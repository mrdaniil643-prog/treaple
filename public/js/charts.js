// Графики админки. Построены по правилам скилла dataviz: тонкие метки со скруглённым концом,
// зазор 2px между сегментами, подписи — цветом текста, у каждого графика есть таблица.
// Цвета — токены --chart-sold / --chart-held в style.css, проверены validate_palette.js на фоне #2a3648.
import { esc, TZ } from './common.js';

const DAY = 864e5;
const isoDay = new Intl.DateTimeFormat('sv-SE', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
const shortDay = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const dayLabel = (key) => shortDay.format(new Date(`${key}T12:00:00Z`)).replace('.', '');

// ---- подсказка: одна на страницу, события слушаем на контейнере графика ----
let tip;
function showTip(el) {
  if (!tip) {
    tip = document.createElement('div');
    tip.className = 'chart-tip';
    tip.setAttribute('role', 'status');
    document.body.append(tip);
  }
  tip.innerHTML = el.dataset.tip;
  tip.hidden = false;
  const r = el.getBoundingClientRect();
  const tr = tip.getBoundingClientRect();
  const left = Math.min(innerWidth - tr.width - 8, Math.max(8, r.left + r.width / 2 - tr.width / 2));
  const top = r.top - tr.height - 8 < 8 ? r.bottom + 8 : r.top - tr.height - 8;
  tip.style.transform = `translate(${Math.round(left + scrollX)}px, ${Math.round(top + scrollY)}px)`;
}
const hideTip = () => { if (tip) tip.hidden = true; };

function withTips(el) {
  if (el.dataset.tips) return;
  el.dataset.tips = '1';
  const on = (e) => { const t = e.target.closest('[data-tip]'); if (t) showTip(t); };
  el.addEventListener('pointerover', on);
  el.addEventListener('focusin', on);
  el.addEventListener('click', on);
  el.addEventListener('pointerleave', hideTip);
  el.addEventListener('focusout', hideTip);
}

// Перерисовываем, только если данные графика изменились: иначе сбиваются фокус и открытая таблица.
// Открытая таблица и фокус на столбике переживают живое обновление.
function render(el, key, html) {
  if (el.dataset.key === key) return;
  el.dataset.key = key;
  const open = el.querySelector('details')?.open;
  const focused = el.contains(document.activeElement) ? document.activeElement.dataset.focus : null;
  hideTip();
  el.innerHTML = html;
  if (open) el.querySelector('details').open = true;
  if (focused) el.querySelector(`[data-focus="${focused}"]`)?.focus({ preventScroll: true });
  withTips(el);
}

const tableToggle = (rows, head) => `<details class="chart-table"><summary>Показать таблицей</summary>
  <div class="table-wrap"><table class="list"><thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead>
  <tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div></details>`;

// Заполненность залов: горизонтальный стек «продано | в брони» на фоне свободных мест
export function occupancyChart(el, halls, availability) {
  const rows = [];
  for (const h of halls) {
    const r = { title: h.title, seats: 0, sold: 0, held: 0 };
    for (const t of h.tables) {
      const a = availability[t.id];
      if (!a) continue;
      r.seats += a.seats; r.sold += a.sold; r.held += a.held;
    }
    if (r.seats) rows.push({ ...r, free: r.seats - r.sold - r.held });
  }
  const seg = (r, n, cls, label) => {
    if (!n) return '';
    const text = `${label}: ${n} из ${r.seats}`;
    return `<span class="seg ${cls}" role="img" tabindex="0" data-focus="${esc(r.title)}-${cls}" style="width:${(n / r.seats) * 100}%"
      data-tip="${esc(`<b>${esc(r.title)}</b><br>${text}`)}" aria-label="${esc(`${r.title}, ${text}`)}"></span>`;
  };
  render(el, JSON.stringify(rows), `<div class="chart-legend" aria-hidden="true">
      <span><i class="sold"></i>Продано</span><span><i class="held"></i>В брони</span><span><i></i>Свободно</span>
    </div>
    ${rows.map((r) => `<div class="occ-row">
      <div class="occ-head"><span>${esc(r.title)}</span><span class="occ-value">${r.sold + r.held} из ${r.seats}</span></div>
      <div class="occ-bar">${seg(r, r.sold, 'sold', 'продано')}${seg(r, r.held, 'held', 'в брони')}</div>
    </div>`).join('')}
    ${tableToggle(rows.map((r) => [r.title, r.sold, r.held, r.free, r.seats]), ['Зал', 'Продано', 'В брони', 'Свободно', 'Всего'])}`);
}

// Продажи по дням: столбики с числом проданных мест за день
export function salesChart(el, orders) {
  const byDay = new Map();
  for (const o of orders) {
    if (o.status !== 'paid' || !o.paidAt) continue;
    const k = isoDay.format(new Date(o.paidAt));
    byDay.set(k, (byDay.get(k) || 0) + o.tickets.length);
  }
  if (!byDay.size) {
    render(el, 'empty', '<p class="muted">Продаж пока нет. Здесь появятся места, проданные по дням.</p>');
    return;
  }
  // Непрерывный ряд дней: до сегодня, а если продажи давно закончились — до последней продажи.
  // На узком экране дней меньше, чтобы столбик и подпись оставались читаемыми.
  const maxDays = el.clientWidth && el.clientWidth < 480 ? 10 : 21;
  const saleDays = [...byDay.keys()].sort();
  const first = Date.parse(`${saleDays[0]}T12:00:00Z`);
  const last = Date.parse(`${saleDays.at(-1)}T12:00:00Z`);
  let end = Math.max(last, Date.parse(`${isoDay.format(new Date())}T12:00:00Z`));
  if (end - last >= maxDays * DAY) end = last;
  const start = Math.max(first, end - (maxDays - 1) * DAY);
  const days = [];
  for (let t = start; t <= end; t += DAY) days.push(new Date(t).toISOString().slice(0, 10));
  const values = days.map((k) => byDay.get(k) || 0);
  const labels = days.map(dayLabel);
  const max = Math.max(...values);
  const step = [1, 2, 5, 10].find((s) => max / s <= 5) ?? Math.ceil(max / 50) * 10;
  const top = Math.max(step, Math.ceil(max / step) * step);
  // ширина в реальных пикселях контейнера: подписи остаются 11px на любом экране
  const W = Math.max(280, Math.round(el.clientWidth || 640)), H = 200, padL = 32, padB = 26, padT = 18;
  const innerW = W - padL - 8, innerH = H - padB - padT;
  const band = innerW / days.length;
  const bw = Math.min(24, band * 0.6);
  const y = (v) => padT + innerH - (v / top) * innerH;
  const base = y(0);
  const ticks = Array.from({ length: top / step + 1 }, (_, i) => i * step);
  const peak = values.indexOf(max);
  // подпись дня занимает ~56px: прореживаем по реальной ширине, чтобы подписи не слипались
  const every = Math.max(1, Math.ceil(days.length / Math.max(1, Math.floor(innerW / 56))));
  const cols = values.map((v, i) => {
    const x = padL + band * i + (band - bw) / 2;
    const yt = y(v);
    const r = Math.min(4, (base - yt) / 2, bw / 2);
    const bar = v ? `<path class="bar" d="M${x},${base} V${yt + r} Q${x},${yt} ${x + r},${yt} H${x + bw - r} Q${x + bw},${yt} ${x + bw},${yt + r} V${base} Z"/>` : '';
    return `<g class="col" tabindex="0" data-focus="${days[i]}" data-tip="${esc(`<b>${labels[i]}</b><br>продано мест: ${v}`)}" aria-label="${labels[i]}: ${v}">
      <rect class="hit" x="${padL + band * i}" y="${padT}" width="${band}" height="${innerH}"/>${bar}
      ${i === peak ? `<text class="val" x="${x + bw / 2}" y="${yt - 6}">${v}</text>` : ''}
      ${(days.length - 1 - i) % every === 0 ? `<text class="day" x="${x + bw / 2}" y="${H - 8}">${labels[i]}</text>` : ''}
    </g>`;
  });
  render(el, JSON.stringify(values) + days[0], `<svg class="sales-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Проданные места по дням, максимум ${max} в день">
    ${ticks.map((v) => `<line class="grid" x1="${padL}" x2="${W - 8}" y1="${y(v)}" y2="${y(v)}"/><text class="tick" x="${padL - 6}" y="${y(v)}">${v}</text>`).join('')}
    ${cols.join('')}
  </svg>
  ${first < start ? `<p class="muted chart-note">Показаны последние ${days.length} дн. Всего продано мест: ${[...byDay.values()].reduce((a, b) => a + b, 0)}.</p>` : ''}
  ${tableToggle(saleDays.map((k) => [dayLabel(k), byDay.get(k)]), ['День', 'Продано мест'])}`);
}

// Проход гостей: шкала «пришли из проданных»; обновляется на месте, чтобы работала анимация
export function entryMeter(el, checkedIn, sold) {
  if (!el.firstChild) {
    el.innerHTML = `<div class="meter-head"><span>Пришли гости</span><b></b></div>
      <div class="meter" role="meter" aria-valuemin="0"><i></i></div>`;
  }
  const meter = el.querySelector('.meter');
  el.querySelector('b').textContent = `${checkedIn} из ${sold}`;
  meter.setAttribute('aria-valuemax', String(Math.max(sold, 1)));
  meter.setAttribute('aria-valuenow', String(checkedIn));
  meter.setAttribute('aria-label', `Пришли ${checkedIn} из ${sold}`);
  meter.firstChild.style.width = `${sold ? Math.round((checkedIn / sold) * 100) : 0}%`;
}
