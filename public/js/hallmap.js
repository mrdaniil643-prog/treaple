import { esc, money, seatsWord } from './common.js';

const NS = 'http://www.w3.org/2000/svg';

function seatPositions(t) {
  const horizontal = t.w >= t.h;
  const a = Math.ceil(t.seats / 2), b = t.seats - a;
  const off = 9;
  const out = [];
  const along = (count, fixed, start, len, isX) => {
    for (let i = 0; i < count; i++) {
      const p = start + (len * (i + 1)) / (count + 1);
      out.push(isX ? [p, fixed] : [fixed, p]);
    }
  };
  if (horizontal) {
    along(a, t.y - off, t.x, t.w, true);
    along(b, t.y + t.h + off, t.x, t.w, true);
  } else {
    along(a, t.x - off, t.y, t.h, false);
    along(b, t.x + t.w + off, t.y, t.h, false);
  }
  return out;
}

// При повороте схемы подписи поворачиваем обратно, чтобы они читались.
let upright = () => '';

function decorEl(d) {
  if (d.t === 'rect') return `<rect class="${d.c}" x="${d.x}" y="${d.y}" width="${d.w}" height="${d.h}" rx="${d.c === 'floor' ? 6 : 3}"/>`;
  if (d.t === 'path') return `<path class="${d.c}" d="${d.d}"/>`;
  if (d.t === 'line') return `<line class="${d.c}" x1="${d.x1}" y1="${d.y1}" x2="${d.x2}" y2="${d.y2}"/>`;
  if (d.t === 'text') return `<text class="${d.c}" x="${d.x}" y="${d.y}"${upright(d.x, d.y)}>${esc(d.s)}</text>`;
  return '';
}

// Рисует зал и возвращает объект для обновления состояния без перерисовки.
// rotate — развернуть вертикальный план на 90°, чтобы он лучше занимал широкий экран.
export function mountHall(container, hall, { onPick, readonly = false, rotate = false } = {}) {
  const [vx, vy, vw, vh] = hall.viewBox;
  upright = rotate ? (x, y) => ` transform="rotate(90 ${x} ${y})"` : () => '';
  const box = rotate ? [vy, -(vx + vw), vh, vw] : [vx, vy, vw, vh];
  container.innerHTML = `<svg class="hall-svg${readonly ? ' readonly' : ''}${rotate ? ' rotated' : ''}" viewBox="${box.join(' ')}" role="group" aria-label="Схема: ${esc(hall.title)}">
    <defs><pattern id="hatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(90)">
      <line x1="0" y1="0" x2="0" y2="8" stroke="rgba(255,255,255,.14)" stroke-width="3"/></pattern></defs>
    <g${rotate ? ' transform="rotate(-90)"' : ''}>
    ${hall.decor.map(decorEl).join('')}
    ${hall.tables.map((t) => {
      const seats = seatPositions(t).map(([x, y]) => `<circle class="seat" cx="${x}" cy="${y}" r="5"/>`).join('');
      return `<g class="tbl" data-id="${t.id}" ${readonly ? '' : 'tabindex="0" role="button"'}>
        ${seats}<rect class="top" x="${t.x}" y="${t.y}" width="${t.w}" height="${t.h}" rx="5"/>
        <text x="${t.x + t.w / 2}" y="${t.y + t.h / 2}"${upright(t.x + t.w / 2, t.y + t.h / 2)}>${t.n}</text></g>`;
    }).join('')}
    </g>
  </svg>`;
  const svg = container.firstElementChild;
  const groups = new Map([...svg.querySelectorAll('.tbl')].map((g) => [g.dataset.id, g]));
  let lastState = {};

  if (!readonly) {
    const pick = (g) => g && onPick?.(g.dataset.id);
    svg.addEventListener('click', (e) => pick(e.target.closest('.tbl')));
    svg.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        pick(e.target.closest('.tbl'));
      }
    });
  }

  function update(availability, selection = new Map(), activeId = null) {
    for (const t of hall.tables) {
      const g = groups.get(t.id);
      const a = availability?.[t.id];
      if (!a) { g.style.display = 'none'; continue; }
      g.style.display = '';
      const sel = selection.get(t.id);
      const mine = sel ? sel.seats : 0;
      const prev = lastState[t.id];
      if (prev && (prev.sold !== a.sold || prev.held !== a.held) && !sel) {
        g.classList.remove('flash');
        void g.getBBox();
        g.classList.add('flash');
      }
      g.classList.toggle('full', a.status === 'full' && !mine);
      g.classList.toggle('partial', a.status === 'partial');
      g.classList.toggle('selected', mine > 0);
      g.classList.toggle('active', activeId === t.id);
      const circles = g.querySelectorAll('.seat');
      circles.forEach((c, i) => {
        c.classList.toggle('taken', i < a.sold);
        c.classList.toggle('held', i >= a.sold && i < a.sold + a.held);
        c.classList.toggle('mine', i >= a.sold + a.held && i < a.sold + a.held + mine);
      });
      const label = a.status === 'full' ? 'мест нет' : `свободно ${seatsWord(a.free)}, ${money(a.price)} за место`;
      g.setAttribute('aria-label', `Стол ${t.n}: ${label}${mine ? `, выбрано ${seatsWord(mine)}` : ''}`);
      if (a.status === 'full' && !readonly) g.setAttribute('aria-disabled', 'true');
      else g.removeAttribute('aria-disabled');
    }
    lastState = availability || {};
  }

  return { update, svg };
}
