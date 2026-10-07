import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { updateTask } from "../src/domain/tasks.ts";
import { buildDailyTimeline, timeToMinutes } from "../src/domain/timeline.ts";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const tasksSource = readFileSync(path.join(root, "src/components/Tasks.tsx"), "utf8");

function makeTask(overrides = {}) {
  return {
    id: "t-1",
    title: "Write report",
    completed: false,
    priority: "medium",
    createdAt: new Date(2025, 4, 14, 8, 0).toISOString(),
    ...overrides,
  };
}

function timelineInput(tasks) {
  return {
    habits: [],
    tasks,
    goals: [],
    milestones: [],
    projects: [],
    focusSessions: [],
    todayKey: "2025-05-14",
    dayResetHour: 0,
    now: new Date(2025, 4, 14, 12, 0),
  };
}

test("task edit preserves existing fields while updating scheduling info", () => {
  const task = makeTask({
    dueDate: "2025-05-14",
    estimatedMinutes: 45,
    goalId: "goal-1",
    projectId: "project-1",
    milestoneId: "m-1",
  });
  const updated = updateTask(task, {
    title: task.title,
    priority: task.priority,
    dueDate: task.dueDate,
    estimatedMinutes: task.estimatedMinutes,
    scheduledTime: "09:30",
    durationMinutes: 25,
    goalId: task.goalId,
    projectId: task.projectId,
    milestoneId: task.milestoneId,
  });

  assert.equal(updated.scheduledTime, "09:30");
  assert.equal(updated.durationMinutes, 25);
  assert.equal(updated.title, "Write report");
  assert.equal(updated.priority, "medium");
  assert.equal(updated.dueDate, "2025-05-14");
  assert.equal(updated.estimatedMinutes, 45);
  assert.equal(updated.goalId, "goal-1");
  assert.equal(updated.projectId, "project-1");
  assert.equal(updated.milestoneId, "m-1");
  assert.equal(updated.completed, false);
});

test("clearing the scheduled time clears the duration, matching Today", () => {
  const task = makeTask({ scheduledTime: "09:30", durationMinutes: 25, estimatedMinutes: 45 });
  const scheduledTime = "" || undefined;
  const updated = updateTask(task, {
    title: task.title,
    priority: task.priority,
    dueDate: undefined,
    estimatedMinutes: task.estimatedMinutes,
    scheduledTime,
    durationMinutes: scheduledTime ? 25 : undefined,
    goalId: undefined,
    projectId: undefined,
    milestoneId: undefined,
  });

  assert.equal(updated.scheduledTime, undefined);
  assert.equal(updated.durationMinutes, undefined);
  assert.equal(updated.estimatedMinutes, 45);
});

test("a task scheduled from Tasks appears on the Today timeline", () => {
  const scheduled = updateTask(makeTask({ dueDate: "2025-05-14", estimatedMinutes: 45 }), {
    title: "Write report",
    priority: "medium",
    dueDate: "2025-05-14",
    estimatedMinutes: 45,
    scheduledTime: "09:30",
    durationMinutes: 25,
    goalId: undefined,
    projectId: undefined,
    milestoneId: undefined,
  });
  const blocks = buildDailyTimeline(timelineInput([scheduled]));
  const block = blocks.find((entry) => entry.kind === "task" && entry.taskId === "t-1");

  assert.ok(block, "scheduled task must produce a timeline block");
  assert.equal(block.time, "09:30");
  assert.equal(block.sortMinutes, timeToMinutes("09:30"));
  assert.equal(block.durationMinutes, 25);
});

test("invalid scheduled times never render, reusing the shared validation", () => {
  const blocks = buildDailyTimeline(timelineInput([makeTask({ scheduledTime: "9am" })]));
  assert.ok(!blocks.some((entry) => entry.kind === "task"), "invalid times must not render");
});

test("Tasks edit form exposes the full scheduling model on the same task data", () => {
  for (const needle of [
    "editScheduledTime",
    "editDurationMinutes",
    "task.scheduledTime ?? ",
    "task.durationMinutes?.toString()",
    "scheduledTime,",
    "durationMinutes: scheduledTime ? parseMinutes(editDurationMinutes) : undefined",
    'aria-label="Scheduled Time"',
    'aria-label="Duration in Minutes"',
    "Scheduled {task.scheduledTime}",
    "task.durationMinutes ?? task.estimatedMinutes",
  ]) {
    assert.ok(tasksSource.includes(needle), `Tasks edit form must include ${needle}`);
  }
});
