'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

require('../src/lib/time.js');
const { formatCountdown, formatAge, tickInterval } = globalThis.Headroom.time;

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

test('formatCountdown: multi-day uses "5d 03h"', () => {
  assert.equal(formatCountdown(5 * DAY + 3 * HOUR + 12 * MINUTE), '5d 03h');
  assert.equal(formatCountdown(DAY), '1d 00h');
});

test('formatCountdown: over an hour uses "4h 32m"', () => {
  assert.equal(formatCountdown(4 * HOUR + 32 * MINUTE + 10 * SECOND), '4h 32m');
  assert.equal(formatCountdown(HOUR), '1h 0m');
});

test('formatCountdown: 5-60 minutes uses "42m"', () => {
  assert.equal(formatCountdown(42 * MINUTE + 30 * SECOND), '42m');
  assert.equal(formatCountdown(5 * MINUTE), '5m');
});

test('formatCountdown: under 5 minutes uses "4m 12s"', () => {
  assert.equal(formatCountdown(4 * MINUTE + 12 * SECOND), '4m 12s');
  assert.equal(formatCountdown(59 * SECOND), '0m 59s');
});

test('formatCountdown: zero, negative, and garbage return null', () => {
  assert.equal(formatCountdown(0), null);
  assert.equal(formatCountdown(-5 * MINUTE), null);
  assert.equal(formatCountdown(NaN), null);
});

test('formatAge: compact single unit', () => {
  assert.equal(formatAge(30 * SECOND), '<1m');
  assert.equal(formatAge(7 * MINUTE), '7m');
  assert.equal(formatAge(3 * HOUR + 20 * MINUTE), '3h');
  assert.equal(formatAge(2 * DAY), '2d');
});

test('tickInterval: 1s only inside the under-5-minute band', () => {
  assert.equal(tickInterval(4 * MINUTE), 1000);
  assert.equal(tickInterval(5 * MINUTE), 30000);
  assert.equal(tickInterval(2 * HOUR), 30000);
  assert.equal(tickInterval(-1), 30000);
  assert.equal(tickInterval(Infinity), 30000);
});
