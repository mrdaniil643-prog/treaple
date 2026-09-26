// Продавец билетов: реквизиты для подвала сайта, оферты и чеков.
// Эти же данные вписаны в public/offer.html, privacy.html, consent.html и contacts.html
// (страницы должны читаться без JavaScript). test/legal.test.js проверяет, что они совпадают.
export const SELLER = {
  name: 'Индивидуальный предприниматель Чухалдин Владимир Ильич',
  short: 'ИП Чухалдин В. И.',
  inn: '272402549281',
  ogrnip: '326270000041993',
  city: 'г. Хабаровск',
  phone: '+7 929 418-82-88',
  email: 'jpeg8288@gmail.com',
};

export const LEGAL_LINKS = [
  ['/offer', 'Оферта'],
  ['/refund', 'Возврат билетов'],
  ['/privacy', 'Политика обработки данных'],
  ['/contacts', 'Контакты и реквизиты'],
];
