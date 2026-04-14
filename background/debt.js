const DEFAULT_STATE = {
  debtSeconds: 0,
  accrualRate: 1.5,
  workHours: {
    mon: ["09:00", "18:00"],
    tue: ["09:00", "18:00"],
    wed: ["09:00", "18:00"],
    thu: ["09:00", "18:00"],
    fri: ["09:00", "18:00"],
    sat: null,
    sun: null
  },
  bannedSites: [
    "youtube.com",
    "reddit.com",
    "twitter.com",
    "x.com",
    "instagram.com",
    "tiktok.com"
  ],
  productiveSites: ["github.com", "notion.so", "docs.google.com", "figma.com", "linear.app"],
  streakDays: 0,
  allTimeStreak: 0,
  badges: [],
  history: [],
  siteDebtTotals: {},
  hourlyDebtTotals: {},
  repaymentSessions: [],
  activeDebtStartedAt: null,
  forgiveSession: null,
  onboardingComplete: false
};

const STORAGE_KEYS = Object.keys(DEFAULT_STATE);

export async function ensureDefaultState() {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEYS);
    const merged = { ...DEFAULT_STATE, ...result };
    await chrome.storage.local.set(merged);
    return merged;
  } catch (err) {
    console.error("Failed to initialize state:", err);
    return { ...DEFAULT_STATE };
  }
}

export async function getState() {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEYS);
    return { ...DEFAULT_STATE, ...result };
  } catch (err) {
    console.error("Failed to read state:", err);
    return { ...DEFAULT_STATE };
  }
}

export async function setDebtSeconds(debtSeconds) {
  const clamped = Math.max(0, Math.round(debtSeconds));
  try {
    await chrome.storage.local.set({ debtSeconds: clamped });
    return clamped;
  } catch (err) {
    console.error("Failed to write debt:", err);
    return clamped;
  }
}

export async function setDebtAndHistory({ debtSeconds, history }) {
  const clamped = Math.max(0, Math.round(debtSeconds));
  const safeHistory = Array.isArray(history) ? history.slice(-90) : [];
  try {
    await chrome.storage.local.set({ debtSeconds: clamped, history: safeHistory });
    return clamped;
  } catch (err) {
    console.error("Failed to write debt/history:", err);
    return clamped;
  }
}

export function applyDebtTick(state, classification) {
  let updatedDebt = state.debtSeconds ?? 0;

  if (classification.isBanned) {
    updatedDebt += 60 * (state.accrualRate ?? 1.5);
  } else if (classification.isProductive && updatedDebt > 0) {
    updatedDebt -= 60;
  }

  return Math.max(0, Math.round(updatedDebt));
}

const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

function toMinutes(timeString) {
  const [hours, minutes] = String(timeString).split(":").map(Number);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) {
    return null;
  }

  return hours * 60 + minutes;
}

export function isWithinWorkHours(workHours, now = new Date()) {
  const dayKey = DAY_KEYS[now.getDay()];
  const dayRange = workHours?.[dayKey];

  if (!Array.isArray(dayRange) || dayRange.length !== 2) {
    return false;
  }

  const start = toMinutes(dayRange[0]);
  const end = toMinutes(dayRange[1]);
  if (start === null || end === null) {
    return false;
  }

  const current = now.getHours() * 60 + now.getMinutes();
  return current >= start && current < end;
}

function todayKey(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

export function updateHistory(history, previousDebt, nextDebt, now = new Date()) {
  const delta = Math.round(nextDebt - previousDebt);
  if (delta === 0) {
    return Array.isArray(history) ? history.slice(-90) : [];
  }

  const list = Array.isArray(history) ? [...history] : [];
  const date = todayKey(now);
  const existingIndex = list.findIndex((item) => item?.date === date);
  const existing =
    existingIndex >= 0
      ? list[existingIndex]
      : { date, debtAccrued: 0, debtRepaid: 0, cleanDay: nextDebt === 0 };

  if (delta > 0) {
    existing.debtAccrued += delta;
  } else {
    existing.debtRepaid += Math.abs(delta);
  }
  existing.cleanDay = nextDebt === 0;

  if (existingIndex >= 0) {
    list[existingIndex] = existing;
  } else {
    list.push(existing);
  }

  return list.slice(-90);
}

export function computeStreakFromHistory(history) {
  const list = Array.isArray(history) ? [...history].sort((a, b) => (a.date < b.date ? -1 : 1)) : [];
  let streak = 0;

  for (let i = list.length - 1; i >= 0; i -= 1) {
    if (list[i]?.cleanDay) {
      streak += 1;
    } else {
      break;
    }
  }

  return streak;
}

export function computeBadges(state, history, previousDebt, currentDebt) {
  const next = new Set(Array.isArray(state?.badges) ? state.badges : []);
  const streak = computeStreakFromHistory(history);

  if (streak >= 5) {
    next.add("clean_week");
  }

  if (previousDebt >= 60 * 60 && currentDebt === 0) {
    next.add("comeback");
  }

  if (previousDebt > 0 && currentDebt === 0 && previousDebt <= 10 * 60) {
    next.add("speed_repay");
  }

  return [...next];
}
