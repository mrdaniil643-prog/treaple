// Схемы залов. Координаты взяты с планов заведения (единицы — пиксели исходных картинок),
// клиент рисует по ним SVG. seats — сколько гостей помещается за столом,
// zone — ценовая зона, wholeOnly — стол продаётся только целиком (VIP-комната).

export const ZONES = {
  standard: { title: 'Зал', multiplier: 1 },
  stage: { title: 'У сцены', multiplier: 1.3 },
  vip: { title: 'Караоке VIP', multiplier: 1.6 },
};

export const HALLS = [
  {
    id: 'karaoke',
    title: 'Караоке-зал',
    note: 'Сцена, барная стойка и отдельная VIP-комната с караоке',
    viewBox: [224, 226, 448, 1022],
    decor: [
      { t: 'rect', x: 232, y: 234, w: 432, h: 970, c: 'floor' },
      { t: 'rect', x: 278, y: 248, w: 196, h: 70, c: 'service' },
      { t: 'text', x: 376, y: 290, s: 'WC', c: 'label' },
      { t: 'rect', x: 390, y: 318, w: 222, h: 58, c: 'stairs' },
      { t: 'rect', x: 390, y: 380, w: 256, h: 146, c: 'vip-room' },
      { t: 'rect', x: 404, y: 392, w: 128, h: 20, c: 'sofa' },
      { t: 'rect', x: 404, y: 392, w: 22, h: 124, c: 'sofa' },
      { t: 'rect', x: 556, y: 386, w: 86, h: 92, c: 'service' },
      { t: 'text', x: 599, y: 437, s: 'WC', c: 'label' },
      { t: 'text', x: 500, y: 514, s: 'Караоке VIP', c: 'label accent' },
      { t: 'rect', x: 282, y: 374, w: 32, h: 196, c: 'sofa' },
      { t: 'path', d: 'M388 570 L502 570 A57 57 0 0 1 388 570 Z', c: 'stage' },
      { t: 'text', x: 445, y: 606, s: 'Сцена', c: 'label stage-label' },
      { t: 'rect', x: 528, y: 634, w: 80, h: 108, c: 'stairs' },
      { t: 'path', d: 'M378 728 H522 V748 H400 V945 H485 V835 H545 V965 H378 Z', c: 'bar' },
      { t: 'text', x: 442, y: 852, s: 'Бар', c: 'label' },
      { t: 'rect', x: 266, y: 772, w: 28, h: 280, c: 'sofa' },
      { t: 'rect', x: 266, y: 1162, w: 292, h: 34, c: 'sofa' },
      { t: 'rect', x: 612, y: 840, w: 26, h: 330, c: 'sofa' },
      { t: 'text', x: 448, y: 1232, s: 'Вход', c: 'label muted' },
    ],
    tables: [
      { id: 'K21', n: '21', x: 318, y: 376, w: 32, h: 58, seats: 4, zone: 'stage' },
      { id: 'K22', n: '22', x: 318, y: 440, w: 32, h: 58, seats: 4, zone: 'stage' },
      { id: 'K23', n: '23', x: 318, y: 504, w: 32, h: 58, seats: 4, zone: 'stage' },
      { id: 'K34', n: '34', x: 432, y: 436, w: 30, h: 64, seats: 6, zone: 'vip', wholeOnly: true },
      { id: 'K35', n: '35', x: 468, y: 428, w: 58, h: 28, seats: 4, zone: 'vip', wholeOnly: true },
      { id: 'K33', n: '33', x: 298, y: 778, w: 30, h: 82, seats: 6, zone: 'standard' },
      { id: 'K24', n: '24', x: 298, y: 870, w: 30, h: 58, seats: 4, zone: 'standard' },
      { id: 'K25', n: '25', x: 298, y: 932, w: 30, h: 56, seats: 4, zone: 'standard' },
      { id: 'K26', n: '26', x: 298, y: 994, w: 30, h: 56, seats: 4, zone: 'standard' },
      { id: 'K27', n: '27', x: 300, y: 1096, w: 34, h: 60, seats: 6, zone: 'standard' },
      { id: 'K28', n: '28', x: 396, y: 1096, w: 34, h: 60, seats: 6, zone: 'standard' },
      { id: 'K29', n: '29', x: 490, y: 1096, w: 34, h: 60, seats: 6, zone: 'standard' },
      { id: 'K30', n: '30', x: 574, y: 1102, w: 30, h: 60, seats: 2, zone: 'standard' },
      { id: 'K31', n: '31', x: 574, y: 982, w: 30, h: 60, seats: 4, zone: 'standard' },
      { id: 'K32', n: '32', x: 574, y: 862, w: 30, h: 60, seats: 4, zone: 'standard' },
    ],
  },
  {
    id: 'main',
    title: 'Основной зал',
    note: 'Столы 1–17, от двухместных до больших компаний',
    viewBox: [14, 14, 490, 730],
    decor: [
      { t: 'rect', x: 18, y: 18, w: 482, h: 722, c: 'floor' },
      { t: 'line', x1: 164, y1: 103, x2: 478, y2: 103, c: 'partition' },
      { t: 'line', x1: 164, y1: 103, x2: 164, y2: 316, c: 'partition' },
      { t: 'line', x1: 354, y1: 40, x2: 354, y2: 103, c: 'partition' },
      { t: 'line', x1: 268, y1: 312, x2: 268, y2: 698, c: 'partition' },
    ],
    tables: [
      { id: 'M6', n: '6', x: 44, y: 36, w: 98, h: 49, seats: 4, zone: 'standard' },
      { id: 'M7', n: '7', x: 160, y: 36, w: 97, h: 51, seats: 4, zone: 'standard' },
      { id: 'M5', n: '5', x: 46, y: 120, w: 96, h: 54, seats: 4, zone: 'standard' },
      { id: 'M4', n: '4', x: 47, y: 216, w: 98, h: 55, seats: 4, zone: 'standard' },
      { id: 'M8', n: '8', x: 195, y: 125, w: 55, h: 50, seats: 2, zone: 'standard' },
      { id: 'M9', n: '9', x: 197, y: 186, w: 53, h: 51, seats: 2, zone: 'standard' },
      { id: 'M10', n: '10', x: 197, y: 247, w: 53, h: 49, seats: 2, zone: 'standard' },
      { id: 'M11', n: '11', x: 291, y: 123, w: 55, h: 47, seats: 2, zone: 'standard' },
      { id: 'M12', n: '12', x: 293, y: 190, w: 60, h: 85, seats: 4, zone: 'standard' },
      { id: 'M3', n: '3', x: 44, y: 369, w: 84, h: 108, seats: 6, zone: 'standard' },
      { id: 'M17', n: '17', x: 84, y: 492, w: 72, h: 94, seats: 4, zone: 'standard' },
      { id: 'M2', n: '2', x: 37, y: 604, w: 78, h: 114, seats: 6, zone: 'standard' },
      { id: 'M1', n: '1', x: 152, y: 604, w: 78, h: 108, seats: 6, zone: 'standard' },
      { id: 'M14', n: '14', x: 341, y: 342, w: 135, h: 40, seats: 6, zone: 'standard' },
      { id: 'M13', n: '13', x: 304, y: 405, w: 49, h: 61, seats: 2, zone: 'standard' },
      { id: 'M16', n: '16', x: 303, y: 489, w: 49, h: 66, seats: 2, zone: 'standard' },
      { id: 'M15', n: '15', x: 382, y: 422, w: 86, h: 144, seats: 8, zone: 'standard' },
    ],
  },
];

const byId = new Map();
for (const hall of HALLS) for (const t of hall.tables) byId.set(t.id, { ...t, hallId: hall.id });

export function findTable(id) {
  return byId.get(id) || null;
}

export function seatPrice(event, table) {
  const m = ZONES[table.zone]?.multiplier ?? 1;
  return Math.round((event.price * m) / 50) * 50;
}
