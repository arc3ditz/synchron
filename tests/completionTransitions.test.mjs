import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  listNextStepCandidates,
  recommendNextStep,
} from "../src/domain/nextStep.ts";
import { toggleTaskCompletion } from "../src/domain/tasks.ts";
import { markHabitComplete, markHabitIncomplete } from "../src/domain/completions.ts";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const todaySource = readFileSync(path.join(root, "src/components/Today.tsx"), "utf8");

const TODAY = "2026-10-09";

function makeTask(overrides = {}) {
  return {
    id: "task-1",
    title: "Task",
    completed: false,
    priority: "medium",
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function makeHabit(overrides = {}) {
  return {
    id: 1,
    name: "Habit",
    priority: "Optional",
    type: "Daily",
    completedDates: [],
    ...overrides,
  };
}

function input(overrides = {}) {
  return {
    habits: [],
    tasks: [],
    goals: [],
    milestones: [],
    projects: [],
    todayKey: TODAY,
    ...overrides,
  };
}

function section(source, start, end = "\n  }") {
  const idx = source.indexOf(start);
  assert.ok(idx >= 0, `expected block ${start}`);
  const tail = source.slice(idx);
  const close = tail.indexOf(end);
  assert.ok(close >= 0, `expected terminator for ${start}`);
  return tail.slice(0, close + end.length);
}

// --- Instant recommendation transitions on completion ---

test("completing the recommended task instantly surfaces the next item", () => {
  const tasks = [
    makeTask({ id: "first", title: "First", dueDate: "2026-10-08", priority: "high" }),
    makeTask({ id: "second", title: "Second", dueDate: TODAY, priority: "high" }),
  ];
  assert.equal(recommendNextStep(input({ tasks })).taskId, "first");
  const after = recommendNextStep(input({
    tasks: tasks.map((task) => (task.id === "first" ? toggleTaskCompletion(task) : task)),
  }));
  assert.equal(after.kind, "task");
  assert.equal(after.taskId, "second");
  assert.ok(
    !listNextStepCandidates(input({ tasks: tasks.map((t) => (t.id === "first" ? toggleTaskCompletion(t) : t)) }))
      .some((c) => c.kind === "task" && c.taskId === "first"),
    "completed items drop out of the candidate list entirely",
  );
});

test("completing the recommended habit moves to the next habit, history intact", () => {
  const habits = [makeHabit({ id: 1, name: "First" }), makeHabit({ id: 2, name: "Second" })];
  const before = recommendNextStep(input({ habits }));
  assert.equal(before.kind, "habit");
  const done = markHabitComplete(habits.find((h) => h.id === before.habitId), TODAY);
  assert.deepEqual(done.completedDates, [TODAY], "only today is appended");
  const after = recommendNextStep(input({
    habits: habits.map((h) => (h.id === before.habitId ? done : h)),
  }));
  assert.equal(after.kind, "habit");
  assert.notEqual(after.habitId, before.habitId);
});

test("finishing the last open item lands on the calm all-clear", () => {
  const rec = recommendNextStep(input({
    tasks: [makeTask({ id: "t", title: "T", dueDate: TODAY, completed: true })],
    habits: [makeHabit({ id: 1, name: "H", completedDates: [TODAY] })],
  }));
  assert.equal(rec.kind, "none");
  assert.equal(rec.durationMinutes, undefined, "fallback carries no invented effort");
});

test("unmarking restores eligibility without touching history", () => {
  const done = markHabitComplete(makeHabit({ id: 1, name: "H", completedDates: ["2026-10-08"] }), TODAY);
  const reopened = markHabitIncomplete(done, TODAY);
  assert.deepEqual(reopened.completedDates, ["2026-10-08"], "earlier history survives the round trip");
  const rec = recommendNextStep(input({ habits: [reopened] }));
  assert.equal(rec.kind, "habit");
  assert.equal(rec.habitId, 1);
});

// --- Rapid double-clicks cannot disagree: one toggle in flight per item ---

test("Today ignores repeat toggles until the store refresh lands", () => {
  assert.ok(todaySource.includes("pendingToggleRef"), "in-flight toggle tracking exists");
  for (const fn of ["function handleTaskToggle(", "function handleHabitToggle("]) {
    const body = section(todaySource, fn);
    assert.ok(body.includes("pendingToggleRef.current.has(itemKey)"), `${fn} drops repeats while pending`);
    assert.ok(body.includes("pendingToggleRef.current.add(itemKey)"), `${fn} marks the in-flight item`);
  }
  assert.ok(
    todaySource.includes("pendingToggleRef.current.clear()"),
    "the guard releases on every tasks/habits refresh so deliberate unmarking still works",
  );
});

// --- Completion touches nothing else ---

test("Today completion wrappers change only completion state", () => {
  for (const fn of ["function handleTaskToggle(", "function handleHabitToggle("]) {
    const body = section(todaySource, fn);
    for (const forbidden of ["onUpdateTask", "onUpdateHabit", "playSfx", "navigateTo", "saveStorageData", "deleteTask"]) {
      assert.ok(!body.includes(forbidden), `${fn} must not call ${forbidden}`);
    }
  }
  assert.ok(
    todaySource.includes("habits,") && todaySource.includes("tasks,") && todaySource.includes("nextStepBaseInput"),
    "the hero re-derives from store props, so completion refreshes it with no manual re-render",
  );
});
