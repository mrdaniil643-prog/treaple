// Форма заявки на бронь стола. Денег здесь нет: гость оставляет контакты, администратор перезванивает.
// eventId — заявка на конкретное событие; без него гость выбирает событие из афиши или дату обычного вечера.
import { api, esc, fmt, TZ, $ } from './common.js';

const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

export function mountTableRequest(root, { eventId = null, events = [] } = {}) {
  const pick = !eventId;
  root.innerHTML = `
    <form class="request-form" novalidate>
      ${pick ? `<label class="field"><span>Когда</span>
        <select class="input" name="eventId">
          ${events.map((e) => `<option value="${e.id}">${esc(fmt.date(e.starts_at))}, ${esc(e.title)}</option>`).join('')}
          <option value="">Другой вечер</option>
        </select></label>
      <label class="field" data-day ${events.length ? 'hidden' : ''}><span>Дата</span><input class="input" name="day" type="date" min="${today()}"></label>` : ''}
      <div class="request-row">
        <label class="field"><span>Имя</span><input class="input" name="name" autocomplete="name" autocapitalize="words" enterkeyhint="next" required></label>
        <label class="field"><span>Телефон</span><input class="input" name="phone" type="tel" inputmode="tel" autocomplete="tel" enterkeyhint="next" placeholder="+7 900 000-00-00" required></label>
      </div>
      <label class="field"><span>Сколько вас будет</span><input class="input" name="guests" type="number" inputmode="numeric" min="1" max="50" value="2" required></label>
      <label class="field"><span>Пожелания (необязательно)</span><textarea class="input" name="comment" maxlength="500" rows="2" placeholder="Например, у сцены или в VIP-комнате"></textarea></label>
      <label class="check consent"><input type="checkbox" name="consent" required> <span>Я даю <a href="/consent" target="_blank">согласие на обработку персональных данных</a></span></label>
      <p class="form-error" data-error></p>
      <button class="btn ghost block" type="submit">Отправить заявку</button>
    </form>`;
  const form = $('form', root);
  const day = $('[data-day]', root);
  form.eventId?.addEventListener('change', () => { day.hidden = form.eventId.value !== ''; });
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const err = $('[data-error]', form);
    const btn = form.querySelector('[type=submit]');
    if (!form.consent.checked) {
      err.textContent = 'Отметьте согласие на обработку персональных данных';
      return;
    }
    btn.disabled = true;
    err.textContent = '';
    try {
      await api('/api/table-requests', {
        method: 'POST',
        body: {
          eventId: pick ? form.eventId.value : eventId, day: form.day?.value || null,
          name: form.name.value, phone: form.phone.value, guests: Number(form.guests.value), comment: form.comment.value, consent: true,
        },
      });
      root.innerHTML = `<div class="request-done" role="status"><h3>Заявка отправлена</h3><p>Администратор перезвонит на ${esc(form.phone.value)} и подтвердит стол.</p></div>`;
    } catch (e) {
      err.textContent = e.message;
      btn.disabled = false;
    }
  });
}
