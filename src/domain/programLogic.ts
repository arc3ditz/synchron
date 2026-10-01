/**
 * Program logic utilities
 * Program view calculations derived from explicit Program records and their habits.
 */

import type { Habit, Program as ProgramEntity } from "../types";
import { diffInDays, getTodayKey, isHabitScheduledOnDate } from "../utils/dates.ts";

export type ProgramState = "Upcoming" | "Active" | "Completed" | "Incomplete";

export interface ProgramView extends ProgramEntity {
  habits: Habit[];
  state: ProgramState;
  currentDay: number;
  totalDays: number;
  completedDays: number;
  overallProgress: number;
}

/**
 * Resolve each Program's ordered habit IDs into its view data.
 */
export function groupHabitsIntoPrograms(
  programs: ProgramEntity[],
  habits: Habit[],
  dayResetHour: number,
): ProgramView[] {
  const habitMap = new Map(habits.map((habit) => [habit.id, habit]));
  const programViews: ProgramView[] = [];

  programs.forEach((program) => {
    const orderedHabits = program.habitIds
      .map((habitId) => habitMap.get(habitId))
      .filter((habit): habit is Habit => habit?.programId === program.id);
    const orderedHabitIds = new Set(orderedHabits.map((habit) => habit.id));
    const unlistedHabits = habits.filter(
      (habit) => habit.programId === program.id && !orderedHabitIds.has(habit.id),
    );
    const programHabits = [...orderedHabits, ...unlistedHabits];
    if (programHabits.length === 0) return;

    const todayKey = getTodayKey(dayResetHour);
    const currentDay = getProgramDayNumber(program, todayKey);
    const totalDays = program.durationDays;
    const completedDays = calculateProgramCompletedDays(programHabits, program);
    const overallProgress = totalDays > 0 ? (completedDays / totalDays) * 100 : 0;
    const state = determineProgramState(program, todayKey, completedDays, totalDays);

    programViews.push({
      ...program,
      habits: programHabits,
      state,
      currentDay,
      totalDays,
      completedDays,
      overallProgress,
    });
  });

  return programViews.sort((a, b) => b.startDate.localeCompare(a.startDate));
}

/**
 * Get the current day number for a program (1-indexed)
 */
function getProgramDayNumber(program: ProgramEntity, dateKey: string): number {
  const daysElapsed = diffInDays(dateKey, program.startDate);
  return Math.min(program.durationDays, Math.max(1, daysElapsed + 1));
}

/**
 * Calculate the number of completed days in a program
 * A day is considered complete if at least one habit was completed on that day
 */
function calculateProgramCompletedDays(habits: Habit[], program: ProgramEntity): number {
  let completedDays = 0;
  for (let offset = 0; offset < program.durationDays; offset++) {
    const dateKey = diffInDaysToKey(program.startDate, offset);
    if (calculateProgramDayCompletion(habits, dateKey).isComplete) completedDays++;
  }
  return completedDays;
}

/**
 * Determine the state of a program
 */
function determineProgramState(
  program: ProgramEntity,
  todayKey: string,
  completedDays: number,
  totalDays: number,
): ProgramState {
  const daysElapsed = diffInDays(todayKey, program.startDate);

  // Program hasn't started yet
  if (daysElapsed < 0) return "Upcoming";

  if (completedDays >= totalDays) return "Completed";

  // The duration has elapsed without every required day being complete.
  if (daysElapsed >= totalDays) return "Incomplete";

  // Program is currently active
  return "Active";
}

/**
 * Get today's habits for a program
 */
export function getTodayProgramHabits(program: ProgramView, _dateKey: string, dayResetHour: number): Habit[] {
  const todayKeyAdjusted = getTodayKey(dayResetHour);
  const daysElapsed = diffInDays(todayKeyAdjusted, program.startDate);

  // Only return habits if the current date is within the program window
  if (daysElapsed < 0 || daysElapsed >= program.durationDays) {
    return [];
  }

  // Return all habits for the program day, including archived ones
  return program.habits.filter((habit) => isHabitScheduledOnDate(habit, todayKeyAdjusted));
}

/**
 * Calculate today's completion percentage for a program
 */
export function calculateTodayProgress(program: ProgramView, _dateKey: string, dayResetHour: number): {
  completed: number;
  total: number;
  percent: number;
} {
  const todayKeyAdjusted = getTodayKey(dayResetHour);
  const todayHabits = getTodayProgramHabits(program, todayKeyAdjusted, dayResetHour);
  const { completed, total } = calculateProgramDayCompletion(todayHabits, todayKeyAdjusted);
  const percent = total > 0 ? (completed / total) * 100 : 0;

  return { completed, total, percent };
}

/**
 * Get day-by-day progress for a program
 * Returns an array of day statuses: "complete", "partial", "upcoming"
 */
export function getDayByDayProgress(program: ProgramView, dayResetHour: number): Array<{
  dayNumber: number;
  dateKey: string;
  status: "complete" | "partial" | "upcoming";
}> {
  const days: Array<{
    dayNumber: number;
    dateKey: string;
    status: "complete" | "partial" | "upcoming";
  }> = [];

  const todayKey = getTodayKey(dayResetHour);

  for (let i = 0; i < program.durationDays; i++) {
    const dateKey = diffInDaysToKey(program.startDate, i);
    const dayNumber = i + 1;

    // Determine if this day is complete, partial, or upcoming
    // Only consider non-archived habits
    const { completed, total, isComplete } = calculateProgramDayCompletion(program.habits, dateKey);

    if (total === 0) {
      // No habits scheduled on this day
      days.push({ dayNumber, dateKey, status: "upcoming" });
      continue;
    }

    if (isComplete) {
      days.push({ dayNumber, dateKey, status: "complete" });
    } else if (completed > 0) {
      days.push({ dayNumber, dateKey, status: "partial" });
    } else {
      // Check if this day is in the past
      const daysElapsed = diffInDays(todayKey, dateKey);
      if (daysElapsed > 0) {
        // Past day with no completions = partial (missed)
        days.push({ dayNumber, dateKey, status: "partial" });
      } else {
        days.push({ dayNumber, dateKey, status: "upcoming" });
      }
    }
  }

  return days;
}

function calculateProgramDayCompletion(habits: Habit[], dateKey: string): {
  completed: number;
  total: number;
  isComplete: boolean;
} {
  const scheduledHabits = habits.filter(
    (habit) => !habit.isArchived && isHabitScheduledOnDate(habit, dateKey),
  );
  const completed = scheduledHabits.filter((habit) => habit.completedDates.includes(dateKey)).length;
  const total = scheduledHabits.length;

  return { completed, total, isComplete: total > 0 && completed === total };
}

/**
 * Helper to calculate a date key from a start date and offset
 */
function diffInDaysToKey(startDate: string, offset: number): string {
  const [year, month, day] = startDate.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + offset);
  const yearStr = date.getFullYear();
  const monthStr = String(date.getMonth() + 1).padStart(2, "0");
  const dayStr = String(date.getDate()).padStart(2, "0");
  return `${yearStr}-${monthStr}-${dayStr}`;
}
