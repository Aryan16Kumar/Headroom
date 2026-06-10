'use strict';

// ISOLATED world: receives bridge messages from fetch-patch.js (MAIN world),
// validates them, and persists snapshots. postMessage is NOT a security
// boundary — any page script can send these — so every field is treated as
// untrusted input.
(() => {
  const C = Headroom.constants;

  // Per-tab state shared with badge.js (loaded after this file).
  Headroom.session = {
    // Once this tab's traffic reveals its org, the badge pins to it so a
    // multi-org user with two tabs never sees the other account's numbers.
    pinnedOrgId: null,
    // Set when a completion stream finished without a parseable message_limit.
    unavailable: false,
    onChange: null, // assigned by badge.js
    notify() {
      try {
        if (this.onChange) this.onChange();
      } catch {
        // badge failures must not break the bridge
      }
    },
  };

  function sanitizeOrgId(raw) {
    return typeof raw === 'string' && /^[\w-]{1,128}$/.test(raw) ? raw : null;
  }

  function sanitizeWindow(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const utilization = Number(raw.utilization);
    if (!Number.isFinite(utilization)) return null;
    const resetsAt = Number(raw.resets_at);
    return {
      utilization: Math.min(1, Math.max(0, utilization)),
      resetsAt:
        Number.isFinite(resetsAt) && resetsAt >= C.EPOCH_MIN_S && resetsAt <= C.EPOCH_MAX_S
          ? resetsAt
          : null,
      status: typeof raw.status === 'string' ? raw.status.slice(0, 64) : null,
    };
  }

  window.addEventListener('message', (event) => {
    if (event.source !== window || event.origin !== location.origin) return;
    const data = event.data;
    if (!data || typeof data !== 'object' || data.source !== C.BRIDGE_SOURCE) return;

    if (data.type === 'parse_miss') {
      Headroom.session.unavailable = true;
      Headroom.session.notify();
      return;
    }
    if (data.type !== 'snapshot') return;

    const orgId = sanitizeOrgId(data.orgId);
    if (!orgId) return;
    if (!data.windows || typeof data.windows !== 'object') return;

    const windows = {};
    for (const key of C.WINDOW_KEYS) {
      const sanitized = sanitizeWindow(data.windows[key]);
      if (sanitized) windows[key] = sanitized;
    }
    if (Object.keys(windows).length === 0) return;

    Headroom.session.pinnedOrgId = orgId;
    Headroom.session.unavailable = false;
    Headroom.session.notify();

    Headroom.storage.saveSnapshot({
      v: C.SNAPSHOT_VERSION,
      orgId,
      capturedAt: Date.now(),
      windows,
    });
  });
})();
