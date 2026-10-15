/* Сазиков — юридическая практика
   Ваниль, без зависимостей. Страница читается полностью без этого файла. */
(function () {
  'use strict';

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var $  = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  /* ── 1. Оркестрованное открытие первого экрана ───────────── */
  $$('.hero .reveal-line').forEach(function (el, i) {
    el.style.setProperty('--d', (i * 90) + 'ms');
  });
  requestAnimationFrame(function () {
    requestAnimationFrame(function () { document.body.classList.add('is-ready'); });
  });

  /* ── 2. Появление секций по скроллу ──────────────────────── */
  $$('.band__head, .case, .step, .person, .form--main, .qa')
    .forEach(function (el) { el.setAttribute('data-anim', ''); });

  $$('[data-stagger]').forEach(function (group) {
    $$('[data-anim]', group).forEach(function (el, i) {
      el.style.setProperty('--d', (i * 60) + 'ms');
    });
  });

  var appear = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (!e.isIntersecting) return;
      e.target.classList.add('is-in');
      appear.unobserve(e.target);            // один раз, обратный скролл ничего не мигает
    });
  }, { rootMargin: '0px 0px -12% 0px', threshold: 0.15 });

  $$('[data-anim]').forEach(function (el) { appear.observe(el); });

  /* ── 3. Таймлайн: линия заполняется по мере скролла ──────── */
  var steps = $('#steps');
  if (steps) {
    var fill = $('.steps__fill', steps);
    var stepEls = $$('.step', steps);
    var ticking = false;

    var paint = function () {
      ticking = false;
      var r = steps.getBoundingClientRect();
      var vh = window.innerHeight;
      var p = (vh * 0.75 - r.top) / Math.max(r.height * 0.85, 1);
      p = Math.min(1, Math.max(0, p));
      if (fill) fill.style.setProperty('--progress', p.toFixed(3));
      stepEls.forEach(function (el, i) {
        el.classList.toggle('is-on', p >= i / stepEls.length);
      });
    };

    var onScroll = function () {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(paint);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    paint();
  }

  /* ── 4. FAQ: раскрытие через grid-template-rows ──────────── */
  $$('.qa').forEach(function (qa) {
    var summary = $('.qa__q', qa);
    var panel = $('.qa__a', qa);
    summary.addEventListener('click', function (e) {
      e.preventDefault();
      if (qa.open) {
        qa.classList.remove('is-open');
        if (reduced) { qa.open = false; return; }
        var close = function (ev) {
          if (ev.propertyName !== 'grid-template-rows') return;
          qa.open = false;
          panel.removeEventListener('transitionend', close);
        };
        panel.addEventListener('transitionend', close);
      } else {
        qa.open = true;
        requestAnimationFrame(function () { qa.classList.add('is-open'); });
      }
    });
  });

  /* ── 5. Панель вызова: после первого экрана, но не поверх главной формы ── */
  var bar = $('#callbar');
  var hero = $('#hero');
  var apply = $('#apply');
  var pastHero = false, formVisible = false;
  var syncTab = function () { if (bar) bar.classList.toggle('is-on', pastHero && !formVisible); };

  if (hero) new IntersectionObserver(function (es) {
    es.forEach(function (e) { pastHero = !e.isIntersecting; syncTab(); });
  }, { threshold: 0, rootMargin: '-120px 0px 0px 0px' }).observe(hero);

  if (apply) new IntersectionObserver(function (es) {
    es.forEach(function (e) { formVisible = e.isIntersecting; syncTab(); });
  }, { threshold: 0.12 }).observe(apply);

  var topbar = $('#topbar');
  if (topbar) {
    var sentinel = document.createElement('div');
    document.body.prepend(sentinel);
    new IntersectionObserver(function (es) {
      topbar.classList.toggle('is-stuck', !es[0].isIntersecting);
    }, { threshold: 1 }).observe(sentinel);
  }

  /* ── 6. Формы ────────────────────────────────────────────── */
  var ENDPOINT = (window.LEAD_ENDPOINT || '/api/lead');

  /* Режим превью. Нужен там, где сайт лежит статикой и serverless-функции нет:
     GitHub Pages, любой файловый хостинг, открытый локально index.html.
     Форма проходит валидацию и показывает успех, но заявка никуда не уходит.
     На собственном домене клиента режим не включается никогда. */
  var DEMO = ENDPOINT === 'demo' ||
             /[?&]demo=1(&|$)/.test(location.search) ||
             /(^|\.)github\.io$/.test(location.hostname);

  function sendLead(payload) {
    if (DEMO) {
      return new Promise(function (resolve) { setTimeout(resolve, 650); });
    }
    return fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json().catch(function () { return {}; });
    });
  }

  function maskPhone(input) {
    var digits = input.value.replace(/\D/g, '');
    if (digits[0] === '8') digits = '7' + digits.slice(1);
    if (digits[0] !== '7') digits = '7' + digits;
    digits = digits.slice(0, 11);
    var out = '+7';
    if (digits.length > 1) out += ' (' + digits.slice(1, 4);
    if (digits.length >= 5) out += ') ' + digits.slice(4, 7);
    if (digits.length >= 8) out += '-' + digits.slice(7, 9);
    if (digits.length >= 10) out += '-' + digits.slice(9, 11);
    input.value = out;
  }

  $$('[data-mask="phone"]').forEach(function (input) {
    input.addEventListener('focus', function () { if (!input.value) input.value = '+7 ('; });
    input.addEventListener('input', function () { maskPhone(input); });
    input.addEventListener('blur', function () { if (input.value.replace(/\D/g, '').length < 2) input.value = ''; });
  });

  function setError(field, message) {
    var box = field.closest('.field') || field.closest('.check');
    var err = $('.field__error', box);
    box.classList.toggle('is-invalid', !!message);
    if (!err) return;
    err.textContent = message || '';
    err.hidden = !message;
    if (message) field.setAttribute('aria-describedby', err.id);
    else field.removeAttribute('aria-describedby');
  }

  function validate(field) {
    var v = (field.value || '').trim();
    if (field.type === 'checkbox') {
      if (!field.checked) { setError(field, 'Нужно согласие на обработку данных'); return false; }
    } else if (field.name === 'name') {
      if (v.length < 2) { setError(field, 'Напишите, как к вам обращаться'); return false; }
    } else if (field.name === 'phone') {
      if (v.replace(/\D/g, '').length !== 11) { setError(field, 'Нужны все 11 цифр номера'); return false; }
    }
    setError(field, '');
    return true;
  }

  function stampNode(title, text) {
    var wrap = document.createElement('div');
    wrap.className = 'stamp';
    wrap.innerHTML =
      '<svg class="stamp__mark" viewBox="0 0 120 120" fill="none" stroke="currentColor" aria-hidden="true">' +
        '<circle cx="60" cy="60" r="54" stroke-width="2"/>' +
        '<circle cx="60" cy="60" r="45" stroke-width="1" opacity=".55"/>' +
        '<path d="M42 61l12 12 25-27" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>' +
        '<path d="M32 88h56" stroke-width="1" opacity=".5"/>' +
      '</svg>' +
      '<p class="stamp__title"></p><p class="stamp__text"></p>';
    $('.stamp__title', wrap).textContent = title;
    $('.stamp__text', wrap).textContent = text;
    requestAnimationFrame(function () { wrap.classList.add('is-on'); });
    return wrap;
  }

  $$('form[data-form]').forEach(function (form) {
    var status = $('.form__status', form);
    var button = $('button[type="submit"]', form);
    var fields = $$('input[name], textarea[name]', form).filter(function (f) { return f.name !== 'company'; });

    fields.forEach(function (f) {
      f.addEventListener('blur', function () { if (f.value || f.required) validate(f); });
      f.addEventListener('input', function () {
        var box = f.closest('.field') || f.closest('.check');
        if (box && box.classList.contains('is-invalid')) validate(f);
      });
      if (f.type === 'checkbox') f.addEventListener('change', function () { validate(f); });
    });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var ok = true;
      fields.forEach(function (f) { if (f.required && !validate(f)) ok = false; });
      if (!ok) {
        var bad = $('.is-invalid input, .is-invalid textarea', form);
        if (bad) bad.focus();
        return;
      }

      button.disabled = true;
      button.classList.add('is-busy');
      status.classList.remove('is-error');
      status.textContent = 'Отправляю';

      var payload = {
        name: (form.elements.name.value || '').trim(),
        phone: (form.elements.phone.value || '').trim(),
        message: form.elements.message ? form.elements.message.value.trim() : '',
        company: form.elements.company ? form.elements.company.value : '',
        source: form.dataset.form === 'quick' ? 'Первый экран' : 'Основная форма',
        page: location.href
      };

      sendLead(payload)
        .then(function () {
          var card = form.dataset.form === 'quick'
            ? stampNode('Заявка принята', 'Я перезвоню с номера +7 909 854-88-61.')
            : stampNode('Заявка принята', 'Я прочитаю описание и перезвоню с номера +7 909 854-88-61.');
          form.replaceWith(card);
          card.setAttribute('tabindex', '-1');
          card.focus();
        })
        .catch(function () {
          button.disabled = false;
          button.classList.remove('is-busy');
          status.classList.add('is-error');
          status.textContent = 'Заявка не отправилась. Позвоните мне: +7 909 854-88-61.';
        });
    });
  });

  var year = $('#year');
  if (year) year.textContent = new Date().getFullYear();
})();
