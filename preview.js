'use strict';

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
  // Внутренние ссылки можно переслать или открыть в новой вкладке.
  return html.replace(/\bhref="([^"]+)"/g, (attribute, href) => {
    if (!/^(?:#|[\w-]+\.html(?:[?#]|$))/.test(href)) return attribute;
    const [page, section] = href.split('#');
    const fragment = new URLSearchParams({ p: token });
    if (section) fragment.set('at', section);
    return 'href="' + page + '#' + fragment.toString().replaceAll('&', '&amp;') + '"';
  });
}

async function openPreview() {
  const token = new URLSearchParams(location.hash.slice(1)).get('p');
  const status = document.getElementById('preview-status');
  if (!/^[A-Za-z0-9_-]{22}$/.test(token || '')) {
    status.textContent = 'Для просмотра откройте полную ссылку из сообщения.';
    return;
  }

  try {
    const bytes = Uint8Array.from(atob(token.replaceAll('-', '+').replaceAll('_', '/') + '=='), char => char.charCodeAt(0));
    const key = await crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, ['decrypt']);
    const response = await fetch(document.body.dataset.bundle);
    if (!response.ok) throw new Error('Не загрузилась страница.');
    const file = new Uint8Array(await response.arrayBuffer());
    const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: file.subarray(0, 12) }, key, file.subarray(12));
    const metadataLength = new DataView(plaintext).getUint32(0);
    const metadata = JSON.parse(new TextDecoder().decode(new Uint8Array(plaintext, 4, metadataLength)));
    const pictures = new Map();
    let offset = 4 + metadataLength;
    for (const [name, size] of metadata.photos) {
      const photo = new Blob([new Uint8Array(plaintext, offset, size)], { type: 'image/webp' });
      pictures.set(name, URL.createObjectURL(photo));
      offset += size;
    }
    let html = shareableLinks(metadata.html, token);
    html = html.replace(/assets\/[\w-]+\.webp/g, name => pictures.get(name));
    html = html.replace('<title>', '<meta name="referrer" content="no-referrer"><title>Демоверсия · ');
    // Браузер сам разбирает исходный документ, применяет стили и запускает defer-скрипты.
    document.open();
    document.write(html);
    document.close();

    window.addEventListener('hashchange', scrollToPreviewSection);
    document.addEventListener('click', event => {
      const link = event.target.closest?.('a[href]');
      if (!event.defaultPrevented && link?.href === location.href) scrollToPreviewSection();
    });
    if (document.readyState === 'complete') scrollToPreviewSection();
    else window.addEventListener('load', scrollToPreviewSection, { once: true });
  } catch {
    status.textContent = 'Не удалось открыть демоверсию. Попробуйте ещё раз по полной ссылке из сообщения.';
  }
}

openPreview();
