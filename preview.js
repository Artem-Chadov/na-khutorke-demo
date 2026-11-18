'use strict';

const previewBase = new URL(document.baseURI);
const sessionKey = 'hutorok-preview:' + previewBase.pathname;
const previewVersion = new URLSearchParams(location.search).get('v');

function keepPreviewVersion(url) {
  if (previewVersion && !url.searchParams.has('v')) url.searchParams.set('v', previewVersion);
}

function scrollToPreviewSection() {
  const section = new URLSearchParams(location.hash.slice(1)).get('at');
  if (!section) return;
  const target = document.getElementById(section);
  if (!target) return;
  if (section === 'main') {
    target.tabIndex = -1;
    target.focus({ preventScroll: true });
  }
  target.scrollIntoView();
}

function shareableLinks(html, token) {
  const current = new URL(location.href);
  const landing = document.body.dataset.page === 'index.html';
  // Относительные якоря остаются внутри документа, даже если лендинг открыт как /index.html?zal=...
  return html.replace(/<a\b[^>]*>/gi, tag => {
    const value = tag.match(/\shref="([^"]+)"/)?.[1];
    if (!value) return tag;
    const href = value.replaceAll('&amp;', '&');
    if (!/^(?:#|[\w-]+\.html(?:[?#]|$))/.test(href)) return tag;
    const address = new URL(href, href.startsWith('#') ? current : previewBase);
    const sameLanding = landing && address.pathname === new URL('index.html', previewBase).pathname;
    const section = address.hash.slice(1) || (sameLanding ? 'main' : '');
    const fragment = new URLSearchParams({ p: token });
    if (section) fragment.set('at', decodeURIComponent(section));
    if (section === 'zapis') {
      const space = tag.match(/\sdata-book-space="(russkiy|turetskiy|privat|kottedzh)"/)?.[1];
      const guests = tag.match(/\sdata-book-guests="([1-9]\d*)"/)?.[1];
      if (space) fragment.set('zal', space);
      if (guests) fragment.set('gosti', guests);
    }
    if (sameLanding && !address.search) {
      address.pathname = current.pathname;
      address.search = current.search;
    }
    keepPreviewVersion(address);
    address.hash = fragment.toString();
    const next = (address.pathname + address.search + address.hash).replaceAll('&', '&amp;');
    return tag.replace(/\shref="[^"]+"/, ' href="' + next + '"');
  });
}

function readSessionToken() {
  try { return sessionStorage.getItem(sessionKey); } catch { return null; }
}

function rememberToken(token) {
  try { sessionStorage.setItem(sessionKey, token); } catch { /* Полная ссылка работает и без хранилища. */ }
}

function refreshWrapper() {
  const url = new URL(location.href);
  if (url.searchParams.has('_demo_refresh')) return false;
  url.searchParams.set('_demo_refresh', Date.now().toString(36));
  location.replace(url.href);
  return true;
}

function showRecovery(message) {
  document.getElementById('preview-heading').hidden = false;
  document.getElementById('preview-status').textContent = message;
  const form = document.getElementById('preview-recovery');
  form.hidden = false;
  form.addEventListener('submit', event => {
    event.preventDefault();
    const input = document.getElementById('preview-address');
    const error = document.getElementById('preview-input-error');
    try {
      const url = new URL(input.value.trim());
      const supplied = new URLSearchParams(url.hash.slice(1)).get('p');
      const relative = url.pathname.slice(previewBase.pathname.length);
      if (url.origin !== previewBase.origin || !url.pathname.startsWith(previewBase.pathname) ||
          !/^(?:(?:index|zaly|kottedzh|zapis|404)\.html)?$/.test(relative) || !/^[A-Za-z0-9_-]{22}$/.test(supplied || '')) {
        throw new Error('Неполная ссылка.');
      }
      keepPreviewVersion(url);
      if (url.pathname === location.pathname && url.search === location.search) {
        history.replaceState(history.state, '', url.href);
        location.reload();
      } else {
        location.assign(url.href);
      }
    } catch {
      error.textContent = 'Вставьте полную ссылку на демоверсию «На Хуторке» вместе с частью после решётки.';
      error.hidden = false;
      input.setAttribute('aria-invalid', 'true');
      input.focus();
    }
  });
}

async function readEncrypted(name, key, priority = 'auto') {
  const response = await fetch(new URL(name, previewBase), { cache: 'force-cache', priority });
  if (!response.ok) throw Object.assign(new Error('Не загрузился файл демоверсии.'), { status: response.status });
  const file = new Uint8Array(await response.arrayBuffer());
  return crypto.subtle.decrypt({ name: 'AES-GCM', iv: file.subarray(0, 12) }, key, file.subarray(12));
}

function hydratePhotos(photos, key) {
  const images = document.querySelectorAll('img[data-preview-src]');
  if (!images.length) return;
  const requests = new Map();
  const choices = new WeakMap();
  const requested = new WeakSet();
  const visible = new Set();

  function candidate(image) {
    const sources = image.parentElement?.tagName === 'PICTURE' ? [...image.parentElement.querySelectorAll('source[data-preview-srcset]')] : [];
    const source = sources.find(item => !item.media || matchMedia(item.media).matches) || image;
    const set = source.dataset.previewSrcset || image.dataset.previewSrc;
    const list = set.trim().split(/\s*,\s*/).map(item => {
      const [name, descriptor = '1x'] = item.split(/\s+/);
      return { name, descriptor, size: parseFloat(descriptor) };
    }).sort((a, b) => a.size - b.size);
    const box = image.getBoundingClientRect();
    let slot = box.width;
    // В высоком кадре исходник разворачивается по высоте, а его боковые края уходят за границы экрана.
    if (image.closest('.cover-estate, .cover-sauna') && getComputedStyle(image).objectFit === 'cover') {
      const width = Number(image.getAttribute('width'));
      const height = Number(image.getAttribute('height'));
      if (width > 0 && height > 0) slot = Math.max(slot, box.height * width / height);
    }
    const needed = (list[0].descriptor.endsWith('w') ? slot : 1) * (window.devicePixelRatio || 1);
    return { source, ...(list.find(item => item.size >= needed) || list[list.length - 1]) };
  }

  async function fill(image, retried = false) {
    if (!image.isConnected || !image.getBoundingClientRect().width) return;
    if (image.hasAttribute('data-preview-deferred') && !requested.has(image) && getComputedStyle(image).opacity === '0') return;
    const selected = candidate(image);
    const shown = choices.get(image);
    if (!Object.hasOwn(photos, selected.name) || (shown?.source === selected.source && shown.size >= selected.size)) return;
    try {
      if (!requests.has(selected.name)) {
        const task = readEncrypted(photos[selected.name], key, image.fetchPriority)
          .then(bytes => URL.createObjectURL(new Blob([bytes], { type: 'image/webp' })))
          .catch(error => { requests.delete(selected.name); throw error; });
        requests.set(selected.name, task);
      }
      const url = await requests.get(selected.name);
      if (!image.isConnected || candidate(image).name !== selected.name) return;
      choices.set(image, selected);
      image.srcset = url + ' ' + selected.descriptor;
      image.src = url;
    } catch {
      if (!image.isConnected) return;
      if (!retried) setTimeout(() => fill(image, true), 800);
      else image.dispatchEvent(new Event('error'));
    }
  }

  const near = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        visible.add(entry.target);
        fill(entry.target);
      } else {
        visible.delete(entry.target);
      }
    }
  }, { rootMargin: '180px 0px' });
  const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(entries => {
    for (const entry of entries) if (visible.has(entry.target)) fill(entry.target);
  });
  const refresh = () => { for (const image of visible) fill(image); };
  window.addEventListener('resize', refresh, { passive: true });
  document.addEventListener('photo:request', event => {
    const image = event.target;
    if (!image.matches?.('img[data-preview-deferred]')) return;
    requested.add(image);
    // Обработчик сайта может открыть скрытую панель сразу после запроса фотографии.
    requestAnimationFrame(() => fill(image));
  });
  for (const image of images) {
    resize?.observe(image);
    if (near) near.observe(image);
    else { visible.add(image); fill(image); }
    if (image.fetchPriority === 'high') fill(image);
  }
}

function preparePhotoTags(html) {
  return html.replace(/<(?:img|source)\b[^>]*>/gi, tag => tag.replace(/(\s)(data-defer-)?(src|srcset)="([^"]*)"/g,
    (attribute, space, deferred, name, values) => {
      if (!/assets\/[\w-]+\.webp/.test(values)) return attribute;
      const marker = deferred && name === 'src' ? ' data-preview-deferred' : '';
      return space + 'data-preview-' + name + '="' + values + '"' + marker;
    }));
}

async function openPreview() {
  if (document.body.dataset.layout !== 'landing-v3') {
    // Старая оболочка из кэша может получить уже обновлённый загрузчик.
    if (!refreshWrapper()) document.getElementById('preview-status').textContent = 'Обновите страницу, чтобы открыть текущую демоверсию.';
    return;
  }
  const fragment = new URLSearchParams(location.hash.slice(1));
  const explicit = fragment.has('p');
  const token = explicit ? fragment.get('p') : readSessionToken();
  const isErrorPage = document.body.dataset.page === '404.html';
  if (!/^[A-Za-z0-9_-]{22}$/.test(token || '')) {
    showRecovery(explicit ? 'Не удалось открыть демоверсию. Проверьте полную ссылку из сообщения.' :
      isErrorPage ? 'По этому адресу страницы нет. Вставьте ссылку из сообщения, чтобы открыть усадьбу.' :
      'Для просмотра откройте полную ссылку из сообщения.');
    return;
  }

  try {
    const raw = Uint8Array.from(atob(token.replaceAll('-', '+').replaceAll('_', '/') + '=='), char => char.charCodeAt(0));
    const key = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['decrypt']);
    const bytes = await readEncrypted(document.body.dataset.bundle, key, 'high');
    const metadata = JSON.parse(new TextDecoder().decode(bytes));
    rememberToken(token);
    const current = new URL(location.href);
    current.searchParams.delete('_demo_refresh');
    if (!explicit) {
      const share = new URLSearchParams({ p: token });
      const section = fragment.get('at') || location.hash.slice(1);
      if (section) share.set('at', section);
      for (const name of ['zal', 'gosti']) if (fragment.has(name)) share.set(name, fragment.get(name));
      current.hash = share.toString();
    }
    if (current.href !== location.href) history.replaceState(history.state, '', current.href);
    // Подставляем базу и после расшифровки: фактический URL ошибочной страницы может иметь любую глубину.
    let html = shareableLinks(metadata.html, token);
    html = html.replace('<head>', '<head><base href="' + previewBase.href + '"><meta name="referrer" content="no-referrer">');
    html = html.replace('<title>', '<title>Демоверсия · ');
    html = preparePhotoTags(html);
    document.open();
    document.write(html);
    document.close();
    const startPhotos = () => hydratePhotos(metadata.photos, key);
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startPhotos, { once: true });
    else startPhotos();

    window.addEventListener('hashchange', () => {
      const state = new URLSearchParams(location.hash.slice(1));
      if (state.has('p') && state.get('p') !== token) {
        location.reload();
        return;
      }
      if (!state.has('p')) {
        const anchor = state.get('at') || location.hash.slice(1);
        const restored = new URLSearchParams({ p: token });
        if (anchor && document.getElementById(anchor)) restored.set('at', anchor);
        for (const name of ['zal', 'gosti']) if (state.has(name)) restored.set(name, state.get(name));
        history.replaceState(history.state, '', location.pathname + location.search + '#' + restored.toString());
      }
      scrollToPreviewSection();
    });
    document.addEventListener('click', event => {
      const link = event.target.closest?.('a[href]');
      if (!event.defaultPrevented && link?.href === location.href) scrollToPreviewSection();
    });
    if (document.readyState === 'complete') scrollToPreviewSection();
    else window.addEventListener('load', scrollToPreviewSection, { once: true });
  } catch (error) {
    if (error.status === 404 && refreshWrapper()) return;
    showRecovery('Не удалось открыть демоверсию. Попробуйте ещё раз по полной ссылке из сообщения.');
  }
}

openPreview();
