/**
 * Ad-hoc verification for the Home overview rules.
 * Run: node --experimental-strip-types scripts/verify-home-overview.ts
 */

import type { Action } from "../src/actionStore.ts";
import { projectActivityTargetId } from "../src/projectActivity.ts";
import type { Project } from "../src/projectStore.ts";

const storeMap = new Map<string, string>();

(globalThis as unknown as { window: unknown }).window = {
  localStorage: {
    getItem: (key: string) => (storeMap.has(key) ? (storeMap.get(key) as string) : null),
    setItem: (key: string, value: string) => {
      storeMap.set(key, value);
    },
    removeItem: (key: string) => {
      storeMap.delete(key);
    },
    clear: () => {
      storeMap.clear();
    },
  },
};

const { buildHomeAttention, buildHomeContext, daysSince, formatQuietSpan, selectContinueProject } =
  await import("../src/homeOverview.ts");

let failures = 0;

function check(label: string, condition: boolean, detail?: unknown) {
  if (condition) {
    console.log(`  ok  ${label}`);
  } else {
    failures += 1;
    console.log(`FAIL  ${label}`, detail === undefined ? "" : detail);
  }
}

// Timestamps are written without a zone so the day arithmetic in the rules
// reads the same local day the test describes.
const created = "2026-10-01T12:00:00";
const yesterday = "2026-10-24T12:00:00";
const twoDaysAgo = "2026-10-23T12:00:00";
const lastWeek = "2026-10-18T12:00:00";
const lastMonth = "2026-09-20T12:00:00";
const longAgo = "2026-06-01T12:00:00";
const today = "2026-10-25";

function action(overrides: Partial<Action> & { id: string }): Action {
  return {
    title: overrides.id,
    status: "open",
    createdAt: created,
    importance: "normal",
    ...overrides,
  };
}

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

function note(id: string, title: string, at: string) {
  return { id, title, content: "", createdAt: at, updatedAt: at };
}

console.log("Continue where you left off");

// A project is only offered when it holds something to continue from: a
// written resume note, a current focus, or an open action of its own.
const stale = project({
  id: "stale",
  name: "Stale",
  updatedAt: lastWeek,
  currentFocus: "Ship the beta",
});
const recent = project({
  id: "recent",
  name: "Recent",
  updatedAt: yesterday,
  currentFocus: "Finish the pricing page",
});
check(
  "the most recently active eligible project is the one to continue",
  selectContinueProject([stale, recent], [])?.id === "recent",
);

const untouched = project({ id: "untouched", name: "Untouched", updatedAt: yesterday });
check(
  "a project with nothing to continue from is not offered",
  selectContinueProject([untouched], []) === undefined,
);
check(
  "a newer project with nothing to continue does not win",
  selectContinueProject([untouched, stale], [])?.id === "stale",
);
check("no projects offer nothing to continue", selectContinueProject([], []) === undefined);
const onlyUntouched = [
  untouched,
  project({ id: "also-untouched", name: "Also untouched", updatedAt: yesterday }),
];
check(
  "no project is offered when none has a continuation signal",
  selectContinueProject(onlyUntouched, []) === undefined,
);

const resumed = project({
  id: "resumed",
  name: "Resumed",
  updatedAt: created,
  resume: { note: "Waiting on the legal sign-off.", createdAt: yesterday, updatedAt: yesterday },
});
check(
  "a written resume note makes a project the one to continue",
  selectContinueProject([stale, resumed], [])?.id === "resumed",
);

const focused = project({
  id: "focused",
  name: "Focused",
  updatedAt: created,
  currentFocus: "Land the first interview",
});
check(
  "a current focus alone makes a project the one to continue",
  selectContinueProject([untouched, focused], [])?.id === "focused",
);

const actionable = project({ id: "actionable", name: "Actionable", updatedAt: created });
check(
  "an open action alone makes a project the one to continue",
  selectContinueProject(
    [untouched, actionable],
    [action({ id: "open-action", projectId: "actionable" })],
  )?.id === "actionable",
);
check(
  "a completed action is not something to continue",
  selectContinueProject(
    [actionable],
    [
      action({
        id: "done-action",
        projectId: "actionable",
        status: "completed",
        completedAt: yesterday,
      }),
    ],
  ) === undefined,
);
check(
  "another project's open action does not qualify a project",
  selectContinueProject([actionable], [action({ id: "elsewhere", projectId: "untouched" })]) ===
    undefined,
);

const blankFocus = project({
  id: "blank-focus",
  name: "Blank focus",
  updatedAt: yesterday,
  currentFocus: "   ",
});
check(
  "a whitespace-only focus is treated as empty",
  selectContinueProject([blankFocus], []) === undefined,
);

const blankResume = project({
  id: "blank-resume",
  name: "Blank resume",
  updatedAt: yesterday,
  resume: { note: "  \n\t ", createdAt: yesterday, updatedAt: yesterday },
});
check(
  "a whitespace-only resume note is treated as empty",
  selectContinueProject([blankResume], []) === undefined,
);

const archived = project({
  id: "archived",
  name: "Archived",
  status: "archived",
  updatedAt: yesterday,
  currentFocus: "Consolidate the archive",
});
check(
  "archived projects are never offered to continue",
  selectContinueProject([archived, stale], [])?.id === "stale",
);

const tieAlpha = project({ id: "z-id", name: "Alpha", currentFocus: "Same signal" });
const tieBeta = project({ id: "a-id", name: "Beta", currentFocus: "Same signal" });
check(
  "a full tie resolves by name",
  selectContinueProject([tieBeta, tieAlpha], [])?.name === "Alpha",
);
check(
  "the choice is deterministic across calls",
  selectContinueProject([tieBeta, tieAlpha], [])?.name ===
    selectContinueProject([tieBeta, tieAlpha], [])?.name,
);

const candidates = [tieBeta, tieAlpha];
const candidatesCopy = [...candidates];
selectContinueProject(candidates, []);
check(
  "selection does not mutate the input array",
  candidates.every((item, index) => item === candidatesCopy[index]),
);

check(
  "a project is offered while it still holds a signal",
  selectContinueProject([focused], [])?.id === "focused",
);
const { currentFocus: _clearedFocus, ...cleared } = focused;
check(
  "removing the final signal removes it from eligibility",
  selectContinueProject([cleared], []) === undefined,
);

console.log("Needs attention");

const overdueProject = project({ id: "overdue-project", name: "Overdue" });
const overdueAction = action({
  id: "overdue-action",
  title: "Send the legal draft",
  projectId: "overdue-project",
  dueDate: "2026-10-20",
});

const overdueAttention = buildHomeAttention([overdueProject], [overdueAction], today);
check("a project with an overdue action needs attention", overdueAttention.length === 1);
check("the overdue reason is stated", overdueAttention[0]?.reasonLabel === "1 overdue action");
check(
  "the overdue action is named",
  overdueAttention[0]?.overdue[0]?.title === "Send the legal draft",
);

check(
  "the overdue card carries the named action's navigation target",
  overdueAttention[0]?.targetId === "project-action-overdue-action",
);
check(
  "the target is the established project-action anchor, not a second scheme",
  overdueAttention[0]?.targetId === projectActivityTargetId({ kind: "action", id: overdueAction.id }),
);

const twoOverdue = buildHomeAttention(
  [overdueProject],
  [
    overdueAction,
    action({ id: "overdue-action-2", projectId: "overdue-project", dueDate: "2026-10-21" }),
  ],
  today,
);
check("the overdue count is stated", twoOverdue[0]?.reasonLabel === "2 overdue actions");
check(
  "the card's target is the action the card names",
  twoOverdue[0]?.targetId === `project-action-${twoOverdue[0]?.next?.action.id}`,
);
check(
  "an overdue card names an action that is actually overdue",
  Boolean(twoOverdue[0]?.next && twoOverdue[0]?.overdue.some((item) => item.id === twoOverdue[0]?.next?.action.id)),
);

const parked = project({
  id: "parked",
  name: "Parked",
  updatedAt: lastWeek,
  resume: { note: "Waiting on legal.", createdAt: lastWeek, updatedAt: lastWeek },
});
const parkedAttention = buildHomeAttention([parked], [], today);
check(
  "a project with context but no open action needs attention",
  parkedAttention.length === 1,
);
check("the no-next-action reason is stated", parkedAttention[0]?.reasonLabel === "No next action");
check(
  "a card that names no action carries no target",
  parkedAttention[0]?.targetId === undefined,
);

const finished = project({ id: "finished", name: "Finished", updatedAt: lastWeek });
const finishedAttention = buildHomeAttention(
  [finished],
  [action({ id: "done", projectId: "finished", status: "completed", completedAt: lastWeek })],
  today,
);
check(
  "a project whose work is all completed needs a next action",
  finishedAttention[0]?.reasonLabel === "No next action",
);

const fresh = project({ id: "fresh", name: "Fresh" });
check(
  "a project with nothing recorded is not flagged",
  buildHomeAttention([fresh], [], today).length === 0,
);

const healthy = project({ id: "healthy", name: "Healthy" });
check(
  "a project with work on track is not flagged",
  buildHomeAttention(
    [healthy],
    [action({ id: "on-track", projectId: "healthy", dueDate: "2026-10-30" })],
    today,
  ).length === 0,
);

const quiet = project({
  id: "quiet",
  name: "Quiet",
  currentFocus: "Ship the launch page",
  updatedAt: lastMonth,
});
const quietAttention = buildHomeAttention(
  [quiet],
  [
    action({
      id: "quiet-action",
      projectId: "quiet",
      createdAt: lastMonth,
      updatedAt: lastMonth,
    }),
  ],
  today,
);
check("a project that has gone quiet needs attention", quietAttention.length === 1);
check(
  "the quiet reason is stated",
  quietAttention[0]?.reasonLabel.startsWith("Quiet for "),
);
check(
  "a card whose next action is named points at that action",
  quietAttention[0]?.targetId === projectActivityTargetId({ kind: "action", id: "quiet-action" }),
);

const neglected = project({
  id: "neglected",
  name: "Neglected",
  currentFocus: "Rewrite the handbook",
  updatedAt: lastMonth,
});
check(
  "a missing next action is named before the length of the silence",
  buildHomeAttention([neglected], [], today)[0]?.reasonLabel === "No next action",
);

const ranked = buildHomeAttention([parked, overdueProject], [overdueAction], today);
check("overdue work is offered before other reasons", ranked[0]?.project.id === "overdue-project");

check(
  "the project shown above is not repeated below",
  buildHomeAttention([overdueProject], [overdueAction], today, {
    excludeProjectId: "overdue-project",
  }).length === 0,
);

const manyParked = Array.from({ length: 6 }, (_, index) =>
  project({
    id: `parked-${index}`,
    name: `Parked ${index}`,
    updatedAt: lastWeek,
    resume: { note: "Waiting.", createdAt: lastWeek, updatedAt: lastWeek },
  }),
);
check(
  "the attention list stays short",
  buildHomeAttention(manyParked, [], today).length === 4,
);

console.log("Recent context");

const withNote = project({
  id: "context-project",
  name: "Context project",
  notes: [note("n1", "Pricing tiers draft", yesterday)],
});
const context = buildHomeContext([withNote], [], today);
check("a recent note appears as context", context.length === 1);
check("the note's own wording is used", context[0]?.title === "Pricing tiers draft");
check("the kind is stated", context[0]?.kind === "Note");
check("the entry points at the note", context[0]?.targetId === "project-note-n1");
check("the owning project is kept", context[0]?.project.id === "context-project");
check("the recorded timestamp is kept", context[0]?.at === yesterday);

const withDecision = project({
  id: "decision-project",
  name: "Decision project",
  updatedAt: twoDaysAgo,
  decisions: [
    { id: "d1", statement: "Bill annually", rationale: "Simpler for customers.", createdAt: twoDaysAgo, updatedAt: twoDaysAgo },
  ],
});
const decisionContext = buildHomeContext([withDecision], [], today);
check("a recent decision appears as context", decisionContext[0]?.kind === "Decision");
check("the decision points at itself", decisionContext[0]?.targetId === "project-decision-d1");

const oldNote = project({
  id: "old-project",
  name: "Old project",
  notes: [note("n2", "Ancient draft", longAgo)],
});
check(
  "context older than the recency window is left off",
  buildHomeContext([oldNote], [], today).length === 0,
);

const archivedWithNote = project({
  id: "archived-project",
  name: "Archived project",
  status: "archived",
  notes: [note("n3", "Archived draft", yesterday)],
});
check(
  "archived projects do not add context",
  buildHomeContext([archivedWithNote], [], today).length === 0,
);

const manyProjects = Array.from({ length: 8 }, (_, index) =>
  project({
    id: `recent-${index}`,
    name: `Recent ${index}`,
    notes: [note(`note-${index}`, `Note ${index}`, `2026-10-${String(24 - index).padStart(2, "0")}T12:00:00`)],
  }),
);
const recentContext = buildHomeContext(manyProjects, [], today);
check("the context list stays compact", recentContext.length === 5);
check("context is ordered newest first", recentContext[0]?.title === "Note 0");
check(
  "every context entry carries a real timestamp",
  recentContext.every((entry) => !Number.isNaN(Date.parse(entry.at))),
);
check(
  "context is deterministic across calls",
  JSON.stringify(buildHomeContext(manyProjects, [], today)) === JSON.stringify(recentContext),
);

console.log("Day arithmetic");

check("days since counts whole days", daysSince("2026-10-20T12:00:00", today) === 5);
check("a quiet span reads as days", formatQuietSpan(3) === "3 days");
check("a quiet span reads as a week", formatQuietSpan(7) === "a week");
check("a quiet span reads as weeks", formatQuietSpan(21) === "3 weeks");
check("a quiet span reads as months", formatQuietSpan(60) === "2 months");

console.log("");
if (failures > 0) {
  console.log(`${failures} check(s) failed.`);
  process.exit(1);
}
console.log("All Home overview checks passed.");
