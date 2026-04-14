function secondsToMinutes(seconds) {
  return Math.round((Number(seconds) || 0) / 60);
}

function getLastSevenDays(history) {
  return [...(history || [])].slice(-7);
}

function renderSummary(days) {
  const totalAccrued = days.reduce((sum, d) => sum + (d.debtAccrued || 0), 0);
  const totalRepaid = days.reduce((sum, d) => sum + (d.debtRepaid || 0), 0);
  const cleanDays = days.filter((d) => d.cleanDay).length;
  document.getElementById("summary").textContent =
    `Accrued: ${secondsToMinutes(totalAccrued)}m | Repaid: ${secondsToMinutes(totalRepaid)}m | Clean days: ${cleanDays}/${days.length}`;
}

function topEntry(mapObj) {
  const entries = Object.entries(mapObj || {});
  if (!entries.length) {
    return null;
  }
  entries.sort((a, b) => b[1] - a[1]);
  return entries[0];
}

function formatHourLabel(hourKey) {
  const hour = Number(hourKey);
  if (Number.isNaN(hour)) {
    return "n/a";
  }
  return `${String(hour).padStart(2, "0")}:00`;
}

function renderMetrics({ siteDebtTotals, hourlyDebtTotals, repaymentSessions }) {
  const metricsEl = document.getElementById("metrics");
  const topSite = topEntry(siteDebtTotals);
  const worstHour = topEntry(hourlyDebtTotals);
  const avgRepay =
    Array.isArray(repaymentSessions) && repaymentSessions.length
      ? Math.round(
          repaymentSessions.reduce((sum, session) => sum + (session.durationSeconds || 0), 0) /
            repaymentSessions.length
        )
      : 0;
  const accruedTotal = Object.entries(siteDebtTotals || {}).reduce((sum, [, value]) => sum + value, 0);

  metricsEl.innerHTML = [
    `<li>Worst Hour: ${worstHour ? formatHourLabel(worstHour[0]) : "n/a"}</li>`,
    `<li>Biggest Offender: ${topSite ? topSite[0] : "n/a"}</li>`,
    `<li>Avg Payback Time: ${secondsToMinutes(avgRepay)}m</li>`,
    `<li>Debt Trend Baseline (tracked total): ${secondsToMinutes(accruedTotal)}m</li>`
  ].join("");
}

function renderChart(days) {
  if (!days.length) {
    document.getElementById("chart").textContent = "No history yet.";
    return;
  }

  const lines = days.map((day) => {
    const accruedBars = "█".repeat(Math.min(30, Math.round((day.debtAccrued || 0) / 60)));
    const repaidBars = "░".repeat(Math.min(30, Math.round((day.debtRepaid || 0) / 60)));
    return `${day.date}  +${accruedBars}\n            -${repaidBars}`;
  });

  document.getElementById("chart").textContent = lines.join("\n");
}

function renderHistoryList(days) {
  const list = document.getElementById("historyList");
  list.innerHTML = days
    .map((day) => {
      const accrued = secondsToMinutes(day.debtAccrued || 0);
      const repaid = secondsToMinutes(day.debtRepaid || 0);
      return `<li>${day.date}: +${accrued}m, -${repaid}m, clean: ${day.cleanDay ? "yes" : "no"}</li>`;
    })
    .join("");
}

async function loadAnalytics() {
  try {
    const result = await chrome.storage.local.get([
      "history",
      "siteDebtTotals",
      "hourlyDebtTotals",
      "repaymentSessions"
    ]);
    const history = result.history || [];
    const days = getLastSevenDays(history);
    renderSummary(days);
    renderMetrics({
      siteDebtTotals: result.siteDebtTotals || {},
      hourlyDebtTotals: result.hourlyDebtTotals || {},
      repaymentSessions: result.repaymentSessions || []
    });
    renderChart(days);
    renderHistoryList(days);
  } catch (err) {
    console.error("Failed to load analytics:", err);
    document.getElementById("chart").textContent = "Failed to load analytics.";
  }
}

loadAnalytics();
