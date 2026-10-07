import { getFocusSessionsForLogicalToday } from "./focusTimer.ts";
import { resolveTaskContext } from "./tasks.ts";
import type { FocusSessionRecord, Habit, Task } from "../types";

export type TimelineBlock =
  | {
    kind: "task";
    key: string;
    time: string;
    sortMinutes: number;
    taskId: string;
    title: string;
    meta?: string;
    durationMinutes?: number;
    completed: boolean;
    overdue: boolean;
  }
  | {
    kind: "habit";
    key: string;
    time: string;
    sortMinutes: number;
    habitId: number;
    title: string;
    meta?: string;
    durationMinutes?: number;
    completed: boolean;
  }
  | {
    kind: "session";
    key: string;
    time: string;
    sortMinutes: number;
    sessionId: number;
    title: string;
    durationMinutes: number;
    taskId?: string;
    habitId?: number;
    goalId?: string;
    milestoneId?: string;
  };

/**
 * "HH:MM" (24h, as produced by `<input type="time">`) to minutes since
 * midnight. Returns null for anything else so unparsable values never render
 * as phantom timeline blocks.
 */
export function timeToMinutes(time: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/** Local "HH:MM" clock label for a logged Focus session timestamp. */
export function formatClockTime(timestamp: number): string {
  const date = new Date(timestamp);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export interface TimelineInput {
  habits: Habit[];
  tasks: Task[];
  goals: { id: string; title: string }[];
  milestones: { id: string; title: string; goalId?: string; projectId?: string }[];
  projects?: { id: string; name: string }[];
  focusSessions: FocusSessionRecord[];
  todayKey: string;
  dayResetHour: number;
  now?: Date;
}

/**
 * Chronological daily timeline derived entirely from existing fields —
 * `scheduledTime`/`durationMinutes` on Habits and Tasks plus logged Focus
 * sessions for the logical day (day-reset aware). Pure derivation: no record
 * is created, duplicated, or mutated here, so rescheduling is just updating
 * the underlying item and rebuilding.
 */
export function buildDailyTimeline(input: TimelineInput): TimelineBlock[] {
  const blocks: TimelineBlock[] = [];

  for (const habit of input.habits) {
    if (!habit.scheduledTime) continue;
    const sortMinutes = timeToMinutes(habit.scheduledTime);
    if (sortMinutes === null) continue;
    blocks.push({
      kind: "habit",
      key: `habit-${habit.id}`,
      time: habit.scheduledTime,
      sortMinutes,
      habitId: habit.id,
      title: habit.name,
      meta: habit.category || habit.priority,
      durationMinutes: habit.durationMinutes,
      completed: habit.completedDates.includes(input.todayKey),
    });
  }

  for (const task of input.tasks) {
    if (!task.scheduledTime) continue;
    const sortMinutes = timeToMinutes(task.scheduledTime);
    if (sortMinutes === null) continue;
    const { goal } = resolveTaskContext(task, {
      goals: input.goals,
      projects: input.projects,
      milestones: input.milestones,
    });
    blocks.push({
      kind: "task",
      key: `task-${task.id}`,
      time: task.scheduledTime,
      sortMinutes,
      taskId: task.id,
      title: task.title,
      meta: goal?.title || task.priority,
      durationMinutes: task.durationMinutes || task.estimatedMinutes,
      completed: task.completed,
      overdue: !task.completed && task.dueDate !== undefined && task.dueDate < input.todayKey,
    });
  }

  const todaySessions = getFocusSessionsForLogicalToday(
    input.focusSessions,
    input.dayResetHour,
    input.now ?? new Date(),
  );
  for (const session of todaySessions) {
    const date = new Date(session.timestamp);
    blocks.push({
      kind: "session",
      key: `session-${session.id}`,
      time: formatClockTime(session.timestamp),
      sortMinutes: date.getHours() * 60 + date.getMinutes(),
      sessionId: session.id,
      title: session.habitName,
      durationMinutes: session.durationMinutes,
      taskId: session.taskId,
      habitId: session.habitId,
      goalId: session.goalId,
      milestoneId: session.milestoneId,
    });
  }

  // Stable sort keeps insertion order (tasks, habits, sessions) for ties.
  return blocks.sort((a, b) => a.sortMinutes - b.sortMinutes);
}

/** Planned minutes count scheduled work only — logged sessions are history. */
export function totalPlannedMinutes(blocks: TimelineBlock[]): number {
  return blocks.reduce(
    (total, block) => total + (block.kind === "session" ? 0 : block.durationMinutes || 0),
    0,
  );
}
