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

  assert.equal(progress.percent, 60);
  assert.equal(progress.taskSegmentWidth, 25);
  assert.equal(progress.milestoneSegmentWidth, 15);
  assert.equal(progress.habitSegmentWidth, 20);
  assert.equal(
    progress.taskSegmentWidth + progress.milestoneSegmentWidth + progress.habitSegmentWidth,
    progress.percent,
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
  assert.equal(progress.habitWeight, 100);
  // Percent stays mathematically consistent with the segment breakdown.
  assert.equal(progress.percent, progress.habitSegmentWidth);
});
test("Goal progress includes work reached through its Projects", () => {
  const goal = { id: "goal-1", title: "Goal", status: "active", createdAt: "2025-01-01" };
  const projects = [
    { id: "project-1", goalId: goal.id, name: "P1", status: "active", createdAt: "2025-01-01" },
    { id: "project-2", name: "Independent", status: "active", createdAt: "2025-01-01" },
  ];
  const milestones = [
    { id: "m-1", projectId: "project-1", title: "Via project", completed: true },
    { id: "m-2", projectId: "project-2", title: "Other project", completed: true },
    { id: "m-3", goalId: goal.id, title: "Direct", completed: false },
  ];
  const tasks = [
    { id: "t-1", projectId: "project-1", title: "Via project", completed: true, priority: "medium", createdAt: "2025-01-01" },
    { id: "t-2", milestoneId: "m-1", title: "Via project milestone", completed: false, priority: "medium", createdAt: "2025-01-01" },
    { id: "t-3", projectId: "project-2", title: "Other project", completed: true, priority: "medium", createdAt: "2025-01-01" },
  ];

  const progress = calculateGoalProgress(goal, milestones, tasks, undefined, undefined, undefined, projects);

  assert.equal(progress.total, 4); // m-1, m-3, t-1, t-2
  assert.equal(progress.completed, 2); // m-1, t-1
});

test("Goal progress does not double-count directly and indirectly linked items", () => {
  const goal = { id: "goal-1", title: "Goal", status: "active", createdAt: "2025-01-01" };
  const projects = [
    { id: "project-1", goalId: goal.id, name: "P1", status: "active", createdAt: "2025-01-01" },
  ];
  const milestones = [
    { id: "m-1", goalId: goal.id, projectId: "project-1", title: "Both", completed: true },
  ];
  const tasks = [
    { id: "t-1", goalId: goal.id, projectId: "project-1", milestoneId: "m-1", title: "All links", completed: true, priority: "medium", createdAt: "2025-01-01" },
  ];

  const progress = calculateGoalProgress(goal, milestones, tasks, undefined, undefined, undefined, projects);

  assert.equal(progress.total, 2);
  assert.equal(progress.completed, 2);
});

test("Independent tasks and milestones still contribute only when directly linked", () => {
  const goal = { id: "goal-1", title: "Goal", status: "active", createdAt: "2025-01-01" };
  const milestones = [{ id: "m-1", title: "Orphan", completed: true }];
  const tasks = [
    { id: "t-1", title: "Orphan", completed: true, priority: "medium", createdAt: "2025-01-01" },
  ];

  const progress = calculateGoalProgress(goal, milestones, tasks);

  assert.equal(progress.total, 0);
  assert.equal(progress.completed, 0);
  assert.equal(progress.percent, 0);
});

test("Goal progress includes Tasks reached only through a Project", () => {
  const goal = { id: "goal-1", title: "Goal", status: "active", createdAt: "2025-01-01" };
  const projects = [
    { id: "project-1", goalId: goal.id, name: "P1", status: "active", createdAt: "2025-01-01" },
  ];
  const tasks = [
    { id: "t-1", projectId: "project-1", title: "Only via project", completed: true, priority: "medium", createdAt: "2025-01-01" },
  ];

  const progress = calculateGoalProgress(goal, [], tasks, undefined, undefined, undefined, projects);

  assert.equal(progress.total, 1);
  assert.equal(progress.completed, 1);
});

test("Goal progress includes Milestones reached only through a Project", () => {
  const goal = { id: "goal-1", title: "Goal", status: "active", createdAt: "2025-01-01" };
  const projects = [
    { id: "project-1", goalId: goal.id, name: "P1", status: "active", createdAt: "2025-01-01" },
  ];
  const milestones = [
    { id: "m-1", projectId: "project-1", title: "Only via project", completed: false },
  ];

  const progress = calculateGoalProgress(goal, milestones, [], undefined, undefined, undefined, projects);

  assert.equal(progress.total, 1);
  assert.equal(progress.completed, 0);
});
