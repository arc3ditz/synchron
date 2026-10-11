import assert from "node:assert/strict";
import test from "node:test";
import { calculateHabitSummary, selectTodayMandatoryHabits } from "../src/domain/today.ts";

const TODAY = "2026-10-11";

test("habit summary counts completion only among the habits selected for that date", () => {
  const habits = [
    {
      id: 1,
      name: "Daily",
      priority: "Mandatory",
      type: "Daily",
      completedDates: [TODAY],
    },
    {
      id: 2,
      name: "Weekday",
      priority: "Mandatory",
      type: "Daily",
      frequencyType: "weekdays",
      completedDates: [],
    },
    {
      id: 3,
      name: "Optional",
      priority: "Optional",
      type: "Daily",
      completedDates: [TODAY],
    },
    {
      id: 4,
      name: "Archived",
      priority: "Mandatory",
      type: "Daily",
      isArchived: true,
      completedDates: [],
    },
  ];

  const selected = selectTodayMandatoryHabits(habits, TODAY);
  assert.deepEqual(selected.map((habit) => habit.id), [1]);
  assert.deepEqual(calculateHabitSummary(selected, TODAY), {
    total: 1,
    doneCount: 1,
    percent: 100,
    mandatoryTotal: 1,
    mandatoryDone: 1,
  });
});

test("habit summary handles an empty scheduled set without dividing by zero", () => {
  assert.deepEqual(calculateHabitSummary([], TODAY), {
    total: 0,
    doneCount: 0,
    percent: 0,
    mandatoryTotal: 0,
    mandatoryDone: 0,
  });
});
