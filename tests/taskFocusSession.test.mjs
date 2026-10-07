import assert from "node:assert/strict";
import test from "node:test";
import { buildFocusSessionRecord } from "../src/domain/focusTimer.ts";
import { completeTask } from "../src/domain/tasks.ts";

const tasks = [
  { id: "task-1", goalId: "goal-1", projectId: "project-1", milestoneId: "milestone-1", title: "Deep work", completed: false },
  { id: "task-2", goalId: "goal-1", title: "No project", completed: false },
  { id: "task-done", goalId: "goal-1", title: "Already done", completed: true },
];

const milestones = [
  { id: "milestone-1", goalId: "goal-1", projectId: "project-1", title: "M1", completed: false },
  { id: "milestone-2", goalId: "goal-2", projectId: "project-2", title: "M2", completed: false },
];

const baseInput = {
  sessionType: "Timer",
  durationMinutes: 25,
  habitName: "General Focus",
};

test("a Focus session persists the Task ID with its Goal/Milestone context", () => {
  const record = buildFocusSessionRecord(
    { ...baseInput, goalId: "goal-1", milestoneId: "milestone-1", taskId: "task-1" },
    { tasks, milestones },
    { id: 1, timestamp: 1000 },
  );

  assert.equal(record.taskId, "task-1");
  assert.equal(record.goalId, "goal-1");
  assert.equal(record.milestoneId, "milestone-1");
  assert.equal(record.sessionType, "Timer");
  assert.equal(record.durationMinutes, 25);
});

test("the Task's Project is preserved on the Focus session", () => {
  const record = buildFocusSessionRecord(
    { ...baseInput, goalId: "goal-1", milestoneId: "milestone-1", taskId: "task-1" },
    { tasks, milestones },
    { id: 2, timestamp: 2000 },
  );

  assert.equal(record.projectId, "project-1");
});

test("the Project falls back to the Milestone when the Task has none", () => {
  const record = buildFocusSessionRecord(
    { ...baseInput, goalId: "goal-2", milestoneId: "milestone-2", taskId: "task-2" },
    { tasks, milestones },
    { id: 3, timestamp: 3000 },
  );

  assert.equal(record.taskId, "task-2");
  assert.equal(record.projectId, "project-2");
});

test("sessions without a Task keep working and carry no Task ID", () => {
  const record = buildFocusSessionRecord(
    { ...baseInput, habitId: 7 },
    { tasks, milestones },
    { id: 4, timestamp: 4000 },
  );

  assert.equal(record.taskId, undefined);
  assert.equal(record.projectId, undefined);
  assert.equal(record.habitId, 7);
  assert.equal(record.habitName, "General Focus");
});

test("a session linked to a deleted Task keeps its IDs but resolves no Project", () => {
  const record = buildFocusSessionRecord(
    { ...baseInput, goalId: "goal-1", milestoneId: "milestone-1", taskId: "gone" },
    { tasks, milestones },
    { id: 5, timestamp: 5000 },
  );

  assert.equal(record.taskId, "gone");
  assert.equal(record.projectId, "project-1");
});

test("completing a Task sets completed without touching its context", () => {
  const task = tasks[0];
  const completed = completeTask(task);

  assert.equal(completed.completed, true);
  assert.equal(completed.id, "task-1");
  assert.equal(completed.goalId, "goal-1");
  assert.equal(completed.projectId, "project-1");
  assert.equal(completed.milestoneId, "milestone-1");
  assert.equal(task.completed, false);
});

test("completing an already completed Task is a no-op and never reopens it", () => {
  const completed = completeTask(tasks[2]);

  assert.equal(completed.completed, true);
  assert.equal(completed, tasks[2]);
});
