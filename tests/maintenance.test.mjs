import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { isTaskStaleBacklog, STALE_OVERDUE_DAYS } from "../src/domain/nextStep.ts";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const tasksSource = readFileSync(path.join(root, "src/components/Tasks.tsx"), "utf8");
const todaySource = readFileSync(path.join(root, "src/components/Today.tsx"), "utf8");
const appSource = readFileSync(path.join(root, "src/App.tsx"), "utf8");

const TODAY = "2026-10-09";

function makeTask(overrides = {}) {
  return {
    id: "t",
    title: "T",
    completed: false,
    priority: "medium",
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

// --- Stale-backlog definition: one shared rule for display and ranking ---

test("stale means overdue beyond the shared threshold, nothing else", () => {
  assert.equal(STALE_OVERDUE_DAYS, 7);
  // Age exactly 7 days is still fresh overdue; 8+ is backlog.
  assert.equal(isTaskStaleBacklog(makeTask({ dueDate: "2026-10-02" }), TODAY), false);
  assert.equal(isTaskStaleBacklog(makeTask({ dueDate: "2026-10-01" }), TODAY), true);
  assert.equal(isTaskStaleBacklog(makeTask({ dueDate: TODAY }), TODAY), false);
  assert.equal(isTaskStaleBacklog(makeTask({ dueDate: "2026-10-10" }), TODAY), false);
  assert.equal(isTaskStaleBacklog(makeTask({}), TODAY), false, "no due date is never backlog");
});

test("stale work is quieted, never hidden, deleted, or rescheduled", () => {
  for (const [name, source] of [["Tasks", tasksSource], ["Today", todaySource]]) {
    assert.ok(source.includes("isTaskStaleBacklog"), `${name} must reuse the shared definition`);
    assert.ok(source.includes("Backlog since"), `${name} must label stale work truthfully`);
  }
  // No destructive handling anywhere near the stale path.
  for (const source of [tasksSource, todaySource, appSource]) {
    assert.ok(!source.includes("isTaskStaleBacklog(task") || !/deleteTask\(.*stale|stale.*deleteTask/i.test(source));
  }
  assert.ok(tasksSource.includes("statusFilter"), "completed work stays reachable via filters");
  assert.ok(todaySource.includes("Completed ("), "completed work stays visible on Today");
});

// --- Rescheduling from Today rows: one tap into the existing prefilled modal ---

test("Today task and habit rows open the existing schedule modal", () => {
  const row = todaySource.match(/function renderTaskRow[\s\S]*?\n  \}\n/);
  assert.ok(row);
  assert.ok(row[0].includes('openScheduleModal("task", task.id)'), "task rows schedule in place");
  assert.ok(
    todaySource.includes('openScheduleModal("habit", habit.id)'),
    "habit rows schedule in place",
  );
  const opener = todaySource.match(/const openScheduleModal[\s\S]*?\n  \};/);
  assert.ok(opener);
  assert.ok(opener[0].includes("item.scheduledTime || "), "modal prefills the known time — no re-entry");
  assert.ok(opener[0].includes("item.durationMinutes || estimatedMinutes"), "modal prefills the known duration");
});

test("creation stays minimal: title/name only, everything else defaulted or optional", () => {
  const addForm = tasksSource.match(/function handleAddSubmit[\s\S]*?\n  \}/);
  assert.ok(addForm);
  assert.ok(addForm[0].includes("dueDate: dueDate || undefined"), "due date stays optional on creation");
  assert.ok(addForm[0].includes("goalId: goalId || undefined"), "links stay optional on creation");
  assert.ok(
    appSource.includes("frequencyType: newFrequencyType") && appSource.includes('priority: newPriority'),
    "habit creation keeps working defaults",
  );
});

test("no automatic destructive rescheduling on complete, toggle, or load paths", () => {
  for (const name of ["handleToggleTask", "handleCompleteTaskFromFocus"]) {
    const handler = appSource.match(new RegExp(`function ${name}[\\s\\S]*?\\n  \\}`));
    assert.ok(handler, `App must define ${name}`);
    assert.ok(!handler[0].includes("dueDate"), `${name} must not touch due dates`);
    assert.ok(!handler[0].includes("deleteTask"), `${name} must not delete`);
  }
  assert.ok(!appSource.includes("shiftDateKey(task.dueDate"), "no bulk due-date shifting on load");
});
