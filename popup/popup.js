function formatSeconds(seconds) {
  const safe = Math.max(0, Number(seconds) || 0);
  const minutes = Math.floor(safe / 60);
  const remainder = safe % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

function renderDebt(debtSeconds) {
  const debtEl = document.getElementById("debt");
  debtEl.textContent = `Debt: ${formatSeconds(debtSeconds)}`;
}

chrome.runtime.sendMessage({ type: "GET_STATE" }, (response) => {
  renderDebt(response?.payload?.debtSeconds ?? 0);
});

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === "DEBT_UPDATED") {
    renderDebt(message.payload?.debtSeconds ?? 0);
  }
});
