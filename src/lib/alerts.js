'use strict';

globalThis.Headroom = globalThis.Headroom || {};

// Pure decision logic for the service worker's two v1 jobs: when to schedule a
// reset alarm, whether a fired alarm deserves a notification, and what the
// toolbar badge should read. No chrome.* calls live here so all of it is
// unit-testable — the worker itself stays a thin wiring layer.
Headroom.alerts = (() => {
  const C = Headroom.constants;
  const T = Headroom.time;

  const ALARM_PREFIX = 'reset:';

  function alarmName(orgId, windowKey) {
    return `${ALARM_PREFIX}${orgId}:${windowKey}`;
  }

  // orgIds are sanitized to [\w-]+ upstream, so the last ':' always separates
  // the org from the window key.
  function parseAlarmName(name) {
    if (typeof name !== 'string' || !name.startsWith(ALARM_PREFIX)) return null;
    const rest = name.slice(ALARM_PREFIX.length);
    const split = rest.lastIndexOf(':');
    if (split <= 0) return null;
    const orgId = rest.slice(0, split);
    const windowKey = rest.slice(split + 1);
    if (!C.WINDOW_KEYS.includes(windowKey)) return null;
    return { orgId, windowKey };
  }

  function band(utilization) {
    if (utilization >= C.THRESHOLDS.red) return 'red';
    if (utilization >= C.THRESHOLDS.amber) return 'amber';
    return 'green';
  }

  // A reset ping is only worth an interruption if the user was actually near
  // the wall. `status` is authoritative when present (over-limit reports
  // "exceeded_limit"); utilization is the fallback.
  function isNotifiable(w) {
    if (!w) return false;
    if (typeof w.status === 'string' && w.status && w.status !== 'within_limit') return true;
    const utilization = Number(w.utilization);
    return Number.isFinite(utilization) && utilization >= C.NOTIFY_MIN_UTILIZATION;
  }

  // One-shot alarms for every window that is still counting down and was last
  // seen close enough to the cap to be worth announcing. Every quota change
  // arrives as a fresh snapshot, so a window that later crosses the threshold
  // gets its alarm on that write.
  function plannedAlarms(snapshots, now) {
    const planned = [];
    for (const snapshot of snapshots || []) {
      if (!snapshot || !snapshot.orgId || !snapshot.windows) continue;
      for (const windowKey of C.WINDOW_KEYS) {
        const w = snapshot.windows[windowKey];
        if (!w || !w.resetsAt || !isNotifiable(w)) continue;
        const when = w.resetsAt * 1000;
        if (when <= now) continue;
        planned.push({ name: alarmName(snapshot.orgId, windowKey), when, windowKey });
      }
    }
    return planned;
  }

  // Which of our alarms to drop and which to (re)create. Alarms not carrying
  // our prefix belong to nobody else today, but we still leave them alone.
  function reconcileAlarms(existing, planned) {
    const desired = new Map(planned.map((p) => [p.name, p]));
    const obsolete = [];
    for (const alarm of existing || []) {
      if (!alarm || typeof alarm.name !== 'string' || !alarm.name.startsWith(ALARM_PREFIX)) continue;
      const want = desired.get(alarm.name);
      if (!want) {
        obsolete.push(alarm.name);
        continue;
      }
      // Same reset time — leave the live alarm alone. Drifted (the window
      // rolled forward) — recreate below.
      if (Math.abs(alarm.scheduledTime - want.when) <= 1000) desired.delete(alarm.name);
      else obsolete.push(alarm.name);
    }
    return { clear: obsolete, create: [...desired.values()] };
  }

  // Returns the notification to raise, or null. Null covers: notifications off,
  // alarm fired early, browser asleep so long that "just reset" would be a lie,
  // already announced this reset, or the user was never near the cap.
  function resetNotification({ snapshot, windowKey, now, lastNotifiedResetsAt, enabled }) {
    if (!enabled) return null;
    const w = snapshot && snapshot.windows ? snapshot.windows[windowKey] : null;
    if (!w || !w.resetsAt || !isNotifiable(w)) return null;

    const resetsAtMs = w.resetsAt * 1000;
    if (now < resetsAtMs) return null;
    if (now - resetsAtMs > C.NOTIFY_MAX_LATE_MS) return null;
    if (lastNotifiedResetsAt === w.resetsAt) return null;

    const name = C.WINDOW_NAMES[windowKey];
    return {
      id: `${ALARM_PREFIX}${snapshot.orgId}:${windowKey}:${w.resetsAt}`,
      title: `Your ${name} limit has reset`,
      message: `The ${name} window is back to full headroom. Send a message on claude.ai to refresh the gauge.`,
      resetsAt: w.resetsAt,
    };
  }

  // Toolbar badge reflects the window closest to its cap, since that's the one
  // that will stop you. A window past its reset carries no current information,
  // so we blank the number rather than show a value we know is out of date.
  function toolbarState(snapshot, now) {
    const idle = {
      text: '',
      color: null,
      title: 'Headroom — open claude.ai and send a message to start tracking',
    };
    if (!snapshot || !snapshot.windows) return idle;

    let worst = null;
    let anyReset = false;
    const lines = [];

    for (const windowKey of C.WINDOW_KEYS) {
      const w = snapshot.windows[windowKey];
      if (!w) continue;
      const name = C.WINDOW_NAMES[windowKey];
      const resetsAtMs = w.resetsAt ? w.resetsAt * 1000 : null;

      if (resetsAtMs && now >= resetsAtMs) {
        anyReset = true;
        lines.push(`${name}: reset — send a message to refresh`);
        continue;
      }

      const utilization = Number(w.utilization) || 0;
      if (!worst || utilization > worst.utilization) worst = { utilization, windowKey };
      const eta = resetsAtMs ? T.formatCountdown(resetsAtMs - now) : null;
      lines.push(
        `${name}: ${Math.round(utilization * 100)}% used` + (eta ? `, resets in ${eta}` : '')
      );
    }

    if (!worst) {
      if (!anyReset) return idle;
      return {
        text: '',
        color: null,
        title: `Headroom\n${lines.join('\n')}`,
      };
    }

    const age = now - snapshot.capturedAt;
    if (Number.isFinite(age) && age > C.STALE_AFTER_MS) {
      lines.push(`as of ${T.formatAge(age)} ago`);
    }

    return {
      text: `${Math.round(worst.utilization * 100)}%`,
      color: C.BADGE_COLORS[band(worst.utilization)],
      title: `Headroom\n${lines.join('\n')}`,
    };
  }

  return {
    ALARM_PREFIX,
    alarmName,
    parseAlarmName,
    band,
    isNotifiable,
    plannedAlarms,
    reconcileAlarms,
    resetNotification,
    toolbarState,
  };
})();
