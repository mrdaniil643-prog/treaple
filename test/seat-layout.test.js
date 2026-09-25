import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HALLS } from '../server/halls.js';
import { layoutHall, seatBox } from '../public/js/seat-layout.js';

const overlaps = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const inside = (a, b) => a.x >= b.x && a.y >= b.y && a.x + a.w <= b.x + b.w && a.y + a.h <= b.y + b.h;
// Подпись на схеме: примерный габарит текста
const textBox = (d) => {
  const w = d.s.length * (d.c.includes('accent') ? 6.5 : 8);
  return { x: d.x - w / 2, y: d.y - 8, w, h: 16 };
};

for (const hall of HALLS) {
  test(`${hall.title}: места не залезают на столы, обстановку и друг на друга`, () => {
    const layout = layoutHall(hall);
    const floor = hall.decor.find((d) => d.c === 'floor');
    const all = [];
    for (const t of hall.tables) {
      const seats = layout.get(t.id);
      assert.equal(seats.length, t.seats, `стол ${t.n}: мест ${seats.length} вместо ${t.seats}`);
      for (const s of seats) all.push({ t, s, box: seatBox(s) });
    }
    for (const { t, s, box } of all) {
      assert.ok(inside(box, floor), `стол ${t.n}: место вне зала`);
      for (const o of hall.tables) assert.ok(!overlaps(box, o), `стол ${t.n}: место на столе ${o.n}`);
      for (const d of hall.decor) {
        if (d.t === 'text') assert.ok(!overlaps(box, textBox(d)), `стол ${t.n}: место на подписи «${d.s}»`);
        if (d.t === 'rect' && !['floor', 'vip-room', 'sofa'].includes(d.c)) assert.ok(!overlaps(box, d), `стол ${t.n}: место на ${d.c}`);
        if (d.c === 'sofa' && s.kind === 'chair') assert.ok(!overlaps(box, d), `стол ${t.n}: стул на диване`);
        if (d.c === 'sofa' && s.kind === 'cushion') assert.ok(inside(box, d) || !overlaps(box, d), `стол ${t.n}: подушка вылезает с дивана`);
      }
    }
    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) {
        const a = all[i].box, b = all[j].box;
        const gap = { x: a.x - 1, y: a.y - 1, w: a.w + 2, h: a.h + 2 };
        assert.ok(!overlaps(gap, b), `места столов ${all[i].t.n} и ${all[j].t.n} слиплись`);
      }
    }
  });
}
