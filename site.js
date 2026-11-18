'use strict';
document.documentElement.classList.add('has-js');

function loadPhoto(image) {
  image?.dispatchEvent(new Event('photo:request', { bubbles:true }));
  if (!image?.dataset.deferSrc) return;
  const {deferSrc, deferSrcset} = image.dataset;
  image.addEventListener('error', () => {
    image.removeAttribute('src');
    image.removeAttribute('srcset');
    image.dataset.deferSrc = deferSrc;
    if (deferSrcset) image.dataset.deferSrcset = deferSrcset;
  }, {once:true});
  if (deferSrcset) image.srcset = deferSrcset;
  image.src = deferSrc;
  delete image.dataset.deferSrc;
  delete image.dataset.deferSrcset;
}

const navigation = document.querySelector('.main-nav');
const menuButton = document.querySelector('.menu-toggle');
function closeMenu(focus = false) {
  if (!navigation || !menuButton) return;
  navigation.classList.remove('is-open');
  menuButton.setAttribute('aria-expanded', 'false');
  menuButton.setAttribute('aria-label', 'Открыть меню');
  if (focus) menuButton.focus();
}
menuButton?.addEventListener('click', () => {
  if (navigation.classList.contains('is-open')) { closeMenu(true); return; }
  navigation.classList.add('is-open');
  menuButton.setAttribute('aria-expanded', 'true');
  menuButton.setAttribute('aria-label', 'Закрыть меню');
  navigation.querySelector('a').focus();
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && navigation?.classList.contains('is-open')) closeMenu(true);
});
document.addEventListener('click', event => {
  if (navigation?.classList.contains('is-open') && (!event.target.closest('.masthead') || event.target.closest('a'))) closeMenu();
});
matchMedia('(max-width:760px)').addEventListener('change', () => closeMenu());

const cover = document.querySelector('.cover');
if (cover) {
  const toggle = cover.querySelector('.peek');
  const inside = cover.querySelector('.cover-sauna');
  const picture = inside.querySelector('img');
  const status = cover.querySelector('[data-cover-status]');
  let requested = false;
  function showScene() {
    cover.dataset.scene = requested ? 'inside' : 'outside';
    toggle.setAttribute('aria-pressed', String(requested));
    inside.setAttribute('aria-hidden', String(!requested));
    cover.querySelector('.cover-estate').setAttribute('aria-hidden', String(requested));
    toggle.setAttribute('aria-label', requested ? 'Вернуться в комнату' : 'Посмотреть двор');
    toggle.title = toggle.getAttribute('aria-label');
  }
  picture.addEventListener('load', showScene);
  picture.addEventListener('error', () => {
    if (requested) { requested = false; showScene(); status.textContent = 'Фотография двора не загрузилась. Попробуйте ещё раз.'; }
  });
  toggle.hidden = false;
  toggle.addEventListener('click', () => {
    requested = !requested;
    status.textContent = '';
    if (!requested) { showScene(); return; }
    inside.hidden = false;
    loadPhoto(picture);
    if (picture.complete && picture.naturalWidth) showScene();
  });
}

const fragmentParams = () => new URLSearchParams(location.hash.slice(1));
const entries = [...document.querySelectorAll('.room-entry')];
const roomButtons = entries.map(entry => entry.querySelector('[data-room]'));

function selectRoom(id, fromGuest = false) {
  const selected = entries.find(entry => entry.id === id);
  if (!selected) return;
  for (const entry of entries) {
    const active = entry === selected;
    entry.toggleAttribute('data-selected', active);
    const button = entry.querySelector('.room-toggle');
    button.setAttribute('aria-expanded', String(active));
    button.setAttribute('aria-disabled', String(active));
    const panel = document.getElementById(button.getAttribute('aria-controls'));
    panel.hidden = !active;
    panel.toggleAttribute('data-current', active);
    if (active && (fromGuest || entry !== entries[0])) loadPhoto(panel.querySelector('.room-shot img'));
    panel.toggleAttribute('data-opened', active && fromGuest);
  }
  if (fromGuest) {
    history.replaceState({...history.state, selectedRoom:id}, '');
  }
}

function restoreRoom() {
  const params = fragmentParams();
  const section = params.get('at') || location.hash.slice(1);
  const query = new URLSearchParams(location.search);
  const sectionHasRoom = section === 'zaly' || section === 'zapis';
  const addressRoom = sectionHasRoom ? params.get('zal') || query.get('zal') : section;
  const current = entries.find(entry => entry.hasAttribute('data-selected'))?.id;
  const draftRoom = section === 'zapis' ? history.state?.visitDraft?.space : null;
  const pick = [draftRoom, history.state?.selectedRoom, addressRoom, current, entries[0]?.id]
    .find(id => entries.some(entry => entry.id === id));
  selectRoom(pick);
}

if (entries.length) {
  restoreRoom();
  const spaceField = document.getElementById('space');
  spaceField?.addEventListener('input', () => {
    if (!entries.some(entry => entry.id === spaceField.value && entry.hasAttribute('data-selected'))) {
      selectRoom(spaceField.value, true);
    }
  });
  roomButtons.forEach((button, index) => {
    button.addEventListener('click', () => {
      const room = button.dataset.room;
      if (!entries[index].hasAttribute('data-selected')) selectRoom(room, true);
      if (spaceField && spaceField.value !== room) {
        spaceField.value = room;
        spaceField.dispatchEvent(new Event('input', {bubbles:true}));
      }
    });
    button.addEventListener('keydown', event => {
      const next = (index + 1) % entries.length;
      const previous = (index + entries.length - 1) % entries.length;
      const keys = {ArrowDown:next, ArrowRight:next, ArrowUp:previous, ArrowLeft:previous, Home:0, End:entries.length - 1};
      if (!Object.hasOwn(keys,event.key)) return;
      event.preventDefault();
      roomButtons[keys[event.key]].focus();
    });
  });
  window.addEventListener('popstate', restoreRoom);
}

// Сведения о выбранном визите остаются во фрагменте: ссылки работают и после пересылки, и с диска.
if (!fragmentParams().has('p')) {
  for (const cta of document.querySelectorAll('a[data-book-space]')) {
    const params = new URLSearchParams({at:'zapis',zal:cta.dataset.bookSpace});
    if (cta.dataset.bookGuests) params.set('gosti',cta.dataset.bookGuests);
    cta.setAttribute('href','#'+params);
  }
  function scrollToSelection() {
    if (fragmentParams().get('at')==='zapis') {
      const target=document.getElementById('zapis');
      target?.scrollIntoView();
    }
  }
  window.addEventListener('hashchange', scrollToSelection);
  if(fragmentParams().has('at')) window.addEventListener('load', scrollToSelection, {once:true});
}

// Клавиатура продолжает путь с первого поля, а возврат ведёт к тому действию, откуда пришёл гость.
if (document.getElementById('zapis')) {
  const anchors = [...document.querySelectorAll('a[href]')];
  const sectionOf = url => new URLSearchParams(url.hash.slice(1)).get('at') || url.hash.slice(1);
  let clickedDestination = null;
  function focusAfterNavigation() {
    const current = new URL(location.href);
    const returning = !clickedDestination;
    clickedDestination = null;
    const source = returning && Number.isInteger(history.state?.landingFocus)
      ? anchors[history.state.landingFocus] : null;
    requestAnimationFrame(() => {
      if (sectionOf(current) === 'zapis') {
        document.getElementById('space')?.focus({preventScroll:true});
      } else if (source) {
        const target = source.getClientRects().length ? source : menuButton;
        target?.focus({preventScroll:true});
        const rect = target?.getBoundingClientRect();
        if (rect && (rect.bottom < 0 || rect.top > innerHeight)) target.scrollIntoView({block:'nearest', behavior:'instant'});
      }
    });
  }
  document.addEventListener('click', event => {
    const link = event.target.closest?.('a[href]');
    if (!link || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    const next = new URL(link.href);
    if (next.origin !== location.origin || next.pathname !== location.pathname || next.search !== location.search || !next.hash) return;
    if (next.href !== location.href) history.replaceState({...history.state, landingFocus:anchors.indexOf(link)}, '');
    clickedDestination = next.href;
    if (next.href === location.href) focusAfterNavigation();
  }, true);
  window.addEventListener('hashchange', focusAfterNavigation);
}

const gallery = document.getElementById('galereya');
if (gallery) {
  const thumbnails = [...gallery.querySelectorAll('[data-gallery-index]')];
  const frames = [...gallery.querySelectorAll('[data-gallery-frame]')];
  const caption = gallery.querySelector('[data-gallery-caption]');
  const counter = gallery.querySelector('[data-gallery-count]');
  const expandButton = gallery.querySelector('.gallery-all');

  function showGalleryFrame(index) {
    frames.forEach((frame, position) => {
      frame.hidden = position !== index;
      frame.toggleAttribute('data-active', position === index);
    });
    thumbnails.forEach((button, position) => {
      button.setAttribute('aria-pressed', String(position === index));
    });
    loadPhoto(frames[index].querySelector('img'));
    caption.textContent = thumbnails[index].dataset.caption;
    counter.textContent = (index + 1) + ' из ' + frames.length;
    expandButton.dataset.openPhoto = String(index);
  }

  thumbnails.forEach((button, index) => {
    button.addEventListener('click', () => showGalleryFrame(index));
    button.addEventListener('keydown', event => {
      const last = thumbnails.length - 1;
      const destinations = {ArrowLeft:(index + last) % thumbnails.length, ArrowRight:(index + 1) % thumbnails.length, Home:0, End:last};
      if (!(event.key in destinations)) return;
      event.preventDefault();
      const next = destinations[event.key];
      showGalleryFrame(next);
      thumbnails[next].focus({preventScroll:true});
    });
  });
  frames.forEach((frame, index) => { frame.hidden = index !== 0; });
  gallery.querySelector('.gallery-controls').hidden = false;
}

const album = document.getElementById('album');
if (album && typeof album.showModal === 'function') {
  const slides = [...album.querySelectorAll('[data-album-slide]')];
  const position = album.querySelector('[data-album-position]');
  const close = album.querySelector('[data-album-close]');
  let activeIndex = 0;
  let opener;
  function openSlide(next) {
    activeIndex = (next + slides.length) % slides.length;
    slides.forEach((slide,index)=>{slide.hidden=index!==activeIndex;});
    const current = slides[activeIndex];
    loadPhoto(current.querySelector('img'));
    position.textContent = (activeIndex+1)+' из '+slides.length;
  }
  for (const button of document.querySelectorAll('[data-open-photo]')) {
    button.hidden = false;
    button.addEventListener('click', () => {
      opener=button;
      openSlide(Number(button.dataset.openPhoto));
      album.showModal();
      close.focus({preventScroll:true});
    });
  }
  album.querySelectorAll('[data-album-step]').forEach(button=>{
    button.addEventListener('click',()=>openSlide(activeIndex+Number(button.dataset.albumStep)));
  });
  album.addEventListener('keydown',event=>{
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    openSlide(activeIndex + (event.key === 'ArrowLeft' ? -1 : 1));
  });
  close.addEventListener('click',()=>album.close());
  album.addEventListener('close',()=>opener?.focus({preventScroll:true}));
  album.addEventListener('click',event=>{
    const box=album.getBoundingClientRect();
    if (event.target===album && (event.clientX<box.left||event.clientX>box.right||event.clientY<box.top||event.clientY>box.bottom)) album.close();
  });
}
