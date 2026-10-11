import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { recalculateProjectStatuses } from "../src/domain/projects.ts";
import { getTaskPlanningCategory, selectTodayTasks } from "../src/domain/tasks.ts";
import { createFocusTimerSnapshot, restoreFocusTimerSnapshot } from "../src/domain/focusTimerRecovery.ts";
import { getHabitDateKey } from "../src/utils/dates.ts";
import { loadTodaySnoozes, saveTodaySnoozes, STORAGE_KEYS } from "../src/utils/storage.ts";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const appSource = readFileSync(path.join(root, "src/App.tsx"), "utf8");
const timerSource = readFileSync(path.join(root, "src/components/FocusTimer.tsx"), "utf8");

function withStorage(callback) {
  const values = new Map();
  globalThis.localStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
  try {
    callback(values);
  } finally {
    delete globalThis.localStorage;
  }
}

test("expired snoozes reconcile on restart and persist as removed", () => {
  withStorage((values) => {
    const returnedAt = 1_800_000_000_000;
    saveTodaySnoozes([
      { kind: "task", id: "due", returnAt: returnedAt - 1 },
      { kind: "habit", id: 2, returnAt: returnedAt + 1 },
    ]);

    const restored = loadTodaySnoozes(returnedAt);
    assert.deepEqual(restored, [{ kind: "habit", id: 2, returnAt: returnedAt + 1 }]);
    saveTodaySnoozes(restored);
    assert.deepEqual(JSON.parse(values.get(STORAGE_KEYS.TODAY_SNOOZES)), restored);
  });
});

test("a scheduled task becomes overdue after a missed day without mutating its stored record", () => {
  const task = {
    id: "yesterday",
    title: "Missed while closed",
    dueDate: "2026-10-10",
    completed: false,
    priority: "medium",
    createdAt: "2026-10-01",
  };
  assert.equal(getTaskPlanningCategory(task, "2026-10-10"), "scheduled");
  assert.equal(getTaskPlanningCategory(task, "2026-10-11"), "overdue");
  assert.deepEqual(selectTodayTasks([task], { milestones: [], todayKey: "2026-10-10" }), [task]);
  assert.deepEqual(selectTodayTasks([task], { milestones: [], todayKey: "2026-10-11" }), [task]);
  assert.equal(task.dueDate, "2026-10-10");
  assert.equal(task.completed, false);
});

test("project end-date archival recalculates after restart and repeated reconciliation is stable", () => {
  const project = {
    id: "p",
    name: "Finished",
    targetDate: "2026-10-10",
    status: "active",
    createdAt: "2026-01-01",
  };
  const milestone = { id: "m", projectId: "p", title: "Done", completed: true };
  const completed = recalculateProjectStatuses([project], [milestone], [], "2026-10-11");
  assert.equal(completed[0].status, "archived");
  assert.equal(recalculateProjectStatuses(completed, [milestone], [], "2026-10-11"), completed);
  assert.equal(recalculateProjectStatuses([project], [milestone], [], "2026-10-10")[0].status, "completed");
});

test("timer restart honors running deadlines while paused sessions remain frozen", () => {
  const startedAt = 1_800_000_000_000;
  const running = createFocusTimerSnapshot(25);
  running.timer = {
    totalMs: 25 * 60_000,
    remainingMs: 25 * 60_000,
    minutes: 25,
    running: true,
    endAt: startedAt + 25 * 60_000,
  };
  const restoredRunning = restoreFocusTimerSnapshot(running, startedAt + 30 * 60_000, 25);
  assert.equal(restoredRunning.timer.remainingMs, 0);
  assert.equal(restoredRunning.timer.endAt, startedAt + 25 * 60_000);

  const paused = createFocusTimerSnapshot(25);
  paused.timer = {
    totalMs: 25 * 60_000,
    remainingMs: 8 * 60_000,
    minutes: 25,
    running: false,
    endAt: null,
  };
  const restoredPaused = restoreFocusTimerSnapshot(paused, startedAt + 30 * 60_000, 25);
  assert.equal(restoredPaused.timer.remainingMs, 8 * 60_000);
  assert.equal(restoredPaused.timer.running, false);
  assert.equal(restoreFocusTimerSnapshot(restoredPaused, startedAt + 60 * 60_000, 25).timer.remainingMs, 8 * 60_000);
});

test("logical-day reconciliation crosses a daylight-saving boundary using local reset time", () => {
  const previousTimezone = process.env.TZ;
  process.env.TZ = "America/New_York";
  try {
    const beforeReset = new Date("2026-03-08T07:30:00.000Z");
    const afterReset = new Date("2026-03-08T08:30:00.000Z");
    assert.equal(getHabitDateKey(beforeReset, 4), "2026-03-07");
    assert.equal(getHabitDateKey(afterReset, 4), "2026-03-08");
  } finally {
    if (previousTimezone === undefined) delete process.env.TZ;
    else process.env.TZ = previousTimezone;
  }
});

test("startup and resume refreshes reconcile date and timer state without a new scheduler", () => {
  assert.ok(appSource.includes("syncHabitDay();"), "App synchronizes logical day immediately at startup");
  assert.ok(appSource.includes('window.addEventListener("focus", syncHabitDay)'));
  assert.ok(appSource.includes('document.addEventListener("visibilitychange", syncHabitDay)'));
  assert.ok(appSource.includes("setProjectStatusDate(getDateKey(new Date()))"));
  assert.ok(appSource.includes("setTodayDateKey(currentDateKey)"));
  assert.ok(appSource.includes("recalculateProjectStatuses(projectRecords, milestones, tasks, projectStatusDate)"));
  assert.ok(timerSource.includes("tick();"), "restored timer deadlines process immediately on mount");
  assert.ok(timerSource.includes('document.addEventListener("visibilitychange", handleVisibility)'));
  assert.ok(timerSource.includes("if (shouldLogSession("), "timer completion keys guard replayed restore events");
  assert.ok(!appSource.includes("setInterval(syncHabitDay, 1)"), "reconciliation does not add a high-frequency scheduler");
});
