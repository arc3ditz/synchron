import assert from "node:assert/strict";
import test from "node:test";
import {
  generateActionableInsights,
  getHabitFocusMinutes,
  getHabitPerformanceDiagnostics,
  getHabitPeriodStreak,
  getWeekdayFrictionMetrics,
  queryAnalyticsData,
} from "../src/domain/analytics.ts";
import { markHabitIncomplete } from "../src/domain/completions.ts";

process.env.TZ = "Asia/Tokyo";

const now = new Date(2025, 4, 14, 12);
const WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

const habits = [
  {
    id: 1, name: "A", createdAt: "2025-04-20", priority: "Optional", type: "Daily",
    completedDates: ["2025-05-10", "2025-05-12", "2025-05-13", "2025-05-14"],
    streakFreezeDates: ["2025-05-11"],
  },
  {
    id: 2, name: "B", createdAt: "2025-04-20", priority: "Optional", type: "Daily",
    frequencyType: "weekdays", completedDates: ["2025-05-12"], streakFreezeDates: [],
  },
  {
    id: 3, name: "C", createdAt: "2025-05-13", priority: "Optional", type: "Daily",
    completedDates: [], streakFreezeDates: [],
  },
];
const tasks = [
  { id: "t1", title: "Done", dueDate: "2025-05-12", completed: true, priority: "medium", createdAt: "2025-01-01" },
  { id: "t2", title: "Open", dueDate: "2025-05-13", completed: false, priority: "medium", createdAt: "2025-01-01" },
];
const sessions = [
  { id: 1, timestamp: new Date(2025, 4, 12, 9).getTime(), sessionType: "Timer", durationMinutes: 20, habitName: "A", habitId: 1 },
  { id: 2, timestamp: new Date(2025, 4, 13, 9).getTime(), sessionType: "Timer", durationMinutes: 10, habitName: "B", habitId: 2 },
];

function query({ habits: h = habits, tasks: t = tasks, focusSessions: s = sessions, horizon = "Last 30 Days" } = {}) {
  return queryAnalyticsData({
    habits: h,
    tasks: t,
    focusSessions: s,
    horizon,
    weekStart: "Monday",
    dayResetHour: 0,
    now,
  });
}

function frictionTotals(friction) {
  return {
    completed: WEEKDAYS.reduce((sum, day) => sum + friction[day].completed, 0),
    missed: WEEKDAYS.reduce((sum, day) => sum + friction[day].missed, 0),
  };
}

test("completion totals agree across occurrences, diagnostics, and friction", () => {
  const dataset = query();
  const diagnostics = getHabitPerformanceDiagnostics(dataset);
  const friction = frictionTotals(getWeekdayFrictionMetrics(dataset));

  const occurrenceCompleted = dataset.habitOccurrences.filter((o) => o.completed).length;
  const diagnosticsCompleted = diagnostics.habitRates.reduce((sum, r) => sum + r.completedOccurrences, 0);

  assert.equal(diagnosticsCompleted, occurrenceCompleted);
  // Friction adds the single completed in-range task on top of habit completions.
  assert.equal(friction.completed, occurrenceCompleted + 1);
  // No completion is counted twice within the habit metrics.
  const expectedTotal = diagnostics.habitRates.reduce((sum, r) => sum + r.expectedOccurrences, 0);
  assert.equal(
    diagnostics.overallCompletionRate,
    Math.round((diagnosticsCompleted / expectedTotal) * 100),
  );
});

test("protected days are excluded from completion counts everywhere", () => {
  const dataset = query();
  const protectedOccurrences = dataset.habitOccurrences.filter((o) => o.protected);

  assert.deepEqual(protectedOccurrences.map((o) => `${o.habit.id}@${o.dateKey}`), ["1@2025-05-11"]);
  for (const occurrence of protectedOccurrences) {
    assert.equal(occurrence.completed, false);
  }

  const diagnostics = getHabitPerformanceDiagnostics(dataset);
  const rateA = diagnostics.habitRates.find((r) => r.habit.id === 1);
  assert.ok(!rateA || rateA.expectedOccurrences < dataset.habitOccurrences.filter((o) => o.habit.id === 1).length);

  // The bridged streak still counts the protected day without calling it a completion.
  assert.equal(getHabitPeriodStreak(dataset, habits[0], false), 5);
  assert.equal(rateA.completedOccurrences, 4);
});

test("uncompleting a historical date updates analytics by exactly that date", () => {
  const before = query();
  const beforeCompleted = before.habitOccurrences.filter((o) => o.completed).length;

  const edited = habits.map((habit) =>
    habit.id === 1 ? markHabitIncomplete(habit, "2025-05-12") : habit,
  );
  const after = query({ habits: edited });
  const afterCompleted = after.habitOccurrences.filter((o) => o.completed).length;

  assert.equal(afterCompleted, beforeCompleted - 1);
  const flipped = after.habitOccurrences.find((o) => o.habit.id === 1 && o.dateKey === "2025-05-12");
  assert.equal(flipped.completed, false);
  assert.equal(flipped.protected, false);
  // Nothing else moved: same occurrence keys, only the flag changed.
  assert.deepEqual(
    after.habitOccurrences.map((o) => `${o.habit.id}@${o.dateKey}`).sort(),
    before.habitOccurrences.map((o) => `${o.habit.id}@${o.dateKey}`).sort(),
  );
});

test("deleted habits, tasks, and sessions leave no chart data behind", () => {
  const withoutHabit = query({ habits: habits.filter((h) => h.id !== 1) });
  assert.ok(withoutHabit.habitOccurrences.every((o) => o.habit.id !== 1));
  assert.equal(getHabitFocusMinutes(withoutHabit).get(1), undefined);
  assert.equal(getHabitPerformanceDiagnostics(withoutHabit).habitRates.some((r) => r.habit.id === 1), false);

  const withoutTask = query({ tasks: tasks.filter((t) => t.id !== "t1") });
  assert.ok(withoutTask.taskOccurrences.every(({ task }) => task.id !== "t1"));

  const withoutSessions = query({ focusSessions: [] });
  assert.equal(getHabitFocusMinutes(withoutSessions).size, 0);

  // Unrelated records are untouched by each deletion.
  assert.ok(withoutHabit.habitOccurrences.some((o) => o.habit.id === 2));
  assert.ok(withoutTask.taskOccurrences.some(({ task }) => task.id === "t2"));
});

test("empty datasets stay neutral instead of showing misleading values", () => {
  const dataset = query({ habits: [], tasks: [], focusSessions: [] });
  const diagnostics = getHabitPerformanceDiagnostics(dataset);
  const friction = getWeekdayFrictionMetrics(dataset);

  assert.equal(diagnostics.overallCompletionRate, null);
  assert.equal(diagnostics.hasData, false);
  assert.deepEqual(diagnostics.habitRates, []);
  assert.equal(friction.highestFrictionDay, null);
  assert.equal(friction.hasData, false);
  assert.deepEqual(generateActionableInsights(dataset, []), []);
  assert.equal(getHabitFocusMinutes(dataset).size, 0);
});

test("narrower horizons nest inside wider ones without recounting", () => {
  const completedByHorizon = ["This Week", "Last 30 Days", "All Time"].map((horizon) => {
    const dataset = query({ horizon });
    return dataset.habitOccurrences.filter((o) => o.completed).length;
  });

  assert.ok(completedByHorizon[0] <= completedByHorizon[1], "week counts fit inside 30 days");
  assert.ok(completedByHorizon[1] <= completedByHorizon[2], "30 days fit inside all time");

  const weekRange = query({ horizon: "This Week" }).range;
  assert.deepEqual(weekRange, { horizon: "This Week", startDateKey: "2025-05-12", endDateKey: "2025-05-14" });
});

test("occurrences mirror the underlying completion records exactly", () => {
  const dataset = query({ horizon: "All Time" });

  for (const habit of habits) {
    const scheduledCompletions = habit.completedDates.filter((dateKey) =>
      dataset.habitOccurrences.some((o) => o.habit.id === habit.id && o.dateKey === dateKey && o.completed),
    );
    // Every in-range scheduled completion record produces exactly one completed occurrence.
    for (const dateKey of scheduledCompletions) {
      assert.equal(
        dataset.habitOccurrences.filter((o) => o.habit.id === habit.id && o.dateKey === dateKey).length,
        1,
        `single occurrence for habit ${habit.id} on ${dateKey}`,
      );
    }
  }

  // And no completed occurrence exists without a matching record.
  for (const occurrence of dataset.habitOccurrences.filter((o) => o.completed)) {
    assert.ok(
      occurrence.habit.completedDates.includes(occurrence.dateKey),
      `occurrence ${occurrence.habit.id}@${occurrence.dateKey} matches a stored completion`,
    );
  }
});
