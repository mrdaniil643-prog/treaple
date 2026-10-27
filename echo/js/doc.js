// Документы (оферта, возврат, политика, согласие, контакты) в демо: берём текст из тех же HTML, что на сайте.
import { renderHeader, renderFooter } from './common.js';

export default async function mount(route) {
  renderHeader('');
  const app = document.getElementById('app');
  app.className = 'wrap page-head doc';
  try {
    const html = await (await fetch(`docs/${route.name}.html`)).text();
    app.innerHTML = html.match(/<main[^>]*>([\s\S]*)<\/main>/)?.[1] || '';
  } catch {
    app.innerHTML = '<h1>Документ не загрузился</h1><p>Обновите страницу.</p>';
  }
  renderFooter();
}
