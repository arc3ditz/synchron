import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  COMPLETION_CONFIRMATION_MS,
  getCompletionMessage,
} from "../src/domain/completionFeedback.ts";
import { recommendNextStep } from "../src/domain/nextStep.ts";
import { toggleTaskCompletion } from "../src/domain/tasks.ts";
import { markHabitComplete, markHabitIncomplete } from "../src/domain/completions.ts";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const todaySource = readFileSync(path.join(root, "src/components/Today.tsx"), "utf8");
const appSource = readFileSync(path.join(root, "src/App.tsx"), "utf8");
const feedbackSource = readFileSync(path.join(root, "src/domain/completionFeedback.ts"), "utf8");

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

const FORBIDDEN = /streak|points?|levels?|troph|reward|confetti|celebrat|amazing|incredible|guilt|shame|punish|fire|rocket|keep (it|this) up|you('| a)re (the )?best|unstoppable/i;

// --- Calm, concise copy ---

test("completion message names what finished, nothing more", () => {
  assert.equal(getCompletionMessage("Read", false), "Done — Read.");
});

test("final completion acknowledges it plainly, without pressure", () => {
  assert.equal(
    getCompletionMessage("Read", true),
    "Done — Read. All clear for today.",
  );
});

test("blank titles degrade to a bare confirmation, never an empty name", () => {
  assert.equal(getCompletionMessage("   ", false), "Done.");
  assert.equal(getCompletionMessage("", true), "Done. All clear for today.");
});

test("titles are trimmed before rendering", () => {
  assert.equal(getCompletionMessage("  Walk  ", false), "Done — Walk.");
});

test("completion copy avoids gamified, pressuring, or shaming language", () => {
  for (const message of [
    getCompletionMessage("Read", false),
    getCompletionMessage("Read", true),
    getCompletionMessage("", false),
    getCompletionMessage("", true),
  ]) {
    assert.doesNotMatch(message, FORBIDDEN);
  }
  // The module doc names what it avoids; scan the shipped strings instead.
  const shipped = feedbackSource.match(/export function getCompletionMessage[\s\S]*?\n\}/);
  assert.ok(shipped, "message builder must stay a single small function");
  assert.doesNotMatch(shipped[0], FORBIDDEN);
});

test("confirmation timing is a shared, sane constant reused by the view", () => {
  assert.ok(
    Number.isFinite(COMPLETION_CONFIRMATION_MS) &&
    COMPLETION_CONFIRMATION_MS >= 3000 &&
    COMPLETION_CONFIRMATION_MS <= 10000,
    "quietly visible for seconds, not flashing or lingering",
  );
  assert.ok(
    todaySource.includes("COMPLETION_CONFIRMATION_MS"),
    "Today must reuse the domain timeout, not a magic number",
  );
});

// --- Recommendation updates promptly on completion ---

test("completing the top task immediately yields the next candidate", () => {
  const tasks = [
    makeTask({ id: "first", title: "First", dueDate: "2026-10-08", priority: "high" }),
    makeTask({ id: "second", title: "Second", dueDate: TODAY, priority: "high" }),
  ];
  const before = recommendNextStep(input({ tasks }));
  assert.equal(before.kind, "task");
  assert.equal(before.taskId, "first");

  const after = recommendNextStep(input({
    tasks: tasks.map((task) =>
      task.id === "first" ? toggleTaskCompletion(task) : task,
    ),
  }));
  assert.equal(after.kind, "task");
  assert.equal(after.taskId, "second");
});

test("completing the recommended habit moves on without a planning step", () => {
  const habits = [
    makeHabit({ id: 1, name: "First" }),
    makeHabit({ id: 2, name: "Second" }),
  ];
  const before = recommendNextStep(input({ habits }));
  assert.equal(before.kind, "habit");

  const doneId = before.habitId;
  const after = recommendNextStep(input({
    habits: habits.map((habit) =>
      habit.id === doneId ? markHabitComplete(habit, TODAY) : habit,
    ),
  }));
  assert.equal(after.kind, "habit");
  assert.notEqual(after.habitId, doneId);
});

test("completing everything resolves to a calm all-clear, never guilt", () => {
  const rec = recommendNextStep(input({
    tasks: [makeTask({ id: "t", title: "T", dueDate: TODAY, completed: true })],
    habits: [makeHabit({ id: 1, name: "H", completedDates: [TODAY] })],
  }));
  assert.equal(rec.kind, "none");
  assert.ok(rec.title.length > 0 && rec.reason.length > 0);
  assert.doesNotMatch(`${rec.title} ${rec.reason}`, FORBIDDEN);
});

// --- Completion state preserves history ---

test("habit completion appends history and round-trips exactly", () => {
  const habit = makeHabit({ completedDates: ["2026-10-08"] });
  const done = markHabitComplete(habit, TODAY);
  assert.deepEqual(done.completedDates, ["2026-10-08", TODAY]);
  const undone = markHabitIncomplete(done, TODAY);
  assert.deepEqual(undone.completedDates, ["2026-10-08"]);
});

test("task completion flips state without touching identity or plan links", () => {
  const task = makeTask({ id: "t", title: "T", goalId: "g", priority: "high" });
  const done = toggleTaskCompletion(task);
  assert.equal(done.completed, true);
  assert.equal(done.id, "t");
  assert.equal(done.title, "T");
  assert.equal(done.goalId, "g");
  assert.equal(toggleTaskCompletion(done).completed, false);
});

// --- Today: one quiet, event-sourced confirmation ---

test("Today renders exactly one polite confirmation region", () => {
  assert.equal(
    todaySource.match(/data-testid="completion-confirmation"/g)?.length ?? 0,
    1,
    "a single confirmation node, never stacked",
  );
  assert.ok(todaySource.includes('role="status"'), "polite live region, no focus theft");
  assert.ok(!todaySource.includes('role="alert"'), "alerts would be disproportionate");
  assert.equal(
    todaySource.match(/\{renderCompletionConfirmation\(\)\}/g)?.length ?? 0,
    1,
    "rendered once, directly after the refreshed hero",
  );
});

test("every Today toggle routes through the shared completion wrappers", () => {
  assert.equal(todaySource.match(/onToggleTask\(/g)?.length ?? 0, 2);
  assert.equal(todaySource.match(/onToggleHabit\(/g)?.length ?? 0, 2);
  assert.ok(todaySource.includes("function handleTaskToggle"));
  assert.ok(todaySource.includes("function handleHabitToggle"));
  assert.ok((todaySource.match(/handleTaskToggle\(/g) ?? []).length >= 4);
  assert.ok((todaySource.match(/handleHabitToggle\(/g) ?? []).length >= 4);
});

test("confirmation is set only on completion and cleared on unmark, timeout, and dismiss", () => {
  assert.equal(todaySource.match(/setLastCompletion\(\{/g)?.length ?? 0, 2);
  assert.ok((todaySource.match(/setLastCompletion\(null\)/g) ?? []).length >= 3);
  assert.ok(todaySource.includes("clearTimeout"), "auto-dismiss timer must clean up");
  assert.ok(
    todaySource.includes("Dismiss completion message"),
    "user can dismiss without waiting",
  );
});

test("confirmation block stays calm: no streaks, rewards, or animation", () => {
  const block = todaySource.match(/function renderCompletionConfirmation\(\)[\s\S]*?\n  \}/);
  assert.ok(block, "confirmation renders through one function");
  assert.doesNotMatch(block[0], FORBIDDEN);
  assert.ok(!todaySource.includes("confetti"), "no celebration effects anywhere on Today");
  const styleBlock = todaySource.match(/completionConfirmation: \{[\s\S]*?\n  \},/);
  assert.ok(styleBlock, "confirmation has its own quiet style");
  assert.doesNotMatch(styleBlock[0], /animation|transition|transform|keyframes/);
});

test("Today adds no new sounds to the completion path", () => {
  assert.equal(todaySource.match(/playSfx/g)?.length ?? 0, 0);
  assert.ok(!todaySource.includes("SfxEvent"));
});

// --- App: existing sound, only on completion, settings-respected ---

test("App plays the existing subtle sound only when marking complete", () => {
  const taskHandler = appSource.match(/function handleToggleTask[\s\S]*?\n  \}/);
  assert.ok(taskHandler, "App must define handleToggleTask");
  assert.ok(taskHandler[0].includes("if (!isCurrentlyComplete)"));
  assert.ok(taskHandler[0].includes('playSfx("habitComplete")'));

  const habitHandler = appSource.match(/function toggleHabit[\s\S]*?\n  \}/);
  assert.ok(habitHandler, "App must define toggleHabit");
  assert.ok(habitHandler[0].includes("if (!isCurrentlyComplete)"));
  assert.ok(habitHandler[0].includes('playSfx("habitComplete")'));
});

test("completion preserves History and Analytics access", () => {
  assert.ok(appSource.includes("onNavigateToHistory"));
  assert.ok(appSource.includes("onNavigateToAnalytics"));
  assert.ok(todaySource.includes("View History"));
  assert.ok(todaySource.includes("Receive Analytics"));
});

test("no rewards system is introduced", () => {
  assert.ok(!appSource.includes("confetti"));
  assert.ok(!appSource.includes("trophy"));
  assert.ok(!appSource.includes("celebrat"));
  assert.ok(!todaySource.includes("trophy"));
  assert.ok(!feedbackSource.includes("reward"));
});
