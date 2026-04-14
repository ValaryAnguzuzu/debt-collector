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

function loadState() {
  chrome.runtime.sendMessage({ type: "GET_STATE" }, (response) => {
    const state = response?.payload || {};
    renderState(state);
    setSiteInputs(state);
  });
}

function saveSites() {
  const bannedSites = parseSites(document.getElementById("bannedSites").value);
  const productiveSites = parseSites(document.getElementById("productiveSites").value);

  chrome.runtime.sendMessage(
    {
      type: "SITES_UPDATED",
      payload: { bannedSites, productiveSites }
    },
    (response) => {
      if (response?.ok) {
        setSaveState("Saved.");
        loadState();
      } else {
        setSaveState("Failed to save.");
      }
    }
  );
}

document.getElementById("saveSites").addEventListener("click", saveSites);
loadState();

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === "DEBT_UPDATED") {
    renderState({
      debtSeconds: message.payload?.debtSeconds ?? 0,
      streakDays: message.payload?.streakDays ?? 0,
      inWorkHours: Boolean(message.payload?.inWorkHours)
    });
  }
});
