'use strict';

const previewBase = new URL(document.baseURI);
const sessionKey = 'hutorok-preview:' + previewBase.pathname;

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
  // Сохраняем ключ только во фрагменте, включая переходы из вложенного адреса 404.
  return html.replace(/\bhref="([^"]+)"/g, (attribute, value) => {
    const href = value.replaceAll('&amp;', '&');
    if (!/^(?:#|[\w-]+\.html(?:[?#]|$))/.test(href)) return attribute;
    const address = new URL(href, href.startsWith('#') ? location.href : previewBase);
    const section = address.hash.slice(1);
    const fragment = new URLSearchParams({ p: token });
    if (section) fragment.set('at', decodeURIComponent(section));
    address.hash = fragment.toString();
    return 'href="' + (address.pathname + address.search + address.hash).replaceAll('&', '&amp;') + '"';
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
  const visible = new Set();

  function candidate(image) {
    const sources = image.parentElement?.tagName === 'PICTURE' ? [...image.parentElement.querySelectorAll('source[data-preview-srcset]')] : [];
    const source = sources.find(item => !item.media || matchMedia(item.media).matches) || image;
    const set = source.dataset.previewSrcset || image.dataset.previewSrc;
    const list = set.trim().split(/\s*,\s*/).map(item => {
      const [name, descriptor = '1x'] = item.split(/\s+/);
      return { name, descriptor, size: parseFloat(descriptor) };
    }).sort((a, b) => a.size - b.size);
    // После вёрстки известна реальная ширина фотографии, в том числе внутри цифры на странице 404.
    const slot = image.getBoundingClientRect().width;
    const needed = (list[0].descriptor.endsWith('w') ? slot : 1) * (window.devicePixelRatio || 1);
    return { source, ...(list.find(item => item.size >= needed) || list[list.length - 1]) };
  }

  async function fill(image, retried = false) {
    if (!image.isConnected || !image.getBoundingClientRect().width) return;
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
  for (const image of images) {
    resize?.observe(image);
    if (near) near.observe(image);
    else { visible.add(image); fill(image); }
    if (image.fetchPriority === 'high') fill(image);
  }
}

function preparePhotoTags(html) {
  return html.replace(/<(?:img|source)\b[^>]*>/gi, tag => tag.replace(/\s(?:data-defer-)?(src|srcset)="([^"]*)"/g,
    (attribute, name, values) => /assets\/[\w-]+\.webp/.test(values) ? ' data-preview-' + name + '="' + values + '"' : attribute));
}

async function openPreview() {
  if (!document.body.dataset.page) {
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

    window.addEventListener('hashchange', scrollToPreviewSection);
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
