# Headroom Privacy Policy

**Effective date:** 2026-06-10 (draft — pre-release)
**Applies to:** the Headroom browser extension (working title), v0.

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
- Snapshot history in IndexedDB, automatically deleted after **90 days**

Uninstalling the extension removes this data.

## What is transmitted

Nothing. Headroom has no backend, makes no network requests of its own, and requests host access only to `claude.ai` — solely to observe responses the page already receives.

## Permissions explained

- `storage` — to save quota snapshots locally
- Host access to `https://claude.ai/*` — to run the content script that reads the quota event

No other permissions are requested.

## Changes to this policy

Any future feature that would send data off your device (for example, optional cross-device sync) will be strictly opt-in, off by default, end-to-end encrypted, and announced in release notes with an updated version of this policy.

## Contact

Open an issue on the project repository. <!-- TODO: add repository URL / contact email before Chrome Web Store submission -->
