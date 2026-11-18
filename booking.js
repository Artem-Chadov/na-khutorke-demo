'use strict';

(() => {
  const visitForm = document.getElementById('visit-form');
  if (!visitForm) return;

  const space = visitForm.elements.space;
  const date = visitForm.elements.date;
  const time = visitForm.elements.time;
  const hours = visitForm.elements.hours;
  const guests = visitForm.elements.guests;
  const timeField = document.getElementById('time-field');
  const hoursField = document.getElementById('hours-field');
  const dateLabel = document.getElementById('visit-date-label');
  const limit = document.getElementById('guest-limit');
  const estimate = document.querySelector('.estimate');
  const liveEstimate = document.getElementById('estimate-live');
  const requestResult = document.getElementById('request-result');
  const requestText = document.getElementById('request-text');
  const copyStatus = document.getElementById('copy-status');
  const steppers = Array.from(visitForm.querySelectorAll('[data-counter]'));
  const draftFields = [space, guests, hours, date, time];
  const amount = new Intl.NumberFormat('ru-RU');
  const dayFormatter = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Moscow' });
  const clock = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  });
  const rates = {
    service: Number(estimate.dataset.serviceFee),
    extra: Number(estimate.dataset.extraRate),
    included: Number(estimate.dataset.includedGuests)
  };

  const price = (value) => amount.format(value) + ' ₽';
  const priceMarkup = value => amount.format(value) + ' <span class="currency">₽</span>';
  const chosenSpace = () => space.selectedOptions[0];
  const isCottage = () => space.value === 'kottedzh';
  const moscowTime = () => clock.format(new Date()).split(' ');

  function inflect(number, one, few, many) {
    const lastTwo = number % 100;
    const last = number % 10;
    if (lastTwo >= 11 && lastTwo <= 14) return many;
    if (last === 1) return one;
    return last >= 2 && last <= 4 ? few : many;
  }

  function hoursText(number) {
    return number + ' ' + inflect(number, 'час', 'часа', 'часов');
  }

  function guestText(number) {
    return number + ' ' + inflect(number, 'гость', 'гостя', 'гостей');
  }

  function updateSpace() {
    const cottage = isCottage();
    const maximum = chosenSpace().dataset.max;
    timeField.hidden = cottage;
    hoursField.hidden = cottage;
    time.disabled = cottage;
    hours.disabled = cottage;
    if (dateLabel) dateLabel.textContent = cottage ? 'Дата заезда' : 'Дата визита';
    if (maximum) {
      guests.max = maximum;
      if (guests.valueAsNumber > Number(maximum)) guests.value = maximum;
      limit.textContent = 'До ' + maximum + ' гостей';
    } else {
      guests.removeAttribute('max');
      limit.textContent = 'Вместимость уточнит администратор';
    }
  }

  function numberIsValid(input) {
    return Number.isSafeInteger(input.valueAsNumber) && input.validity.valid;
  }

  function calculate() {
    const count = guests.valueAsNumber;
    const length = hours.valueAsNumber;
    const room = chosenSpace();
    const rental = Number(room.dataset.hourly) * length;
    const service = rates.service * count;
    const additional = room.dataset.extra === 'true' ? Math.max(0, count - rates.included) : 0;
    const extra = rates.extra * additional * length;
    return { count, length, rental, service, additional, extra, total: rental + service + extra };
  }

  function cottageEstimate() {
    const weekday = date.value ? new Date(date.value + 'T12:00:00Z').getUTCDay() : null;
    const weekend = weekday === 0 || weekday === 6;
    const weekdayRate = Number(chosenSpace().dataset.weekdayRate || 50000);
    const rate = weekend
      ? '<p class="estimate-total estimate-total--words">По договорённости</p>'
      : '<p class="estimate-total">' + priceMarkup(weekdayRate) + '</p><p class="estimate-period">За сутки в будни. В праздники — по договорённости.</p>';
    return rate +
      '<p class="estimate-note">Два часа в бане включены. Стоимость на вашу дату и вместимость уточнит администратор.</p>';
  }

  let previousEstimate;

  function updateEstimate() {
    for (const button of steppers) {
      const field = visitForm.elements[button.dataset.counter];
      const value = field.valueAsNumber;
      const step = Number(button.dataset.step);
      button.disabled = step < 0 ? value <= Number(field.min) : Boolean(field.max) && value >= Number(field.max);
    }
    let next;
    if (isCottage()) {
      next = cottageEstimate();
    } else if (!numberIsValid(guests) || !numberIsValid(hours)) {
      next = '<p class="estimate-note">Укажите допустимое число гостей и часов для расчёта.</p>';
    } else {
      const sum = calculate();
      const items = [
        ['Аренда · ' + hoursText(sum.length), sum.rental],
        ['Сервисный сбор · ' + guestText(sum.count), sum.service]
      ];
      if (sum.extra) items.push(['Доплата за ' + guestText(sum.additional), sum.extra]);
      next = '<p class="estimate-total">' + priceMarkup(sum.total) + '</p><dl class="estimate-items">' +
        items.map(([name, value]) => '<div><dt>' + name + '</dt><dd>' + price(value) + '</dd></div>').join('') +
        '</dl>' +
        '<p class="estimate-note">Стоимость и время подтвердит администратор.</p>';
    }
    if (previousEstimate !== next) {
      liveEstimate.innerHTML = next;
      previousEstimate = next;
    }
  }

  const inputErrors = new Map([
    [date, document.getElementById('date-error')],
    [time, document.getElementById('time-error')],
    [guests, document.getElementById('guests-error')],
    [hours, document.getElementById('hours-error')]
  ]);

  function showError(field, message = '') {
    const target = inputErrors.get(field);
    target.textContent = message;
    target.hidden = !message;
    if (message) field.setAttribute('aria-invalid', 'true');
    else field.removeAttribute('aria-invalid');
  }

  function resetResult() {
    requestResult.hidden = true;
    requestText.value = '';
    copyStatus.textContent = '';
  }

  function rememberDraft() {
    const values = Object.fromEntries(draftFields.map(field => [field.name, field.value]));
    history.replaceState({ ...history.state, visitDraft: values }, '');
  }

  function restoreDraft(values) {
    if (!values || !draftFields.every(field => typeof values[field.name] === 'string')) return false;
    if (!Array.from(space.options).some(option => option.value === values.space)) return false;
    if (draftFields.some(field => field.value !== values[field.name])) {
      space.value = values.space;
      updateSpace();
      for (const field of draftFields) field.value = values[field.name];
      for (const field of inputErrors.keys()) showError(field);
      resetResult();
      updateEstimate();
    }
    return true;
  }

  function validate() {
    const [today, now] = moscowTime();
    date.min = today;
    const problems = new Map();
    if (!date.value) problems.set(date, 'Выберите дату визита.');
    else if (date.value < today) problems.set(date, 'Выберите сегодняшнюю дату или позже.');
    if (!isCottage() && (!time.value || (date.value === today && time.value < now))) {
      problems.set(time, time.value ? 'На сегодня выберите более позднее время.' : 'Укажите желаемое время.');
    }
    if (!numberIsValid(guests)) {
      problems.set(guests, guests.max ? 'Укажите от 1 до ' + guests.max + ' гостей.' : 'Укажите число гостей.');
    }
    if (!isCottage() && !numberIsValid(hours)) {
      problems.set(hours, 'Укажите от ' + hours.min + ' до ' + hours.max + ' часов.');
    }
    for (const field of inputErrors.keys()) showError(field, problems.get(field));
    if (!problems.size) return true;
    visitForm.querySelector('[aria-invalid="true"]:not(:disabled)').focus();
    return false;
  }

  for (const button of steppers) {
    button.addEventListener('click', () => {
      const input = visitForm.elements[button.dataset.counter];
      const min = Number(input.min);
      const max = input.max ? Number(input.max) : Number.MAX_SAFE_INTEGER;
      const value = input.valueAsNumber;
      const next = Number.isFinite(value) ? value + Number(button.dataset.step) : min;
      input.value = Math.min(max, Math.max(min, next));
      showError(input);
      resetResult();
      updateEstimate();
      rememberDraft();
      if (button.disabled) input.focus();
    });
  }

  visitForm.addEventListener('input', (event) => {
    if (event.target === space) {
      updateSpace();
      for (const field of [time, guests, hours]) showError(field);
    }
    if (inputErrors.has(event.target)) showError(event.target);
    resetResult();
    updateEstimate();
    rememberDraft();
  });

  visitForm.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!validate()) return;
    const day = dayFormatter.format(new Date(date.value + 'T12:00:00+03:00'));
    const details = ['Хочу уточнить запись в банную усадьбу на Хуторке.', chosenSpace().textContent.trim(), day + ' · ' + guestText(guests.valueAsNumber)];
    if (!isCottage()) {
      details.push('Начало в ' + time.value + ', ' + hoursText(hours.valueAsNumber) + '.');
      details.push('Предварительный расчёт — ' + price(calculate().total) + '.');
    }
    requestText.value = details.join('\n');
    requestResult.hidden = false;
    requestResult.focus();
  });

  document.getElementById('copy-request').addEventListener('click', async () => {
    const text = requestText.value;
    try {
      await navigator.clipboard.writeText(text);
      if (text === requestText.value && !requestResult.hidden) copyStatus.textContent = 'Текст скопирован.';
    } catch {
      if (text !== requestText.value || requestResult.hidden) return;
      requestText.focus();
      requestText.select();
      copyStatus.textContent = 'Текст выделен. Скопируйте его в меню устройства.';
    }
  });
  document.getElementById('edit-visit')?.addEventListener('click', () => space.focus());

  function applyPreset(roomId, guestCount) {
    const previousRoom = space.value;
    const previousGuests = guests.value;
    if (Array.from(space.options).some(option => option.value === roomId)) {
      space.value = roomId;
    }
    updateSpace();
    const count = Number(guestCount);
    if (Number.isSafeInteger(count) && count >= Number(guests.min) && (!guests.max || count <= Number(guests.max))) {
      guests.value = String(count);
    }
    if (previousRoom !== space.value || previousGuests !== guests.value) {
      for (const field of [time, guests, hours]) showError(field);
      resetResult();
    }
    updateEstimate();
  }

  let lastAddress;
  let lastSearch;
  function readPresetFromAddress() {
    if (lastAddress === location.href) return;
    const first = lastAddress === undefined;
    const queryChanged = lastSearch !== location.search;
    lastAddress = location.href;
    lastSearch = location.search;
    // У каждой записи истории свой черновик; при открытии пересланной ссылки история пуста.
    if (restoreDraft(history.state?.visitDraft)) return;
    const hash = new URLSearchParams(location.hash.slice(1));
    const query = new URLSearchParams(location.search);
    // Обычный якорь наследует query от страницы, но сам комнату не выбирает.
    const explicit = hash.has('zal') || hash.has('gosti');
    const anchor = hash.has('p') ? hash.get('at') || '' : location.hash.slice(1);
    const queryEntry = location.pathname + location.search + '#' + anchor;
    if (!explicit && !first && !queryChanged && history.state?.visitQueryPreset !== queryEntry) return;
    // Один предвыбор берётся из одного адреса: число из старого query не относится к новому залу во фрагменте.
    const preset = explicit ? hash : query;
    const room = preset.get('zal');
    const count = preset.get('gosti');
    if (room === null && count === null) return;
    applyPreset(room, count);
    if (!explicit && history.state?.visitQueryPreset !== queryEntry) {
      // Отмечаем исходную запись истории, чтобы Back восстановил предвыбор из query.
      history.replaceState({ ...history.state, visitQueryPreset: queryEntry }, '');
    }
  }

  document.addEventListener('click', (event) => {
    const trigger = event.target.closest?.('[data-book-space]');
    if (!trigger || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || trigger.target === '_blank') return;
    applyPreset(trigger.dataset.bookSpace, trigger.dataset.bookGuests);
    if (trigger.href === location.href) rememberDraft();
  });
  window.addEventListener('hashchange', readPresetFromAddress);
  window.addEventListener('popstate', readPresetFromAddress);

  visitForm.noValidate = true;
  date.min = moscowTime()[0];
  updateSpace();
  readPresetFromAddress();
  updateEstimate();
  document.getElementById('visit-interactive')?.removeAttribute('hidden');
  document.getElementById('visit-fallback')?.setAttribute('hidden', '');
})();
