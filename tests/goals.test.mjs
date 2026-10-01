import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateGoalProgress,
  detachTasksFromDeletedMilestone,
  disassociateGoalFocusSessions,
} from "../src/domain/goals.ts";
import { getTodayKey, shiftDateKey } from "../src/utils/dates.ts";

test("deleting a milestone detaches its Tasks and retains their Goal", () => {
  const milestone = { id: "milestone-1", goalId: "goal-1", title: "Milestone", completed: false };
  const tasks = [
    { id: "task-1", title: "Linked", milestoneId: milestone.id, completed: false, priority: "medium", createdAt: "2025-01-01" },
    { id: "task-2", title: "Already general", goalId: milestone.goalId, completed: false, priority: "medium", createdAt: "2025-01-01" },
  ];

  assert.deepEqual(detachTasksFromDeletedMilestone(tasks, milestone), [
    { ...tasks[0], goalId: milestone.goalId, milestoneId: undefined },
    tasks[1],
  ]);
});

test("deleting a Goal disassociates historical Focus Sessions and removed child links", () => {
  const sessions = [
    { id: 1, timestamp: 1, sessionType: "Timer", durationMinutes: 20, habitName: "One", goalId: "goal-1" },
    { id: 2, timestamp: 2, sessionType: "Timer", durationMinutes: 20, habitName: "Two", milestoneId: "milestone-1" },
    { id: 3, timestamp: 3, sessionType: "Timer", durationMinutes: 20, habitName: "Three", taskId: "task-1" },
    { id: 4, timestamp: 4, sessionType: "Timer", durationMinutes: 20, habitName: "Unrelated", goalId: "goal-2" },
  ];

  const updated = disassociateGoalFocusSessions(
    sessions,
    "goal-1",
    new Set(["milestone-1"]),
    new Set(["task-1"]),
  );

  assert.equal(updated[0].goalId, undefined);
  assert.equal(updated[1].milestoneId, undefined);
  assert.equal(updated[2].taskId, undefined);
  assert.equal(updated[3], sessions[3]);
});

test("Goal progress uses item completion and segment widths stay within 0-100", () => {
  const goal = { id: "goal-1", title: "Goal", status: "active", createdAt: "2025-01-01" };
  const tasks = [
    { id: "task-1", goalId: goal.id, title: "Done", completed: true, priority: "medium", createdAt: "2025-01-01" },
    { id: "task-2", goalId: goal.id, title: "Open", completed: false, priority: "medium", createdAt: "2025-01-01" },
    { id: "task-3", goalId: goal.id, title: "Open", completed: false, priority: "medium", createdAt: "2025-01-01" },
  ];
  const progress = calculateGoalProgress(goal, [], tasks);

  assert.equal(progress.percent, 33);
  assert.equal(progress.completed, 1);
  assert.equal(progress.total, 3);
  assert.equal(progress.taskSegmentWidth, 33);
  assert.ok([progress.taskSegmentWidth, progress.milestoneSegmentWidth, progress.habitSegmentWidth]
    .every((width) => width >= 0 && width <= 100));
});

test("completed task, milestone, and habit categories share one progress bar", () => {
  const goal = { id: "goal-segments", title: "Segments", status: "active", createdAt: "2025-01-01" };
  const today = getTodayKey(0);
  const completedDates = Array.from({ length: 10 }, (_, index) => shiftDateKey(today, -index));
  const tasks = [
    { id: "task-1", goalId: goal.id, title: "Done", completed: true, priority: "medium", createdAt: today },
    { id: "task-2", goalId: goal.id, title: "Open", completed: false, priority: "medium", createdAt: today },
  ];
  const milestones = [
    { id: "milestone-1", goalId: goal.id, title: "Done", completed: true },
    { id: "milestone-2", goalId: goal.id, title: "Open", completed: false },
  ];
  const habits = [{
    id: 9,
    name: "Streak",
    goalId: goal.id,
    priority: "Optional",
    type: "Daily",
    completedDates,
  }];
  const progress = calculateGoalProgress(goal, milestones, tasks, habits, false, 0);

  assert.equal(progress.percent, 50);
  assert.equal(progress.taskSegmentWidth, 25);
  assert.equal(progress.milestoneSegmentWidth, 15);
  assert.equal(progress.habitSegmentWidth, 20);
  assert.equal(
    progress.taskSegmentWidth + progress.milestoneSegmentWidth + progress.habitSegmentWidth,
    60,
  );
});

test("habit-only progress does not report completed Goal items", () => {
  const goal = { id: "goal-1", title: "Goal", status: "active", createdAt: "2025-01-01" };
  const today = getTodayKey(0);
  const habit = {
    id: 1,
    name: "Linked Habit",
    goalId: goal.id,
    priority: "Optional",
    type: "Daily",
    completedDates: Array.from({ length: 12 }, (_, index) => shiftDateKey(today, -index)),
  };
  const progress = calculateGoalProgress(goal, [], [], [habit], false, 0);

  assert.equal(progress.total, 0);
  assert.equal(progress.completed, 0);
  assert.equal(progress.percent, 0);
  assert.equal(progress.habitWeight, 100);
});