import assert from "node:assert/strict";
import test from "node:test";
import {
  getCompletionTimestamp,
  markHabitComplete,
  markHabitIncomplete,
  sanitizeCompletedAt,
} from "../src/domain/completions.ts";
import { calculateStreak } from "../src/utils/dates.ts";
import { getHabitPerformanceDiagnostics, queryAnalyticsData } from "../src/domain/analytics.ts";

function makeHabit(overrides = {}) {
  return {
    id: 1,
    name: "Read",
    priority: "Optional",
    type: "Daily",
    completedDates: [],
    ...overrides,
  };
}

test("new completion records a timestamp without changing date behavior", () => {
  const habit = makeHabit();
  const now = 1_800_000_000_000;
  const completed = markHabitComplete(habit, "2026-10-06", now);

  assert.deepEqual(completed.completedDates, ["2026-10-06"]);
  assert.deepEqual(completed.completedAt, { "2026-10-06": now });
  assert.equal(getCompletionTimestamp(completed, "2026-10-06"), now);
  // Original is untouched.
  assert.deepEqual(habit.completedDates, []);
  assert.equal(habit.completedAt, undefined);
});

test("completing an already-completed day preserves its original timestamp", () => {
  const habit = makeHabit({
    completedDates: ["2026-10-06"],
    completedAt: { "2026-10-06": 1000 },
  });
  const completed = markHabitComplete(habit, "2026-10-06", 2000);
  assert.equal(completed, habit);
  assert.equal(getCompletionTimestamp(completed, "2026-10-06"), 1000);
});

test("uncompletion removes the date and its timestamp but keeps the rest", () => {
  const habit = makeHabit({
    completedDates: ["2026-10-05", "2026-10-06"],
    completedAt: { "2026-10-05": 1000, "2026-10-06": 2000 },
  });
  const updated = markHabitIncomplete(habit, "2026-10-06");

  assert.deepEqual(updated.completedDates, ["2026-10-05"]);
  assert.deepEqual(updated.completedAt, { "2026-10-05": 1000 });
  assert.equal(getCompletionTimestamp(updated, "2026-10-06"), null);
});

test("uncompleting the last timestamped date drops the map instead of leaving an empty one", () => {
  const habit = makeHabit({
    completedDates: ["2026-10-06"],
    completedAt: { "2026-10-06": 2000 },
  });
  const updated = markHabitIncomplete(habit, "2026-10-06");

  assert.deepEqual(updated.completedDates, []);
  assert.equal(updated.completedAt, undefined);
  assert.equal("completedAt" in updated, false);
});

test("historical records without timestamps keep working and are never backfilled", () => {
  const historical = makeHabit({ completedDates: ["2026-10-04", "2026-10-05", "2026-10-06"] });

  assert.equal(getCompletionTimestamp(historical, "2026-10-06"), null);
  assert.equal(sanitizeCompletedAt(historical.completedDates, historical.completedAt), undefined);
  // sanitize does not invent timestamps.
  assert.equal(historical.completedAt, undefined);
  assert.deepEqual(historical.completedDates, ["2026-10-04", "2026-10-05", "2026-10-06"]);

  // Corrupt or orphan entries are dropped, valid ones survive.
  assert.equal(sanitizeCompletedAt(["2026-10-06"], "not-a-map"), undefined);
  assert.deepEqual(
    sanitizeCompletedAt(["2026-10-06"], { "2026-10-06": 2000, "2026-01-01": 1000, "2026-10-06x": 5 }),
    { "2026-10-06": 2000 },
  );
  assert.equal(sanitizeCompletedAt(["2026-10-06"], { "2026-10-06": Number.NaN }), undefined);
});

test("streak calculation is identical with and without timestamps", () => {
  const without = makeHabit({ completedDates: ["2026-10-04", "2026-10-05", "2026-10-06"] });
  const withTimestamps = {
    ...without,
    completedAt: { "2026-10-04": 1000, "2026-10-05": 2000, "2026-10-06": 3000 },
  };
  assert.equal(calculateStreak(withTimestamps), calculateStreak(without));
});

test("analytics results are identical with and without timestamps", () => {
  const base = [
    makeHabit({ id: 11, completedDates: ["2026-10-04", "2026-10-05", "2026-10-06"] }),
    makeHabit({ id: 12, name: "Gym", completedDates: ["2026-10-06"] }),
  ];
  const stamped = base.map((habit) => ({
    ...habit,
    completedAt: Object.fromEntries(habit.completedDates.map((date) => [date, 1000])),
  }));
  const params = {
    tasks: [],
    focusSessions: [],
    horizon: "All Time",
    weekStart: "Sunday",
    dayResetHour: 0,
    now: new Date(2026, 9, 7, 12, 0),
  };

  const plain = queryAnalyticsData({ ...params, habits: base });
  const withTime = queryAnalyticsData({ ...params, habits: stamped });
  assert.deepEqual(withTime.habitOccurrences.map(({ habit, dateKey, completed }) => [
    habit.id,
    dateKey,
    completed,
  ]), plain.habitOccurrences.map(({ habit, dateKey, completed }) => [habit.id, dateKey, completed]));

  const plainDiagnostics = getHabitPerformanceDiagnostics(plain);
  const stampedDiagnostics = getHabitPerformanceDiagnostics(withTime);
  assert.equal(stampedDiagnostics.overallCompletionRate, plainDiagnostics.overallCompletionRate);
  assert.deepEqual(
    stampedDiagnostics.habitRates.map((rate) => [rate.habit.id, rate.completedOccurrences, rate.completionRate]),
    plainDiagnostics.habitRates.map((rate) => [rate.habit.id, rate.completedOccurrences, rate.completionRate]),
  );
});

test("timestamps survive a persistence round-trip and reload intact", () => {
  const habit = markHabitComplete(makeHabit(), "2026-10-06", 1_800_000_000_000);
  const reloaded = JSON.parse(JSON.stringify([habit]))[0];

  assert.deepEqual(reloaded.completedDates, ["2026-10-06"]);
  assert.equal(getCompletionTimestamp(reloaded, "2026-10-06"), 1_800_000_000_000);
  assert.deepEqual(
    sanitizeCompletedAt(reloaded.completedDates, reloaded.completedAt),
    { "2026-10-06": 1_800_000_000_000 },
  );

  // A legacy payload without timestamps reloads without gaining any.
  const legacy = JSON.parse(JSON.stringify([makeHabit({ completedDates: ["2026-10-06"] })]))[0];
  assert.equal(legacy.completedAt, undefined);
  assert.equal(sanitizeCompletedAt(legacy.completedDates, legacy.completedAt), undefined);
});
