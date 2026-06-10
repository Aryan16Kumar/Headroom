'use strict';

// Loaded in the MAIN world (and by Node for tests). Attaches a single factory
// to globalThis; fetch-patch.js captures the reference and deletes the global
// so the page's namespace stays clean.
//
// Privacy invariant: the stream text fed to push() contains the user's full
// conversation. Only the message_limit payload may leave this parser —
// everything else is discarded, never stored, never logged.
(() => {
  function createMessageLimitExtractor() {
    let buffer = '';
    let sawCompleteEvent = false;
    const SEPARATOR = /\r?\n\r?\n/;

    function parseEventBlock(block) {
      let eventName = '';
      const dataLines = [];
      for (const line of block.split(/\r?\n/)) {
        if (line.startsWith('event:')) {
          eventName = line.slice(6).trim();
        } else if (line.startsWith('data:')) {
          dataLines.push(line.slice(5).replace(/^ /, ''));
        }
      }
      if (!eventName && dataLines.length === 0) return null;
      sawCompleteEvent = true;
      if (eventName && eventName !== 'message_limit') return null;
      if (dataLines.length === 0) return null;
      let parsed;
      try {
        parsed = JSON.parse(dataLines.join('\n'));
      } catch {
        return null;
      }
      if (!parsed || parsed.type !== 'message_limit') return null;
      const limit = parsed.message_limit;
      if (!limit || typeof limit !== 'object') return null;
      return limit;
    }

    return {
      // Feed decoded stream text in arrival order. Returns the message_limit
      // payload once its event is complete, otherwise null.
      push(text) {
        buffer += text;
        let found = null;
        for (;;) {
          const match = SEPARATOR.exec(buffer);
          if (!match) break;
          const block = buffer.slice(0, match.index);
          buffer = buffer.slice(match.index + match[0].length);
          const limit = parseEventBlock(block);
          if (limit) found = limit;
        }
        // A stream with no event separators would otherwise grow the buffer
        // unboundedly; real SSE always has them, so this only trips on garbage.
        if (buffer.length > 1048576) buffer = buffer.slice(-65536);
        return found;
      },

      // True once at least one well-formed SSE event was seen. Lets the caller
      // distinguish "schema drifted" from "response wasn't SSE at all".
      hasSeenCompleteEvent() {
        return sawCompleteEvent;
      },
    };
  }

  globalThis.__headroomSSE = { createMessageLimitExtractor };
})();
