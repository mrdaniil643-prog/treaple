// Реквизиты продавца живут в brand.js; документы в public/*.html собираются из них (npm run brand),
// test/legal.test.js проверяет, что страницы не устарели.
export { SELLER } from './brand.js';

export const LEGAL_LINKS = [
  ['/prices', 'Цены и оплата'],
  ['/offer', 'Оферта'],
  ['/refund', 'Возврат билетов'],
  ['/privacy', 'Политика обработки данных'],
  ['/contacts', 'Контакты и реквизиты'],
];
