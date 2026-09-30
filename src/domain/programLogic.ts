/**
 * Program logic utilities
 * A Program is a collection of habits grouped by programId that share
 * the same startDate and durationDays (stored on the first habit).
 */

import type { Habit } from "../types";
import { diffInDays, getTodayKey, isHabitScheduledOnDate } from "../utils/dates";

export type ProgramState = "Upcoming" | "Active" | "Completed";

export interface Program {
  id: number;
  name: string;
  startDate: string;
  durationDays: number;
  habits: Habit[];
  state: ProgramState;
  currentDay: number;
  totalDays: number;
  completedDays: number;
  overallProgress: number;
}

/**
 * Group habits by programId to form Programs
 * A Program is identified by a shared programId across habits.
 * The program metadata (name, startDate, durationDays) comes from the first habit.
 * The first habit's name is the program name, subsequent habits are the program's habits.
 */
export function groupHabitsIntoPrograms(habits: Habit[]): Program[] {
  const programMap = new Map<number, Habit[]>();

  // Group habits by programId
  habits.forEach((habit) => {
    if (habit.programId) {
      const existing = programMap.get(habit.programId) || [];
      programMap.set(habit.programId, [...existing, habit]);
    }
  });

  const programs: Program[] = [];

  programMap.forEach((programHabits, programId) => {
    if (programHabits.length === 0) return;

    // Use the first habit's data for program metadata
    const firstHabit = programHabits[0];
    if (!firstHabit.startDate || !firstHabit.durationDays) return;

    const todayKey = getTodayKey();
    const currentDay = getProgramDayNumber(firstHabit, todayKey);
    const totalDays = firstHabit.durationDays;
    const completedDays = calculateProgramCompletedDays(programHabits, firstHabit);
    const overallProgress = totalDays > 0 ? (completedDays / totalDays) * 100 : 0;
    const state = determineProgramState(firstHabit, todayKey, completedDays, totalDays);

    // Exclude the first habit from the habits list (it's the program metadata)
    const actualHabits = programHabits.slice(1);

    programs.push({
      id: programId,
      name: firstHabit.name, // Program name comes from first habit
      startDate: firstHabit.startDate,
      durationDays: totalDays,
      habits: actualHabits.length > 0 ? actualHabits : programHabits, // Fallback to all if only one habit
      state,
      currentDay,
      totalDays,
      completedDays,
      overallProgress,
    });
  });

  // Sort by startDate (newest first)
  return programs.sort((a, b) => b.startDate.localeCompare(a.startDate));
}

/**
 * Get the current day number for a program (1-indexed)
 */
function getProgramDayNumber(habit: Habit, dateKey: string): number {
  if (!habit.startDate) return 1;
  const daysElapsed = diffInDays(dateKey, habit.startDate);
  return Math.max(1, daysElapsed + 1);
}

/**
 * Calculate the number of completed days in a program
 * A day is considered complete if at least one habit was completed on that day
 */
function calculateProgramCompletedDays(habits: Habit[], metadataHabit: Habit): number {
  if (!metadataHabit.startDate || !metadataHabit.durationDays) return 0;

  const completedDateSet = new Set<string>();

  // Only consider non-archived habits for completion tracking
  habits.forEach((habit) => {
    if (!habit.isArchived) {
      habit.completedDates.forEach((date) => {
        const offset = diffInDays(date, metadataHabit.startDate!);
        if (offset >= 0 && offset < metadataHabit.durationDays!) {
          completedDateSet.add(date);
        }
      });
    }
  });

  return completedDateSet.size;
}

/**
 * Determine the state of a program
 */
function determineProgramState(
  habit: Habit,
  todayKey: string,
  completedDays: number,
  totalDays: number,
): ProgramState {
  if (!habit.startDate) return "Upcoming";

  const daysElapsed = diffInDays(todayKey, habit.startDate);

  // Program hasn't started yet
  if (daysElapsed < 0) return "Upcoming";

  // Program has ended and all days are complete
  if (daysElapsed >= totalDays && completedDays >= totalDays) return "Completed";

  // Program is currently active
  return "Active";
}

/**
 * Get today's habits for a program
 */
export function getTodayProgramHabits(program: Program, _dateKey: string, dayResetHour: number): Habit[] {
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
export function calculateTodayProgress(program: Program, dateKey: string, dayResetHour: number): {
  completed: number;
  total: number;
  percent: number;
} {
  const todayHabits = getTodayProgramHabits(program, dateKey, dayResetHour);
  const todayKeyAdjusted = getTodayKey(dayResetHour);

  // Only count non-archived habits for progress
  const activeHabits = todayHabits.filter((habit) => !habit.isArchived);
  const completed = activeHabits.filter((habit) =>
    habit.completedDates.includes(todayKeyAdjusted),
  ).length;
  const total = activeHabits.length;
  const percent = total > 0 ? (completed / total) * 100 : 0;

  return { completed, total, percent };
}

/**
 * Get day-by-day progress for a program
 * Returns an array of day statuses: "complete", "partial", "upcoming"
 */
export function getDayByDayProgress(program: Program): Array<{
  dayNumber: number;
  dateKey: string;
  status: "complete" | "partial" | "upcoming";
}> {
  const days: Array<{
    dayNumber: number;
    dateKey: string;
    status: "complete" | "partial" | "upcoming";
  }> = [];

  const todayKey = getTodayKey();

  for (let i = 0; i < program.durationDays; i++) {
    const dateKey = diffInDaysToKey(program.startDate, i);
    const dayNumber = i + 1;

    // Determine if this day is complete, partial, or upcoming
    // Only consider non-archived habits
    const habitsScheduledOnDay = program.habits.filter((habit) =>
      !habit.isArchived && isHabitScheduledOnDate(habit, dateKey),
    );

    if (habitsScheduledOnDay.length === 0) {
      // No habits scheduled on this day
      days.push({ dayNumber, dateKey, status: "upcoming" });
      continue;
    }

    const completedCount = habitsScheduledOnDay.filter((habit) =>
      habit.completedDates.includes(dateKey),
    ).length;

    const totalCount = habitsScheduledOnDay.length;

    if (completedCount === totalCount) {
      days.push({ dayNumber, dateKey, status: "complete" });
    } else if (completedCount > 0) {
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
