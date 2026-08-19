
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
    settings: 'settings',
    // Last announced reset per org+window, so an alarm that fires twice (or a
    // service-worker restart) can't double-ping.
    notifyState: 'notifyState',
  },

  THRESHOLDS: { amber: 0.6, red: 0.85 },

  DEFAULT_SETTINGS: { resetNotifications: true },

  // Below this a "your window reset" notification is noise, not news.
  NOTIFY_MIN_UTILIZATION: 0.85,
  // Alarms don't fire while the browser is closed. A late ping is still useful
  // for a while; past this, "just reset" would be false.
  NOTIFY_MAX_LATE_MS: 30 * 60 * 1000,

  // Same palette as the in-page pill (src/styles/badge.css).
  BADGE_COLORS: { green: '#2f9e44', amber: '#e8a13c', red: '#d64545' },

  STALE_AFTER_MS: 5 * 60 * 1000,
  HISTORY_RETENTION_MS: 90 * 24 * 60 * 60 * 1000,

  // Plausible range for resets_at (epoch seconds): 2020-01-01 .. 2100-01-01.
  // Bridge payloads are untrusted input; anything outside this is dropped.
  EPOCH_MIN_S: 1577836800,
  EPOCH_MAX_S: 4102444800,

  WINDOW_KEYS: ['5h', '7d'],
  WINDOW_NAMES: { '5h': '5-hour', '7d': '7-day' },
};
