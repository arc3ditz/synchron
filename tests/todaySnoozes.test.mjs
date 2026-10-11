import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_SNOOZE_RETURN_MINUTES,
  SNOOZE_RETURN_MINUTES,
  getActiveTodaySnoozes,
  pruneIneligibleTodaySnoozes,
  snoozeTodayItem,
} from "../src/domain/todaySnoozes.ts";
import { selectTodayMandatoryHabits } from "../src/domain/today.ts";
import { selectTodayTasks } from "../src/domain/tasks.ts";
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
  assert.deepEqual(
    [...getActiveTodaySnoozes(afterOneHour, now + 60 * 60 * 1000 - 1).taskIds],
    ["task-1"],
    "a snooze remains hidden until the exact return timestamp",
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
    const restored = loadTodaySnoozes(now);
    assert.deepEqual(restored, persisted.slice(0, 1));
    assert.deepEqual([...getActiveTodaySnoozes(restored, now).taskIds], []);
  } finally {
    delete globalThis.localStorage;
  }
});

test("an overdue persisted snooze is eligible immediately after an app restart", () => {
  const values = new Map();
  globalThis.localStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
  try {
    const startedAt = 1_800_000_000_000;
    saveTodaySnoozes(snoozeTodayItem([], { kind: "task", id: "task-1" }, startedAt, 60));
    const reloadedAfterReturn = loadTodaySnoozes(startedAt + 60 * 60 * 1000);
    assert.deepEqual(reloadedAfterReturn, []);
    const reappeared = selectTodayTasks([{
      id: "task-1",
      title: "Return",
      dueDate: TODAY,
      completed: false,
      priority: "medium",
      createdAt: "2026-01-01",
    }], { milestones: [], todayKey: TODAY });
    assert.deepEqual(reappeared.map((task) => task.id), ["task-1"]);
    assert.deepEqual(
      [...getActiveTodaySnoozes(reloadedAfterReturn, startedAt + 60 * 60 * 1000).taskIds],
      [],
    );
  } finally {
    delete globalThis.localStorage;
  }
});

test("completed, deleted, and archived targets lose their snooze instead of resurfacing", () => {
  const snoozes = [
    { kind: "task", id: "complete", returnAt: 1000 },
    { kind: "task", id: "deleted", returnAt: 1000 },
    { kind: "task", id: "archived-project", returnAt: 1000 },
    { kind: "habit", id: 1, returnAt: 1000 },
    { kind: "habit", id: 2, returnAt: 1000 },
  ];
  const retained = pruneIneligibleTodaySnoozes(snoozes, {
    tasks: [
      { id: "complete", completed: true },
      { id: "archived-project", completed: false, projectId: "p-archived" },
    ],
    habits: [
      { id: 1, isArchived: true },
      { id: 2, isArchived: false },
    ],
    milestones: [],
    projects: [{ id: "p-archived", status: "archived" }],
  });
  assert.deepEqual(retained.map((snooze) => `${snooze.kind}:${snooze.id}`), ["habit:2"]);
});
