import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { QUICK_FOCUS_MINUTES, buildFocusSessionRecord } from "../src/domain/focusTimer.ts";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const appSource = readFileSync(path.join(root, "src/App.tsx"), "utf8");
const timerSource = readFileSync(path.join(root, "src/components/FocusTimer.tsx"), "utf8");
const todaySource = readFileSync(path.join(root, "src/components/Today.tsx"), "utf8");

function section(source, start, end = "\n  }") {
  const idx = source.indexOf(start);
  assert.ok(idx >= 0, `expected block ${start}`);
  const tail = source.slice(idx);
  const close = tail.indexOf(end);
  assert.ok(close >= 0, `expected terminator for ${start}`);
  return tail.slice(0, close + end.length);
}

const tasks = [
  { id: "task-1", goalId: "goal-1", projectId: "project-1", milestoneId: "m-1", title: "Deep work", completed: false },
];
const milestones = [
  { id: "m-1", goalId: "goal-1", projectId: "project-1", title: "M1", completed: false },
];

// --- Context payload: task, habit, and untitled sessions ---

test("quick focus carries task context with the short commitment", () => {
  const handler = section(appSource, "function startQuickFocus(");
  assert.ok(handler.includes("entity.taskId !== undefined"), "task ids take the task branch");
  assert.ok(handler.includes("{ taskId: entity.taskId, title: entity.title }"), "taskId and title travel together");
  assert.ok(handler.includes("durationMinutes = entity.durationMinutes ?? QUICK_FOCUS_MINUTES"), "short commitment defaults, never touches saved default");
  const record = buildFocusSessionRecord(
    { sessionType: "Timer", durationMinutes: QUICK_FOCUS_MINUTES, habitName: "Deep work", taskId: "task-1" },
    { tasks, milestones },
    { id: 1, timestamp: 1000 },
  );
  assert.equal(record.taskId, "task-1");
  assert.equal(record.projectId, "project-1", "project resolves through the linked task");
});

test("quick focus carries habit context without forcing a task", () => {
  const handler = section(appSource, "function startQuickFocus(");
  assert.ok(handler.includes("{ habitId: entity.habitId, title: entity.title }"), "habitId and title travel together");
  const record = buildFocusSessionRecord(
    { sessionType: "Timer", durationMinutes: QUICK_FOCUS_MINUTES, habitName: "Run", habitId: 7 },
    { tasks, milestones },
    { id: 2, timestamp: 2000 },
  );
  assert.equal(record.habitId, 7);
  assert.equal(record.taskId, undefined, "no task is fabricated for habit sessions");
});

test("unlinked focus stays possible: title-only or empty entity", () => {
  const handler = section(appSource, "function startQuickFocus(");
  assert.ok(handler.includes("entity.title"), "title-only entities land as General Focus with a label");
  const starter = section(appSource, "function startFocusSession(");
  assert.ok(starter.includes("setInitialFocusEntityId(entityId)"), "plain starts link without arming auto-start");
  assert.ok(!starter.includes("setTimerAutoStartAction"), "unlinked browsing never auto-starts the timer");
  const record = buildFocusSessionRecord(
    { sessionType: "Timer", durationMinutes: 25, habitName: "General Focus" },
    { tasks, milestones },
    { id: 3, timestamp: 3000 },
  );
  assert.equal(record.taskId, undefined);
  assert.equal(record.habitId, undefined);
});

// --- Recommendation entry points: one tap to a linked timer ---

test("hero Start and row Focus both land on the linked Timer", () => {
  const hero = section(todaySource, "function startNextStep()");
  assert.ok(hero.includes("onQuickFocus({ taskId: nextStep.taskId"), "hero task Start carries the task link");
  assert.ok(hero.includes("onQuickFocus({ habitId: nextStep.habitId"), "hero habit Start carries the habit link");
  assert.ok(hero.includes("QUICK_FOCUS_MINUTES"), "hero carries the short commitment");
  assert.ok(todaySource.includes("onStartFocus({ taskId: task.id"), "row Focus links the task without auto-starting");
  assert.ok(todaySource.includes("onStartFocus({ habitId:"), "habit entry points link the habit");
});

// --- Timer survives navigation; one engine only ---

test("active timer state survives tab changes", () => {
  assert.ok(
    appSource.includes("Both views stay mounted at all times"),
    "Today/Timer stay mounted; intervals and state are never torn down",
  );
  assert.ok(
    appSource.includes('className="focus-view"'),
    "Timer view toggles visibility instead of unmounting",
  );
  assert.ok(!timerSource.includes("QUICK_FOCUS_MINUTES"), "no duplicate quick-start engine inside the timer");
});

// --- Lifecycle: early stop and pause never complete or log ---

test("auto-start switches to Timer mode safely and clears exactly once", () => {
  const effect = timerSource.match(/if \(!autoStartAction\) return;[\s\S]*?onAutoStartHandled\?\.\(\);/);
  assert.ok(effect, "one-shot effect intact");
  assert.ok(effect[0].includes('setMode("Timer")'), "Pomodoro-safe mode commit before start");
  assert.ok(effect[0].includes("handleTimerDurationChange(String(durationMinutes))"), "duration applied to the shared timer");
  assert.ok(effect[0].includes("handleStart()"), "starts without an extra tap");
});

test("pause, reset, and early stop never complete work or log sessions", () => {
  for (const fn of ["function handlePause()", "function handleReset()"]) {
    const body = section(timerSource, fn);
    assert.ok(!body.includes("onCompleteTask"), `${fn} must not complete work`);
    assert.ok(!body.includes("onSessionComplete") && !body.includes("handleSessionComplete"), `${fn} must not log a session`);
  }
  const completions = timerSource.match(/onCompleteTask\?\.?\(/g) ?? [];
  assert.equal(completions.length, 1, "completion stays a single manual affordance");
});

test("natural timer end logs a session but still never auto-completes", () => {
  const start = timerSource.indexOf("function updateTimer(");
  assert.ok(start >= 0);
  const updater = timerSource.slice(start, timerSource.indexOf('playSfx("timerComplete")', start));
  assert.ok(updater.includes("handleSessionComplete"), "finished sessions are recorded");
  assert.ok(!updater.includes("onCompleteTask"), "recording never completes the task");
  assert.ok(!updater.includes("completeTask"), "no completion call on the natural-end path");
});
