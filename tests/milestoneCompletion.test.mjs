import assert from "node:assert/strict";
import test from "node:test";
import { synchronizeMilestoneTaskCompletion } from "../src/domain/milestoneCompletion.ts";
import { selectTodayTasks } from "../src/domain/tasks.ts";

const milestone = (id, completed = false) => ({ id, title: `Milestone ${id}`, completed });
const task = (id, milestoneId, completed, extra = {}) => ({
  id,
  milestoneId,
  title: `Task ${id}`,
  completed,
  priority: "medium",
  createdAt: "2026-01-01",
  ...extra,
});

test("a milestone completes only when all of its linked tasks are complete", () => {
  const tasks = [task("a", "m", true), task("b", "m", true)];
  assert.equal(synchronizeMilestoneTaskCompletion(tasks, [milestone("m")]).milestones[0].completed, true);
  assert.equal(
    synchronizeMilestoneTaskCompletion([tasks[0], { ...tasks[1], completed: false }], [milestone("m", true)])
      .milestones[0].completed,
    false,
  );
});

test("manually completing a milestone completes each linked task without changing other properties", () => {
  const first = task("a", "m", false, { dueDate: "2026-12-01", projectId: "p", isBacklog: true });
  const unrelated = task("x", "other", false, { dueDate: "2026-11-01" });
  const result = synchronizeMilestoneTaskCompletion(
    [first, unrelated],
    [milestone("m"), milestone("other")],
    "m",
  );

  assert.equal(result.tasks[0].completed, true);
  assert.equal(result.tasks[0].title, first.title);
  assert.equal(result.tasks[0].dueDate, first.dueDate);
  assert.equal(result.tasks[0].projectId, first.projectId);
  assert.equal(result.tasks[0].isBacklog, first.isBacklog);
  assert.equal(result.tasks[1], unrelated);
  assert.equal(result.milestones[0].completed, true);
  assert.equal(result.milestones[1].completed, false);
});

test("repeated milestone completion requests synchronize once without producing new state", () => {
  const initialTasks = [task("a", "m", false), task("b", "m", false)];
  const initialMilestones = [milestone("m")];
  const completed = synchronizeMilestoneTaskCompletion(initialTasks, initialMilestones, "m", true);
  const repeated = synchronizeMilestoneTaskCompletion(completed.tasks, completed.milestones, "m", true);

  assert.deepEqual(completed.tasks.map((item) => item.completed), [true, true]);
  assert.equal(completed.milestones[0].completed, true);
  assert.equal(repeated.tasks, completed.tasks);
  assert.equal(repeated.milestones, completed.milestones);
});

test("manually reopening a milestone reopens all and only its linked tasks", () => {
  const linked = [task("a", "m", true), task("b", "m", true)];
  const unrelated = task("x", "other", true);
  const result = synchronizeMilestoneTaskCompletion(
    [...linked, unrelated],
    [milestone("m", true), milestone("other", true)],
    "m",
  );

  assert.deepEqual(result.tasks.slice(0, 2).map((item) => item.completed), [false, false]);
  assert.equal(result.tasks[2], unrelated);
  assert.equal(result.milestones[0].completed, false);
  assert.equal(result.milestones[1].completed, true);
});

test("reopening one task reopens its milestone but leaves sibling task completion unchanged", () => {
  const completed = task("a", "m", true);
  const sibling = task("b", "m", true);
  const result = synchronizeMilestoneTaskCompletion(
    [{ ...completed, completed: false }, sibling],
    [milestone("m", true)],
  );

  assert.equal(result.milestones[0].completed, false);
  assert.equal(result.tasks[0].completed, false);
  assert.equal(result.tasks[1], sibling);
});

test("project-linked task completion removes it from Today and reopening restores it", () => {
  const linkedTask = task("linked", "m", false, { projectId: "p" });
  const milestoneItem = milestone("m");
  const completed = synchronizeMilestoneTaskCompletion(
    [{ ...linkedTask, completed: true }],
    [milestoneItem],
  );
  assert.equal(completed.milestones[0].completed, true);
  assert.deepEqual(selectTodayTasks(completed.tasks, {
    milestones: completed.milestones,
    todayKey: "2026-01-01",
  }), []);

  const reopened = synchronizeMilestoneTaskCompletion(
    [{ ...completed.tasks[0], completed: false }],
    completed.milestones,
  );
  assert.equal(reopened.milestones[0].completed, false);
  assert.deepEqual(
    selectTodayTasks(reopened.tasks, { milestones: reopened.milestones, todayKey: "2026-01-01" })
      .map((item) => item.id),
    ["linked"],
  );
});

test("milestones without linked tasks remain manually completable", () => {
  const result = synchronizeMilestoneTaskCompletion([], [milestone("m")], "m");
  assert.equal(result.milestones[0].completed, true);
  assert.deepEqual(result.tasks, []);
});

test("linking an incomplete task reopens a completed milestone", () => {
  const result = synchronizeMilestoneTaskCompletion(
    [task("new", "m", false)],
    [milestone("m", true)],
  );
  assert.equal(result.milestones[0].completed, false);
  assert.equal(result.tasks[0].completed, false);
});

test("deletion and reassignment recalculate each affected milestone independently", () => {
  const source = milestone("source", true);
  const destination = milestone("destination", true);
  const remaining = task("remaining", "source", true);
  const reassigned = task("move", "source", false);
  const movedResult = synchronizeMilestoneTaskCompletion(
    [remaining, { ...reassigned, milestoneId: "destination" }],
    [source, destination],
  );
  assert.equal(movedResult.milestones[0].completed, true);
  assert.equal(movedResult.milestones[1].completed, false);

  const deletedResult = synchronizeMilestoneTaskCompletion(
    [remaining],
    [milestone("source", false)],
  );
  assert.equal(deletedResult.milestones[0].completed, true);
});
