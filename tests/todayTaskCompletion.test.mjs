import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  selectTodayTasks,
  sortTodayTasks,
  toggleTaskCompletion,
} from "../src/domain/tasks.ts";
import { loadTasks, saveTasks } from "../src/utils/storage.ts";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const todaySource = readFileSync(path.join(root, "src/components/Today.tsx"), "utf8");
const tasksSource = readFileSync(path.join(root, "src/components/Tasks.tsx"), "utf8");
const appSource = readFileSync(path.join(root, "src/App.tsx"), "utf8");

const TODAY = "2025-05-14";
const ACTIVE_GOALS = new Set(["goal-1"]);

function makeTask(id, overrides = {}) {
  return {
    id,
    title: `Task ${id}`,
    completed: false,
    priority: "medium",
    createdAt: `2025-01-0${id.slice(-1)}T00:00:00.000Z`,
    dueDate: TODAY,
    ...overrides,
  };
}

function selectSorted(tasks) {
  return sortTodayTasks(
    selectTodayTasks(tasks, { milestones: [], activeGoalIds: ACTIVE_GOALS, todayKey: TODAY }),
    TODAY,
  );
}

// Mirrors Today's actionable section: the shared selector returns only
// incomplete tasks eligible for Today.
function activeSection(tasks) {
  return selectSorted(tasks);
}

class MemoryStorage {
  values = new Map();

  getItem(key) {
    return this.values.get(key) ?? null;
  }

  setItem(key, value) {
    this.values.set(key, String(value));
  }

  removeItem(key) {
    this.values.delete(key);
  }
}

function withStorage(values, callback) {
  const storage = new MemoryStorage();
  for (const [key, value] of Object.entries(values)) storage.setItem(key, value);
  globalThis.localStorage = storage;
  try {
    callback(storage);
  } finally {
    delete globalThis.localStorage;
  }
}

test("completing a task removes it from Today's active section without deleting it", () => {
  const tasks = [makeTask("t-1", { priority: "high" }), makeTask("t-2", { priority: "low" })];
  assert.deepEqual(activeSection(tasks).map((task) => task.id), ["t-1", "t-2"]);

  const next = tasks.map((task) =>
    task.id === "t-1" ? toggleTaskCompletion(task) : task,
  );

  // Gone from the shared Today selection and its actionable count...
  assert.deepEqual(activeSection(next).map((task) => task.id), ["t-2"]);
  // ...but remains stored with its completion state for other views and analytics.
  assert.equal(next.length, 2);
  assert.equal(next.find((task) => task.id === "t-1").completed, true);
});

test("uncompleting a task restores it to Today's active section in order", () => {
  const tasks = [makeTask("t-1", { priority: "high" }), makeTask("t-2", { priority: "low" })];
  const completed = tasks.map((task) =>
    task.id === "t-1" ? toggleTaskCompletion(task) : task,
  );
  assert.deepEqual(activeSection(completed).map((task) => task.id), ["t-2"]);

  const reopened = completed.map((task) =>
    task.id === "t-1" ? toggleTaskCompletion(task) : task,
  );

  assert.deepEqual(
    activeSection(reopened).map((task) => task.id),
    ["t-1", "t-2"],
    "uncompleted task reappears with its original ordering",
  );
  assert.deepEqual(
    selectSorted(reopened).map((task) => task.id),
    selectSorted(tasks).map((task) => task.id),
    "completion round-trip preserves Today ordering",
  );
});

test("completed tasks persist through save/load and stay out of the active section", () => {
  withStorage({}, () => {
    const tasks = [makeTask("t-1"), makeTask("t-2")];
    const next = tasks.map((task) =>
      task.id === "t-1" ? toggleTaskCompletion(task) : task,
    );
    saveTasks(next);

    const loaded = loadTasks();
    assert.equal(loaded.find((task) => task.id === "t-1").completed, true);
    assert.equal(loaded.find((task) => task.id === "t-2").completed, false);
    assert.deepEqual(activeSection(loaded).map((task) => task.id), ["t-2"]);
    assert.equal(loaded.length, 2, "completing must never delete task data");
  });
});

test("Today uses the shared incomplete-task selection without a completed task section", () => {
  assert.ok(
    todaySource.includes("selectTodayTasks(tasks, { milestones, todayKey })"),
    "the shared selector drives Today task membership",
  );
  assert.ok(!todaySource.includes("completedTodayTasks"), "completed tasks are not listed on Today");
  assert.ok(todaySource.includes("const pendingTodayTasks = todayTasks"), "actionable counts use open tasks");
  assert.ok(
    !todaySource.includes("deleteTask("),
    "completing on Today must never route through deletion",
  );
});

test("the shared toggle handler updates tasks functionally (no stale-state replacement)", () => {
  const handler = appSource.match(/function handleToggleTask[\s\S]*?\n  \}/);
  assert.ok(handler, "App must define handleToggleTask");
  assert.ok(
    handler[0].includes("commitTaskChanges((currentTasks)") &&
      handler[0].includes("setTaskCompletion(task, requestedCompleted)") &&
      handler[0].includes("return changed ? nextTasks : currentTasks"),
    "repeated callbacks from a stale render set the same requested state without a second write",
  );
});

test("overdue, due-today, and upcoming work are visibly distinct and date refreshes", () => {
  assert.ok(tasksSource.includes('label: "Overdue"'));
  assert.ok(tasksSource.includes('label: "Due Today"'));
  assert.ok(tasksSource.includes('label: "Upcoming"'));
  assert.ok(todaySource.includes("Overdue · Due"));
  assert.ok(todaySource.includes("Upcoming · Due"));
  assert.ok(appSource.includes("setTodayDateKey(currentDateKey)"));
  assert.ok(appSource.includes("window.addEventListener(\"focus\", syncHabitDay)"));
  assert.ok(appSource.includes("document.addEventListener(\"visibilitychange\", syncHabitDay)"));
  assert.ok(appSource.includes("window.setInterval(syncHabitDay, 30_000)"));
});
