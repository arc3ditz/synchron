import assert from "node:assert/strict";
import test from "node:test";
import { filterTasksForFocusSelection } from "../src/domain/tasks.ts";

const tasks = [
  { id: "direct-1", projectId: "project-1", title: "First", completed: false },
  { id: "direct-2", projectId: "project-1", title: "Second", completed: false },
  { id: "milestone-task", projectId: "project-1", milestoneId: "milestone-1", title: "Milestone", completed: false },
  { id: "other-project", projectId: "project-2", title: "Other", completed: false },
  { id: "standalone", title: "Standalone", completed: false },
];

test("selecting a Project exposes its direct Tasks", () => {
  assert.deepEqual(
    filterTasksForFocusSelection(tasks, "", "", "project-1").map((task) => task.id),
    ["direct-1", "direct-2"],
  );
});

test("selecting a Milestone keeps Task filtering scoped to that Milestone", () => {
  assert.deepEqual(
    filterTasksForFocusSelection(tasks, "", "milestone-1").map((task) => task.id),
    ["milestone-task"],
  );
});

test("no selection exposes all Tasks including standalone work", () => {
  assert.deepEqual(
    filterTasksForFocusSelection(tasks, "", "").map((task) => task.id),
    ["direct-1", "direct-2", "milestone-task", "other-project", "standalone"],
  );
});
