(() => {
  const OVERLAY_ID = "debt-collector-overlay";
  let overlayEl = null;
  let debtEl = null;
  let sitesEl = null;

  function formatSeconds(seconds) {
    const safe = Math.max(0, Number(seconds) || 0);
    const minutes = Math.floor(safe / 60);
    const remainder = safe % 60;
    return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
  }

  function ensureOverlay() {
    if (overlayEl) {
      return overlayEl;
    }

    overlayEl = document.createElement("div");
    overlayEl.id = OVERLAY_ID;
    overlayEl.innerHTML = `
      <div class="dc-card">
        <h1>Access requires zero balance</h1>
        <p class="dc-subtitle">Repay debt on a productive site to continue.</p>
        <p class="dc-debt" id="dc-debt">Debt: 00:00</p>
        <p class="dc-links-title">Productive sites</p>
        <ul class="dc-links" id="dc-links"></ul>
      </div>
    `;

    debtEl = overlayEl.querySelector("#dc-debt");
    sitesEl = overlayEl.querySelector("#dc-links");
    return overlayEl;
  }

  function setLinks(productiveSites = []) {
    if (!sitesEl) {
      return;
    }

    const topSites = productiveSites.slice(0, 3);
    if (topSites.length === 0) {
      sitesEl.innerHTML = "<li>Add productive sites in popup settings.</li>";
      return;
    }

    sitesEl.innerHTML = topSites
      .map((site) => `<li><a href="https://${site}" target="_blank" rel="noreferrer">${site}</a></li>`)
      .join("");
  }

  function showOverlay({ debtSeconds, productiveSites }) {
    const root = ensureOverlay();
    if (!document.documentElement.contains(root)) {
      document.documentElement.appendChild(root);
    }
    debtEl.textContent = `Debt: ${formatSeconds(debtSeconds)}`;
    setLinks(productiveSites);
  }

  function hideOverlay() {
    if (overlayEl?.parentElement) {
      overlayEl.parentElement.removeChild(overlayEl);
    }
  }

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === "BLOCK_STATUS") {
      const payload = message.payload || {};
      if (payload.shouldBlock) {
        showOverlay(payload);
      } else {
        hideOverlay();
      }
    }

    if (message?.type === "DEBT_UPDATED" && overlayEl?.isConnected) {
      debtEl.textContent = `Debt: ${formatSeconds(message.payload?.debtSeconds ?? 0)}`;
    }
  });
})();
