/**
 * Storage utility functions for localStorage operations
 */

import type { Goal, Milestone, Task, Habit, Project } from "../types";
import { sanitizeCompletedAt } from "../domain/completions.ts";

export const STORAGE_KEYS = {
  HABITS: "habits",
  SETTINGS: "appSettings",
  GOALS: "goals",
  TASKS: "tasks",
  MILESTONES: "milestones",
  PROJECTS: "projects",
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
    try {
      const parsed = JSON.parse(raw);
      return parsed as T;
    } catch {
      // Invalid/corrupted JSON: never silently treat it as valid empty data.
      // Preserve the original stored value under a backup key and remove the
      // corrupted entry so later saves of the fallback cannot overwrite it.
      try {
        const backupKey = `${key}CorruptedBackup`;
        if (localStorage.getItem(backupKey) === null) {
          localStorage.setItem(backupKey, raw);
        }
        localStorage.removeItem(key);
      } catch {
        // If preservation fails, still return the fallback for this session
        // and leave the original value untouched.
        return fallback;
      }
      return fallback;
    }
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

export function loadGoals(): Goal[] {
  return loadStorageData<Goal[]>(STORAGE_KEYS.GOALS, []);
}

export function saveGoals(goals: Goal[]): void {
  saveStorageData(STORAGE_KEYS.GOALS, goals);
}

export function loadTasks(): Task[] {
  const parsed = loadStorageData<(Partial<Task> & { id?: unknown; title?: unknown })[]>(STORAGE_KEYS.TASKS, []);
  if (!Array.isArray(parsed)) return [];

  const tasks: Task[] = [];
  for (const item of parsed) {
    // Drop corrupt entries (missing/empty id or title) while preserving every
    // valid stored Task byte-for-byte through the defaults below.
    if (typeof item.id !== "string" || item.id === "") continue;
    if (typeof item.title !== "string" || item.title.trim() === "") continue;
    tasks.push({
      id: item.id,
      milestoneId: typeof item.milestoneId === "string" ? item.milestoneId : undefined,
      goalId: typeof item.goalId === "string" ? item.goalId : undefined,
      projectId: typeof item.projectId === "string" ? item.projectId : undefined,
      title: item.title,
      dueDate: typeof item.dueDate === "string" ? item.dueDate : undefined,
      estimatedMinutes: typeof item.estimatedMinutes === "number" && item.estimatedMinutes > 0 ? item.estimatedMinutes : undefined,
      completed: item.completed === true,
      priority: item.priority === "high" || item.priority === "low" ? item.priority : "medium",
      createdAt: typeof item.createdAt === "string" ? item.createdAt : new Date().toISOString(),
      scheduledTime: typeof item.scheduledTime === "string" ? item.scheduledTime : undefined,
      durationMinutes: typeof item.durationMinutes === "number" && item.durationMinutes > 0 ? item.durationMinutes : undefined,
    });
  }
  return tasks;
}

export function saveTasks(tasks: Task[]): void {
  saveStorageData(STORAGE_KEYS.TASKS, tasks);
}

export function loadMilestones(): Milestone[] {
  const parsed = loadStorageData<(Partial<Milestone> & { id: string; title: string })[]>(STORAGE_KEYS.MILESTONES, []);
  if (!Array.isArray(parsed)) return [];

  return parsed.map((item) => {
    return {
      id: item.id,
      goalId: typeof item.goalId === "string" ? item.goalId : undefined,
      projectId: typeof item.projectId === "string" ? item.projectId : undefined,
      title: item.title,
      targetDate: typeof item.targetDate === "string" ? item.targetDate : undefined,
      completed: item.completed === true,
    };
  });
}

export function saveMilestones(milestones: Milestone[]): void {
  saveStorageData(STORAGE_KEYS.MILESTONES, milestones);
}

export function loadHabits(): Habit[] {
  const parsed = loadStorageData<Habit[]>(STORAGE_KEYS.HABITS, []);
  if (!Array.isArray(parsed)) return [];
  // Historical records predate timestamp collection: preserve them as-is,
  // keeping only valid timestamps for dates actually completed.
  return parsed.map((habit) => {
    if (!habit || typeof habit !== "object") return habit;
    const completedDates = Array.isArray(habit.completedDates) ? habit.completedDates : [];
    const completedAt = sanitizeCompletedAt(completedDates, habit.completedAt);
    if (completedAt === undefined && habit.completedAt === undefined) return { ...habit, completedDates };
    const next = { ...habit, completedDates };
    if (completedAt !== undefined) {
      next.completedAt = completedAt;
    } else {
      delete next.completedAt;
    }
    return next;
  });
}

export function saveHabits(habits: Habit[]): void {
  saveStorageData(STORAGE_KEYS.HABITS, habits);
}

export function loadProjects(): Project[] {
  const parsed = loadStorageData<(Partial<Project> & { id: string; name: string })[]>(STORAGE_KEYS.PROJECTS, []);
  if (!Array.isArray(parsed)) return [];

  return parsed.map((item) => {
    return {
      id: item.id,
      goalId: typeof item.goalId === "string" ? item.goalId : undefined,
      name: item.name,
      description: typeof item.description === "string" ? item.description : undefined,
      startDate: typeof item.startDate === "string" ? item.startDate : undefined,
      targetDate: typeof item.targetDate === "string" ? item.targetDate : undefined,
      status: (item.status === "planned" || item.status === "active" || item.status === "completed" || item.status === "archived")
        ? item.status
        : "planned",
      createdAt: typeof item.createdAt === "string" ? item.createdAt : new Date().toISOString(),
    };
  });
}

export function saveProjects(projects: Project[]): void {
  saveStorageData(STORAGE_KEYS.PROJECTS, projects);
}
