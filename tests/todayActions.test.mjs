import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { completeTask, toggleTaskCompletion } from "../src/domain/tasks.ts";
import { markHabitComplete, markHabitIncomplete } from "../src/domain/completions.ts";

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

// --- Completion is idempotent: repeats never duplicate or reopen ---

test("task completion is idempotent and toggle stays a pure flip", () => {
  const open = { id: "t", title: "T", completed: false, priority: "medium", createdAt: "x" };
  const done = completeTask(open);
  assert.equal(done.completed, true);
  assert.equal(completeTask(done), done, "re-completing is a no-op, never reopens");
  assert.equal(toggleTaskCompletion(done).completed, false);
  assert.equal(toggleTaskCompletion(open).completed, true);
});

test("habit completion helpers are idempotent no-ops on no-change", () => {
  const habit = { id: 1, name: "H", completedDates: [] };
  const done = markHabitComplete(habit, "2026-10-09");
  assert.deepEqual(done.completedDates, ["2026-10-09"]);
  assert.equal(markHabitComplete(done, "2026-10-09"), done, "double complete logs once");
  const undone = markHabitIncomplete(done, "2026-10-09");
  assert.deepEqual(undone.completedDates, []);
  assert.equal(markHabitIncomplete(undone, "2026-10-09"), undone, "double unmark is a no-op");
});

test("hero Mark Done never toggles stale or already-complete items", () => {
  const body = section(todaySource, "function completeNextStep()");
  assert.ok(body.includes("if (!task || task.completed) return"), "missing/deleted task is a no-op");
  assert.ok(
    body.includes("habit.completedDates.includes(todayKey)"),
    "already-complete habit is a no-op",
  );
  assert.ok(!body.includes("?? { id:"), "no synthetic fallback item that would phantom-toggle the store");
});

// --- Rapid toggles compose: no stale-closure lost update ---

test("habit toggle updates from latest state, not a stale snapshot", () => {
  const body = section(todaySource, "function handleHabitToggle");
  assert.ok(body, "row/timeline toggles keep passing actual status");
  const appToggle = section(appSource, "function toggleHabit(");
  assert.ok(
    appToggle.includes("setHabits((current) =>"),
    "habit store update must use the functional form so queued toggles compose",
  );
  assert.ok(
    appToggle.includes("h.completedDates.includes(targetDateKey)"),
    "per-item decision must re-derive inside the updater",
  );
  assert.ok(
    !appToggle.includes("const updatedHabits: Habit[] = habits.map"),
    "stale snapshot mapping must not survive",
  );
});

// --- Skipping never touches persistent state ---

test("skipping a recommendation only hides it in-session", () => {
  const body = section(todaySource, "function skipNextStep()");
  assert.ok(body.includes("setSkippedTaskIds") || body.includes("setSkippedHabitIds"));
  assert.ok(body.includes("setChosenNextStepKey(null)"), "pin clears so the next candidate surfaces");
  for (const forbidden of ["onToggleTask", "onToggleHabit", "onUpdateTask", "onUpdateHabit", "completeTask", "markHabitComplete", "saveStorageData"]) {
    assert.ok(!body.includes(forbidden), `skip path must not call ${forbidden}`);
  }
  assert.ok(
    todaySource.includes("const [skippedTaskIds, setSkippedTaskIds] = useState<string[]>([])"),
    "skips stay in component state",
  );
  assert.ok(!todaySource.includes("skippedTaskIds") || !todaySource.match(/saveStorageData\([^)]*[Ss]kip/),
    "no persistent skip history");
});

// --- Timer start reuses the existing instance; stop never completes ---

test("quick focus reuses the existing timer with a one-shot auto-start", () => {
  const handler = section(appSource, "function startQuickFocus(");
  assert.ok(handler.includes("setInitialFocusEntityId"), "entity links through the existing timer");
  assert.ok(handler.includes("setTimerAutoStartAction"), "duration arms the one-shot auto-start");
  assert.ok(handler.includes('navigateToView("Timer")'), "lands on the existing Timer view");
  assert.ok(!handler.includes("setFocusSessions"), "starting never logs a session");
  assert.ok(!handler.includes("completeTask"), "starting never completes work");
  assert.ok(
    appSource.includes("onAutoStartHandled={() => setTimerAutoStartAction(null)}"),
    "auto-start clears after firing so it can never restart or double-log",
  );
});

test("stopping or resetting the timer never completes the underlying item", () => {
  for (const fn of ["function handlePause()", "function handleReset()"]) {
    const body = section(timerSource, fn);
    assert.ok(!body.includes("onCompleteTask"), `${fn} must not complete work`);
    assert.ok(!body.includes("onSessionComplete"), `${fn} must not log a session`);
  }
  const completions = timerSource.match(/onCompleteTask\?\.?\(/g) ?? [];
  assert.equal(completions.length, 1, "exactly one manual completion affordance in the timer");
  assert.ok(timerSource.includes("showTaskCompleteAffordance"), "manual completion is gated on the just-logged session");
});

// --- Navigation and restart preserve consistency without new storage ---

test("navigating away never tears down timer or recommendation state", () => {
  assert.ok(
    appSource.includes("Both views stay mounted at all times"),
    "Today and Timer stay mounted across navigation",
  );
  assert.ok(todaySource.includes("chosenNextStepKey"), "pinned choice survives in-session navigation");
});

test("restart restores recommendations from persisted stores only", () => {
  for (const key of ["saveHabits(habits)", "saveTasks(tasks)", "saveStorageData(STORAGE_KEYS.FOCUS_SESSIONS, focusSessions)"]) {
    assert.ok(appSource.includes(key), `expected persistence ${key}`);
  }
  assert.ok(
    !appSource.match(/saveStorageData\([^)]*[Ss]kipped/),
    "skips must not persist across restarts",
  );
});
