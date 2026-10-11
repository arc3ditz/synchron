import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { buildFocusSessionRecord } from "../src/domain/focusTimer.ts";
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

// --- Up Next CTA navigates with 15min prefilled, no auto-start ---

test("Today hero Start navigates to Timer with 15 minutes prefilled, no auto-start", () => {
  const starter = todaySource.match(/function startNextStep\(\)[\s\S]*?\n  \}/);
  assert.ok(starter, "hero Start funnels through one startNextStep");
  assert.ok(starter[0].includes("onStartFocus"), "hero Start uses onStartFocus for navigation");
  assert.ok(starter[0].includes("durationMinutes: 15"), "hero Start carries 15-minute duration");
  assert.ok(!starter[0].includes("onQuickFocus"), "hero Start does NOT use quick auto-start");
  assert.ok(!starter[0].includes("QUICK_FOCUS_MINUTES"), "hero Start does NOT use the 5-minute constant");
  const hero = todaySource.match(/function renderNextStep\(\)[\s\S]*?\n  \}/);
  assert.ok(hero);
  assert.ok(hero[0].includes("onClick={startNextStep}"), "hero primary button triggers startNextStep");
  assert.ok(hero[0].includes("Start Focus Timer"), "button label is 'Start Focus Timer'");
  assert.ok(!hero[0].includes("Start · 5 min focus"), "button label is NOT the old quick-start text");
});

test("navigation prefill uses presetDurationMinutes, not auto-start", () => {
  assert.ok(
    appSource.includes("setTimerPresetDurationMinutes"),
    "App must set preset duration for navigation prefill",
  );
  assert.ok(
    appSource.includes("presetDurationMinutes={timerPresetDurationMinutes}"),
    "FocusTimer receives the preset duration prop",
  );
  assert.ok(
    timerSource.includes("presetDurationMinutes"),
    "FocusTimer handles the preset duration prop",
  );
  assert.ok(
    timerSource.includes("onPresetDurationHandled"),
    "FocusTimer clears the preset after applying it",
  );
});

test("preset duration applies without auto-starting", () => {
  const effect = timerSource.match(/if \(presetDurationMinutes == null\) return;[\s\S]*?onPresetDurationHandled\?\.\(\);/);
  assert.ok(effect, "FocusTimer must handle the one-shot preset duration");
  assert.ok(effect[0].includes("handleTimerDurationChange"), "duration is applied to the timer");
  assert.ok(!effect[0].includes("handleStart()"), "preset does NOT auto-start");
  assert.ok(effect[0].includes("onPresetDurationHandled?.()"), "the request clears so it applies only once");
  assert.ok(timerSource.includes("clampFocusDurationMinutes(presetDurationMinutes, defaultFocusDuration)"), "preset duration is clamped and applied");
});

test("notification actions still use auto-start (separate path from Up Next)", () => {
  assert.ok(
    appSource.includes("setTimerAutoStartAction"),
    "notification actions still use auto-start",
  );
  assert.ok(
    appSource.includes("autoStartAction={timerAutoStartAction}"),
    "the auto-start prop is still passed to FocusTimer for notifications",
  );
  assert.ok(
    timerSource.includes("autoStartAction"),
    "FocusTimer still handles auto-start for notifications",
  );
});

// --- Selection survives the session; completion stays manual and single ---

test("session records preserve the linked task and its context", () => {
  const record = buildFocusSessionRecord(
    { sessionType: "Timer", durationMinutes: 15, habitName: "Deep work", goalId: "goal-1", milestoneId: "m-1", taskId: "task-1" },
    { tasks, milestones },
    { id: 1, timestamp: 1000 },
  );
  assert.equal(record.taskId, "task-1");
  assert.equal(record.goalId, "goal-1");
  assert.equal(record.milestoneId, "m-1");
  assert.equal(record.projectId, "project-1");
  assert.equal(record.durationMinutes, 15);
});

test("session logging is guarded against duplicates", () => {
  assert.ok(timerSource.includes("shouldLogSession"), "completion handler checks before logging");
  assert.ok(timerSource.includes("markSessionLogged"), "each completion is recorded once");
  assert.ok(
    timerSource.includes("loggedSessionKeysRef") &&
      timerSource.includes("saveFocusTimerSnapshot"),
    "completion identities survive re-renders and app restarts",
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
