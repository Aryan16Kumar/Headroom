
'use strict';

// ISOLATED-world namespace. Invisible to the page; shared across our content
// scripts, which the manifest loads in dependency order.
globalThis.Headroom = globalThis.Headroom || {};

Headroom.constants = {
  // Must match the literal in src/content/fetch-patch.js (MAIN world can't
  // share this object without polluting the page's globals).
  BRIDGE_SOURCE: 'headroom/bridge',

  SNAPSHOT_VERSION: 1,

  STORAGE_KEYS: {
    snapshotPrefix: 'snapshot:',
    latestOrgId: 'latestOrgId',
    badgePosition: 'badgePosition',
  },

  THRESHOLDS: { amber: 0.6, red: 0.85 },

  STALE_AFTER_MS: 5 * 60 * 1000,
  HISTORY_RETENTION_MS: 90 * 24 * 60 * 60 * 1000,

  // Plausible range for resets_at (epoch seconds): 2020-01-01 .. 2100-01-01.
  // Bridge payloads are untrusted input; anything outside this is dropped.
  EPOCH_MIN_S: 1577836800,
  EPOCH_MAX_S: 4102444800,

  WINDOW_KEYS: ['5h', '7d'],
  WINDOW_NAMES: { '5h': '5-hour', '7d': '7-day' },
};
