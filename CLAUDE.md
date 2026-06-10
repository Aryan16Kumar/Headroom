# Headroom — Project Memory

> Working title: **Headroom**. Final name TBD — see naming candidates at the bottom of this file. Replace throughout when chosen.

This file is loaded into every Claude Code session in this directory. It is the single source of truth for *what this project is*, *what we're building*, and *how we work on it*. Keep it terse and current — stale guidance is worse than no guidance.

---

## Project Overview

**Headroom** is a browser extension that visualizes AI usage limits in real time, starting with the claude.ai 5-hour rolling message cap. It runs entirely on the user's machine — no backend, no accounts, no servers, no data ever leaves the browser.

**The problem it solves.** Anthropic's consumer claude.ai surface gives you a 5-hour rolling message quota *and* a 7-day rolling quota. Anthropic now shows both bars natively under **Settings > Usage** — but that's a settings page you have to navigate to, not something in view while you work. The real gaps: an always-visible gauge, a heads-up *before* you hit the wall, a notification when the cooldown resets, and one consistent meter across providers (ChatGPT, Gemini, and others have the same opacity).

**Market context (checked 2026-06-10).** Several free Chrome extensions already track claude.ai limits (ClaudeKarma, Claude Usage Tracker, Claude Usage Monitor, Claude Quota Monitor — some open source). The claude.ai badge is therefore the *wedge*, not the product. The sellable product is the v1+ tier: reset notifications, pace prediction, history analytics, multi-provider aggregation. Don't pitch the badge as novel; pitch the roadmap.

**The technical insight.** Every claude.ai completion response is an SSE stream that ends with a `message_limit` event carrying current `utilization` (0–1) and `resets_at` (epoch) for both the 5-hour and 7-day windows. We intercept that event via a content script that patches `window.fetch`, store the snapshot locally, and render a floating badge. No polling, no API keys, no auth.

---

## Deliverables

### v0 — Personal claude.ai cooldown visualizer (current scope)

**Goal:** Ship a working browser extension that, while the user is on claude.ai, shows a live floating badge with their 5-hour and 7-day quota utilization and countdown to reset.

**In scope:**
- MV3 Chrome extension (Firefox WebExtension port deferred)
- Content script that patches `window.fetch` on claude.ai (declared `world: "MAIN"` in the manifest, Chrome 111+ — no script-tag injection, no `web_accessible_resources` exposure)
- Parses `message_limit` SSE event from `/completion*` endpoints
- Latest snapshot in `chrome.storage.local` (sync reads for badge), schema-versioned (`{ v: 1, ... }`) and keyed by `orgId`
- Snapshot history in IndexedDB (time-series, 90-day rolling retention pruned on write)
- Floating bottom-right pill with two rows (5h + 7d), draggable, position persisted
- Staleness indicator (see UI Guidelines — data only refreshes when the user sends a message)
- Color thresholds: green `< 60%`, amber `60–85%`, red `> 85%`
- Dark mode aware (`prefers-color-scheme`)

**Out of scope for v0** (explicitly — do not scope creep):
- Any non-Anthropic provider
- Settings panel
- Charts / history visualization
- Accounts, login, sync, backend
- API key dashboards
- Export/import
- Notifications
- Cross-device anything

**Why these v0 cuts.** The original ask was "show me how far I am from the Claude cooldown." Everything above that bar is risk without proven value. We ship v0, the author dogfoods it for a week, then we revisit roadmap with evidence. The market check reinforces this: free claude.ai-only trackers already exist, so v0's job is dogfooding plus a distribution wedge — the differentiated, monetizable features live in v1+.

### v1 — Notifications, prediction, history (first paid tier)

The features no free competitor does well — and the actual reasons users would pay:
- **Reset notifications** — "ping me when my cooldown ends," plus a toolbar badge (`chrome.action`) that works even when the user is not on claude.ai. The single most-requested behavior in limit-complaint threads; the floating badge only helps while the user is staring at claude.ai.
- **Pace prediction** — "at your current rate you'll hit the 5h cap in ~40 minutes," powered by the IndexedDB time-series v0 is already collecting. This is where the history data stops being dead weight and becomes the moat.
- Basic history chart (last 30 days)
- Settings panel (badge position, color thresholds, notification rules, clear-history action)
- Payments plumbing: Chrome Web Store has no native billing — ExtensionPay or Stripe + license key. Free tier = the badge; paid = everything in this section.

### v2 — Multi-provider consumer chat tracking

Same pattern (fetch interception + local storage) extended to:
- ChatGPT (chat.openai.com / chatgpt.com) — needs its own recon pass
- Gemini (gemini.google.com) — recon TBD
- Provider toggles in settings

Positioning goal: "one meter for all your AI subscriptions." Anthropic can sherlock a Claude meter any day; they will never build a ChatGPT meter.

### v3 — Terminal/CLI coverage (Claude Code, Codex)

Pulled forward from last place: Claude Code users on Max plans are the loudest, most willing-to-pay segment (cf. ccusage's traction), and they're developers — a reachable audience with proven $100–200/mo spend. Two viable paths:
- **Log-watcher daemon**: a small local agent that tails `~/.claude/` (or equivalent) and emits events the extension picks up via native messaging
- **Local proxy**: user routes CLI traffic through a localhost proxy that records usage

A unified browser + Claude Code view would be genuinely differentiated — nothing on the market does both.

### v4 — Multi-device sync (optional)

If user demand warrants it:
- Optional backend (Supabase candidate) for cross-device sync
- Storage layer in v0 is abstracted behind `lib/storage.js` so swapping in a remote backend is a one-file change
- End-to-end encrypted: user holds the key, server only sees ciphertext
- Free tier without sync remains the default

### v5 — API key dashboard mode

Separate workflow for developers using paid APIs:
- User pastes an Anthropic/OpenAI API key (stored in `chrome.storage.local`, never sent to any third party)
- Extension calls the provider's usage endpoint directly from the browser
- Sidebar dashboard with per-model breakdown

---

## Code Standards

**Stack.** Vanilla JavaScript (ES2022 modules), no build step, no TypeScript, no framework, no bundler — for v0. We can introduce a build pipeline later if the codebase actually demands it. It doesn't yet.

**Files are small.** If a file passes ~200 lines, that's a signal to split — not a hard rule.

**Defensive parsing everywhere claude.ai's API touches us.** Wrap SSE parsing, JSON parsing, and event dispatch in `try/catch`. Log unknown shapes, fail soft, never break Claude's UI. The `completion2` endpoint (we'd expect `completion3` eventually) proves Anthropic versions this — code must tolerate schema drift.

**Storage is async, the badge needs to render synchronously.** That's why we mirror the latest snapshot into `chrome.storage.local` (sync API) and keep history in IndexedDB (async). Don't unify them — they serve different read patterns.

**No external runtime dependencies in v0** unless one of (a) it saves >100 lines and (b) it's <5KB minified. Dev-only tooling (linters, formatters) is fine.

**Comments.** Only write a comment when the *why* is non-obvious — a hidden constraint, a workaround for a specific quirk, a non-trivial invariant. Don't comment what the code does; the names should already say that.

**Error handling lives at boundaries.** Anywhere we touch claude.ai's response, `chrome.*` APIs, or DOM injection: handle errors. Internal pure functions don't need defensive checks.

**Shadow DOM for any injected UI.** claude.ai's own CSS must not style our badge; our CSS must not leak onto their page. Non-negotiable.

**MAIN world vs ISOLATED world:**
- `fetch-patch.js` runs in MAIN world (must share `window.fetch` with the page), declared via `world: "MAIN"` in the manifest (Chrome 111+) — never via injected `<script>` tags
- `injector.js` and `badge.js` run in ISOLATED world (have access to `chrome.*` APIs)
- Communication between them: `window.postMessage` with a namespaced `source` field. The namespace is collision avoidance, **not** a security boundary — see Security & Privacy Invariants below.

---

## Security & Privacy Invariants

Non-negotiable. Violating any of these is a release blocker.

1. **Conversation content never leaves the parser.** The cloned stream contains the user's full conversation. `sse-parser.js` extracts `message_limit` and discards everything else — message content is never stored, logged, or posted across the world bridge. One stray debug `console.log(chunk)` in a release breaks the entire privacy promise.
2. **`postMessage` is not a security boundary.** Any page script can post messages our ISOLATED-world listener receives. The listener must verify `event.source === window` and `event.origin === location.origin`, then still treat the payload as untrusted input: validate the shape, clamp `utilization` to `[0, 1]`, sanity-check `resets_at` is a plausible epoch. Never interpolate bridge data into HTML — set `textContent`, never `innerHTML`.
3. **Fail soft and visibly.** If the schema drifts and parsing fails, the badge shows an explicit "unavailable" state — never wrong numbers, never stale numbers presented as current. A confidently wrong gauge is worse than none.
4. **Snapshots are schema-versioned and org-keyed.** `{ v: 1, orgId, ... }`. Versioning makes future migrations possible; org keying prevents mixing data when a user belongs to multiple orgs/accounts.
5. **Retention is bounded.** IndexedDB history capped at 90 days, pruned on write. A user-facing "clear history" action ships with the settings panel (v1).
6. **Multi-tab consistency.** All open claude.ai tabs converge on the latest snapshot via `chrome.storage.onChanged`.
7. **Minimal permissions, forever.** `storage` plus `host_permissions: ["https://claude.ai/*"]`. Nothing else without a written rationale in this file. This is both the trust story and what gets us through Chrome Web Store review (extensions intercepting third-party traffic get extra scrutiny).

---

## Project Structure

```
tracker/
├── manifest.json                 # MV3 manifest, content_scripts on claude.ai/*
├── CLAUDE.md                     # this file
├── README.md                     # public-facing
├── LICENSE.md                    # PolyForm Shield 1.0.0 (source-available)
├── PRIVACY.md                    # standalone privacy policy (required for CWS listing)
├── src/
│   ├── background/
│   │   └── service-worker.js     # MV3 service worker (mostly idle in v0)
│   ├── content/
│   │   ├── injector.js           # ISOLATED world; bridges page ↔ extension
│   │   ├── fetch-patch.js        # MAIN world; patches window.fetch
│   │   └── badge.js              # ISOLATED world; injects Shadow DOM badge
│   ├── lib/
│   │   ├── storage.js            # chrome.storage + IndexedDB facade
│   │   ├── sse-parser.js         # extracts message_limit from SSE chunks
│   │   ├── time.js               # countdown / format helpers
│   │   └── constants.js          # endpoint regexes, color thresholds
│   └── styles/
│       └── badge.css             # scoped to Shadow DOM
├── site/                         # marketing landing page (static, zero deps, GitHub Pages-ready)
│   ├── index.html
│   ├── style.css
│   └── script.js
└── assets/
    └── icons/                    # 16/48/128 PNG
```

When a file's role changes or moves, update this tree.

---

## UI Guidelines

**Form factor.** Floating pill, bottom-right by default, draggable, position persisted to `chrome.storage.local`. Two rows: 5-hour and 7-day. Each row: label, progress bar, percentage, countdown.

**Visual language.** Match claude.ai's restraint — neutral background, low-contrast borders, the progress bar carries the color signal. Do not introduce gradients, animations, or anything that draws the eye away from the user's actual conversation.

**Color thresholds.**
- `utilization < 0.60` → green
- `0.60 ≤ utilization < 0.85` → amber
- `utilization ≥ 0.85` → red

Same thresholds for both windows. If they need tuning later, surface in settings rather than reshuffling the codebase.

**Dark mode.** Respect `@media (prefers-color-scheme: dark)` in `badge.css`. No JS detection.

**Countdown granularity.**
- `> 1 hour` → `4h 32m`
- `5–60 min` → `42m`
- `< 5 min` → `4m 12s` (refresh every second in this band only)

Outside the under-5-min band, refresh the countdown every 30 seconds — it's cheap and keeps the badge accurate without burning CPU.

**Staleness.** Utilization data refreshes only when the user sends a message — the badge can silently go stale. If the latest snapshot is older than 5 minutes, show an "as of Xm ago" hint on the pill. If a window's `resets_at` has passed, don't extrapolate to 0% — show that row in a neutral "reset — send a message to refresh" state. Never present old data as current.

**Never disrupt Claude's UI.** Shadow DOM, `pointer-events: auto` only on the pill itself, `z-index` no higher than needed. If Claude opens a modal, we yield (badge stays put, doesn't fight).

**Accessibility.** Use semantic elements, ARIA live regions for the countdown so screen readers announce updates without being noisy. Keyboard-dismissible.

---

## Technical Reference — The `message_limit` event

This is the *only* data source for v0. Memorize it.

**Endpoint:** `POST https://claude.ai/api/organizations/{orgId}/chat_conversations/{convId}/completion2`
(match pattern: `/\/completion\d*$/` on `claude.ai` — tolerate future versioned variants)

Extract `{orgId}` from the request URL and key all stored snapshots by it — users can belong to multiple orgs/accounts, and mixing their quota data is a correctness bug.

**Response:** `text/event-stream`. Final events before `message_stop`:

```json
event: message_limit
data: {
  "type": "message_limit",
  "message_limit": {
    "type": "within_limit",
    "resetsAt": null,
    "remaining": null,
    "perModelLimit": null,
    "representativeClaim": "five_hour",
    "overageDisabledReason": "overage_not_provisioned",
    "overageInUse": false,
    "windows": {
      "5h": { "status": "within_limit", "resets_at": <epoch>, "utilization": 0.07 },
      "7d": { "status": "within_limit", "resets_at": <epoch>, "utilization": 0.01 }
    }
  }
}
```

**What's reliable:**
- `windows["5h"].utilization` (0–1 float, primary signal)
- `windows["5h"].resets_at` (Unix epoch seconds)
- Same shape for `windows["7d"]`

**What's null when healthy** (probably populates near the limit — handle when seen, don't depend on):
- Top-level `resetsAt`, `remaining`, `perModelLimit`
- `windows.*.status` shifts to some non-`within_limit` string (exact value unconfirmed)

**No rate-limit headers exist.** Don't look there.

---

## Before Making Changes

1. **Understand existing code.** Read the file you're editing and any files it imports. Don't change a function whose callers you haven't read.
2. **Check for reusable components.** If you're about to write a date formatter, look in `lib/time.js` first. If you're about to write a storage helper, check `lib/storage.js`.
3. **Maintain backward compatibility.** Storage schema in particular — users will have data from older versions. If you change the IndexedDB schema, write a migration. Never delete user data without an explicit user action.
4. **Explain significant architectural changes.** If you're moving the line between MAIN and ISOLATED worlds, changing how data flows, or introducing a new dependency, write a paragraph in the PR/commit explaining why. Future-you will thank present-you.

---

## How We Work

- **Recon before code** when touching anything that depends on a third party's API surface (claude.ai, ChatGPT, etc.). Capture the actual response shape, then design.
- **One PR per coherent change.** Mixing storage refactor with a UI tweak makes review impossible.
- **Manual QA every release.** This extension lives or dies by working on a live, undocumented API. Automated tests for pure logic (`sse-parser.js`, `time.js`) are great; full E2E against a moving target is not worth it yet.
- **Privacy is a feature, not a footnote.** Any change that would cause data to leave the user's machine is a v4+ conversation and a user-facing opt-in, not a default. PRIVACY.md is the canonical public statement — keep it in lockstep with actual behavior; it's also the privacy policy the Chrome Web Store requires even for zero-collection extensions.
- **Licensing discipline.** PolyForm Shield 1.0.0 (source-available: anyone may read, audit, modify, and use it — including at work; nobody may ship a product that competes with ours from this code). Outside contributions require a signed CLA before merge — without clean IP ownership there is nothing to sell later. Never merge a PR without it.
- **Trademark hygiene.** The final product name must not contain "Claude" (Anthropic trademark; Chrome Web Store impersonation rules). All public copy carries a "not affiliated with Anthropic" disclaimer.

---

## Naming candidates (working title: Headroom)

See README.md's name section, or the conversation log where these were proposed. Final pick determines a global find-and-replace through this repo.

Hard constraint: no candidate containing "Claude" or "Anthropic" will be considered (trademark risk, CWS impersonation rules). "Headroom" itself is distinctive and conveniently already describes the v2 multi-provider positioning — it's the front-runner.
