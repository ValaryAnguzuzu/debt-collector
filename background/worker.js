import {
  applyDebtTick,
  computeBadges,
  computeStreakFromHistory,
  ensureDefaultState,
  getState,
  isWithinWorkHours,
  setDebtAndHistory,
  updateHistory
} from "./debt.js";
import { classifyUrl } from "./sites.js";

const ALARM_NAME = "debt-tick";
const HIGH_DEBT_SECONDS = 15 * 60;
let sentHighDebtNotification = false;

async function safeBroadcast(message) {
  try {
    await chrome.runtime.sendMessage(message);
  } catch (err) {
    // This is expected when popup/content listeners are not open.
    if (!String(err?.message || "").includes("Receiving end does not exist")) {
      console.error("Broadcast failed:", err);
    }
  }
}

async function getActiveTab() {
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    return tabs[0] ?? null;
  } catch (err) {
    console.error("Failed to query active tab:", err);
    return null;
  }
}

async function sendToTab(tabId, message) {
  if (!Number.isInteger(tabId)) {
    return;
  }

  try {
    await chrome.tabs.sendMessage(tabId, message);
  } catch (err) {
    if (!String(err?.message || "").includes("Receiving end does not exist")) {
      console.error("Tab message failed:", err);
    }
  }
}

async function updateBlockStateForTab(tab, source) {
  if (!tab?.url) {
    return;
  }

  const state = await getState();
  const classification = classifyUrl(tab.url, state.bannedSites, state.productiveSites);
  const inWorkHours = isWithinWorkHours(state.workHours);
  const isForgiven = isForgivenForUrl(state, tab.url);
  const shouldBlock = Boolean(
    inWorkHours && classification.isBanned && (state.debtSeconds ?? 0) > 0 && !isForgiven
  );

  await sendToTab(tab.id, {
    type: "BLOCK_STATUS",
    payload: {
      shouldBlock,
      debtSeconds: state.debtSeconds ?? 0,
      productiveSites: state.productiveSites ?? []
    }
  });

  console.log(`[DebtCollector][block-check:${source}]`, {
    tabId: tab.id,
    url: tab.url,
    shouldBlock,
    inWorkHours,
    isForgiven,
    debtSeconds: state.debtSeconds ?? 0
  });
}

function extractHostname(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function addAccrualStats(state, url, deltaSeconds, now = new Date()) {
  if (deltaSeconds <= 0) {
    return {
      siteDebtTotals: state.siteDebtTotals ?? {},
      hourlyDebtTotals: state.hourlyDebtTotals ?? {}
    };
  }

  const hostname = extractHostname(url) || "unknown";
  const hourKey = String(now.getHours()).padStart(2, "0");
  const siteDebtTotals = { ...(state.siteDebtTotals ?? {}) };
  const hourlyDebtTotals = { ...(state.hourlyDebtTotals ?? {}) };
  siteDebtTotals[hostname] = (siteDebtTotals[hostname] ?? 0) + deltaSeconds;
  hourlyDebtTotals[hourKey] = (hourlyDebtTotals[hourKey] ?? 0) + deltaSeconds;
  return { siteDebtTotals, hourlyDebtTotals };
}

function isForgiveSessionActive(state, nowMs = Date.now()) {
  return Boolean(state?.forgiveSession?.endsAt && state.forgiveSession.endsAt > nowMs);
}

function isForgivenForUrl(state, url, nowMs = Date.now()) {
  if (!isForgiveSessionActive(state, nowMs)) {
    return false;
  }
  const targetSite = state?.forgiveSession?.site;
  const hostname = extractHostname(url);
  return Boolean(targetSite && hostname && (hostname === targetSite || hostname.endsWith(`.${targetSite}`)));
}

async function clearExpiredForgiveSession(state, nowMs = Date.now()) {
  if (state?.forgiveSession?.endsAt && state.forgiveSession.endsAt <= nowMs) {
    await chrome.storage.local.set({ forgiveSession: null });
    return { ...state, forgiveSession: null };
  }
  return state;
}

async function notifyIfNeeded(previousDebt, currentDebt) {
  if (previousDebt < HIGH_DEBT_SECONDS && currentDebt >= HIGH_DEBT_SECONDS && !sentHighDebtNotification) {
    sentHighDebtNotification = true;
    try {
      await chrome.notifications.create({
        type: "basic",
        iconUrl: "assets/icons/icon48.png",
        title: "Debt Collector",
        message: "Debt is above 15 minutes. Repayment recommended."
      });
    } catch (err) {
      console.error("High debt notification failed:", err);
    }
  }

  if (previousDebt > 0 && currentDebt === 0) {
    sentHighDebtNotification = false;
    try {
      await chrome.notifications.create({
        type: "basic",
        iconUrl: "assets/icons/icon48.png",
        title: "Debt Collector",
        message: "Debt fully cleared. Site access restored."
      });
    } catch (err) {
      console.error("Debt cleared notification failed:", err);
    }
  }

  if (currentDebt < HIGH_DEBT_SECONDS) {
    sentHighDebtNotification = false;
  }
}

async function updateActionBadge(state, inWorkHours) {
  const debtSeconds = state?.debtSeconds ?? 0;
  const forgivenessActive = isForgiveSessionActive(state);

  if (forgivenessActive) {
    await chrome.action.setBadgeText({ text: "F" });
    await chrome.action.setBadgeBackgroundColor({ color: "#2563eb" });
    return;
  }

  if (!inWorkHours) {
    await chrome.action.setBadgeText({ text: "OFF" });
    await chrome.action.setBadgeBackgroundColor({ color: "#6b7280" });
    return;
  }

  if (debtSeconds <= 0) {
    await chrome.action.setBadgeText({ text: "OK" });
    await chrome.action.setBadgeBackgroundColor({ color: "#16a34a" });
    return;
  }

  const debtMinutes = Math.ceil(debtSeconds / 60);
  const text = debtMinutes > 99 ? "99+" : String(debtMinutes);
  await chrome.action.setBadgeText({ text });
  await chrome.action.setBadgeBackgroundColor({ color: "#dc2626" });
}

async function classifyAndLogTab(tab, source) {
  if (!tab?.url) {
    return null;
  }

  const state = await getState();
  const classification = classifyUrl(tab.url, state.bannedSites, state.productiveSites);

  console.log(`[DebtCollector][${source}]`, {
    tabId: tab.id,
    url: tab.url,
    hostname: classification.hostname,
    isBanned: classification.isBanned,
    isProductive: classification.isProductive
  });

  return classification;
}

async function runDebtTick() {
  const tab = await getActiveTab();
  if (!tab?.url) {
    return;
  }

  let state = await getState();
  state = await clearExpiredForgiveSession(state);
  const inWorkHours = isWithinWorkHours(state.workHours);
  if (!inWorkHours) {
    await safeBroadcast({
      type: "DEBT_UPDATED",
      payload: { debtSeconds: state.debtSeconds ?? 0, streakDays: state.streakDays ?? 0, inWorkHours }
    });
    await updateBlockStateForTab(tab, "tick-off-hours");
    await updateActionBadge(state, inWorkHours);
    return;
  }

  const classification = classifyUrl(tab.url, state.bannedSites, state.productiveSites);
  const previousDebt = state.debtSeconds ?? 0;
  const forgiven = isForgivenForUrl(state, tab.url);
  const debtSeconds = forgiven ? previousDebt : applyDebtTick(state, classification);
  const debtDelta = debtSeconds - previousDebt;
  const nextHistory = updateHistory(state.history, previousDebt, debtSeconds);
  const { siteDebtTotals, hourlyDebtTotals } = addAccrualStats(
    state,
    tab.url,
    debtDelta > 0 ? debtDelta : 0
  );
  let activeDebtStartedAt = state.activeDebtStartedAt ?? null;
  let repaymentSessions = Array.isArray(state.repaymentSessions) ? [...state.repaymentSessions] : [];
  if (previousDebt === 0 && debtSeconds > 0) {
    activeDebtStartedAt = Date.now();
  }
  if (previousDebt > 0 && debtSeconds === 0 && activeDebtStartedAt) {
    repaymentSessions.push({
      startedAt: activeDebtStartedAt,
      endedAt: Date.now(),
      durationSeconds: Math.round((Date.now() - activeDebtStartedAt) / 1000)
    });
    repaymentSessions = repaymentSessions.slice(-200);
    activeDebtStartedAt = null;
  }
  const streakDays = computeStreakFromHistory(nextHistory);
  const allTimeStreak = Math.max(state.allTimeStreak ?? 0, streakDays);
  const badges = computeBadges(state, nextHistory, previousDebt, debtSeconds);
  const savedDebt = await setDebtAndHistory({ debtSeconds, history: nextHistory });
  await chrome.storage.local.set({
    streakDays,
    allTimeStreak,
    badges,
    siteDebtTotals,
    hourlyDebtTotals,
    activeDebtStartedAt,
    repaymentSessions
  });
  await notifyIfNeeded(previousDebt, savedDebt);

  // Notify listeners that debt has changed.
  await safeBroadcast({
    type: "DEBT_UPDATED",
    payload: {
      debtSeconds: savedDebt,
      streakDays,
      inWorkHours,
      forgiveSession: state.forgiveSession
    }
  });
  await updateBlockStateForTab(tab, "tick");
  await updateActionBadge({ ...state, debtSeconds: savedDebt, streakDays, allTimeStreak, badges }, inWorkHours);

  console.log("[DebtCollector][tick]", {
    hostname: classification.hostname,
    isBanned: classification.isBanned,
    isProductive: classification.isProductive,
    debtSeconds: savedDebt
  });
}

async function initEngine() {
  await ensureDefaultState();
  await chrome.alarms.create(ALARM_NAME, { periodInMinutes: 1 });
  const tab = await getActiveTab();
  const state = await getState();
  await updateActionBadge(state, isWithinWorkHours(state.workHours));
  if (tab) {
    await classifyAndLogTab(tab, "init");
    await updateBlockStateForTab(tab, "init");
  }
}

chrome.runtime.onInstalled.addListener(() => {
  initEngine().catch((err) => console.error("Init on install failed:", err));
});

chrome.runtime.onStartup.addListener(() => {
  initEngine().catch((err) => console.error("Init on startup failed:", err));
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) {
    runDebtTick().catch((err) => console.error("Debt tick failed:", err));
  }
});

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  try {
    const tab = await chrome.tabs.get(tabId);
    await classifyAndLogTab(tab, "onActivated");
    await updateBlockStateForTab(tab, "onActivated");
  } catch (err) {
    console.error("Tab activation handling failed:", err);
  }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (!changeInfo.url && changeInfo.status !== "complete") {
    return;
  }

  classifyAndLogTab(tab, "onUpdated").catch((err) => {
    console.error("Tab update handling failed:", err);
  });
  updateBlockStateForTab(tab, "onUpdated").catch((err) => {
    console.error("Block state update failed:", err);
  });
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "GET_STATE") {
    getState()
      .then((state) =>
        sendResponse({
          type: "STATE_RESPONSE",
          payload: { ...state, inWorkHours: isWithinWorkHours(state.workHours) }
        })
      )
      .catch((err) => {
        console.error("Failed to respond with state:", err);
        sendResponse({ type: "STATE_RESPONSE", payload: null });
      });
    return true;
  }

  if (message?.type === "SITES_UPDATED") {
    const bannedSites = Array.isArray(message.payload?.bannedSites) ? message.payload.bannedSites : [];
    const productiveSites = Array.isArray(message.payload?.productiveSites)
      ? message.payload.productiveSites
      : [];

    chrome.storage.local
      .set({ bannedSites, productiveSites })
      .then(async () => {
        const tab = await getActiveTab();
        if (tab) {
          await classifyAndLogTab(tab, "sites-updated");
          await updateBlockStateForTab(tab, "sites-updated");
        }
        sendResponse({ ok: true });
      })
      .catch((err) => {
        console.error("Failed to save site lists:", err);
        sendResponse({ ok: false });
      });
    return true;
  }

  if (message?.type === "FORGIVE_SESSION") {
    (async () => {
      const durationMinutes = Number(message.payload?.durationMinutes);
      if (!durationMinutes || durationMinutes <= 0) {
        sendResponse({ ok: false });
        return;
      }

      const activeTab = await getActiveTab();
      const site = extractHostname(activeTab?.url || "");
      if (!site) {
        sendResponse({ ok: false });
        return;
      }

      const endsAt = Date.now() + durationMinutes * 60 * 1000;
      await chrome.storage.local.set({ forgiveSession: { endsAt, site } });
      const state = await getState();
      await updateActionBadge(state, isWithinWorkHours(state.workHours));
      if (activeTab) {
        await updateBlockStateForTab(activeTab, "forgive-session");
      }
      sendResponse({ ok: true, payload: { endsAt, site } });
    })().catch((err) => {
      console.error("Forgive session failed:", err);
      sendResponse({ ok: false });
    });
    return true;
  }

  if (message?.type === "WORK_HOURS_UPDATED") {
    const workHours = message.payload?.workHours;
    if (!workHours || typeof workHours !== "object") {
      sendResponse({ ok: false });
      return false;
    }

    chrome.storage.local
      .set({ workHours })
      .then(async () => {
        const state = await getState();
        await updateActionBadge(state, isWithinWorkHours(state.workHours));
        const tab = await getActiveTab();
        if (tab) {
          await updateBlockStateForTab(tab, "work-hours-updated");
        }
        sendResponse({ ok: true });
      })
      .catch((err) => {
        console.error("Failed to save work hours:", err);
        sendResponse({ ok: false });
      });
    return true;
  }

  return false;
});
