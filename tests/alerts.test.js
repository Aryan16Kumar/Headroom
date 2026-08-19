'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

require('../src/lib/constants.js');
require('../src/lib/time.js');
require('../src/lib/alerts.js');

const C = globalThis.Headroom.constants;
const {
  alarmName,
  parseAlarmName,
  band,
  isNotifiable,
  plannedAlarms,
  reconcileAlarms,
  resetNotification,
  toolbarState,
} = globalThis.Headroom.alerts;

const NOW = 1781000000000; // fixed clock; every expectation is relative to it
const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const sec = (ms) => Math.floor(ms / 1000);

function snapshot(overrides = {}) {
  return {
    v: C.SNAPSHOT_VERSION,
    orgId: 'org-abc',
    capturedAt: NOW - MINUTE,
    windows: {
      '5h': { utilization: 0.9, resetsAt: sec(NOW + HOUR), status: 'within_limit' },
      '7d': { utilization: 0.2, resetsAt: sec(NOW + 50 * HOUR), status: 'within_limit' },
    },
    ...overrides,
  };
}

test('alarm names round-trip and reject anything unexpected', () => {
  assert.equal(alarmName('org-abc', '5h'), 'reset:org-abc:5h');
  assert.deepEqual(parseAlarmName('reset:org-abc:5h'), { orgId: 'org-abc', windowKey: '5h' });
  assert.deepEqual(parseAlarmName(alarmName('a_b-1', '7d')), { orgId: 'a_b-1', windowKey: '7d' });
  assert.equal(parseAlarmName('reset:org-abc:9y'), null); // unknown window
  assert.equal(parseAlarmName('reset:5h'), null); // no org segment
  assert.equal(parseAlarmName('somethingelse:org:5h'), null);
  assert.equal(parseAlarmName(undefined), null);
});

test('band matches the documented color thresholds', () => {
  assert.equal(band(0.59), 'green');
  assert.equal(band(0.6), 'amber');
  assert.equal(band(0.84), 'amber');
  assert.equal(band(0.85), 'red');
  assert.equal(band(1), 'red');
});

test('isNotifiable: near the cap by utilization, or any non-healthy status', () => {
  assert.equal(isNotifiable({ utilization: 0.85, status: 'within_limit' }), true);
  assert.equal(isNotifiable({ utilization: 0.84, status: 'within_limit' }), false);
  // Over-limit clamps utilization to 1 upstream, but status is the real signal.
  assert.equal(isNotifiable({ utilization: 0.1, status: 'exceeded_limit' }), true);
  assert.equal(isNotifiable({ utilization: 'nope', status: 'within_limit' }), false);
  assert.equal(isNotifiable(null), false);
});

test('plannedAlarms: only future resets on windows worth announcing', () => {
  const planned = plannedAlarms([snapshot()], NOW);
  assert.deepEqual(planned, [
    { name: 'reset:org-abc:5h', when: sec(NOW + HOUR) * 1000, windowKey: '5h' },
  ]);
});

test('plannedAlarms: skips resets already in the past', () => {
  const past = snapshot({
    windows: { '5h': { utilization: 0.95, resetsAt: sec(NOW - MINUTE), status: 'within_limit' } },
  });
  assert.deepEqual(plannedAlarms([past], NOW), []);
});

test('plannedAlarms: covers every org independently', () => {
  const other = snapshot({
    orgId: 'org-two',
    windows: { '7d': { utilization: 0.99, resetsAt: sec(NOW + 2 * HOUR), status: 'within_limit' } },
  });
  const names = plannedAlarms([snapshot(), other], NOW).map((p) => p.name);
  assert.deepEqual(names, ['reset:org-abc:5h', 'reset:org-two:7d']);
});

test('plannedAlarms: tolerates junk snapshots', () => {
  assert.deepEqual(plannedAlarms([null, {}, { orgId: 'x' }], NOW), []);
  assert.deepEqual(plannedAlarms(undefined, NOW), []);
});

test('reconcileAlarms: keeps live alarms, clears obsolete, recreates drifted', () => {
  const planned = [
    { name: 'reset:org-abc:5h', when: NOW + HOUR, windowKey: '5h' },
    { name: 'reset:org-abc:7d', when: NOW + 50 * HOUR, windowKey: '7d' },
  ];
  const existing = [
    { name: 'reset:org-abc:5h', scheduledTime: NOW + HOUR }, // unchanged
    { name: 'reset:org-abc:7d', scheduledTime: NOW + 40 * HOUR }, // window rolled forward
    { name: 'reset:org-gone:5h', scheduledTime: NOW + HOUR }, // org no longer tracked
    { name: 'someoneelse', scheduledTime: NOW + HOUR }, // not ours
  ];
  const { clear, create } = reconcileAlarms(existing, planned);
  assert.deepEqual(clear, ['reset:org-abc:7d', 'reset:org-gone:5h']);
  assert.deepEqual(
    create.map((c) => c.name),
    ['reset:org-abc:7d']
  );
});

test('reconcileAlarms: creates everything when nothing is scheduled yet', () => {
  const planned = [{ name: 'reset:org-abc:5h', when: NOW + HOUR, windowKey: '5h' }];
  assert.deepEqual(reconcileAlarms([], planned), { clear: [], create: planned });
});

const notifyArgs = (overrides = {}) => ({
  snapshot: snapshot({
    windows: {
      '5h': { utilization: 0.95, resetsAt: sec(NOW), status: 'exceeded_limit' },
      '7d': { utilization: 0.2, resetsAt: sec(NOW + 50 * HOUR), status: 'within_limit' },
    },
  }),
  windowKey: '5h',
  now: NOW + MINUTE,
  lastNotifiedResetsAt: null,
  enabled: true,
  ...overrides,
});

test('resetNotification: announces a passed reset the user was blocked on', () => {
  const plan = resetNotification(notifyArgs());
  assert.equal(plan.id, `reset:org-abc:5h:${sec(NOW)}`);
  assert.equal(plan.title, 'Your 5-hour limit has reset');
  assert.match(plan.message, /full headroom/);
  assert.equal(plan.resetsAt, sec(NOW));
});

test('resetNotification: silent when the setting is off', () => {
  assert.equal(resetNotification(notifyArgs({ enabled: false })), null);
});

test('resetNotification: silent before the reset actually happens', () => {
  assert.equal(resetNotification(notifyArgs({ now: NOW - MINUTE })), null);
});

test('resetNotification: silent once too late to claim "just reset"', () => {
  const late = C.NOTIFY_MAX_LATE_MS + MINUTE;
  assert.equal(resetNotification(notifyArgs({ now: NOW + late })), null);
  assert.ok(resetNotification(notifyArgs({ now: NOW + C.NOTIFY_MAX_LATE_MS })));
});

test('resetNotification: never announces the same reset twice', () => {
  assert.equal(resetNotification(notifyArgs({ lastNotifiedResetsAt: sec(NOW) })), null);
  // A later reset for the same window is still news.
  assert.ok(resetNotification(notifyArgs({ lastNotifiedResetsAt: sec(NOW) - 5 * 3600 })));
});

test('resetNotification: silent when the user was nowhere near the cap', () => {
  const relaxed = notifyArgs({
    snapshot: snapshot({
      windows: { '5h': { utilization: 0.3, resetsAt: sec(NOW), status: 'within_limit' } },
    }),
  });
  assert.equal(resetNotification(relaxed), null);
});

test('resetNotification: tolerates a missing snapshot or window', () => {
  assert.equal(resetNotification(notifyArgs({ snapshot: null })), null);
  assert.equal(resetNotification(notifyArgs({ windowKey: '7d', now: NOW })), null);
});

test('toolbarState: no data yet is an empty badge with a hint', () => {
  const idle = toolbarState(null, NOW);
  assert.equal(idle.text, '');
  assert.equal(idle.color, null);
  assert.match(idle.title, /send a message to start tracking/);
});

test('toolbarState: shows the window closest to its cap', () => {
  const state = toolbarState(snapshot(), NOW);
  assert.equal(state.text, '90%');
  assert.equal(state.color, C.BADGE_COLORS.red);
  assert.match(state.title, /5-hour: 90% used, resets in 1h 0m/);
  assert.match(state.title, /7-day: 20% used, resets in 2d 02h/);
  assert.doesNotMatch(state.title, /as of/);
});

test('toolbarState: colors follow the shared thresholds', () => {
  const amber = snapshot({
    windows: { '5h': { utilization: 0.7, resetsAt: sec(NOW + HOUR), status: 'within_limit' } },
  });
  assert.equal(toolbarState(amber, NOW).color, C.BADGE_COLORS.amber);
  const green = snapshot({
    windows: { '5h': { utilization: 0.07, resetsAt: sec(NOW + HOUR), status: 'within_limit' } },
  });
  const greenState = toolbarState(green, NOW);
  assert.equal(greenState.text, '7%');
  assert.equal(greenState.color, C.BADGE_COLORS.green);
});

test('toolbarState: a past reset is reported, never extrapolated', () => {
  const rolled = snapshot({
    windows: {
      '5h': { utilization: 0.98, resetsAt: sec(NOW - MINUTE), status: 'within_limit' },
      '7d': { utilization: 0.2, resetsAt: sec(NOW + 50 * HOUR), status: 'within_limit' },
    },
  });
  const state = toolbarState(rolled, NOW);
  // 7d is still live, so it carries the badge; the 5h number is gone, not zeroed.
  assert.equal(state.text, '20%');
  assert.match(state.title, /5-hour: reset — send a message to refresh/);
  assert.doesNotMatch(state.title, /98/);
});

test('toolbarState: every window reset means a blank badge', () => {
  const allReset = snapshot({
    windows: {
      '5h': { utilization: 0.98, resetsAt: sec(NOW - MINUTE), status: 'within_limit' },
      '7d': { utilization: 0.9, resetsAt: sec(NOW - MINUTE), status: 'within_limit' },
    },
  });
  const state = toolbarState(allReset, NOW);
  assert.equal(state.text, '');
  assert.equal(state.color, null);
  assert.match(state.title, /7-day: reset/);
});

test('toolbarState: stale snapshots say so in the tooltip', () => {
  const stale = snapshot({ capturedAt: NOW - 20 * MINUTE });
  const state = toolbarState(stale, NOW);
  assert.equal(state.text, '90%');
  assert.match(state.title, /as of 20m ago/);
});
