/**
 * Storage utility functions for localStorage operations
 */

export const STORAGE_KEYS = {
  HABITS: "habits",
  SETTINGS: "appSettings",
  GOALS: "goals",
  TASKS: "tasks",
  MILESTONES: "milestones",
  FOCUS_SESSIONS: "focusSessions",
  STREAK_FREEZE: "streakFreeze",
  CUSTOM_CATEGORIES: "habitCategories",
} as const;

/**
 * Generic function to load data from localStorage with a fallback value
 * @param key - The localStorage key
 * @param fallback - The fallback value to return if the key doesn't exist or parsing fails
 * @returns The parsed data from localStorage or the fallback value
 */
export function loadStorageData<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed as T;
  } catch {
    return fallback;
  }
}

/**
 * Generic function to save data to localStorage
 * @param key - The localStorage key
 * @param data - The data to save
 */
export function saveStorageData<T>(key: string, data: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch {
    // localStorage unavailable (e.g. private browsing) — fail silently
  }
}
