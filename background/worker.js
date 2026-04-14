import { applyDebtTick, ensureDefaultState, getState, setDebtSeconds } from "./debt.js";
import { classifyUrl } from "./sites.js";

const ALARM_NAME = "debt-tick";

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

  const state = await getState();
  const classification = classifyUrl(tab.url, state.bannedSites, state.productiveSites);
  const debtSeconds = applyDebtTick(state, classification);
  const savedDebt = await setDebtSeconds(debtSeconds);

  // Notify listeners that debt has changed.
  await safeBroadcast({
    type: "DEBT_UPDATED",
    payload: { debtSeconds: savedDebt, streakDays: state.streakDays ?? 0 }
  });

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
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "GET_STATE") {
    getState()
      .then((state) => sendResponse({ type: "STATE_RESPONSE", payload: state }))
      .catch((err) => {
        console.error("Failed to respond with state:", err);
        sendResponse({ type: "STATE_RESPONSE", payload: null });
      });
    return true;
  }

  return false;
});
