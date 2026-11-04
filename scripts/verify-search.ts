/**
 * Verification for workspace search results and ordering.
 * Run: node --experimental-strip-types scripts/verify-search.ts
 */

import type { Action, InboxItem } from "../src/actionStore.ts";
import { SEARCH_RESULT_LIMIT, normalizeSearchQuery, searchWorkspace } from "../src/search.ts";
import type { Project, ProjectNote, ProjectDecision } from "../src/projectStore.ts";

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
const yesterday = "2026-10-24T12:00:00";

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

function note(overrides: Partial<ProjectNote> & { id: string }): ProjectNote {
  return {
    title: overrides.id,
    content: "",
    createdAt: created,
    updatedAt: created,
    ...overrides,
  };
}

function decision(overrides: Partial<ProjectDecision> & { id: string }): ProjectDecision {
  return {
    statement: overrides.id,
    rationale: "",
    createdAt: created,
    updatedAt: created,
    ...overrides,
  };
}

function action(overrides: Partial<Action> & { id: string }): Action {
  return {
    title: overrides.id,
    status: "open",
    createdAt: created,
    importance: "normal",
    ...overrides,
  };
}

function inbox(overrides: Partial<InboxItem> & { id: string }): InboxItem {
  return {
    title: overrides.id,
    createdAt: created,
    ...overrides,
  };
}

const inboxItems = [inbox({ id: "i1", title: "Question: what does payroll coverage cost?" })];

const data = () => ({
  projects,
  actions,
  inbox: inboxItems,
});

const projects = [
  project({ id: "pricing", name: "Pricing page", description: "Align the tiers and the copy" }),
  project({
    id: "journal",
    name: "Journal app",
    notes: [
      note({
        id: "n1",
        title: "Launch plan",
        content: "The launch should wait until the pricing experiment settles.",
        updatedAt: yesterday,
      }),
      note({ id: "n2", title: "Pricing notes", content: "Three tiers, simple seats.", updatedAt: lastWeek }),
    ],
    decisions: [
      decision({
        id: "d1",
        statement: "Keep the importer manual for now",
        rationale: "Automating it before the launch invites silent data loss.",
        updatedAt: lastWeek,
      }),
    ],
  }),
];
const actions = [
  action({ id: "a1", title: "Draft the pricing experiment", projectId: "pricing", updatedAt: yesterday }),
  action({ id: "a2", title: "Unlinked stray payroll task" }),
];

console.log("Queries");

check("a blank query matches nothing", searchWorkspace("", data()).length === 0);
check("a whitespace query matches nothing", searchWorkspace("   ", data()).length === 0);
check("queries are trimmed and collapsed", normalizeSearchQuery("  draft   the  ") === "draft the");
check("an all-caps query still matches", searchWorkspace("DRAFT", data()).some((hit) => hit.recordId === "a1"));

console.log("References, not copies");

const nameHit = searchWorkspace("pricing", data()).find((hit) => hit.recordId === "pricing");
check("a project name match is a project", nameHit?.kind === "project");
check("a project match has no target inside itself", nameHit?.targetId === undefined);
check("a title match carries no snippet", nameHit?.snippet === "");
check("a project match carries the match field name", nameHit?.matchField === "Name");

const contentHit = searchWorkspace("experiment settles", data()).find((hit) => hit.recordId === "n1");
check("note content matches with a project reference", contentHit?.projectId === "journal");
check("note content matches with the established anchor", contentHit?.targetId === "project-note-n1");
check("content matches read as Content", contentHit?.matchField === "Content");
check(
  "the snippet is literal stored text around the match",
  (contentHit?.snippet ?? "").includes("pricing experiment settles"),
);

const rationaleHit = searchWorkspace("silent data loss", data()).find((hit) => hit.recordId === "d1");
check("decision rationale matches as Why", rationaleHit?.matchField === "Why");
check("decision matches carry the established anchor", rationaleHit?.targetId === "project-decision-d1");

const actionHit = searchWorkspace("experiment", data()).find((hit) => hit.kind === "action");
check("a linked action lands inside its project", actionHit?.projectId === "pricing" && actionHit?.targetId === "project-action-a1");

const unlinkedHit = searchWorkspace("payroll", data()).find((hit) => hit.kind === "action");
check("an unlinked action has no project target", unlinkedHit?.targetId === undefined);

const inboxHit = searchWorkspace("coverage", data()).find((hit) => hit.kind === "inbox");
check("captured items are searchable", inboxHit?.recordId === "i1");
check("an inbox match carries no project target", inboxHit?.targetId === undefined);

console.log("Ordering and limits");

const everything = searchWorkspace("pricing", data());
check("every result still references a real record", everything.every((hit) => typeof hit.recordId === "string"));
check("projects lead the results", everything[0]?.kind === "project");
check("action matches precede note matches", everything.findIndex((hit) => hit.kind === "project") < everything.findIndex((hit) => hit.kind === "note"));

const orderProbe = searchWorkspace("the", {
  projects: [project({ id: "probe", name: "The probe" })],
  actions: [action({ id: "probe-action", title: "Probe the action", updatedAt: lastWeek })],
  inbox: [inbox({ id: "probe-inbox", title: "The inbox line" })],
});
check(
  "kind ordering is projects, then actions, then the inbox",
  orderProbe.map((hit) => hit.kind).join() === "project,action,inbox",
);

const recency = searchWorkspace("notes", {
  projects: [
    project({
      id: "older-first",
      name: "Older first",
      notes: [note({ id: "old", title: "Older notes note", updatedAt: lastWeek }), note({ id: "newer", title: "Newer notes page", updatedAt: yesterday })],
    }),
  ],
  actions: [],
  inbox: [],
});
check("within a kind, the most recently changed record wins", recency[0]?.recordId === "newer");

const flood = searchWorkspace("halfway", {
  projects: [],
  actions: [],
  inbox: Array.from({ length: 55 }, (_, index) => inbox({ id: `flood-${index}`, title: `Halfway item ${index}` })),
});
check(`results stop at the documented limit`, flood.length === SEARCH_RESULT_LIMIT && flood.length === 40);

check(
  "an unmatched needle returns nothing",
  searchWorkspace("xyzzy-nowhere", data()).length === 0,
);

console.log("Determinism");

check(
  "the same query returns the same results twice",
  JSON.stringify(searchWorkspace("pricing", data())) === JSON.stringify(searchWorkspace("pricing", data())),
);

console.log("");
if (failures > 0) {
  console.log(`${failures} check(s) failed.`);
  process.exit(1);
}
console.log("All workspace search checks passed.");
