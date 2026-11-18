'use strict';

document.documentElement.classList.add('has-js');

const menu = document.querySelector('.main-nav');
const menuButton = document.querySelector('.menu-toggle');
const narrowScreen = matchMedia('(max-width: 720px)');

function setMenu(open, returnFocus = false) {
  menu.classList.toggle('is-open', open);
  menuButton.setAttribute('aria-expanded', String(open));
  menuButton.setAttribute('aria-label', open ? 'Закрыть меню' : 'Открыть меню');
  if (open) menu.querySelector('a').focus();
  if (returnFocus) menuButton.focus();
}

menuButton.addEventListener('click', () => {
  const open = !menu.classList.contains('is-open');
  setMenu(open, !open);
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && menu.classList.contains('is-open')) {
    setMenu(false, true);
  }
});
document.addEventListener('click', (event) => {
  if (menu.classList.contains('is-open') && !event.target.closest('.masthead')) setMenu(false);
});
menu.addEventListener('click', (event) => {
  if (event.target.closest('a')) setMenu(false);
});
narrowScreen.addEventListener('change', () => setMenu(false));

function loadSelectedPhoto(picture) {
  if (!picture.dataset.deferSrc) return;
  if (picture.dataset.deferSrcset) picture.srcset = picture.dataset.deferSrcset;
  picture.src = picture.dataset.deferSrc;
  delete picture.dataset.deferSrcset;
  delete picture.dataset.deferSrc;
}

const gallery = document.querySelector('[data-cover-gallery]');
if (gallery) {
  const controls = gallery.querySelector('.cover-choices');
  const choices = Array.from(controls.querySelectorAll('button'));
  const shots = choices.map(choice => document.getElementById(choice.getAttribute('aria-controls')));
  const status = gallery.querySelector('[data-cover-status]');
  let requested = 0;

  function reveal(index) {
    if (index !== requested) return;
    shots.forEach((shot, position) => {
      const selected = index === position;
      shot.classList.toggle('is-current', selected);
      shot.setAttribute('aria-hidden', String(!selected));
      choices[position].setAttribute('aria-pressed', String(selected));
    });
  }

  choices.forEach((choice, index) => {
    const shot = shots[index];
    const picture = shot.querySelector('img');
    picture.addEventListener('load', () => reveal(index));
    picture.addEventListener('error', () => {
      if (requested === index) status.textContent = 'Не удалось загрузить фотографию.';
    });
    choice.addEventListener('click', () => {
      requested = index;
      status.textContent = '';
      shot.hidden = false;
      picture.loading = 'eager';
      loadSelectedPhoto(picture);
      if (picture.complete && picture.naturalWidth > 0) reveal(index);
    });
  });
  controls.hidden = false;
}

const explorer = document.querySelector('[data-room-explorer]');
if (explorer) {
  const tablist = explorer.querySelector('[data-room-tabs]');
  const tabs = Array.from(tablist.querySelectorAll('[data-room]'));
  const panels = tabs.map((tab) => document.getElementById('panel-' + tab.dataset.room));

  tablist.setAttribute('role', 'tablist');
  tabs.forEach((tab, index) => {
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-controls', panels[index].id);
    panels[index].setAttribute('role', 'tabpanel');
    panels[index].tabIndex = 0;
  });

  function showRoom(current, animate) {
    tabs.forEach((tab, index) => {
      const selected = current === index;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
      panels[index].hidden = !selected;
      panels[index].classList.toggle('is-changing', selected && animate);
      if (selected) loadSelectedPhoto(panels[index].querySelector('img'));
    });
    if (animate) history.replaceState({ ...history.state, selectedRoom: tabs[current].dataset.room }, '');
  }

  const restored = tabs.findIndex(tab => tab.dataset.room === history.state?.selectedRoom);
  showRoom(Math.max(restored, 0), false);
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', (event) => {
      if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      if (tab.getAttribute('aria-selected') !== 'true') showRoom(index, true);
    });
    tab.addEventListener('keydown', (event) => {
      let next;
      switch (event.key) {
        case 'ArrowRight': next = (index + 1) % tabs.length; break;
        case 'ArrowLeft': next = (index + tabs.length - 1) % tabs.length; break;
        case 'Home': next = 0; break;
        case 'End': next = tabs.length - 1; break;
        case ' ':
        case 'Enter':
          event.preventDefault();
          showRoom(index, true);
          return;
        default: return;
      }
      event.preventDefault();
      showRoom(next, true);
      tabs[next].focus();
    });
  });
}
