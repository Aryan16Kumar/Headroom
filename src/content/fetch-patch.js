'use strict';

// MAIN world, document_start: wraps window.fetch so we can observe completion
// responses. The original response passes through untouched — we only read a
// clone. Every code path that touches the page is wrapped: breaking claude.ai
// is the one unforgivable failure mode.
(() => {
  const sse = globalThis.__headroomSSE;
  delete globalThis.__headroomSSE; // keep the page's global namespace clean
  if (!sse || typeof window.fetch !== 'function' || window.fetch.__headroomPatched) return;

  // Must match Headroom.constants.BRIDGE_SOURCE in the ISOLATED world.
  const BRIDGE_SOURCE = 'headroom/bridge';
  // Anthropic versions this endpoint (completion2 today) — tolerate drift.
  const COMPLETION_RE = /\/completion\d*$/;
  const ORG_RE = /\/organizations\/([^/]+)\//;

  const originalFetch = window.fetch;

  function requestUrl(input) {
    try {
      if (typeof input === 'string') return input;
      if (input instanceof URL) return input.href;
      if (input && typeof input.url === 'string') return input.url;
    } catch {
      // fall through
    }
    return '';
  }

  function post(message) {
    try {
      window.postMessage({ source: BRIDGE_SOURCE, ...message }, location.origin);
    } catch {
      // never let bridge failures surface to the page
    }
  }

  async function observe(url, response) {
    const path = new URL(url, location.origin).pathname;
    if (!COMPLETION_RE.test(path)) return;
    const orgMatch = ORG_RE.exec(path);
    if (!orgMatch) return;
    const orgId = orgMatch[1];

    const contentType = response.headers.get('content-type') || '';
    if (!response.ok || !contentType.includes('text/event-stream') || !response.body) return;

    const reader = response.clone().body.getReader();
    const decoder = new TextDecoder('utf-8');
    const extractor = sse.createMessageLimitExtractor();
    let limit = null;
    let completed = false;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        // The trailing blank line flushes a final event that lacks one.
        const text = done ? decoder.decode() + '\n\n' : decoder.decode(value, { stream: true });
        const found = extractor.push(text);
        if (found) limit = found;
        if (done) completed = true;
        if (limit || done) break;
      }
    } catch {
      // Stream aborted (user hit stop) or errored — report nothing rather
      // than flag a false "unavailable".
      return;
    } finally {
      try {
        reader.cancel();
      } catch {
        // already closed
      }
    }

    if (limit && limit.windows && typeof limit.windows === 'object') {
      // Forward only quota metadata — never the rest of the stream.
      const pick = (w) =>
        w && typeof w === 'object'
          ? { status: w.status, utilization: w.utilization, resets_at: w.resets_at }
          : null;
      post({
        type: 'snapshot',
        orgId,
        windows: { '5h': pick(limit.windows['5h']), '7d': pick(limit.windows['7d']) },
      });
    } else if (completed && extractor.hasSeenCompleteEvent()) {
      // The stream finished and parsed as SSE, but message_limit never came —
      // likely schema drift. The badge must show "unavailable", not stale data.
      post({ type: 'parse_miss', orgId });
    }
  }

  window.fetch = function patchedFetch(...args) {
    const result = originalFetch.apply(this, args);
    try {
      const url = requestUrl(args[0]);
      if (url && url.includes('/completion')) {
        result.then(
          (response) => {
            observe(url, response).catch(() => {});
          },
          () => {}
        );
      }
    } catch {
      // observation is best-effort; the page's fetch result is already on its way
    }
    return result;
  };

  try {
    Object.defineProperty(window.fetch, '__headroomPatched', { value: true });
  } catch {
    // cosmetic only — double-patching is still prevented within this script
  }
})();
