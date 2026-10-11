import type { Habit, Summary } from "../types";
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

export function calculateHabitSummary(habits: Habit[], dateKey: string): Summary {
  const total = habits.length;
  const doneCount = habits.filter((habit) => habit.completedDates.includes(dateKey)).length;
  const mandatory = habits.filter((habit) => habit.priority === "Mandatory");
  const mandatoryDone = mandatory.filter((habit) => habit.completedDates.includes(dateKey)).length;
  return {
    total,
    doneCount,
    percent: total === 0 ? 0 : Math.round((doneCount / total) * 100),
    mandatoryTotal: mandatory.length,
    mandatoryDone,
  };
}
