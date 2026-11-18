'use strict';

const visitForm = document.getElementById('visit-form');
const space = visitForm.elements.space;
const date = visitForm.elements.date;
const time = visitForm.elements.time;
const hours = visitForm.elements.hours;
const guests = visitForm.elements.guests;
const timeField = document.getElementById('time-field');
const hoursField = document.getElementById('hours-field');
const limit = document.getElementById('guest-limit');
const estimate = document.querySelector('.estimate');
const liveEstimate = document.getElementById('estimate-live');
const requestResult = document.getElementById('request-result');
const requestText = document.getElementById('request-text');
const copyStatus = document.getElementById('copy-status');
const steppers = Array.from(visitForm.querySelectorAll('[data-counter]'));
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
  const rate = weekend
    ? '<p class="estimate-total estimate-total--words">По договорённости</p>'
    : '<p class="estimate-total">' + priceMarkup(50000) + '</p><p>Тариф для обычных будней.</p>';
  return rate +
    '<p class="estimate-note">Два часа в бане включены. Стоимость на вашу дату и вместимость уточнит администратор.</p>';
}

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
    next = '<dl class="estimate-items">' +
      items.map(([name, value]) => '<div><dt>' + name + '</dt><dd>' + price(value) + '</dd></div>').join('') +
      '</dl><p class="estimate-total">' + priceMarkup(sum.total) + '</p>' +
      '<p class="estimate-note">Стоимость и время подтвердит администратор.</p>';
  }
  if (liveEstimate.dataset.output !== next) {
    liveEstimate.innerHTML = next;
    liveEstimate.dataset.output = next;
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
  copyStatus.textContent = '';
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
  problems.keys().next().value.focus();
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
  try {
    await navigator.clipboard.writeText(requestText.value);
    copyStatus.textContent = 'Текст скопирован.';
  } catch {
    requestText.focus();
    requestText.select();
    copyStatus.textContent = 'Текст выделен. Скопируйте его в меню устройства.';
  }
});

const parameters = new URLSearchParams(location.search);
const initialSpace = parameters.get('zal');
if (Array.from(space.options).some(option => option.value === initialSpace)) space.value = initialSpace;
visitForm.noValidate = true;
date.min = moscowTime()[0];
updateSpace();
const initialGuests = Number(parameters.get('gosti'));
if (Number.isSafeInteger(initialGuests) && initialGuests >= Number(guests.min)
    && (!guests.max || initialGuests <= Number(guests.max))) {
  guests.value = String(initialGuests);
}
updateEstimate();
