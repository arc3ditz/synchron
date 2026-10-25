import {
  completeActionRecord,
  getActionReasons,
  isScheduledForToday,
  loadActionStore,
  localDateKey,
  prioritizeActions,
  reopenActionRecord,
  updateActionRecord,
  type Action,
} from "../src/actionStore.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function action(id: string, changes: Partial<Action> = {}): Action {
  return { id, title: id, status: "open", createdAt: `2026-10-25T00:00:0${id.length}Z`, importance: "normal", ...changes };
}

const today = "2026-10-25";
const ordered = prioritizeActions([
  action("future-critical", { dueDate: "2026-10-26", importance: "critical" }),
  action("focused-low", { focusedDate: today, importance: "low" }),
  action("overdue-high", { dueDate: "2026-10-24", importance: "high" }),
  action("today-normal", { dueDate: today }),
], today);
assert(ordered.map(({ id }) => id).join(",") === "overdue-high,today-normal,focused-low", "Scheduling precedence is incorrect");
assert(!isScheduledForToday(action("future"), today), "Future actions must not appear in Today");
assert(getActionReasons(action("focused", { focusedDate: today }), today)[0] === "In today’s focus", "Focus reason is missing");
assert(localDateKey(new Date(2026, 9, 25, 23, 59)) === "2026-10-25", "Local date boundary changed the date key");

const focused = action("focused", { dueDate: "2026-10-30", focusedDate: today, effortMinutes: 30 });
const completed = completeActionRecord(focused, "2026-10-25T12:00:00.000Z");
assert(completed.status === "completed" && completed.completedAt !== undefined && completed.focusedDate === undefined, "Completion did not leave active focus");
const reopened = reopenActionRecord(completed);
assert(reopened.status === "open" && reopened.completedAt === undefined && reopened.dueDate === "2026-10-30", "Reopening changed completion history or due date");
const cleared = updateActionRecord(reopened, { dueDate: undefined, effortMinutes: undefined });
assert(cleared.dueDate === undefined && cleared.effortMinutes === undefined, "Optional fields were not removable");

const storage = {
  getItem: () => JSON.stringify({ actions: [{ id: "legacy", title: "Legacy", status: "open", createdAt: "2026-10-20T00:00:00.000Z", important: true }], inbox: [] }),
};
(globalThis as { window?: unknown }).window = { localStorage: storage };
const migrated = loadActionStore();
assert(migrated.actions[0]?.importance === "high", "Legacy important records were not migrated");
assert(migrated.actions[0]?.dueDate === undefined, "Migration invented a due date");

console.log("Scheduling checks passed: precedence, focus independence, local date handling, and legacy normalization.");
