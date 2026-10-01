import assert from "node:assert/strict";
import test from "node:test";
import { filterTasksForFocusSelection } from "../src/domain/tasks.ts";

const tasks = [
  { id: "direct-1", goalId: "goal-1", title: "First", completed: false },
  { id: "direct-2", goalId: "goal-1", title: "Second", completed: false },
  { id: "milestone-task", goalId: "goal-1", milestoneId: "milestone-1", title: "Milestone", completed: false },
  { id: "other-goal", goalId: "goal-2", title: "Other", completed: false },
];

test("selecting a Goal exposes all its direct Tasks without a Milestone", () => {
  assert.deepEqual(
    filterTasksForFocusSelection(tasks, "goal-1", "").map((task) => task.id),
    ["direct-1", "direct-2"],
  );
});

test("selecting a Milestone keeps Task filtering scoped to that Milestone", () => {
  assert.deepEqual(
    filterTasksForFocusSelection(tasks, "goal-1", "milestone-1").map((task) => task.id),
    ["milestone-task"],
  );
});

test("no selection does not expose unrelated Tasks", () => {
  assert.deepEqual(filterTasksForFocusSelection(tasks, "", ""), []);
});