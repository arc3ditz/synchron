/**
 * Intelligent Notification Logic
 * Context-aware notifications based on existing habit data
 */

import type { AppSettings, Habit } from "../types";
import { getTodayKey, isHabitScheduledOnDate } from "../utils/dates";
import { sendNotification } from "@tauri-apps/plugin-notification";

export type NotificationType = "timing" | "incomplete" | "availability";
type IntelligentNotificationSettings = Pick<
  AppSettings,
  | "enableIntelligentNotifications"
  | "notificationFrequency"
  | "habitReminders"
  | "incompleteHabitReminders"
>;

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

const NOTIFICATION_COOLDOWNS_MS: Record<AppSettings["notificationFrequency"], number> = {
  conservative: 120 * 60 * 1000,
  balanced: 45 * 60 * 1000,
  frequent: 20 * 60 * 1000,
};

let lastIntelligentNotificationTime = 0;
let getIsFocusTimerRunning = () => false;

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
 * Get completion time pattern from habit history
 * Returns the average hour of day if a clear pattern exists, otherwise null
 * Requires at least 5 completions on different days
 */
function getHabitCompletionPattern(habit: Habit): number | null {
  const completedDates = habit.completedDates;
  if (completedDates.length < 5) return null;

  // For simplicity, we'll use a basic heuristic:
  // If most completions happened within a 2-hour window, return the center of that window
  // Since we only have dates (not timestamps), we'll skip this for now
  // In a real implementation, you'd need to store completion timestamps
  
  // For this implementation, we'll use scheduledTime if available
  if (habit.scheduledTime) {
    const [hours] = habit.scheduledTime.split(":").map(Number);
    return hours;
  }
  
  return null;
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
  
  // If current hour is within 1 hour of pattern hour, allow notification
  const hourDiff = Math.abs(currentHour - patternHour);
  return hourDiff <= 1;
}

/**
 * Generate a habit timing notification
 */
export function generateHabitTimingNotification(habit: Habit): IntelligentNotification {
  return {
    type: "timing",
    title: "Habit Reminder",
    body: `You normally complete "${habit.name}" around this time.`,
    habitId: habit.id,
    habitName: habit.name,
    action: {
      type: "focus-habit",
      habitId: habit.id,
      habitName: habit.name,
      title: habit.name,
      durationMinutes: 25,
    },
  };
}

/**
 * Get incomplete priority habit for focus suggestion
 * Returns the highest priority incomplete habit scheduled today
 */
export function getIncompletePriorityHabit(
  habits: Habit[],
  resetHour: number,
  currentHour: number
): Habit | null {
  const todayKey = getTodayKey(resetHour);
  
  // Filter incomplete habits scheduled today
  const incompleteHabits = habits.filter(
    (habit) =>
      !habit.isArchived &&
      !habit.completedDates.includes(todayKey) &&
      isHabitScheduledOnDate(habit, todayKey)
  );
  
  if (incompleteHabits.length === 0) return null;
  
  // Only suggest if it's late enough in the day (after 6 PM or 18:00)
  if (currentHour < 18) return null;
  
  // Sort by priority (Mandatory first) then by id
  incompleteHabits.sort((a, b) => {
    if (a.priority === "Mandatory" && b.priority !== "Mandatory") return -1;
    if (a.priority !== "Mandatory" && b.priority === "Mandatory") return 1;
    return a.id - b.id;
  });
  
  const topHabit = incompleteHabits[0];
  return topHabit;
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
 */
export function generateFocusSuggestionNotification(habit: Habit, defaultFocusDuration: number): IntelligentNotification {
  return {
    type: "incomplete",
    title: "Incomplete Habit",
    body: `Your "${habit.name}" habit is still incomplete. Would you like to start a ${defaultFocusDuration}-minute focus session?`,
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
 * Main function to determine if any intelligent notification should be sent
 */
export function getIntelligentNotification(
  habits: Habit[],
  resetHour: number,
  currentHour: number,
  defaultFocusDuration: number,
  settings: IntelligentNotificationSettings,
): IntelligentNotification | null {
  if (!settings.enableIntelligentNotifications || getIsFocusTimerRunning()) return null;

  // Check timing notifications first
  if (settings.habitReminders) {
    for (const habit of habits) {
      if (shouldSendHabitTimingNotification(habit, currentHour, resetHour)) {
        return generateHabitTimingNotification(habit);
      }
    }
  }
  
  // Check focus suggestion
  if (settings.incompleteHabitReminders && shouldSendFocusSuggestion(habits, resetHour, currentHour)) {
    const habit = getIncompletePriorityHabit(habits, resetHour, currentHour);
    if (habit) {
      return generateFocusSuggestionNotification(habit, defaultFocusDuration);
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

  const action = notification.action;

  // Tauri native notification for desktop (mobile-only action features not supported)
  let tauriNotificationSucceeded = false;
  try {
    await sendNotification({
      title: notification.title,
      body: notification.body,
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
}
