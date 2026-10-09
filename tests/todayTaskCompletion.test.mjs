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

// Mirrors Today's active/incomplete section: the pending partition of the
// already-sorted Today selection.
function activeSection(tasks) {
  return selectSorted(tasks).filter((task) => !task.completed);
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

  // Gone from the active section...
  assert.deepEqual(activeSection(next).map((task) => task.id), ["t-2"]);
  // ...but still selected for Today so the completed-items view can show (and reopen) it.
  assert.deepEqual(selectSorted(next).map((task) => task.id).sort(), ["t-1", "t-2"]);
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

test("Today derives pending/completed from one sorted selection (no separate queries)", () => {
  assert.ok(
    todaySource.includes("pendingTodayTasks") && todaySource.includes("completedTodayTasks"),
    "Today must keep distinct pending/completed partitions",
  );
  assert.ok(
    !todaySource.includes("deleteTask("),
    "completing on Today must never route through deletion",
  );
  const partition = todaySource.match(/for \(const task of todayTasks\)[\s\S]{0,200}?completed\.push\(task\)/);
  assert.ok(partition, "partitions must derive from the same sorted todayTasks selection");
});

test("the shared toggle handler updates tasks functionally (no stale-state replacement)", () => {
  const handler = appSource.match(/function handleToggleTask[\s\S]*?\n  \}/);
  assert.ok(handler, "App must define handleToggleTask");
  assert.ok(
    handler[0].includes("setTasks((current)") && handler[0].includes("toggleTaskCompletion(task)"),
    "toggle must map over current state with the shared toggle helper",
  );
});
