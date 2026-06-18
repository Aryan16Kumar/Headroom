# Headroom

> A live, private headroom gauge for your AI subscriptions — starting with claude.ai's 5-hour and 7-day limits. Everything stays in your browser.

*Working title — see [Naming](#naming) below. Headroom is an independent project, not affiliated with, endorsed by, or sponsored by Anthropic.*

![status: v0 available](https://img.shields.io/badge/status-v0%20available-brightgreen)
![license: PolyForm Shield 1.0.0](https://img.shields.io/badge/license-PolyForm%20Shield%201.0.0-blue)
![manifest: v3](https://img.shields.io/badge/manifest-v3-green)

---

## The problem

claude.ai enforces a 5-hour rolling limit and a 7-day rolling limit. You *can* check where you stand — under **Settings > Usage**, a page you have to navigate to and will check exactly twice. What's missing:

- An **always-visible gauge** while you work, not three clicks away
- A heads-up **before** you hit the wall, not a banner after it's too late to plan around
- A **ping when your cooldown resets**, so you can close the tab and come back the moment you're un-throttled *(roadmap)*
- **One consistent meter across providers** — ChatGPT, Gemini, and Claude Code all have the same opacity *(roadmap)*

Headroom starts with the claude.ai badge and builds toward the rest.

## What it does (v0 — in development)

A small floating badge on claude.ai showing:

- Your current **5-hour utilization** and time to reset
- Your current **7-day utilization** and time to reset
- Color-coded thresholds so a glance tells you whether to keep going

```
┌─────────────────────────────┐
│  5h ▓▓░░░░░░░░ 7%  4h 32m   │
│  7d ░░░░░░░░░░ 1%  5d 03h   │
└─────────────────────────────┘
```

That's it for v0. No accounts, no settings to wrestle with, no surprise modals.

---

## Status

**v0 is available now** — not yet on the Chrome Web Store, but you can install it in under a minute by loading it unpacked.

**Easiest — the packaged build:**

1. Download [`headroom-v0.1.0.zip`](https://github.com/Aryan16Kumar/Headroom/releases/download/v0.1.0/headroom-v0.1.0.zip) from the [latest release](https://github.com/Aryan16Kumar/Headroom/releases)
2. Unzip it — Chrome can't load a `.zip` directly
3. Open `chrome://extensions`, enable **Developer mode**
4. Click **Load unpacked** and select the unzipped `headroom-v0.1.0` folder
5. Open [claude.ai](https://claude.ai) and send a message — the badge appears bottom-right

**Or from source:** clone this repo and **Load unpacked** the repo folder directly.

Requires Chrome 111+ (or any Chromium browser — Edge, Brave, Arc). Full walkthrough with screenshots: [getheadroom.vercel.app/install.html](https://getheadroom.vercel.app/install.html).

---

## How it works (the honest version)

When you send a message on claude.ai, the response is a streamed event log. The last event in that stream is `message_limit`, which contains your current utilization for both rolling windows — the same data Anthropic's own UI uses internally.

Headroom installs a content script that:

1. Wraps the page's `fetch` so it can observe responses
2. Clones the stream from completion endpoints (the original passes through untouched)
3. Parses the `message_limit` event from the clone — and discards everything else; conversation content is never stored or logged
4. Stores the quota snapshot locally and updates the floating badge

Nothing is sent anywhere. The extension requests access only to `claude.ai` and makes no network requests of its own.

---

## How it compares

**vs. claude.ai's built-in Settings > Usage:** the native page is accurate but out of sight — you check it when you remember to, which is usually after you've been throttled. Headroom keeps the same data in view while you work, keeps local history, and (from v1) notifies you when your window resets and warns you when your pace will hit the cap.

**vs. other tracker extensions:** several free claude.ai usage trackers exist on the Chrome Web Store, and some are open source. If all you want is a basic claude.ai meter, they're worth a look. Headroom's bet is the layer above that: reset notifications, pace prediction ("at this rate you hit the cap in ~40 min"), usage history, one meter across every AI product you pay for — and a strict, auditable everything-stays-local privacy posture throughout.

---

## Privacy

- **No backend.** There is no server to send data to.
- **No network calls of its own.** Host access is limited to `claude.ai`; the extension only *observes* responses the page already receives.
- **Conversation content is never stored.** The parser extracts quota metadata and discards the rest of the stream.
- **No telemetry.** Zero analytics, zero crash reporting, zero pings.
- **No account.** Nothing to sign up for.
- **Storage stays local and bounded.** Latest snapshot in `chrome.storage.local`; history in IndexedDB with a 90-day retention cap. Per-device, browser-scoped.

Full policy: [PRIVACY.md](PRIVACY.md). If any of this ever changes, it will be opt-in, off by default, and called out clearly in release notes.

---

## Roadmap

| Version | Scope |
|---|---|
| **v0 (current)** | claude.ai 5h + 7d badge, local-only, free forever |
| v1 | Reset notifications, pace prediction, history chart, settings — first paid tier |
| v2 | ChatGPT and Gemini support — one meter for all your AI subscriptions |
| v3 | Claude Code / CLI coverage via a small local agent |
| v4 | Optional E2E-encrypted cross-device sync |
| v5 | API-key dashboard mode for developers (Anthropic/OpenAI usage endpoints) |

v0 ships first. Everything after that depends on usage and feedback.

---

## Tech stack

- Manifest V3
- Vanilla JavaScript (no build step, no framework)
- Shadow DOM for UI isolation
- `chrome.storage.local` for latest snapshot, IndexedDB for time-series history

Intentionally boring. Boring is reliable; reliable is the point.

---

## Contributing

Pre-alpha. Issues welcome now; PRs welcome once v0 ships — note that **contributions require signing a CLA** (the project is source-available and commercially licensed, so we need clean IP). If you're recon-ing another AI provider's API surface (ChatGPT, Gemini, Mistral, etc.), capture the request/response pattern and open an issue with the shape — that's the gating step for v2.

---

## Naming

Working title is **Headroom**. Other candidates: Cooldown, Tether, Throttle, Brink, Tally, Ratecap. One hard rule: the final name will not contain "Claude" or "Anthropic" — this is an independent project and the name must not suggest otherwise. The repo will be renamed once a final name is chosen.

---

## License

[PolyForm Shield 1.0.0](LICENSE.md) — source-available. In plain terms:

- You **can** read, audit, modify, and use the software freely, personally or at work. The code being readable is the point — the privacy claims above are verifiable, not vibes.
- You **cannot** take this code and ship a product that competes with Headroom.

Not open source in the OSI sense, by design: the free tier is free, the code is auditable, and the project stays commercially viable.
