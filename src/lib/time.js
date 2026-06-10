'use strict';

globalThis.Headroom = globalThis.Headroom || {};

Headroom.time = (() => {
  const SECOND = 1000;
  const MINUTE = 60 * SECOND;
  const HOUR = 60 * MINUTE;
  const DAY = 24 * HOUR;

  // Granularity per UI guidelines: "5d 03h" / "4h 32m" / "42m" / "4m 12s".
  function formatCountdown(ms) {
    if (!Number.isFinite(ms) || ms <= 0) return null;
    if (ms >= DAY) {
      const d = Math.floor(ms / DAY);
      const h = Math.floor((ms % DAY) / HOUR);
      return `${d}d ${String(h).padStart(2, '0')}h`;
    }
    if (ms >= HOUR) {
      const h = Math.floor(ms / HOUR);
      const m = Math.floor((ms % HOUR) / MINUTE);
      return `${h}h ${m}m`;
    }
    if (ms >= 5 * MINUTE) {
      return `${Math.floor(ms / MINUTE)}m`;
    }
    const m = Math.floor(ms / MINUTE);
    const s = Math.floor((ms % MINUTE) / SECOND);
    return `${m}m ${s}s`;
  }

  // Compact age for the "as of Xm ago" staleness hint.
  function formatAge(ms) {
    if (!Number.isFinite(ms) || ms < MINUTE) return '<1m';
    if (ms < HOUR) return `${Math.floor(ms / MINUTE)}m`;
    if (ms < DAY) return `${Math.floor(ms / HOUR)}h`;
    return `${Math.floor(ms / DAY)}d`;
  }

  // 1s refresh only inside the under-5-minutes band; 30s everywhere else
  // (including past-reset, where the countdown no longer moves).
  function tickInterval(msRemaining) {
    if (Number.isFinite(msRemaining) && msRemaining > 0 && msRemaining < 5 * MINUTE) {
      return 1000;
    }
    return 30000;
  }

  return { formatCountdown, formatAge, tickInterval };
})();
