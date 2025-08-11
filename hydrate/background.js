/* Hydrate — Background Service Worker (MV3)
 * Handles: alarms, notifications, daily rollover, badge, and messages from UI
 */

const DEFAULTS = {
  targetCups: 8,
  cupSizeMl: 250,
  intervalMin: 60,
  startHour: 9,   // 24h local time
  endHour: 21,    // inclusive end boundary check handled below
  notificationsEnabled: true,
  snoozeMin: 15,
  cupsToday: 0,
  lastDate: null,
  snoozeUntil: 0
};

function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function withinActiveHours(now, startHour, endHour) {
  const h = now.getHours();
  if (startHour <= endHour) {
    return h >= startHour && h <= endHour;
  } else {
    // overnight window (e.g., 22 → 6)
    return h >= startHour || h <= endHour;
  }
}

async function getState() {
  const data = await chrome.storage.local.get(Object.keys(DEFAULTS));
  return Object.assign({}, DEFAULTS, data);
}

async function setState(patch) {
  await chrome.storage.local.set(patch);
  return getState();
}

async function ensureInitialized() {
  const state = await getState();
  const needsInit = state.lastDate == null;
  if (needsInit) {
    await setState({ lastDate: todayISO() });
  }
  // One-time badge style
  chrome.action.setBadgeBackgroundColor({ color: "#3B82F6" });
  await updateBadge();
}

async function ensureNewDay() {
  const state = await getState();
  const t = todayISO();
  if (state.lastDate !== t) {
    await setState({ lastDate: t, cupsToday: 0, snoozeUntil: 0 });
    await updateBadge();
  }
}

async function updateBadge() {
  const { cupsToday, targetCups } = await getState();
  const text = `${Math.min(cupsToday, 99)}/${Math.min(targetCups, 99)}`;
  chrome.action.setBadgeText({ text });
}

async function scheduleAlarms() {
  const { intervalMin } = await getState();
  // Clear existing alarms first
  const alarms = await chrome.alarms.getAll();
  await Promise.all(alarms.map(a => chrome.alarms.clear(a.name)));

  // Primary periodic tick. We'll gate by hours & snooze in handler
  const period = Math.max(1, Number(intervalMin) || 60);
  chrome.alarms.create("hydrate:tick", { periodInMinutes: period });

  // Lightweight daily rollover check ~ every 30 minutes
  chrome.alarms.create("hydrate:rollover", { periodInMinutes: 30 });
}

async function maybeNotify() {
  const state = await getState();
  if (!state.notificationsEnabled) return;

  const now = new Date();
  if (!withinActiveHours(now, state.startHour, state.endHour)) return;

  await ensureNewDay();
  const fresh = await getState();
  if (fresh.cupsToday >= fresh.targetCups) return;

  if (Date.now() < (fresh.snoozeUntil || 0)) return; // snoozed

  const left = fresh.targetCups - fresh.cupsToday;
  const title = `Time to hydrate 💧`;
  const message = left === 1 ?
    `Just 1 cup left to hit your daily goal!` :
    `${left} cups to go. Small sips add up.`;

  chrome.notifications.create("hydrate:reminder", {
    type: "basic",
    iconUrl: "", // optional; Chrome allows empty in dev. Add an icons/128.png if you like.
    title,
    message,
    priority: 1,
    requireInteraction: false,
    buttons: [
      { title: "I drank a cup" },
      { title: `Snooze ${fresh.snoozeMin} min` }
    ]
  });
}

async function drinkOne() {
  const { cupsToday, targetCups } = await getState();
  const next = Math.min(cupsToday + 1, targetCups);
  await setState({ cupsToday: next });
  await updateBadge();
}

async function undoOne() {
  const { cupsToday } = await getState();
  const next = Math.max(0, cupsToday - 1);
  await setState({ cupsToday: next });
  await updateBadge();
}

chrome.runtime.onInstalled.addListener(async () => {
  await ensureInitialized();
  await scheduleAlarms();
});

chrome.runtime.onStartup.addListener(async () => {
  await ensureInitialized();
  await scheduleAlarms();
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === "hydrate:tick") {
    await maybeNotify();
  } else if (alarm.name === "hydrate:rollover") {
    await ensureNewDay();
  } else if (alarm.name === "hydrate:snoozeDone") {
    await setState({ snoozeUntil: 0 });
    await maybeNotify();
  }
});

chrome.notifications.onButtonClicked.addListener(async (notifId, btnIdx) => {
  if (notifId !== "hydrate:reminder") return;
  if (btnIdx === 0) {
    await drinkOne();
    chrome.notifications.clear(notifId);
  } else if (btnIdx === 1) {
    const { snoozeMin } = await getState();
    const when = Date.now() + (snoozeMin * 60 * 1000);
    await setState({ snoozeUntil: when });
    chrome.notifications.clear(notifId);
    const whenDate = new Date(when);
    chrome.alarms.create("hydrate:snoozeDone", { when: whenDate.getTime() });
  }
});

chrome.notifications.onClicked.addListener(async (notifId) => {
  if (notifId === "hydrate:reminder") {
    await drinkOne();
    chrome.notifications.clear(notifId);
  }
});

// Message bridge for popup/options
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    switch (msg?.type) {
      case "GET_STATE": {
        const s = await getState();
        sendResponse(s);
        break;
      }
      case "DRINK_ONE": {
        await drinkOne();
        sendResponse({ ok: true });
        break;
      }
      case "UNDO_ONE": {
        await undoOne();
        sendResponse({ ok: true });
        break;
      }
      case "RESET_TODAY": {
        await setState({ cupsToday: 0 });
        await updateBadge();
        sendResponse({ ok: true });
        break;
      }
      case "SETTINGS_CHANGED": {
        // Validate & persist settings
        const patch = {};
        if (typeof msg.targetCups === 'number' && msg.targetCups > 0 && msg.targetCups < 100) patch.targetCups = Math.round(msg.targetCups);
        if (typeof msg.cupSizeMl === 'number' && msg.cupSizeMl > 0 && msg.cupSizeMl < 2000) patch.cupSizeMl = Math.round(msg.cupSizeMl);
        if (typeof msg.intervalMin === 'number' && msg.intervalMin >= 5 && msg.intervalMin <= 360) patch.intervalMin = Math.round(msg.intervalMin);
        if (typeof msg.startHour === 'number' && msg.startHour >= 0 && msg.startHour <= 23) patch.startHour = Math.round(msg.startHour);
        if (typeof msg.endHour === 'number' && msg.endHour >= 0 && msg.endHour <= 23) patch.endHour = Math.round(msg.endHour);
        if (typeof msg.notificationsEnabled === 'boolean') patch.notificationsEnabled = msg.notificationsEnabled;
        if (typeof msg.snoozeMin === 'number' && msg.snoozeMin >= 5 && msg.snoozeMin <= 120) patch.snoozeMin = Math.round(msg.snoozeMin);

        await setState(patch);
        await scheduleAlarms();
        await updateBadge();
        sendResponse({ ok: true });
        break;
      }
      default:
        sendResponse({ ok: false, error: 'unknown_message' });
    }
  })();

  return true; // async response
});
