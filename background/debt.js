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

export function applyDebtTick(state, classification) {
  let updatedDebt = state.debtSeconds ?? 0;

  if (classification.isBanned) {
    updatedDebt += 60 * (state.accrualRate ?? 1.5);
  } else if (classification.isProductive && updatedDebt > 0) {
    updatedDebt -= 60;
  }

  return Math.max(0, Math.round(updatedDebt));
}
