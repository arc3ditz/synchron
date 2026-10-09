import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { QUICK_FOCUS_MINUTES, buildFocusSessionRecord } from "../src/domain/focusTimer.ts";
import { completeTask } from "../src/domain/tasks.ts";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const appSource = readFileSync(path.join(root, "src/App.tsx"), "utf8");
const timerSource = readFileSync(path.join(root, "src/components/FocusTimer.tsx"), "utf8");
const todaySource = readFileSync(path.join(root, "src/components/Today.tsx"), "utf8");

const tasks = [
  { id: "task-1", goalId: "goal-1", projectId: "project-1", milestoneId: "m-1", title: "Deep work", completed: false },
];
const milestones = [
  { id: "m-1", goalId: "goal-1", projectId: "project-1", title: "M1", completed: false },
];

// --- Short commitment reuses the existing timer, not a new one ---

test("quick focus is a five-minute commitment on the shared constant", () => {
  assert.equal(QUICK_FOCUS_MINUTES, 5);
  assert.ok(
    appSource.includes("durationMinutes = entity.durationMinutes ?? QUICK_FOCUS_MINUTES"),
    "App must default the quick start to the shared constant",
  );
  assert.ok(!appSource.includes("defaultFocusDuration: QUICK_FOCUS_MINUTES"), "saved default stays untouched");
  assert.ok(!timerSource.includes("QUICK_FOCUS_MINUTES"), "timer needs no special case for quick starts");
});

test("quick start links the item, arms a one-shot auto-start, and opens the Timer", () => {
  const handler = appSource.match(/function startQuickFocus[\s\S]*?\n  \}/);
  assert.ok(handler, "App must define startQuickFocus");
  assert.ok(handler[0].includes("setInitialFocusEntityId"), "selection travels through the existing entity link");
  assert.ok(handler[0].includes("setTimerAutoStartAction"), "duration travels through the one-shot auto-start");
  assert.ok(handler[0].includes('navigateToView("Timer")'), "user lands on the existing Timer view");
  assert.ok(
    appSource.includes("autoStartAction={timerAutoStartAction}"),
    "the same auto-start prop serves notifications and quick starts",
  );
});

test("the one-shot auto-start fires once: duration, start, then clear", () => {
  const effect = timerSource.match(/if \(!autoStartAction\) return;[\s\S]*?onAutoStartHandled\?\.\(\);/);
  assert.ok(effect, "FocusTimer must handle the one-shot auto-start");
  assert.ok(effect[0].includes("handleTimerDurationChange(String(durationMinutes))"));
  assert.ok(effect[0].includes("handleStart()"), "quick start begins without an extra tap");
  assert.ok(effect[0].includes("onAutoStartHandled?.()"), "the request clears so it can never restart or double-log");
});

test("Today hero offers the quick start; all other starts keep existing behavior", () => {
  const starter = todaySource.match(/function startNextStep\(\)[\s\S]*?\n  \}/);
  assert.ok(starter, "hero Start funnels through one startNextStep");
  assert.ok(starter[0].includes("onQuickFocus"), "hero Start uses the quick path");
  assert.ok(starter[0].includes("QUICK_FOCUS_MINUTES"), "quick path carries the short commitment");
  const hero = todaySource.match(/function renderNextStep\(\)[\s\S]*?\n  \}/);
  assert.ok(hero);
  assert.ok(hero[0].includes("onClick={startNextStep}"), "hero primary button triggers the quick start");
  assert.ok(
    (todaySource.match(/onStartFocus\(/g) ?? []).length >= 5,
    "row, timeline, habit, and quick-action starts keep the existing open-timer flow",
  );
});

// --- Selection survives the session; completion stays manual and single ---

test("quick-focus session records preserve the linked task and its context", () => {
  const record = buildFocusSessionRecord(
    { sessionType: "Timer", durationMinutes: QUICK_FOCUS_MINUTES, habitName: "Deep work", goalId: "goal-1", milestoneId: "m-1", taskId: "task-1" },
    { tasks, milestones },
    { id: 1, timestamp: 1000 },
  );
  assert.equal(record.taskId, "task-1");
  assert.equal(record.goalId, "goal-1");
  assert.equal(record.milestoneId, "m-1");
  assert.equal(record.projectId, "project-1");
  assert.equal(record.durationMinutes, QUICK_FOCUS_MINUTES);
});

test("session logging is guarded against duplicates", () => {
  assert.ok(timerSource.includes("shouldLogSession"), "completion handler checks before logging");
  assert.ok(timerSource.includes("markSessionLogged"), "each completion is recorded once");
  assert.ok(
    timerSource.includes("lastLoggedSessionRef"),
    "the guard survives re-renders via a ref, not a re-created flag",
  );
});

test("timer end never auto-completes: completion is manual and idempotent", () => {
  // The only completion call in the timer is the manual affordance button.
  const completions = timerSource.match(/onCompleteTask\?\.?\(/g) ?? [];
  assert.equal(completions.length, 1, "exactly one manual completion path in the timer");
  assert.ok(timerSource.includes("showTaskCompleteAffordance"), "affordance is gated on the just-logged session");
  assert.ok(
    timerSource.includes("!selectedTask.completed"),
    "the affordance hides once the task is complete, preventing duplicate events",
  );
  // The session-record path never completes work.
  const recorder = appSource.match(/function addFocusSessionRecord[\s\S]*?\n  \}/);
  assert.ok(recorder);
  assert.ok(!recorder[0].includes("completeTask"), "logging a session must not complete the task");
  assert.ok(!recorder[0].includes("toggleTaskCompletion"), "logging a session must not toggle the task");
  // And the completion it does route through is idempotent.
  const alreadyDone = { ...tasks[0], completed: true };
  assert.equal(completeTask(alreadyDone), alreadyDone, "re-completing returns the same record, never reopens");
});

test("finishing work refreshes Today through existing state, not timer side effects", () => {
  assert.ok(
    appSource.includes("onCompleteTask={handleCompleteTaskFromFocus}"),
    "timer completion reuses the shared idempotent handler",
  );
  const handler = appSource.match(/function handleCompleteTaskFromFocus[\s\S]*?\n  \}/);
  assert.ok(handler);
  assert.ok(handler[0].includes("completeTask(task)"), "uses completeTask (idempotent, never reopens)");
  assert.ok(
    todaySource.includes("nextStepBaseInput"),
    "hero derives from tasks/habits props so Today refreshes on change",
  );
});
