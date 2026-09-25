// Раскладка мест вокруг столов. Места ставим только туда, где они помещаются:
// - сторона у дивана: места рисуются подушками на самом диване;
// - свободная сторона: стулья кружками;
// - сторона, упёртая в стену, стойку, соседний стол или чужие места, пустая.
// Модуль без DOM: его же проверяет test/seat-layout.test.js.

export const CHAIR_R = 5;
const CHAIR_OFF = 9; // от края стола до центра стула
const CHAIR_PITCH = 12; // шаг между центрами стульев
const CUSHION_PITCH = 13; // минимальная длина подушки с зазором
const SOFA_GAP = 18; // диван ближе этого к столу считается местами за столом
const CLEAR = CHAIR_OFF + CHAIR_R + 2; // сколько места нужно стороне под стулья

const SIDES = ['top', 'bottom', 'left', 'right'];
const horizontalSide = (s) => s === 'top' || s === 'bottom';

// Габарит элемента обстановки; у пути — по точкам из d.
function bbox(d) {
  if (d.t === 'rect') return { x: d.x, y: d.y, w: d.w, h: d.h };
  if (d.t === 'line') return { x: Math.min(d.x1, d.x2) - 1.5, y: Math.min(d.y1, d.y2) - 1.5, w: Math.abs(d.x2 - d.x1) + 3, h: Math.abs(d.y2 - d.y1) + 3 };
  if (d.t === 'path') {
    const xs = [], ys = [];
    const nums = d.d.match(/[A-Za-z]|-?\d+(?:\.\d+)?/g);
    let cmd = '', x = 0, y = 0, arg = [];
    // M/L пары, H/V одиночные, A — последние два числа
    for (const tok of nums) {
      if (/[A-Za-z]/.test(tok)) { cmd = tok.toUpperCase(); arg = []; continue; }
      arg.push(Number(tok));
      if ((cmd === 'M' || cmd === 'L') && arg.length === 2) { [x, y] = arg; arg = []; }
      else if (cmd === 'H' && arg.length === 1) { x = arg[0]; arg = []; }
      else if (cmd === 'V' && arg.length === 1) { y = arg[0]; arg = []; }
      else if (cmd === 'A' && arg.length === 7) {
        // дуга окружности: находим центр и берём точки по самой дуге
        const [r, , , large, sweep, x1, y1] = arg;
        const mx = (x1 - x) / 2, my = (y1 - y) / 2;
        const d = Math.hypot(mx, my), rr = Math.max(r, d);
        const k = Math.sqrt(Math.max(0, rr * rr - d * d)) / (d || 1) * (large === sweep ? -1 : 1);
        const cx = x + mx - k * my, cy = y + my + k * mx;
        let a0 = Math.atan2(y - cy, x - cx), a1 = Math.atan2(y1 - cy, x1 - cx);
        if (sweep && a1 < a0) a1 += 2 * Math.PI;
        if (!sweep && a1 > a0) a1 -= 2 * Math.PI;
        for (let i = 0; i <= 24; i++) { const an = a0 + ((a1 - a0) * i) / 24; xs.push(cx + rr * Math.cos(an)); ys.push(cy + rr * Math.sin(an)); }
        [x, y] = [x1, y1]; arg = [];
      } else continue;
      xs.push(x); ys.push(y);
    }
    const x0 = Math.min(...xs), y0 = Math.min(...ys);
    return { x: x0, y: y0, w: Math.max(...xs) - x0, h: Math.max(...ys) - y0 };
  }
  return null;
}

const overlaps = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const inside = (a, b) => a.x >= b.x && a.y >= b.y && a.x + a.w <= b.x + b.w && a.y + a.h <= b.y + b.h;

// Полоса вдоль стороны стола глубиной depth
function strip(t, side, depth) {
  if (side === 'top') return { x: t.x, y: t.y - depth, w: t.w, h: depth };
  if (side === 'bottom') return { x: t.x, y: t.y + t.h, w: t.w, h: depth };
  if (side === 'left') return { x: t.x - depth, y: t.y, w: depth, h: t.h };
  return { x: t.x + t.w, y: t.y, w: depth, h: t.h };
}

function chairs(t, side, count) {
  const out = [];
  const len = horizontalSide(side) ? t.w : t.h;
  for (let i = 0; i < count; i++) {
    const p = (len * (i + 1)) / (count + 1);
    if (side === 'top') out.push({ kind: 'chair', cx: t.x + p, cy: t.y - CHAIR_OFF });
    else if (side === 'bottom') out.push({ kind: 'chair', cx: t.x + p, cy: t.y + t.h + CHAIR_OFF });
    else if (side === 'left') out.push({ kind: 'chair', cx: t.x - CHAIR_OFF, cy: t.y + p });
    else out.push({ kind: 'chair', cx: t.x + t.w + CHAIR_OFF, cy: t.y + p });
  }
  return out;
}

// Подушки на диване напротив стороны стола: делим общий отрезок на равные части
function cushions(t, side, sofa, count) {
  const out = [];
  const gap = 3, inset = 3;
  const depth = Math.min(14, (horizontalSide(side) ? sofa.h : sofa.w) - inset * 2);
  if (horizontalSide(side)) {
    const x0 = Math.max(t.x, sofa.x + inset), x1 = Math.min(t.x + t.w, sofa.x + sofa.w - inset);
    const w = (x1 - x0 - gap * (count - 1)) / count;
    const y = side === 'top' ? sofa.y + sofa.h - inset - depth : sofa.y + inset;
    for (let i = 0; i < count; i++) out.push({ kind: 'cushion', x: x0 + i * (w + gap), y, w, h: depth });
  } else {
    const y0 = Math.max(t.y, sofa.y + inset), y1 = Math.min(t.y + t.h, sofa.y + sofa.h - inset);
    const h = (y1 - y0 - gap * (count - 1)) / count;
    const x = side === 'left' ? sofa.x + sofa.w - inset - depth : sofa.x + inset;
    for (let i = 0; i < count; i++) out.push({ kind: 'cushion', x, y: y0 + i * (h + gap), w: depth, h });
  }
  return out;
}

export const seatBox = (s) => (s.kind === 'chair'
  ? { x: s.cx - CHAIR_R, y: s.cy - CHAIR_R, w: CHAIR_R * 2, h: CHAIR_R * 2 }
  : { x: s.x, y: s.y, w: s.w, h: s.h });

// Возвращает Map: id стола → список мест (стулья и подушки) в порядке нумерации.
export function layoutHall(hall) {
  const rooms = hall.decor.filter((d) => d.t === 'rect' && (d.c === 'floor' || d.c === 'vip-room')).map(bbox);
  const sofas = hall.decor.filter((d) => d.c === 'sofa').map(bbox);
  const solid = hall.decor.filter((d) => d.t !== 'text' && d.c !== 'floor' && d.c !== 'vip-room' && d.c !== 'sofa').map(bbox);
  const tables = hall.tables.map((t) => ({ x: t.x, y: t.y, w: t.w, h: t.h }));
  const taken = []; // места уже разложенных столов
  const result = new Map();

  const queue = [...hall.tables.entries()].sort(([, a], [, b]) => b.seats - a.seats);
  for (const [ti, t] of queue) {
    const room = rooms.filter((r) => inside(tables[ti], r)).sort((a, b) => a.w * a.h - b.w * b.h)[0];
    const others = tables.filter((_, i) => i !== ti);
    const options = [];
    for (const side of SIDES) {
      const len = horizontalSide(side) ? t.w : t.h;
      const near = strip(t, side, SOFA_GAP);
      const sofa = sofas
        .filter((s) => overlaps(near, s))
        .map((s) => ({ s, cover: horizontalSide(side) ? Math.min(t.x + t.w, s.x + s.w) - Math.max(t.x, s.x) : Math.min(t.y + t.h, s.y + s.h) - Math.max(t.y, s.y) }))
        .sort((a, b) => b.cover - a.cover)[0];
      if (sofa && sofa.cover >= len * 0.6) {
        options.push({ side, kind: 'sofa', sofa: sofa.s, cap: Math.floor((sofa.cover - 6) / CUSHION_PITCH), long: true }); // диван — всегда основные места
        continue;
      }
      const zone = strip(t, side, CLEAR);
      const blocked = !room || !inside(zone, room)
        || solid.some((b) => overlaps(zone, b))
        || sofas.some((b) => overlaps(zone, b))
        || others.some((b) => overlaps(zone, b))
        || taken.some((b) => overlaps(zone, b));
      if (!blocked) options.push({ side, kind: 'chair', cap: Math.floor(len / CHAIR_PITCH) - 1 || (len >= CHAIR_PITCH ? 1 : 0), long: len >= (horizontalSide(side) ? t.h : t.w) });
    }
    // Если свободны обе длинные стороны (диван считается длинной), сажаем за них поровну, короткие — если не хватило.
    // Двухместный стол без пары длинных сторон — по местам на торцах друг напротив друга.
    // Иначе — по кругу по всем свободным сторонам, длинные первыми.
    const usable = options.filter((o) => o.cap > 0);
    const longs = usable.filter((o) => o.long), shorts = usable.filter((o) => !o.long);
    const groups = longs.length >= 2 ? [longs, shorts]
      : shorts.length === 2 && t.seats <= 2 ? [shorts, longs]
      : [[...longs, ...shorts]];
    const counts = new Map(usable.map((o) => [o, 0]));
    let left = t.seats;
    for (const group of groups) {
      while (left > 0 && group.some((o) => counts.get(o) < o.cap)) {
        for (const o of group) if (left > 0 && counts.get(o) < o.cap) { counts.set(o, counts.get(o) + 1); left--; }
      }
    }
    const order = groups.flat();
    const seats = [];
    for (const o of order) {
      const n = counts.get(o);
      if (!n) continue;
      seats.push(...(o.kind === 'sofa' ? cushions(t, o.side, o.sofa, n) : chairs(t, o.side, n)));
    }
    // Не нашлось места под все стулья: остаток ставим на свободные стороны плотнее
    if (left > 0) throw new Error(`Стол ${t.n}: некуда поставить ${left} мест (${options.map((o) => `${o.side}:${o.kind}:${o.cap}`).join(', ')})`);
    seats.forEach((s) => taken.push(seatBox(s)));
    result.set(t.id, seats);
  }
  // в порядке столов зала
  return new Map(hall.tables.map((t) => [t.id, result.get(t.id)]));
}

// Зоны нажатия: стол вместе с местами, а маленький стол дорастает до HIT_MIN по каждой оси,
// пока не упрётся в соседний стол или чужие места. Так на телефоне стол не мельче пальца.
const HIT_MIN = 60;
export function hitBoxes(hall, layout = layoutHall(hall)) {
  const own = new Map(hall.tables.map((t) => [t.id, [t, ...layout.get(t.id).map(seatBox)]]));
  const out = new Map();
  for (const t of hall.tables) {
    const parts = own.get(t.id);
    const x0 = Math.min(...parts.map((b) => b.x)) - 2, y0 = Math.min(...parts.map((b) => b.y)) - 2;
    const box = { x: x0, y: y0, w: Math.max(...parts.map((b) => b.x + b.w)) - x0 + 2, h: Math.max(...parts.map((b) => b.y + b.h)) - y0 + 2 };
    const foreign = hall.tables.filter((o) => o !== t).flatMap((o) => own.get(o.id));
    const free = (b) => !foreign.some((f) => overlaps(b, f));
    // растим по одному пикселю с каждой стороны по очереди
    for (const [pos, len] of [['x', 'w'], ['y', 'h']]) {
      let guard = HIT_MIN;
      while (box[len] < HIT_MIN && guard--) {
        const before = { ...box, [pos]: box[pos] - 1, [len]: box[len] + 1 };
        const after = { ...box, [len]: box[len] + 1 };
        if (free(before)) Object.assign(box, before);
        if (box[len] < HIT_MIN && free(after)) Object.assign(box, after);
      }
    }
    out.set(t.id, box);
  }
  return out;
}
