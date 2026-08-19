'use strict';

// v1: the only always-on part of the extension. It owns two things the content
// script can't do because it dies with the tab:
//   - reset notifications, driven by chrome.alarms scheduled from the snapshots
//     the content script already wrote to chrome.storage.local
//   - the chrome.action toolbar badge, which stays visible on every tab
// No network calls, no new data — it only reads what v0 already stored.
importScripts('/src/lib/constants.js', '/src/lib/time.js', '/src/lib/alerts.js', '/src/lib/storage.js');

const C = Headroom.constants;
const A = Headroom.alerts;
const S = Headroom.storage;

const CLAUDE_URL = 'https://claude.ai/';

// Listeners must register synchronously on every worker wake-up.
chrome.runtime.onInstalled.addListener(() => void refresh());
chrome.runtime.onStartup.addListener(() => void refresh());

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  // notifyState is written by this worker — reacting to it would loop.
  const relevant = Object.keys(changes).some(
    (key) => key.startsWith(C.STORAGE_KEYS.snapshotPrefix) || key === C.STORAGE_KEYS.settings
  );
  if (relevant) void refresh();
});

chrome.alarms.onAlarm.addListener((alarm) => void onAlarm(alarm));

chrome.action.onClicked.addListener(() => void openClaude());

chrome.notifications.onClicked.addListener((id) => {
  try {
    chrome.notifications.clear(id);
  } catch {
    // already dismissed
  }
  void openClaude();
});

// Repaint the badge and re-sync alarms with whatever is currently stored.
async function refresh() {
  try {
    const snapshots = await S.loadAllSnapshots();
    const now = Date.now();
    await paintToolbar(latest(snapshots), now);
    await syncAlarms(snapshots, now);
  } catch (err) {
    console.warn('[headroom] refresh failed:', err && err.message);
  }
}

function latest(snapshots) {
  let best = null;
  for (const snap of snapshots) {
    if (!best || snap.capturedAt > best.capturedAt) best = snap;
  }
  return best;
}

async function paintToolbar(snapshot, now) {
  const state = A.toolbarState(snapshot, now);
  try {
    await chrome.action.setTitle({ title: state.title });
    await chrome.action.setBadgeText({ text: state.text });
    if (state.color) {
      await chrome.action.setBadgeBackgroundColor({ color: state.color });
      await chrome.action.setBadgeTextColor({ color: '#ffffff' });
    }
  } catch (err) {
    console.warn('[headroom] toolbar update failed:', err && err.message);
  }
}

async function syncAlarms(snapshots, now) {
  try {
    const planned = A.plannedAlarms(snapshots, now);
    const { clear, create } = A.reconcileAlarms(await chrome.alarms.getAll(), planned);
    for (const name of clear) await chrome.alarms.clear(name);
    for (const alarm of create) chrome.alarms.create(alarm.name, { when: alarm.when });
  } catch (err) {
    console.warn('[headroom] alarm sync failed:', err && err.message);
  }
}

async function onAlarm(alarm) {
  const parsed = A.parseAlarmName(alarm && alarm.name);
  if (!parsed) return;
  try {
    const [snapshot, settings, notifyState] = await Promise.all([
      S.loadSnapshot(parsed.orgId),
      S.loadSettings(),
      S.loadNotifyState(),
    ]);
    const stateKey = `${parsed.orgId}:${parsed.windowKey}`;
    const plan = A.resetNotification({
      snapshot,
      windowKey: parsed.windowKey,
      now: Date.now(),
      lastNotifiedResetsAt: notifyState[stateKey] ?? null,
      enabled: settings.resetNotifications !== false,
    });
    if (plan) {
      await notify(plan);
      notifyState[stateKey] = plan.resetsAt;
      await S.saveNotifyState(notifyState);
    }
  } catch (err) {
    console.warn('[headroom] alarm handling failed:', err && err.message);
  }
  // The window just rolled over: the badge must stop showing its old number.
  await refresh();
}

function notify(plan) {
  return new Promise((resolve) => {
    try {
      chrome.notifications.create(
        plan.id,
        {
          type: 'basic',
          iconUrl: chrome.runtime.getURL('assets/icons/icon128.png'),
          title: plan.title,
          message: plan.message,
          priority: 0,
        },
        () => resolve()
      );
    } catch (err) {
      console.warn('[headroom] notification failed:', err && err.message);
      resolve();
    }
  });
}

// Focus an existing claude.ai tab rather than piling up new ones. Tab querying
// by URL is covered by our existing claude.ai host permission.
async function openClaude() {
  try {
    const tabs = await chrome.tabs.query({ url: 'https://claude.ai/*' });
    if (tabs.length > 0) {
      await chrome.tabs.update(tabs[0].id, { active: true });
      if (tabs[0].windowId !== undefined) {
        await chrome.windows.update(tabs[0].windowId, { focused: true });
      }
      return;
    }
    await chrome.tabs.create({ url: CLAUDE_URL });
  } catch (err) {
    console.warn('[headroom] could not open claude.ai:', err && err.message);
  }
}
