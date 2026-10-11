import type { Habit } from "../types";
import { isHabitScheduledOnDate } from "../utils/dates.ts";

export function selectTodayMandatoryHabits(habits: Habit[], todayKey: string): Habit[] {
  return habits.filter(
    (habit) =>
      !habit.isArchived &&
      habit.priority === "Mandatory" &&
      habit.type === "Daily" &&
      isHabitScheduledOnDate(habit, todayKey),
  );
}
