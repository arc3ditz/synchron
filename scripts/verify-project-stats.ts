/**
 * Verification for the honest project row summary.
 * Run: node --experimental-strip-types scripts/verify-project-stats.ts
 */

const storeMap = new Map<string, string>();

const localStorageMock = {
  getItem(key: string) {
    return storeMap.has(key) ? (storeMap.get(key) as string) : null;
  },
  setItem(key: string, value: string) {
    storeMap.set(key, value);
  },
  removeItem(key: string) {
    storeMap.delete(key);
  },
  clear() {
    storeMap.clear();
  },
};

(globalThis as unknown as { window: unknown }).window = { localStorage: localStorageMock };

const { createAction, completeActionRecord } = await import("../src/actionStore.ts");
const { formatProjectCountLabel, buildProjectSummary } = await import("../src/projectStats.ts");
const { projectLastActivityAt } = await import("../src/projectActivity.ts");
const { createProject } = await import("../src/projectStore.ts");
import type { Action } from "../src/actionStore.ts";
import type { Project } from "../src/projectStore.ts";

let failures = 0;

function check(label: string, condition: boolean, detail?: unknown) {
  if (condition) {
    console.log(`  ok  ${label}`);
  } else {
    failures += 1;
    console.log(`FAIL  ${label}`, detail === undefined ? "" : detail);
  }
}

const created = "2026-10-01T12:00:00";
const lastWeek = "2026-10-18T12:00:00";
const today = "2026-10-25";

function project(overrides: Partial<Project> & { id: string }): Project {
  return {
    name: overrides.id,
    status: "active",
    createdAt: created,
    updatedAt: created,
    notes: [],
    decisions: [],
    ...overrides,
  };
}

function link(action: Action, projectId: string): Action {
  return { ...action, projectId };
}

console.log("Count label wording");

check("no work on either side says so plainly", formatProjectCountLabel(0, 0) === "No open actions");
check("one open action is counted", formatProjectCountLabel(1, 0) === "1 open action");
check("several open actions are counted", formatProjectCountLabel(4, 0) === "4 open actions");
check("completed work is mentioned after the open count", formatProjectCountLabel(2, 3) === "2 open actions · 3 completed");
check("a single completed mention is not pluralized", formatProjectCountLabel(2, 1) === "2 open actions · 1 completed");
check("only-completed projects say so", formatProjectCountLabel(0, 2) === "2 completed");

console.log("Summary contents");

const target = project({ id: "target", name: "Target" });
const ownOpen = link(createAction("Own next thing", { importance: "high" }, created), "target");
const otherOpen = createAction("Another project's work", {}, created);
const ownDone = completeActionRecord(link(createAction("Own finished thing", {}, created), "target"), lastWeek);

const summary = buildProjectSummary(target, [ownOpen, otherOpen, ownDone]);
check("only the project's own actions are counted", summary.openCount === 1 && summary.completedCount === 1);
check("the next action is the project's own ranking choice", summary.next?.action.id === ownOpen.id);
check("the stated reason is the action's own", typeof summary.next?.reason === "string" && summary.next.reason.length > 0);
check("last activity is the shared project measure", summary.lastActivityAt === projectLastActivityAt(target, [ownOpen, otherOpen, ownDone]));

check(
  "with nothing recorded, counts are real zeros and no next is invented",
  buildProjectSummary(project({ id: "empty", name: "Empty" }), [otherOpen]).openCount === 0 &&
    buildProjectSummary(project({ id: "empty", name: "Empty" }), [otherOpen]).completedCount === 0 &&
    buildProjectSummary(project({ id: "empty", name: "Empty" }), [otherOpen]).next === undefined,
);

const nothing = buildProjectSummary(project({ id: "empty2", name: "Empty two" }), []);
check("a fresh project reads as untouched", nothing.openCount === 0 && nothing.completedCount === 0 && nothing.next === undefined);

console.log("Next action comes from the same ranking");

const dueSoon = link(createAction("Due first", { dueDate: "2026-11-05" }, lastWeek), "target");
const highImportance = link(createAction("Important but undated", { importance: "high" }, created), "target");
const ranked = buildProjectSummary(target, [highImportance, dueSoon]);
check("a due commitment outranks importance", ranked.next?.action.id === dueSoon.id);

console.log("Formats are deterministic");

check(
  "the same inputs always produce the same label",
  formatProjectCountLabel(3, 2) === formatProjectCountLabel(3, 2),
);

console.log("");
if (failures > 0) {
  console.log(`${failures} check(s) failed.`);
  process.exit(1);
}
console.log("All project summary checks passed.");
