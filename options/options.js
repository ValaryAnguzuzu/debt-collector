const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

const PRESETS = {
  nineToFive: {
    mon: ["09:00", "17:00"],
    tue: ["09:00", "17:00"],
    wed: ["09:00", "17:00"],
    thu: ["09:00", "17:00"],
    fri: ["09:00", "17:00"],
    sat: null,
    sun: null
  },
  deepWork: {
    mon: ["10:00", "14:00"],
    tue: ["10:00", "14:00"],
    wed: ["10:00", "14:00"],
    thu: ["10:00", "14:00"],
    fri: ["10:00", "14:00"],
    sat: null,
    sun: null
  },
  alwaysOn: {
    mon: ["00:00", "23:59"],
    tue: ["00:00", "23:59"],
    wed: ["00:00", "23:59"],
    thu: ["00:00", "23:59"],
    fri: ["00:00", "23:59"],
    sat: ["00:00", "23:59"],
    sun: ["00:00", "23:59"]
  }
};

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

function rowMarkup(day, range) {
  const enabled = Array.isArray(range);
  const start = enabled ? range[0] : "09:00";
  const end = enabled ? range[1] : "17:00";
  return `
    <tr data-day="${day}">
      <td>${day.toUpperCase()}</td>
      <td><input type="checkbox" class="day-enabled" ${enabled ? "checked" : ""} /></td>
      <td><input type="time" class="day-start" value="${start}" ${enabled ? "" : "disabled"} /></td>
      <td><input type="time" class="day-end" value="${end}" ${enabled ? "" : "disabled"} /></td>
    </tr>
  `;
}

function applyWorkHoursToForm(workHours) {
  const body = document.getElementById("workHoursBody");
  body.innerHTML = DAYS.map((day) => rowMarkup(day, workHours?.[day])).join("");
  body.querySelectorAll(".day-enabled").forEach((checkbox) => {
    checkbox.addEventListener("change", () => {
      const row = checkbox.closest("tr");
      const enabled = checkbox.checked;
      row.querySelector(".day-start").disabled = !enabled;
      row.querySelector(".day-end").disabled = !enabled;
    });
  });
}

function readWorkHoursFromForm() {
  const workHours = {};
  const rows = document.querySelectorAll("#workHoursBody tr");
  rows.forEach((row) => {
    const day = row.dataset.day;
    const enabled = row.querySelector(".day-enabled").checked;
    if (!enabled) {
      workHours[day] = null;
      return;
    }
    workHours[day] = [row.querySelector(".day-start").value, row.querySelector(".day-end").value];
  });
  return workHours;
}

function setStatus(text) {
  document.getElementById("saveState").textContent = text;
}

async function loadSettings() {
  const response = await sendRuntimeMessage({ type: "GET_STATE" });
  applyWorkHoursToForm(response?.payload?.workHours || {});
}

async function saveWorkHours() {
  const workHours = readWorkHoursFromForm();
  const response = await sendRuntimeMessage({ type: "WORK_HOURS_UPDATED", payload: { workHours } });
  setStatus(response?.ok ? "Saved." : "Failed to save.");
}

function applyPreset(key) {
  const preset = PRESETS[key];
  if (!preset) {
    return;
  }
  applyWorkHoursToForm(preset);
  setStatus(`Preset applied: ${key}`);
}

document.getElementById("saveWorkHours").addEventListener("click", saveWorkHours);
document.querySelectorAll("[data-preset]").forEach((button) => {
  button.addEventListener("click", () => applyPreset(button.dataset.preset));
});
loadSettings();
