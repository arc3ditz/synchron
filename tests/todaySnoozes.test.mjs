import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_SNOOZE_RETURN_MINUTES,
  SNOOZE_RETURN_MINUTES,
  getActiveTodaySnoozes,
  snoozeTodayItem,
} from "../src/domain/todaySnoozes.ts";
import { selectTodayMandatoryHabits } from "../src/domain/today.ts";
import { loadTodaySnoozes, saveTodaySnoozes } from "../src/utils/storage.ts";

const TODAY = "2026-10-09";

function makeHabit(overrides = {}) {
  return {
    id: 1,
    name: "Habit",
    type: "Daily",
    priority: "Mandatory",
    completedDates: [],
    ...overrides,
  };
}

test("Today habit selection includes only scheduled, active mandatory habits", () => {
  const mandatory = makeHabit({ id: 1, name: "Mandatory" });
  const optional = makeHabit({ id: 2, name: "Optional", priority: "Optional" });
  const archived = makeHabit({ id: 3, name: "Archived", isArchived: true });
  const mixed = selectTodayMandatoryHabits([mandatory, optional, archived], TODAY);
  assert.deepEqual(mixed.map((habit) => habit.id), [1]);
  assert.deepEqual(selectTodayMandatoryHabits([optional], TODAY), []);
  assert.deepEqual(selectTodayMandatoryHabits([mandatory], TODAY), [mandatory]);
});

test("snoozes default to four hours and offer the configured return intervals", () => {
  assert.equal(DEFAULT_SNOOZE_RETURN_MINUTES, 240);
  assert.deepEqual(SNOOZE_RETURN_MINUTES, [30, 60, 120, 240, 480]);

  const now = 1_800_000_000_000;
  const snoozes = snoozeTodayItem([], { kind: "habit", id: 8 }, now, DEFAULT_SNOOZE_RETURN_MINUTES);
  assert.equal(snoozes[0].returnAt, now + 4 * 60 * 60 * 1000);
});

test("task and habit snoozes stay hidden until their absolute return times", () => {
  const now = 1_800_000_000_000;
  const afterOneHour = snoozeTodayItem([], { kind: "task", id: "task-1" }, now, 60);
  const withHabit = snoozeTodayItem(afterOneHour, { kind: "habit", id: 3 }, now, 120);

  assert.deepEqual(
    [...getActiveTodaySnoozes(withHabit, now + 30 * 60 * 1000).taskIds],
    ["task-1"],
  );
  assert.deepEqual(
    [...getActiveTodaySnoozes(withHabit, now + 30 * 60 * 1000).habitIds],
    [3],
  );
  assert.deepEqual(
    [...getActiveTodaySnoozes(withHabit, now + 60 * 60 * 1000).taskIds],
    [],
    "the task returns at its scheduled timestamp",
  );
  assert.deepEqual(
    [...getActiveTodaySnoozes(withHabit, now + 60 * 60 * 1000).habitIds],
    [3],
  );
  assert.deepEqual(
    [...getActiveTodaySnoozes(withHabit, now + 2 * 60 * 60 * 1000).habitIds],
    [],
    "an overdue snooze is eligible immediately, including after a closed-app interval",
  );
});

test("changing the preference does not move existing snooze timestamps", () => {
  const now = 1_800_000_000_000;
  const original = snoozeTodayItem([], { kind: "task", id: "task-1" }, now, 240)[0];
  const laterSnooze = snoozeTodayItem([original], { kind: "task", id: "task-2" }, now, 30);
  assert.equal(laterSnooze.find((snooze) => snooze.id === "task-1")?.returnAt, now + 4 * 60 * 60 * 1000);
  assert.equal(laterSnooze.find((snooze) => snooze.id === "task-2")?.returnAt, now + 30 * 60 * 1000);
});

test("valid snoozes persist while overdue and malformed records are discarded on loading", () => {
  const values = new Map();
  globalThis.localStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
  try {
    const now = Date.now();
    const persisted = [
      { kind: "habit", id: 2, returnAt: now + 60_000 },
      { kind: "task", id: "task-3", returnAt: now - 1 },
      { kind: "task", id: "", returnAt: now + 60_000 },
    ];
    saveTodaySnoozes(persisted);
    const restored = loadTodaySnoozes();
    assert.deepEqual(restored, persisted.slice(0, 1));
    assert.deepEqual([...getActiveTodaySnoozes(restored, now).taskIds], []);
  } finally {
    delete globalThis.localStorage;
  }
});
