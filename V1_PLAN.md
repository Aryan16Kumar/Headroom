# v1 Planning Notes

Decisions captured during dogfooding review (2026-06-28). Not yet scheduled.
Promote into CLAUDE.md's v1 deliverable when v1 work actually starts.

---

## Decision 1 — "Pace prediction" is scoped to burn rate only

The original v1 idea of a confident time-to-cap ETA is **dropped**. Usage is
bursty and non-stationary (planning sips, building gulps; Opus burns faster than
a light model), and v0 only records a snapshot when the user sends a message, so
the time-series is sparse and event-driven — there is no signal about the cost of
the *next* prompt. A confident ETA would be wrong often, which violates the
"never present confidently wrong numbers" invariant.

**Ship instead:** burn rate — a purely descriptive readout from the existing
IndexedDB time-series, e.g. "last hour: +22%" or "~3% per message lately". No
forecasting. The user knows their own intent and does the projection; we just
give the input. This can never be "wrong".

- Velocity alert ("you're burning unusually fast") — deferred, not in v1.
- Conditional ETA ("~40 min if you keep this pace") — dropped for now.

---

## Decision 2 — How the privacy claims survive v1

Most of v1 is privacy-neutral. Burn rate, history chart, settings, and
clear-history are all local-only (clear-history *strengthens* the posture).
Reset notifications add `notifications` + `alarms` permissions but make **no
network calls and move no data off-device**. The only real conflict is payments.

Principles to hold the line:

1. **Data plane stays 100% local, forever.** Quota/usage/history never touch the
   network in any tier. Free tier stays byte-for-byte as private as v0. Enforce
   architecturally: a single `lib/licensing.js` is the *only* module allowed to
   make an outbound request, to *one* declared endpoint, sending *only* an opaque
   license key. Auditable by grepping for `fetch(` / `XMLHttpRequest`.

2. **Prefer a signed-license model over a phone-home SDK.** Avoid ExtensionPay
   (recurring phone-home + stores user email on a third-party server → breaks
   "no account" and "no recurring network calls"). Instead: Stripe-hosted
   Checkout (no card data in our code) → issue a public-key-signed license token
   → verify locally with a bundled public key. After first activation: zero
   recurring network calls, works offline.

3. **Zero telemetry stays zero.** No third-party analytics SDKs in the extension
   context. Payment/activation UI lives on the options page or a hosted page —
   never injected into claude.ai. The monitored site is never touched by payment
   code.

4. **Permission discipline + disclosure.** Each new permission (`notifications`,
   `alarms`, possibly one license-endpoint host) gets a written rationale in
   CLAUDE.md (invariant #7) and an entry in PRIVACY.md's permissions section.

5. **One claim must be reworded (and that's fine).** PRIVACY.md's absolute
   "Nothing is transmitted / makes no network requests of its own" softens to a
   precise claim: *"Your usage data never leaves your device. The only network
   request Headroom ever makes is one-time license validation, which transmits
   only your license key — no usage data, no conversation, no telemetry."* All
   substantive promises stay intact. Follow PRIVACY.md's existing versioning +
   release-note commitment: new effective date and a "what changed" note.

**Headline:** the privacy claims survive v1 cleanly as long as licensing is the
single, narrow, auditable network boundary and the data plane never crosses it.
