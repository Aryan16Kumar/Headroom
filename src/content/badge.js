'use strict';

// ISOLATED world: renders the floating quota pill in a Shadow DOM so neither
// side's CSS leaks. Reads snapshots from chrome.storage.local; all open tabs
// converge on the latest data via chrome.storage.onChanged.
(() => {
  const C = Headroom.constants;
  const T = Headroom.time;
  const S = Headroom.storage;

  if (window !== window.top) return;
  try {
    if (sessionStorage.getItem('headroom.dismissed') === '1') return;
  } catch {
    // sessionStorage blocked — proceed without dismissal memory
  }

  let host = null;
  let pill = null;
  let hintEl = null;
  let liveEl = null;
  const rows = {};
  let snapshot = null;
  let tickTimer = null;
  let announcedBands = null;
  let dismissed = false;

  init();

  async function init() {
    try {
      await domReady();
      const css = await loadCss();
      // No badge beats an unstyled box fighting claude.ai's UI.
      if (!css) return;
      build(css, await S.loadBadgePosition());
      Headroom.session.onChange = onSessionChange;
      chrome.storage.onChanged.addListener(onStorageChanged);
      snapshot = await loadRelevantSnapshot();
      render();
      scheduleTick();
    } catch (err) {
      console.warn('[headroom] badge init failed:', err && err.message);
    }
  }

  function domReady() {
    return new Promise((resolve) => {
      if (document.body) return resolve();
      document.addEventListener('DOMContentLoaded', () => resolve(), { once: true });
    });
  }

  async function loadCss() {
    try {
      const resp = await fetch(chrome.runtime.getURL('src/styles/badge.css'));
      return await resp.text();
    } catch (err) {
      console.warn('[headroom] could not load badge styles:', err && err.message);
      return null;
    }
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function build(css, pos) {
    host = document.createElement('div');
    const shadow = host.attachShadow({ mode: 'closed' });
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(css);
    shadow.adoptedStyleSheets = [sheet];

    pill = el('div', 'pill');
    pill.setAttribute('role', 'group');
    pill.setAttribute('aria-label', 'Headroom: claude.ai usage limits. Press Escape to dismiss.');
    pill.tabIndex = 0;

    for (const key of C.WINDOW_KEYS) {
      const row = el('div', 'row');
      const track = el('span', 'track');
      const fill = el('span', 'fill');
      track.appendChild(fill);
      const pct = el('span', 'pct', '–');
      const eta = el('span', 'eta', '');
      row.append(el('span', 'label', key), track, pct, eta);
      pill.appendChild(row);
      rows[key] = { row, fill, pct, eta };
    }

    hintEl = el('div', 'hint');
    liveEl = el('div', 'sr-only');
    liveEl.setAttribute('aria-live', 'polite');
    pill.append(hintEl, liveEl);
    shadow.appendChild(pill);

    if (pos) {
      host.style.right = `${pos.right}px`;
      host.style.bottom = `${pos.bottom}px`;
    }
    host.style.display = 'none';
    document.body.appendChild(host);

    enableDrag();
    pill.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') dismiss();
    });
  }

  function dismiss() {
    dismissed = true;
    try {
      sessionStorage.setItem('headroom.dismissed', '1');
    } catch {
      // best effort — worst case the badge returns on reload
    }
    clearTimeout(tickTimer);
    chrome.storage.onChanged.removeListener(onStorageChanged);
    Headroom.session.onChange = null;
    host.remove();
  }

  function enableDrag() {
    let drag = null;

    pill.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      const rect = pill.getBoundingClientRect();
      const style = getComputedStyle(host);
      drag = {
        startX: event.clientX,
        startY: event.clientY,
        right: parseFloat(style.right) || 16,
        bottom: parseFloat(style.bottom) || 16,
        width: rect.width,
        height: rect.height,
        moved: false,
      };
      pill.setPointerCapture(event.pointerId);
    });

    pill.addEventListener('pointermove', (event) => {
      if (!drag) return;
      const dx = event.clientX - drag.startX;
      const dy = event.clientY - drag.startY;
      if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
      if (!drag.moved) return;
      const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), Math.max(lo, hi));
      host.style.right = `${clamp(drag.right - dx, 8, window.innerWidth - drag.width - 8)}px`;
      host.style.bottom = `${clamp(drag.bottom - dy, 8, window.innerHeight - drag.height - 8)}px`;
    });

    const endDrag = () => {
      if (!drag) return;
      if (drag.moved) {
        S.saveBadgePosition({
          right: parseFloat(host.style.right),
          bottom: parseFloat(host.style.bottom),
        });
      }
      drag = null;
    };
    pill.addEventListener('pointerup', endDrag);
    pill.addEventListener('pointercancel', endDrag);
  }

  async function loadRelevantSnapshot() {
    const pinned = Headroom.session.pinnedOrgId;
    return pinned ? S.loadSnapshot(pinned) : S.loadLatest();
  }

  async function onSessionChange() {
    if (dismissed) return;
    try {
      snapshot = await loadRelevantSnapshot();
      render();
      scheduleTick();
    } catch {
      // keep showing what we have
    }
  }

  function onStorageChanged(changes, area) {
    if (area !== 'local' || dismissed) return;
    const pinned = Headroom.session.pinnedOrgId;
    const keys = Object.keys(changes);
    const relevant = pinned
      ? keys.includes(C.STORAGE_KEYS.snapshotPrefix + pinned)
      : keys.some(
          (k) => k.startsWith(C.STORAGE_KEYS.snapshotPrefix) || k === C.STORAGE_KEYS.latestOrgId
        );
    if (!relevant) return;
    // A fresh snapshot from any tab supersedes this tab's parse failure.
    Headroom.session.unavailable = false;
    onSessionChange();
  }

  function render() {
    if (dismissed) return;
    const now = Date.now();
    const unavailable = Headroom.session.unavailable;

    if (!snapshot && !unavailable) {
      host.style.display = 'none';
      return;
    }
    host.style.display = '';

    const bands = {};
    for (const key of C.WINDOW_KEYS) {
      const r = rows[key];
      const w = !unavailable && snapshot ? snapshot.windows[key] : null;
      r.row.classList.remove('green', 'amber', 'red', 'reset');

      if (!w) {
        r.fill.style.width = '0';
        r.pct.textContent = '–';
        r.eta.textContent = '';
        r.row.title = '';
        continue;
      }

      const resetsAtMs = w.resetsAt ? w.resetsAt * 1000 : null;
      if (resetsAtMs && now >= resetsAtMs) {
        // Don't extrapolate to 0% — the data is simply gone until the next send.
        r.row.classList.add('reset');
        r.fill.style.width = '0';
        r.pct.textContent = '';
        r.eta.textContent = 'reset — send a message to refresh';
        r.row.title = '';
        continue;
      }

      const pctNum = Math.round(w.utilization * 100);
      const band =
        w.utilization >= C.THRESHOLDS.red
          ? 'red'
          : w.utilization >= C.THRESHOLDS.amber
            ? 'amber'
            : 'green';
      bands[key] = { band, pctNum };
      r.row.classList.add(band);
      r.fill.style.width = `${pctNum}%`;
      r.pct.textContent = `${pctNum}%`;
      const eta = resetsAtMs ? T.formatCountdown(resetsAtMs - now) : null;
      r.eta.textContent = eta || '';
      r.row.title =
        `${C.WINDOW_NAMES[key]} window: ${pctNum}% used` + (eta ? `, resets in ${eta}` : '');
    }

    if (unavailable) {
      hintEl.textContent = 'limit data unavailable';
      hintEl.classList.add('visible');
    } else {
      const age = now - snapshot.capturedAt;
      if (age > C.STALE_AFTER_MS) {
        hintEl.textContent = `as of ${T.formatAge(age)} ago`;
        hintEl.classList.add('visible');
      } else {
        hintEl.textContent = '';
        hintEl.classList.remove('visible');
      }
    }

    announce(bands);
  }

  // Screen readers hear threshold crossings, not every countdown tick.
  function announce(bands) {
    if (!announcedBands) {
      announcedBands = bands;
      return;
    }
    const parts = [];
    for (const key of C.WINDOW_KEYS) {
      const prev = announcedBands[key];
      const cur = bands[key];
      if (cur && prev && cur.band !== prev.band) {
        parts.push(`${C.WINDOW_NAMES[key]} usage at ${cur.pctNum} percent`);
      }
    }
    announcedBands = bands;
    if (parts.length) liveEl.textContent = `Headroom: ${parts.join('; ')}`;
  }

  function scheduleTick() {
    clearTimeout(tickTimer);
    if (dismissed) return;
    const now = Date.now();
    let minRemaining = Infinity;
    if (snapshot) {
      for (const key of C.WINDOW_KEYS) {
        const w = snapshot.windows[key];
        if (w && w.resetsAt) minRemaining = Math.min(minRemaining, w.resetsAt * 1000 - now);
      }
    }
    tickTimer = setTimeout(() => {
      render();
      scheduleTick();
    }, T.tickInterval(minRemaining));
  }
})();
