# Headroom Privacy Policy

**Effective date:** 2026-08-16 (draft — pre-release)
**Applies to:** the Headroom browser extension (working title), v0–v1.

*What changed since 2026-06-10:* v1 adds reset notifications, which require the `alarms` and `notifications` permissions. Both are local-only — no network access, no new data collected. See [Permissions explained](#permissions-explained).

This policy is intentionally short because the extension is intentionally simple: **no data ever leaves your browser.**

## What Headroom processes

When you send a message on claude.ai, the site's own response stream includes a `message_limit` event describing your current usage quota. Headroom reads **only** that event and keeps **only** this metadata:

- Utilization percentage for the 5-hour and 7-day windows (a number between 0 and 1)
- The reset timestamp for each window
- The window status string (e.g. `within_limit`)
- The organization ID from the request URL (so data from multiple accounts isn't mixed)
- A local timestamp of when the snapshot was taken

## What Headroom never collects

- Your conversations, prompts, or Claude's responses — the parser discards everything except the quota event
- Your name, email, account details, or credentials
- API keys
- Browsing activity on any site other than claude.ai (the extension has no access to other sites)
- Analytics, telemetry, crash reports, or usage statistics of any kind

## Where data is stored

All data stays on your device, scoped to your browser profile:

- The latest quota snapshot in `chrome.storage.local`
- Your badge position, your settings, and a record of which resets have already been announced (so you aren't notified twice) — also in `chrome.storage.local`
- Snapshot history in IndexedDB, automatically deleted after **90 days**

Uninstalling the extension removes this data.

## What is transmitted

Nothing. Headroom has no backend, makes no network requests of its own, and requests host access only to `claude.ai` — solely to observe responses the page already receives.

## Permissions explained

- `storage` — to save quota snapshots, your badge position, and your settings locally
- `alarms` — to wake the extension at the moment one of your usage windows resets, so it can notify you. Alarms are local timers; they involve no network activity and carry no data.
- `notifications` — to show the "your limit has reset" desktop notification. The text is generated on your device from the snapshot already stored locally.
- Host access to `https://claude.ai/*` — to run the content script that reads the quota event, and to focus an existing claude.ai tab when you click a notification or the toolbar icon. This is why the broader `tabs` permission is **not** requested.

No other permissions are requested.

## Notifications

Reset notifications are on by default and can be turned off (`resetNotifications` in the extension's local settings; a settings screen is coming). They only fire for a window you were close to the cap on, at most once per reset, and are skipped entirely if your browser was closed long enough that the reset is no longer recent news. Nothing about a notification is logged or transmitted.

## Changes to this policy

Any future feature that would send data off your device (for example, optional cross-device sync) will be strictly opt-in, off by default, end-to-end encrypted, and announced in release notes with an updated version of this policy.

## Contact

Open an issue on the project repository. <!-- TODO: add repository URL / contact email before Chrome Web Store submission -->
