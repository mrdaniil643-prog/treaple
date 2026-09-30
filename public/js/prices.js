import { api, esc, fmt, money, renderHeader, renderFooter, $ } from './common.js';

// «Цены и оплата»: таблицу цен сервер уже вписал в страницу, здесь она обновляется
// (вдруг событие закрыли или билеты кончились, пока страница открыта).
renderHeader('');
renderFooter();

async function refresh() {
  const box = $('#price-list');
  try {
    const events = (await api('/api/events')).filter((e) => e.status !== 'cancelled');
    box.innerHTML = events.length ? `<div class="table-wrap"><table class="list price-table"><thead><tr><th>Мероприятие</th><th>Дата и время</th><th>Входной билет</th></tr></thead><tbody>
      ${events.map((e) => {
        const state = e.status !== 'on_sale' ? 'продажа закрыта' : e.ticketsLeft ? '' : 'билеты закончились';
        return `<tr><td><a href="/event?id=${e.id}">${esc(e.title)}</a></td><td>${fmt.date(e.starts_at)}, ${fmt.time(e.starts_at)}</td><td><b>${money(e.price)}</b>${state ? `<br><span class="muted">${state}</span>` : ''}</td></tr>`;
      }).join('')}</tbody></table></div>` : '<p>Сейчас в продаже нет мероприятий. Новые появятся в афише.</p>';
  } catch { /* остаётся таблица, которую вписал сервер */ }
}
refresh();
