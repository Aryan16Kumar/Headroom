'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

// Classic script that attaches to globalThis — works under require() too.
require('../src/lib/sse-parser.js');
const { createMessageLimitExtractor } = globalThis.__headroomSSE;

const LIMIT_EVENT =
  'event: message_limit\n' +
  'data: {"type":"message_limit","message_limit":{"type":"within_limit",' +
  '"windows":{"5h":{"status":"within_limit","resets_at":1765432100,"utilization":0.07},' +
  '"7d":{"status":"within_limit","resets_at":1765876500,"utilization":0.01}}}}\n\n';

test('extracts message_limit from a full stream', () => {
  const extractor = createMessageLimitExtractor();
  const stream =
    'event: message_start\ndata: {"type":"message_start"}\n\n' +
    'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"text":"secret conversation text"}}\n\n' +
    LIMIT_EVENT +
    'event: message_stop\ndata: {"type":"message_stop"}\n\n';
  const limit = extractor.push(stream);
  assert.ok(limit);
  assert.equal(limit.windows['5h'].utilization, 0.07);
  assert.equal(limit.windows['7d'].resets_at, 1765876500);
});

test('returns only quota metadata, never conversation content', () => {
  const extractor = createMessageLimitExtractor();
  const limit = extractor.push(
    'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"text":"private"}}\n\n' +
      LIMIT_EVENT
  );
  assert.ok(!JSON.stringify(limit).includes('private'));
});

test('handles events split across arbitrary chunk boundaries', () => {
  const extractor = createMessageLimitExtractor();
  let limit = null;
  for (const char of LIMIT_EVENT) {
    const found = extractor.push(char);
    if (found) limit = found;
  }
  assert.ok(limit);
  assert.equal(limit.windows['5h'].utilization, 0.07);
});

test('handles CRLF line endings', () => {
  const extractor = createMessageLimitExtractor();
  const limit = extractor.push(LIMIT_EVENT.replaceAll('\n', '\r\n'));
  assert.ok(limit);
  assert.equal(limit.windows['7d'].utilization, 0.01);
});

test('joins multi-line data fields', () => {
  const extractor = createMessageLimitExtractor();
  const limit = extractor.push(
    'event: message_limit\n' +
      'data: {"type":"message_limit",\n' +
      'data: "message_limit":{"windows":{}}}\n\n'
  );
  assert.ok(limit);
  assert.deepEqual(limit.windows, {});
});

test('matches on data type when the event name is absent', () => {
  const extractor = createMessageLimitExtractor();
  const limit = extractor.push(
    'data: {"type":"message_limit","message_limit":{"windows":{}}}\n\n'
  );
  assert.ok(limit);
});

test('ignores malformed JSON without throwing', () => {
  const extractor = createMessageLimitExtractor();
  assert.equal(extractor.push('event: message_limit\ndata: {not json}\n\n'), null);
  assert.equal(extractor.hasSeenCompleteEvent(), true);
});

test('ignores other event types and incomplete events', () => {
  const extractor = createMessageLimitExtractor();
  assert.equal(extractor.push('event: message_stop\ndata: {"type":"message_stop"}\n\n'), null);
  assert.equal(extractor.push('event: message_limit\ndata: {"type":"message_li'), null);
  assert.equal(extractor.hasSeenCompleteEvent(), true);
});

test('hasSeenCompleteEvent stays false for non-SSE input', () => {
  const extractor = createMessageLimitExtractor();
  assert.equal(extractor.push('{"error":"some json body"}'), null);
  assert.equal(extractor.hasSeenCompleteEvent(), false);
});

test('rejects message_limit with a non-object payload', () => {
  const extractor = createMessageLimitExtractor();
  assert.equal(
    extractor.push('event: message_limit\ndata: {"type":"message_limit","message_limit":null}\n\n'),
    null
  );
});
