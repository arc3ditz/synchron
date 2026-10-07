import { getHabitDateKey } from "../utils/dates.ts";
import type { FocusSessionRecord, Milestone, Task } from "../types";

export interface TimestampedFocusSession {
  timestamp: number;
}

export function getFocusSessionsForLogicalToday<T extends TimestampedFocusSession>(
  sessions: T[],
  dayResetHour: number,
  now = new Date(),
): T[] {
  const todayKey = getHabitDateKey(now, dayResetHour);
  return sessions.filter((session) =>
    getHabitDateKey(new Date(session.timestamp), dayResetHour) === todayKey,
  );
}

export interface FocusSessionInput {
  sessionType: "Timer" | "Pomodoro Focus";
  durationMinutes: number;
  habitName: string;
  habitId?: number;
  goalId?: string;
  milestoneId?: string;
  taskId?: string;
}

/**
 * Build a FocusSessionRecord from a completed session, preserving the linked
 * Task ID and resolving the Project behind the session through its Task or
 * Milestone. Sessions without a Task keep working: unrelated fields pass
 * through untouched and nothing is ever auto-completed here.
 */
export function buildFocusSessionRecord(
  input: FocusSessionInput,
  context: { tasks: Task[]; milestones: Milestone[] },
  ids?: { id?: number; timestamp?: number },
): FocusSessionRecord {
  const linkedTask = input.taskId !== undefined
    ? context.tasks.find((task) => task.id === input.taskId)
    : undefined;
  const linkedMilestone = input.milestoneId !== undefined
    ? context.milestones.find((milestone) => milestone.id === input.milestoneId)
    : undefined;
  const projectId = linkedTask?.projectId ?? linkedMilestone?.projectId;
  const timestamp = ids?.timestamp ?? Date.now();

  return {
    id: ids?.id ?? timestamp,
    timestamp,
    sessionType: input.sessionType,
    durationMinutes: input.durationMinutes,
    habitName: input.habitName,
    habitId: input.habitId,
    goalId: input.goalId,
    milestoneId: input.milestoneId,
    taskId: input.taskId,
    projectId,
  };
}