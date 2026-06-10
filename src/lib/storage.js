'use strict';

globalThis.Headroom = globalThis.Headroom || {};

// Two stores, two read patterns — don't unify them:
//  - chrome.storage.local mirrors the latest snapshot per org so the badge can
//    read it cheaply and all tabs converge via chrome.storage.onChanged
//  - IndexedDB holds the time-series history (v1 pace prediction feeds on it),
//    pruned to 90 days on every write
Headroom.storage = (() => {
  const C = Headroom.constants;
  const DB_NAME = 'headroom';
  const DB_VERSION = 1;
  const HISTORY_STORE = 'history';

  let dbPromise = null;

  function openDb() {
    if (!dbPromise) {
      dbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(HISTORY_STORE)) {
            const store = db.createObjectStore(HISTORY_STORE, { autoIncrement: true });
            store.createIndex('capturedAt', 'capturedAt');
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      // Allow a retry on the next write instead of caching the failure forever.
      dbPromise.catch(() => { dbPromise = null; });
    }
    return dbPromise;
  }

  function appendHistory(snapshot) {
    return openDb().then(
      (db) =>
        new Promise((resolve, reject) => {
          const tx = db.transaction(HISTORY_STORE, 'readwrite');
          const store = tx.objectStore(HISTORY_STORE);
          store.add(snapshot);
          const cutoff = snapshot.capturedAt - C.HISTORY_RETENTION_MS;
          const cursorReq = store.index('capturedAt').openCursor(IDBKeyRange.upperBound(cutoff));
          cursorReq.onsuccess = () => {
            const cursor = cursorReq.result;
            if (cursor) {
              cursor.delete();
              cursor.continue();
            }
          };
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
          tx.onabort = () => reject(tx.error);
        })
    );
  }

  async function saveSnapshot(snapshot) {
    try {
      await chrome.storage.local.set({
        [C.STORAGE_KEYS.snapshotPrefix + snapshot.orgId]: snapshot,
        [C.STORAGE_KEYS.latestOrgId]: snapshot.orgId,
      });
    } catch (err) {
      console.warn('[headroom] snapshot write failed:', err && err.message);
    }
    try {
      await appendHistory(snapshot);
    } catch (err) {
      console.warn('[headroom] history write failed:', err && err.message);
    }
  }

  function validSnapshot(s) {
    return s && s.v === C.SNAPSHOT_VERSION && s.windows && typeof s.windows === 'object' ? s : null;
  }

  async function loadSnapshot(orgId) {
    try {
      const key = C.STORAGE_KEYS.snapshotPrefix + orgId;
      const got = await chrome.storage.local.get(key);
      return validSnapshot(got[key]);
    } catch {
      return null;
    }
  }

  // Latest snapshot across orgs — used before this tab has seen any traffic
  // and therefore doesn't know which org it belongs to.
  async function loadLatest() {
    try {
      const all = await chrome.storage.local.get(null);
      const latestOrg = all[C.STORAGE_KEYS.latestOrgId];
      const direct = latestOrg && validSnapshot(all[C.STORAGE_KEYS.snapshotPrefix + latestOrg]);
      if (direct) return direct;
      let best = null;
      for (const [key, value] of Object.entries(all)) {
        if (!key.startsWith(C.STORAGE_KEYS.snapshotPrefix)) continue;
        const snap = validSnapshot(value);
        if (snap && (!best || snap.capturedAt > best.capturedAt)) best = snap;
      }
      return best;
    } catch {
      return null;
    }
  }

  async function loadBadgePosition() {
    try {
      const got = await chrome.storage.local.get(C.STORAGE_KEYS.badgePosition);
      const pos = got[C.STORAGE_KEYS.badgePosition];
      if (pos && Number.isFinite(pos.right) && Number.isFinite(pos.bottom)) return pos;
    } catch {
      // fall through to default
    }
    return null;
  }

  async function saveBadgePosition(pos) {
    try {
      await chrome.storage.local.set({ [C.STORAGE_KEYS.badgePosition]: pos });
    } catch (err) {
      console.warn('[headroom] position write failed:', err && err.message);
    }
  }

  return { saveSnapshot, loadSnapshot, loadLatest, loadBadgePosition, saveBadgePosition };
})();
