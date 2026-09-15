/**
 * POST /api/lead — приём заявок с сайта.
 *
 * Куда уходит заявка:
 *   1. Telegram-бот (обязательно)  — TG_BOT_TOKEN, TG_CHAT_ID
 *   2. Письмо через Resend (опция) — RESEND_KEY, LEAD_EMAIL_TO, LEAD_EMAIL_FROM
 *
 * Токены живут только в переменных окружения. В клиентский код они не попадают.
 * Формат под Vercel Serverless Functions (Node 18+). Для Netlify смотрите README.
 */

const WINDOW_MS = 60000;
const MAX_PER_WINDOW = 3;
const hits = new Map(); // IP -> метки времени. Живёт в пределах одного инстанса функции.

function rateLimited(ip) {
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) hits.clear();
  return recent.length > MAX_PER_WINDOW;
}

const CONTROL_CHARS = /[\x00-\x1F\x7F]/g;
const clean = (v, max) => String(v == null ? '' : v).replace(CONTROL_CHARS, ' ').trim().slice(0, max);
const escapeHtml = (v) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

async function sendTelegram(text) {
  const token = process.env.TG_BOT_TOKEN;
  const chatId = process.env.TG_CHAT_ID;
  if (!token || !chatId) throw new Error('TG_BOT_TOKEN или TG_CHAT_ID не заданы');

  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Telegram ответил ${res.status}: ${detail.slice(0, 300)}`);
  }
}

async function sendEmail(text) {
  const key = process.env.RESEND_KEY;
  const to = process.env.LEAD_EMAIL_TO;
  const from = process.env.LEAD_EMAIL_FROM;
  if (!key || !to || !from) return;

  // Почта дублирует Telegram, её отказ не должен ронять заявку
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from,
      to: [to],
      subject: 'Заявка с сайта',
      html: text.replace(/\n/g, '<br>'),
    }),
  }).catch(() => {});
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Только POST' });
  }

  const ip =
    String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
    (req.socket && req.socket.remoteAddress) ||
    'unknown';

  if (rateLimited(ip)) {
    return res.status(429).json({ error: 'Слишком много заявок подряд. Попробуйте через минуту.' });
  }

  let body;
  try {
    body = await readBody(req);
  } catch (e) {
    return res.status(400).json({ error: 'Тело запроса не разобрать' });
  }

  // Ловушка для ботов: поле спрятано от людей, заполнить его может только скрипт.
  // Отвечаем успехом, чтобы спамер не подбирал обход.
  if (clean(body.company, 100)) {
    return res.status(200).json({ ok: true });
  }

  const name = clean(body.name, 80);
  const phone = clean(body.phone, 30);
  const message = clean(body.message, 1500);
  const source = clean(body.source, 40) || 'Сайт';
  const page = clean(body.page, 200);

  if (name.length < 2) return res.status(400).json({ error: 'Укажите имя' });
  if (phone.replace(/\D/g, '').length !== 11) {
    return res.status(400).json({ error: 'Проверьте номер телефона' });
  }

  const when = new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' });
  const text =
    '<b>Заявка с сайта</b>\n\n' +
    `<b>Имя:</b> ${escapeHtml(name)}\n` +
    `<b>Телефон:</b> ${escapeHtml(phone)}\n` +
    (message ? `<b>Ситуация:</b> ${escapeHtml(message)}\n` : '') +
    `\n<b>Форма:</b> ${escapeHtml(source)}\n` +
    `<b>Время:</b> ${escapeHtml(when)} (МСК)\n` +
    (page ? `<b>Страница:</b> ${escapeHtml(page)}` : '');

  try {
    await sendTelegram(text);
    await sendEmail(text);
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('lead delivery failed:', err.message);
    return res.status(502).json({ error: 'Заявка не ушла. Позвоните нам напрямую.' });
  }
}
