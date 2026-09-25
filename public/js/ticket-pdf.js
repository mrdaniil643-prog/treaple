// PDF-билет без библиотек: страницу рисуем на canvas (кириллица берётся из шрифтов браузера),
// сохраняем в JPEG и оборачиваем в минимальный PDF. Одна страница A4 на билет.
// QR в файле постоянный: пускает на вход один раз, как обычный распечатанный билет.
import { api, fmt, money, VENUE } from './common.js';

const W = 1240, H = 1754; // A4 при 150 dpi
const PT_W = 595.28, PT_H = 841.89;
const M = 90;
const C = { night: '#212b3a', cream: '#fbe5b5', orange: '#f07a2b', ink: '#1a2230', muted: '#5f6b7d', paper: '#ffffff', box: '#f6f0e4', line: '#d9cdb6' };
const FONT = "Manrope, 'Segoe UI', Roboto, Arial, sans-serif";
const DISPLAY = "Unbounded, Manrope, 'Segoe UI', Arial, sans-serif";
// Логотип МТ — те же многоугольники, что в шапке сайта (viewBox 200×80)
const LOGO = [
  [6, 0, 64, 0, 24, 80, 0, 80, 34, 16, 6, 16],
  [40, 80, 78, 0, 98, 0, 98, 80, 80, 80, 80, 38, 60, 80],
  [106, 0, 200, 0, 200, 16, 161, 16, 161, 80, 145, 80, 145, 16, 106, 16],
];

function wrap(ctx, text, maxWidth, maxLines) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let line = '';
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (ctx.measureText(next).width <= maxWidth || !line) line = next;
    else { lines.push(line); line = w; }
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    lines.length = maxLines;
    while (ctx.measureText(`${lines[maxLines - 1]}…`).width > maxWidth) lines[maxLines - 1] = lines[maxLines - 1].slice(0, -1);
    lines[maxLines - 1] += '…';
  }
  return lines;
}

function text(ctx, s, x, y, { size = 28, weight = 600, color = C.ink, font = FONT, align = 'left' } = {}) {
  ctx.font = `${weight} ${size}px ${font}`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.fillText(s, x, y);
}

function drawQr(ctx, data, x, y, size) {
  const qr = window.qrcode(0, 'M');
  qr.addData(data);
  qr.make();
  const n = qr.getModuleCount();
  const quiet = 4;
  const cell = Math.floor(size / (n + quiet * 2));
  const real = cell * (n + quiet * 2);
  const ox = x + Math.round((size - real) / 2), oy = y + Math.round((size - real) / 2);
  ctx.fillStyle = '#fff';
  ctx.fillRect(ox, oy, real, real);
  ctx.fillStyle = '#000';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) ctx.fillRect(ox + (c + quiet) * cell, oy + (r + quiet) * cell, cell, cell);
}

function drawPage(ctx, t, event, qrData) {
  ctx.fillStyle = C.paper;
  ctx.fillRect(0, 0, W, H);

  // шапка
  ctx.fillStyle = C.night;
  ctx.fillRect(0, 0, W, 300);
  ctx.save();
  ctx.translate(M, 86);
  ctx.scale(1.6, 1.6);
  ctx.fillStyle = C.cream;
  for (const p of LOGO) {
    ctx.beginPath();
    for (let i = 0; i < p.length; i += 2) (i ? ctx.lineTo : ctx.moveTo).call(ctx, p[i], p[i + 1]);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
  text(ctx, 'Музыкальный бар и караоке', W - M, 150, { size: 30, weight: 600, color: C.cream, align: 'right' });
  text(ctx, 'БИЛЕТ', W - M, 205, { size: 40, weight: 700, color: C.orange, font: DISPLAY, align: 'right' });

  // событие
  let y = 400;
  ctx.font = `700 64px ${DISPLAY}`;
  for (const line of wrap(ctx, event.title, W - M * 2, 2)) { text(ctx, line, M, y, { size: 64, weight: 700, font: DISPLAY }); y += 80; }
  y += 6;
  text(ctx, fmt.full(event.startsAt), M, y, { size: 36, weight: 700 });
  y += 52;
  if (event.doorsAt) text(ctx, `Двери открываются в ${fmt.time(event.doorsAt)}`, M, y, { size: 30, weight: 500, color: C.muted });

  // зал, стол, место
  y += 50;
  const cols = [
    [t.whole ? 'Стол целиком' : 'Зал', t.hall],
    ['Стол', String(t.table)],
    ['Место', t.whole ? 'все' : String(t.seat)],
  ];
  const gap = 24, bw = (W - M * 2 - gap * 2) / 3, bh = 170;
  cols.forEach(([label, value], i) => {
    const bx = M + i * (bw + gap);
    ctx.fillStyle = C.box;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(bx, y, bw, bh, 18); else ctx.rect(bx, y, bw, bh);
    ctx.fill();
    text(ctx, label, bx + 28, y + 52, { size: 26, weight: 600, color: C.muted });
    ctx.font = `800 ${i === 0 ? 36 : 72}px ${FONT}`;
    const [v] = wrap(ctx, value, bw - 56, 1);
    text(ctx, v, bx + 28, y + (i === 0 ? 124 : 138), { size: i === 0 ? 36 : 72, weight: 800 });
  });

  // гость и цена
  y += bh + 80;
  text(ctx, 'Гость', M, y, { size: 26, weight: 600, color: C.muted });
  text(ctx, 'Цена', W - M, y, { size: 26, weight: 600, color: C.muted, align: 'right' });
  y += 50;
  ctx.font = `700 40px ${FONT}`;
  text(ctx, wrap(ctx, t.guestName || 'Гость', 700, 1)[0], M, y, { size: 40, weight: 700 });
  text(ctx, money(t.price), W - M, y, { size: 40, weight: 700, align: 'right' });
  if (event.deposit) text(ctx, `из них ${money(event.deposit)} в депозит на еду и напитки`, W - M, y + 42, { size: 24, weight: 500, color: C.muted, align: 'right' });

  // линия отрыва
  y += 110;
  ctx.strokeStyle = C.line;
  ctx.lineWidth = 3;
  ctx.setLineDash([14, 12]);
  ctx.beginPath();
  ctx.moveTo(40, y);
  ctx.lineTo(W - 40, y);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = C.night;
  for (const cx of [0, W]) { ctx.beginPath(); ctx.arc(cx, y, 34, 0, Math.PI * 2); ctx.fill(); }

  // QR и правила
  y += 60;
  const qs = 560;
  drawQr(ctx, qrData, M - 20, y, qs);
  const tx = M + qs + 30, tw = W - M - tx;
  let ty = y + 70;
  text(ctx, 'Покажите этот QR на входе', tx, ty, { size: 34, weight: 800 });
  ty += 64;
  const rules = [
    'Билет пускает одного гостя один раз.',
    'Не выкладывайте QR в сеть и не пересылайте посторонним: пройдёт тот, кто покажет его первым.',
    'На телефоне можно показать и живой QR из «Моих билетов».',
  ];
  ctx.font = `500 28px ${FONT}`;
  for (const r of rules) {
    for (const line of wrap(ctx, r, tw, 4)) { text(ctx, line, tx, ty, { size: 28, weight: 500, color: C.ink }); ty += 40; }
    ty += 18;
  }
  text(ctx, `Билет …${qrData.split('.')[0].slice(-4)}`, tx, y + qs - 40, { size: 28, weight: 700, color: C.muted });

  // подвал
  ctx.fillStyle = C.night;
  ctx.fillRect(0, H - 120, W, 120);
  const venue = [VENUE.address, VENUE.phone].filter(Boolean).join(' · ') || location.host;
  text(ctx, venue, M, H - 50, { size: 26, weight: 600, color: C.cream });
  text(ctx, 'МТ', W - M, H - 50, { size: 26, weight: 800, color: C.orange, font: DISPLAY, align: 'right' });
}

const enc = new TextEncoder();

// Минимальный PDF: на каждой странице одна JPEG-картинка во весь лист
function buildPdf(images) {
  const chunks = [];
  const offsets = [];
  let size = 0;
  const push = (part) => { const b = typeof part === 'string' ? enc.encode(part) : part; chunks.push(b); size += b.length; };
  const obj = (n, body) => { offsets[n] = size; push(`${n} 0 obj\n`); for (const p of [].concat(body)) push(p); push('\nendobj\n'); };

  push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
  const pageIds = images.map((_, i) => 3 + i * 3);
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  obj(2, `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${images.length} >>`);
  images.forEach((img, i) => {
    const page = 3 + i * 3, content = page + 1, image = page + 2;
    obj(page, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PT_W} ${PT_H}] /Resources << /XObject << /Im0 ${image} 0 R >> >> /Contents ${content} 0 R >>`);
    const draw = `q ${PT_W} 0 0 ${PT_H} 0 0 cm /Im0 Do Q`;
    obj(content, [`<< /Length ${draw.length} >>\nstream\n`, draw, '\nendstream']);
    obj(image, [`<< /Type /XObject /Subtype /Image /Width ${W} /Height ${H} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${img.length} >>\nstream\n`, img, '\nendstream']);
  });
  const count = 3 + images.length * 3;
  const xref = size;
  push(`xref\n0 ${count}\n0000000000 65535 f \n`);
  for (let n = 1; n < count; n++) push(`${String(offsets[n]).padStart(10, '0')} 00000 n \n`);
  push(`trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return new Blob(chunks, { type: 'application/pdf' });
}

const toJpeg = (canvas) => new Promise((resolve, reject) => {
  canvas.toBlob((b) => (b ? b.arrayBuffer().then((a) => resolve(new Uint8Array(a)), reject) : reject(new Error('Не удалось нарисовать билет'))), 'image/jpeg', 0.92);
});

// Скачивает PDF с билетами (только действующими). Возвращает число билетов в файле.
export async function downloadTicketsPdf(tickets, event) {
  const active = tickets.filter((t) => t.status === 'active');
  if (!active.length) throw new Error('Нет действующих билетов');
  await document.fonts?.ready;
  const canvas = Object.assign(document.createElement('canvas'), { width: W, height: H });
  const ctx = canvas.getContext('2d');
  const pages = [];
  for (const t of active) {
    const { qr } = await api(`/api/tickets/${encodeURIComponent(t.code)}/print`);
    drawPage(ctx, t, event, `${location.origin}/c/${qr}`);
    pages.push(await toJpeg(canvas));
  }
  const blob = buildPdf(pages);
  const one = active.length === 1 ? active[0] : null;
  // имя латиницей: браузеры и телефоны теряют кириллицу в имени скачанного файла
  const day = new Date(event.startsAt).toISOString().slice(0, 10);
  const name = one ? `MT-bilet-${day}-stol-${one.table}-mesto-${one.seat}.pdf` : `MT-bilety-${day}.pdf`;
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60e3);
  return active.length;
}
