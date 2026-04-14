function formatSeconds(seconds) {
  const safe = Math.max(0, Number(seconds) || 0);
  const minutes = Math.floor(safe / 60);
  const remainder = safe % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

function renderState(state) {
  const debtSeconds = state?.debtSeconds ?? 0;
  const inWorkHours = state?.inWorkHours ?? false;
  const debtEl = document.getElementById("debt");
  const streakEl = document.getElementById("streak");
  const statusEl = document.getElementById("status");
  debtEl.textContent = `Debt: ${formatSeconds(debtSeconds)}`;
  streakEl.textContent = `Streak: ${state?.streakDays ?? 0} days`;
  statusEl.textContent = `Status: ${inWorkHours ? "Work hours active" : "Off hours"}`;
  currentForgiveSession = state?.forgiveSession ?? null;
  renderForgiveState(currentForgiveSession);
}

function parseSites(text) {
  return text
    .split("\n")
    .map((line) => line.trim().toLowerCase().replace(/^www\./, ""))
    .filter((line) => line.length > 0);
}

function setSiteInputs(state) {
  const bannedEl = document.getElementById("bannedSites");
  const productiveEl = document.getElementById("productiveSites");
  bannedEl.value = (state?.bannedSites || []).join("\n");
  productiveEl.value = (state?.productiveSites || []).join("\n");
}

function setSaveState(text) {
  const saveStateEl = document.getElementById("saveState");
  saveStateEl.textContent = text;
}

function renderForgiveState(forgiveSession) {
  const forgiveEl = document.getElementById("forgiveState");
  if (!forgiveSession?.endsAt) {
    forgiveEl.textContent = "No active forgiveness session.";
    return;
  }

  const remaining = Math.max(0, Math.round((forgiveSession.endsAt - Date.now()) / 1000));
  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;
  forgiveEl.textContent = `Active for ${forgiveSession.site} (${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")} left)`;
}

let currentForgiveSession = null;

function sendRuntimeMessage(message) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        resolve({ ok: false, error: chrome.runtime.lastError.message });
        return;
      }
      resolve(response ?? { ok: false });
    });
  });
}

async function loadState() {
  const response = await sendRuntimeMessage({ type: "GET_STATE" });
  const state = response?.payload || {};
  renderState(state);
  setSiteInputs(state);
}

async function saveSites() {
  const bannedSites = parseSites(document.getElementById("bannedSites").value);
  const productiveSites = parseSites(document.getElementById("productiveSites").value);
  const response = await sendRuntimeMessage({
    type: "SITES_UPDATED",
    payload: { bannedSites, productiveSites }
  });

  if (response?.ok) {
    setSaveState("Saved.");
    loadState();
  } else {
    setSaveState("Failed to save.");
  }
}

async function startForgiveSession() {
  const durationMinutes = Number(document.getElementById("forgiveDuration").value);
  const response = await sendRuntimeMessage({
    type: "FORGIVE_SESSION",
    payload: { durationMinutes }
  });

  if (response?.ok) {
    setSaveState("Forgiveness started.");
    loadState();
  } else {
    setSaveState("Failed to start forgiveness.");
  }
}

document.getElementById("saveSites").addEventListener("click", saveSites);
document.getElementById("startForgive").addEventListener("click", startForgiveSession);
loadState();
setInterval(() => renderForgiveState(currentForgiveSession), 1000);

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === "DEBT_UPDATED") {
    renderState({
      debtSeconds: message.payload?.debtSeconds ?? 0,
      streakDays: message.payload?.streakDays ?? 0,
      inWorkHours: Boolean(message.payload?.inWorkHours)
    });
  }
});
