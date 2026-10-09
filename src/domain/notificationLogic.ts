/**
 * Intelligent Notification Logic
 * Context-aware notifications based on existing habit data
 */

import type { AppSettings, Habit } from "../types";
import { getTodayKey, isHabitScheduledOnDate } from "../utils/dates.ts";
import { onAction, registerActionTypes, sendNotification } from "@tauri-apps/plugin-notification";

export type NotificationType = "timing" | "incomplete" | "availability";
type IntelligentNotificationSettings = Pick<
  AppSettings,
  | "enableIntelligentNotifications"
  | "notificationFrequency"
  | "habitReminders"
  | "incompleteHabitReminders"
> & {
  // Day-reset hour is needed to key per-day dedupe. Optional so existing
  // partial settings in tests keep working; defaults to 0 (midnight).
  dayResetHour?: number;
};

export interface NotificationAction {
  type: "focus-habit";
  habitId?: number;
  habitName?: string;
  title?: string;
  durationMinutes?: number;
}

export interface IntelligentNotification {
  type: NotificationType;
  title: string;
  body: string;
  habitId?: number;
  habitName?: string;
  action?: NotificationAction;
}

/**
 * Native (Tauri/macOS) notification action wiring.
 *
 * The Tauri notification plugin exposes a single supported flow:
 * `registerActionTypes()` declares the buttons the OS may render, and
 * `onAction()` delivers the native tap/action event back to the app.
 * The habit context travels in the notification `extra` payload so the
 * action handler can route it to the existing Focus behavior.
 */
export const SYNCHRON_NOTIFICATION_ACTION_TYPE_ID = "synchron-focus";
export const SYNCHRON_FOCUS_ACTION_ID = "focus-habit";

let notificationActionTypesRegistered = false;
let notificationActionTypesPromise: Promise<boolean> | null = null;

export function notificationActionToExtra(action: NotificationAction): Record<string, unknown> {
  return {
    type: action.type,
    habitId: action.habitId,
    habitName: action.habitName,
    title: action.title,
    durationMinutes: action.durationMinutes,
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

export function notificationActionFromExtra(extra: unknown): NotificationAction | null {
  const record = asRecord(extra);
  if (!record || record.type !== "focus-habit") return null;
  const action: NotificationAction = { type: "focus-habit" };
  if (typeof record.habitId === "number") action.habitId = record.habitId;
  if (typeof record.habitName === "string") action.habitName = record.habitName;
  if (typeof record.title === "string") action.title = record.title;
  if (typeof record.durationMinutes === "number") action.durationMinutes = record.durationMinutes;
  return action;
}

/**
 * Normalize the native `onAction` payload into a Synchron action.
 * The plugin types the payload as notification `Options`, so the habit
 * context is read from `extra`. The lookup also tolerates the action id
 * arriving alongside the payload for forward compatibility.
 */
export function notificationActionFromNativePayload(payload: unknown): NotificationAction | null {
  const record = asRecord(payload);
  if (!record) return null;
  const fromExtra = notificationActionFromExtra(record.extra);
  if (fromExtra) return fromExtra;
  if (record.type === "focus-habit") {
    return notificationActionFromExtra(record);
  }
  return null;
}

export function ensureNotificationActionTypesRegistered(): Promise<boolean> {
  if (notificationActionTypesRegistered) return Promise.resolve(true);
  if (notificationActionTypesPromise) return notificationActionTypesPromise;
  notificationActionTypesPromise = (async () => {
    try {
      await registerActionTypes([
        {
          id: SYNCHRON_NOTIFICATION_ACTION_TYPE_ID,
          actions: [{ id: SYNCHRON_FOCUS_ACTION_ID, title: "Start Focus", foreground: true }],
        },
      ]);
      notificationActionTypesRegistered = true;
      return true;
    } catch (error) {
      console.error("Failed to register notification action types", error);
      return false;
    } finally {
      notificationActionTypesPromise = null;
    }
  })();
  return notificationActionTypesPromise;
}

/**
 * Subscribe to native notification actions via the supported `onAction`
 * flow. Resolves to an unlisten function; rejects/falls back silently
 * outside Tauri so normal browser delivery is unaffected.
 */
export async function subscribeToNativeNotificationActions(
  onNotificationAction: (action: NotificationAction) => void,
): Promise<() => void> {
  const listener = await onAction((notification) => {
    const action = notificationActionFromNativePayload(notification);
    if (action) onNotificationAction(action);
  });
  return () => listener.unregister();
}

export function resetNotificationActionRegistrationForTesting(): void {
  notificationActionTypesRegistered = false;
  notificationActionTypesPromise = null;
}

const NOTIFICATION_COOLDOWNS_MS: Record<AppSettings["notificationFrequency"], number> = {
  conservative: 120 * 60 * 1000,
  balanced: 45 * 60 * 1000,
  frequent: 20 * 60 * 1000,
};

let lastIntelligentNotificationTime = 0;
let getIsFocusTimerRunning = () => false;

// Per-habit, per-day dedupe so the 5-minute poller cannot repeat the same
// nudge all evening. Keys look like `timing:123:2026-10-09`. The set resets
// automatically when the logical day rolls over.
const sentIntelligentNotificationKeys = new Set<string>();
let sentIntelligentNotificationDayKey: string | null = null;

function pruneSentNotificationHistory(todayKey: string): void {
  if (sentIntelligentNotificationDayKey !== todayKey) {
    sentIntelligentNotificationDayKey = todayKey;
    sentIntelligentNotificationKeys.clear();
  }
}

function buildIntelligentNotificationDedupeKey(
  type: NotificationType,
  habitId: number | undefined,
  todayKey: string,
): string {
  return `${type}:${habitId ?? "general"}:${todayKey}`;
}

/** Test hook: has this habit already produced this type today? */
export function isIntelligentNotificationDuplicate(
  type: NotificationType,
  habitId: number | undefined,
  todayKey: string,
): boolean {
  pruneSentNotificationHistory(todayKey);
  return sentIntelligentNotificationKeys.has(
    buildIntelligentNotificationDedupeKey(type, habitId, todayKey),
  );
}

function markIntelligentNotificationSent(
  type: NotificationType,
  habitId: number | undefined,
  todayKey: string,
): void {
  pruneSentNotificationHistory(todayKey);
  sentIntelligentNotificationKeys.add(
    buildIntelligentNotificationDedupeKey(type, habitId, todayKey),
  );
}

export function resetIntelligentNotificationDedupeForTesting(): void {
  sentIntelligentNotificationKeys.clear();
  sentIntelligentNotificationDayKey = null;
}

export function registerFocusTimerRunningState(getIsRunning: () => boolean): () => void {
  getIsFocusTimerRunning = getIsRunning;
  return () => {
    if (getIsFocusTimerRunning === getIsRunning) getIsFocusTimerRunning = () => false;
  };
}

export function shouldSendIntelligentNotification(
  type: NotificationType,
  settings: IntelligentNotificationSettings,
  now = Date.now(),
): boolean {
  if (!settings.enableIntelligentNotifications || getIsFocusTimerRunning()) return false;

  const typeEnabled = type === "timing"
    ? settings.habitReminders
    : type === "incomplete"
      ? settings.incompleteHabitReminders
      : false;
  if (!typeEnabled) return false;

  if (now - lastIntelligentNotificationTime < NOTIFICATION_COOLDOWNS_MS[settings.notificationFrequency]) {
    return false;
  }

  lastIntelligentNotificationTime = now;
  return true;
}

/**
 * Get completion time pattern from habit history.
 *
 * Prefers real `completedAt` timestamps (circular mean, requires at least 5
 * samples with a clear concentration) and falls back to the explicit
 * time-block (`scheduledTime`) so newly planned habits still remind during
 * the Plan -> Execute step. Returns the hour of day, otherwise null.
 */
function parseScheduledHour(scheduledTime?: string): number | null {
  if (!scheduledTime) return null;
  const match = /^(\d{1,2}):(\d{2})/.exec(scheduledTime.trim());
  if (!match) return null;
  const hour = Number(match[1]);
  return hour >= 0 && hour <= 23 ? hour : null;
}

function averageHourFromCompletionTimestamps(
  completedAt?: Record<string, number>,
): number | null {
  if (!completedAt) return null;
  const timestamps = Object.values(completedAt).filter(
    (value): value is number => typeof value === "number" && Number.isFinite(value),
  );
  if (timestamps.length < 5) return null;

  let sumX = 0;
  let sumY = 0;
  for (const timestamp of timestamps) {
    const date = new Date(timestamp);
    const hourOfDay = date.getHours() + date.getMinutes() / 60;
    const angle = (hourOfDay / 24) * 2 * Math.PI;
    sumX += Math.cos(angle);
    sumY += Math.sin(angle);
  }
  // Low resultant length means completions are scattered across the day:
  // there is no useful "usual time" to remind about.
  const concentration = Math.hypot(sumX, sumY) / timestamps.length;
  if (concentration < 0.7) return null;

  const meanAngle = Math.atan2(sumY / timestamps.length, sumX / timestamps.length);
  const meanHour = ((meanAngle / (2 * Math.PI)) * 24 + 24) % 24;
  return Math.round(meanHour) % 24;
}

function getHabitCompletionPattern(habit: Habit): number | null {
  const fromHistory = averageHourFromCompletionTimestamps(habit.completedAt);
  if (fromHistory !== null) return fromHistory;

  return parseScheduledHour(habit.scheduledTime);
}

/**
 * Determine if a habit timing notification should be sent
 */
export function shouldSendHabitTimingNotification(
  habit: Habit,
  currentHour: number,
  resetHour: number
): boolean {
  // Skip if archived
  if (habit.isArchived) return false;
  
  // Skip if completed today
  const todayKey = getTodayKey(resetHour);
  if (habit.completedDates.includes(todayKey)) return false;
  
  // Skip if not scheduled today
  if (!isHabitScheduledOnDate(habit, todayKey)) return false;
  
  // Get completion pattern
  const patternHour = getHabitCompletionPattern(habit);
  if (patternHour === null) return false;

  // If current hour is within 1 hour of pattern hour, allow notification.
  // Wrap around midnight so 23:00 and 00:00 count as neighbours.
  const rawDiff = Math.abs(currentHour - patternHour);
  const hourDiff = Math.min(rawDiff, 24 - rawDiff);
  return hourDiff <= 1;
}

/**
 * Generate a habit timing notification (Plan -> Execute).
 * Uses the habit's own time-block/duration data so the Start Focus action
 * matches what the user planned; falls back to the saved default.
 */
export function generateHabitTimingNotification(
  habit: Habit,
  defaultFocusDuration = 25,
): IntelligentNotification {
  const durationMinutes = habit.durationMinutes ?? defaultFocusDuration;
  const scheduled = habit.scheduledTime?.trim();
  const body = scheduled
    ? `Time-blocked for ${scheduled} — you usually do "${habit.name}" around now. Start a ${durationMinutes}-min focus session?`
    : `You usually complete "${habit.name}" around this time. Start a ${durationMinutes}-min focus session?`;
  return {
    type: "timing",
    title: "Habit Reminder",
    body,
    habitId: habit.id,
    habitName: habit.name,
    action: {
      type: "focus-habit",
      habitId: habit.id,
      habitName: habit.name,
      title: habit.name,
      durationMinutes,
    },
  };
}

/**
 * Rank incomplete habits scheduled today for the evening focus suggestion
 * (Execute -> Complete). Mandatory first, then time-blocked habits that are
 * already due, then earliest time-block, then stable id order.
 */
function rankIncompleteHabits(
  habits: Habit[],
  resetHour: number,
  currentHour: number,
): Habit[] {
  const todayKey = getTodayKey(resetHour);

  // Filter incomplete habits scheduled today
  const incompleteHabits = habits.filter(
    (habit) =>
      !habit.isArchived &&
      !habit.completedDates.includes(todayKey) &&
      isHabitScheduledOnDate(habit, todayKey),
  );

  if (incompleteHabits.length === 0) return [];

  // Only suggest if it's late enough in the day (after 6 PM or 18:00)
  if (currentHour < 18) return [];

  return [...incompleteHabits].sort((a, b) => {
    if (a.priority === "Mandatory" && b.priority !== "Mandatory") return -1;
    if (a.priority !== "Mandatory" && b.priority === "Mandatory") return 1;
    const aHour = parseScheduledHour(a.scheduledTime);
    const bHour = parseScheduledHour(b.scheduledTime);
    const aOverdue = aHour !== null && aHour <= currentHour;
    const bOverdue = bHour !== null && bHour <= currentHour;
    if (aOverdue !== bOverdue) return aOverdue ? -1 : 1;
    if (aHour !== null && bHour !== null && aHour !== bHour) return aHour - bHour;
    if (aHour !== null && bHour === null) return -1;
    if (aHour === null && bHour !== null) return 1;
    return a.id - b.id;
  });
}

/**
 * Get incomplete priority habit for focus suggestion
 * Returns the highest priority incomplete habit scheduled today
 */
export function getIncompletePriorityHabit(
  habits: Habit[],
  resetHour: number,
  currentHour: number,
): Habit | null {
  return rankIncompleteHabits(habits, resetHour, currentHour)[0] ?? null;
}

/**
 * Determine if an incomplete habit focus suggestion should be sent
 */
export function shouldSendFocusSuggestion(
  habits: Habit[],
  resetHour: number,
  currentHour: number
): boolean {
  const habit = getIncompletePriorityHabit(habits, resetHour, currentHour);
  return habit !== null;
}

/**
 * Generate an incomplete habit focus suggestion notification
 * (Execute -> Complete). Names how many habits are left so the nudge reads
 * like a wrap-up rather than a repeat.
 */
export function generateFocusSuggestionNotification(
  habit: Habit,
  defaultFocusDuration: number,
  incompleteCount = 1,
): IntelligentNotification {
  const lead = incompleteCount > 1
    ? `${incompleteCount} habits left tonight. Start with "${habit.name}"${habit.priority === "Mandatory" ? " (Mandatory)" : ""}?`
    : `Your "${habit.name}" habit is still incomplete.`;
  return {
    type: "incomplete",
    title: "Incomplete Habit",
    body: `${lead} Start a ${defaultFocusDuration}-minute focus session to finish it?`,
    habitId: habit.id,
    habitName: habit.name,
    action: {
      type: "focus-habit",
      habitId: habit.id,
      habitName: habit.name,
      title: habit.name,
      durationMinutes: defaultFocusDuration,
    },
  };
}

/**
 * Check availability notification
 * This would require more scheduling data than currently exists
 * For now, we'll skip this type
 */
export function shouldSendAvailabilityNotification(): boolean {
  // Not implemented - insufficient scheduling data
  return false;
}

/**
 * Generate availability notification
 */
export function generateAvailabilityNotification(): IntelligentNotification | null {
  // Not implemented - insufficient scheduling data
  return null;
}

/**
 * Main function to determine if any intelligent notification should be sent.
 * Skips habits already nudged today so the poller rotates to the next useful
 * habit instead of repeating the same one.
 */
export function getIntelligentNotification(
  habits: Habit[],
  resetHour: number,
  currentHour: number,
  defaultFocusDuration: number,
  settings: IntelligentNotificationSettings,
): IntelligentNotification | null {
  if (!settings.enableIntelligentNotifications || getIsFocusTimerRunning()) return null;

  const todayKey = getTodayKey(resetHour);
  pruneSentNotificationHistory(todayKey);

  // Check timing notifications first
  if (settings.habitReminders) {
    for (const habit of habits) {
      if (
        sentIntelligentNotificationKeys.has(
          buildIntelligentNotificationDedupeKey("timing", habit.id, todayKey),
        )
      ) {
        continue;
      }
      if (shouldSendHabitTimingNotification(habit, currentHour, resetHour)) {
        return generateHabitTimingNotification(habit, defaultFocusDuration);
      }
    }
  }

  // Check focus suggestion
  if (settings.incompleteHabitReminders && shouldSendFocusSuggestion(habits, resetHour, currentHour)) {
    const ranked = rankIncompleteHabits(habits, resetHour, currentHour);
    const habit = ranked.find(
      (candidate) =>
        !sentIntelligentNotificationKeys.has(
          buildIntelligentNotificationDedupeKey("incomplete", candidate.id, todayKey),
        ),
    );
    if (habit) {
      return generateFocusSuggestionNotification(habit, defaultFocusDuration, ranked.length);
    }
  }

  // Availability notification not implemented
  return null;
}

/**
 * Send a notification using Tauri
 */
export function emitNotificationAction(action?: NotificationAction): void {
  if (!action || typeof window === "undefined") return;

  const event = new CustomEvent("habit-tracker:notification-action", {
    detail: action,
  });
  window.dispatchEvent(event);
}

export async function sendIntelligentNotification(
  notification: IntelligentNotification,
  settings: IntelligentNotificationSettings,
): Promise<void> {
  if (!shouldSendIntelligentNotification(notification.type, settings)) return;

  // Record the attempt before delivery: whether Tauri or the browser
  // fallback wins, retrying the same habit today would just be noise.
  markIntelligentNotificationSent(
    notification.type,
    notification.habitId,
    getTodayKey(settings.dayResetHour ?? 0),
  );

  const action = notification.action;

  // Tauri native notification for desktop (mobile-only action features not supported)
  let tauriNotificationSucceeded = false;
  try {
    await ensureNotificationActionTypesRegistered();
    await sendNotification({
      title: notification.title,
      body: notification.body,
      ...(action
        ? {
            actionTypeId: SYNCHRON_NOTIFICATION_ACTION_TYPE_ID,
            extra: notificationActionToExtra(action),
          }
        : {}),
    });
    tauriNotificationSucceeded = true;
  } catch (error) {
    console.error("Failed to send Tauri notification", error);
  }

  // Browser notification fallback with action support (works on desktop via click)
  if (!tauriNotificationSucceeded && typeof window !== "undefined" && "Notification" in window) {
    if (Notification.permission === "granted") {
      try {
        const browserNotification = new Notification(notification.title, { body: notification.body });
        browserNotification.onclick = () => {
          if (typeof window !== "undefined") {
            window.focus();
            emitNotificationAction(action);
          }
        };
      } catch {
        // Some embedded webviews reject browser notification construction
      }
    }
  }
}

export function clearIntelligentNotificationCooldown(): void {
  lastIntelligentNotificationTime = 0;
  resetIntelligentNotificationDedupeForTesting();
}
