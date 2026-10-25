/**
 * Ad-hoc verification for project activity, action timestamps, and the
 * timestamps that keep project views consistent.
 * Run: node --experimental-strip-types scripts/verify-project-activity.ts
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

const {
  completeActionRecord,
  createAction,
  loadActionStore,
  persistActionStore,
  reopenActionRecord,
  updateActionRecord,
} = await import("../src/actionStore.ts");
const {
  addProjectDecision,
  addProjectNote,
  archiveProjectRecord,
  createProject,
  deleteProjectDecision,
  deleteProjectNote,
  updateProjectDecision,
  updateProjectNote,
  updateProjectResumeRecord,
  touchProjectsRecord,
} = await import("../src/projectStore.ts");
const {
  PROJECT_ACTIVITY_LIMIT,
  buildProjectActivity,
  projectActivityTargetId,
  projectLastActivityAt,
} = await import("../src/projectActivity.ts");

let failures = 0;

function check(label: string, condition: boolean, detail?: unknown) {
  if (condition) {
    console.log(`  ok  ${label}`);
  } else {
    failures += 1;
    console.log(`FAIL  ${label}`, detail === undefined ? "" : detail);
  }
}

const t0 = "2026-01-01T00:00:00.000Z";
const t1 = "2026-02-01T00:00:00.000Z";
const t2 = "2026-03-01T00:00:00.000Z";
const t3 = "2026-04-01T00:00:00.000Z";
const t4 = "2026-05-01T00:00:00.000Z";
const t5 = "2026-06-01T00:00:00.000Z";
const t6 = "2026-07-01T00:00:00.000Z";
const t7 = "2026-08-01T00:00:00.000Z";
const t8 = "2026-09-01T00:00:00.000Z";
const t9 = "2026-10-01T00:00:00.000Z";

function makeAction(overrides: Record<string, unknown> & { id: string }) {
  return {
    title: overrides.id,
    status: "open",
    createdAt: t0,
    updatedAt: t0,
    importance: "normal",
    ...overrides,
  };
}

console.log("Action timestamps");

const created = createAction("Draft the intro", { projectId: "p1" }, t4);
check("a new action records its creation time", created.createdAt === t4);
check("a new action records the same update time", created.updatedAt === t4);

const rescheduled = updateActionRecord(created, { dueDate: "2026-10-30" }, t5);
check("rescheduling updates the action timestamp", rescheduled.updatedAt === t5);
check("rescheduling keeps the creation time", rescheduled.createdAt === t4);
check("rescheduling applies the new date", rescheduled.dueDate === "2026-10-30");

const savedSameValues = updateActionRecord(
  rescheduled,
  { dueDate: "2026-10-30", importance: "normal" },
  t6,
);
check("saving identical values is a no-op", savedSameValues === rescheduled);

const completed = completeActionRecord(rescheduled, t6);
check("completing sets the completed timestamp", completed.completedAt === t6);
check("completing updates the action timestamp", completed.updatedAt === t6);
check("completing again is a no-op", completeActionRecord(completed, t7) === completed);

const reopened = reopenActionRecord(completed, t7);
check("reopening clears the completed timestamp", reopened.completedAt === undefined);
check("reopening updates the action timestamp", reopened.updatedAt === t7);
check("reopening again is a no-op", reopenActionRecord(reopened, t8) === reopened);

const withFocus = { ...reopened, focusedDate: "2026-10-25" };
check(
  "focus alone does not change the action timestamps",
  withFocus.createdAt === reopened.createdAt && withFocus.updatedAt === reopened.updatedAt,
);

console.log("Action normalization and persistence");

storeMap.set(
  "synchron.actions.v1",
  JSON.stringify({
    actions: [
      { id: "legacy", title: "Legacy", status: "open", createdAt: t1 },
      { id: "blank", title: "Blank", status: "open", createdAt: t1, updatedAt: "" },
      { id: "explicit", title: "Explicit", status: "completed", createdAt: t1, updatedAt: t2, completedAt: t2 },
    ],
    inbox: [],
  }),
);
const loaded = loadActionStore();
const loadedById = new Map(loaded.actions.map((action) => [action.id, action]));
check("a legacy action falls back to createdAt", loadedById.get("legacy")?.updatedAt === t1);
check("an empty updatedAt falls back to createdAt", loadedById.get("blank")?.updatedAt === t1);
check("an explicit updatedAt survives loading", loadedById.get("explicit")?.updatedAt === t2);

check(
  "persisting keeps the action timestamp",
  persistActionStore({ actions: [completed], inbox: [] }).ok,
);
check(
  "a round trip keeps the completion timestamp",
  loadActionStore().actions[0]?.updatedAt === t6 &&
    loadActionStore().actions[0]?.completedAt === t6,
);

console.log("Project timestamps");

const alpha = createProject("Alpha", "", t0);
if (!alpha) throw new Error("project fixture failed");
const beta = createProject("Beta", "", t0);
if (!beta) throw new Error("project fixture failed");

const projects = [alpha, beta];
const touched = touchProjectsRecord(projects, [alpha.id], t4);
check("touching moves the linked project forward", touched[0].updatedAt === t4);
check("touching leaves other projects untouched", touched[1] === beta);
check("touching does not mutate the input", projects[0].updatedAt === t0);
check(
  "a repeated touch with the same time is a no-op",
  touchProjectsRecord(touched, [alpha.id], t4) === touched,
);
check(
  "an earlier touch cannot rewind a project",
  touchProjectsRecord(touched, [alpha.id], t2) === touched,
);
check("an empty touch list is a no-op", touchProjectsRecord(projects, [], t4) === projects);
check(
  "touching an unknown project is a no-op",
  touchProjectsRecord(projects, ["missing"], t4) === projects,
);

console.log("Project last activity");

const alphaWithResume = updateProjectResumeRecord(alpha, "Left off at the outline.", t1);
const alphaWithNote = addProjectNote(alphaWithResume, "Outline", "Body", t2);
if (!alphaWithNote) throw new Error("note fixture failed");
const alphaWithDecision = addProjectDecision(alphaWithNote, "Use one page", "Keeps it short", t3);
if (!alphaWithDecision) throw new Error("decision fixture failed");

const alphaAction = createAction("Draft the intro", { projectId: alphaWithDecision.id }, t4);
const betaAction = createAction("Beta work", { projectId: beta.id }, t9);

check(
  "the latest linked action defines the project's last activity",
  projectLastActivityAt(alphaWithDecision, [alphaAction, betaAction]) === t4,
);
check(
  "another project's newer action is ignored",
  projectLastActivityAt(beta, [alphaAction, betaAction]) === t9,
);
check(
  "a project without actions uses its own context timestamps",
  projectLastActivityAt(alphaWithDecision, [betaAction]) === t3,
);
check(
  "an archived project includes its archive time",
  projectLastActivityAt(archiveProjectRecord(alphaWithDecision, t9), [alphaAction]) === t9,
);
check(
  "invalid action timestamps are ignored",
  projectLastActivityAt(alphaWithDecision, [
    makeAction({ id: "bad", projectId: alphaWithDecision.id, createdAt: "not-a-date", updatedAt: "nope" }),
  ]) === t3,
);

console.log("Activity entries");

const entries = buildProjectActivity(alphaWithDecision, [alphaAction, betaAction]);
check("one entry per item, not per edit", entries.length === 4);
check("activity is newest first", entries.map((entry) => entry.at).join("|") === [t4, t3, t2, t1].join("|"));
check("the newest entry is the action", entries[0]?.kind === "action-added");
check("the action entry names the action", entries[0]?.title === "Draft the intro");
check("the decision entry is recorded", entries[1]?.kind === "decision-recorded");
check("the note entry is added", entries[2]?.kind === "note-added");
check("the resume entry is written", entries[3]?.kind === "resume-written");
check(
  "the resume entry does not copy the resume wording",
  entries[3]?.title === "Where I left off" &&
    !entries.some((entry) => entry.title.includes("Left off at the outline")),
);
check(
  "entries use stable item identifiers",
  entries[0]?.key === `action:${alphaAction.id}` &&
    entries[1]?.key === `decision:${alphaWithDecision.decisions[0].id}` &&
    entries[2]?.key === `note:${alphaWithDecision.notes[0].id}` &&
    entries[3]?.key === "resume:note",
);
check(
  "entries point at stable DOM ids",
  projectActivityTargetId(entries[0].target) === `project-action-${alphaAction.id}` &&
    projectActivityTargetId(entries[1].target) ===
      `project-decision-${alphaWithDecision.decisions[0].id}` &&
    projectActivityTargetId(entries[2].target) ===
      `project-note-${alphaWithDecision.notes[0].id}` &&
    projectActivityTargetId(entries[3].target) === "project-resume-note",
);

console.log("Edits replace their entry");

const noteId = alphaWithDecision.notes[0].id;
const decisionId = alphaWithDecision.decisions[0].id;
const editedNote = updateProjectNote(alphaWithDecision, noteId, "Outline v2", "Body", t5);
if (!editedNote) throw new Error("note edit failed");
const noteEntries = buildProjectActivity(editedNote, [alphaAction]);
check("editing a note keeps one note entry", noteEntries.filter((entry) => entry.target.kind === "note").length === 1);
check("editing a note changes its kind", noteEntries[0]?.kind === "note-updated");
check("editing a note uses the edit time", noteEntries[0]?.at === t5);

const editedDecision = updateProjectDecision(
  editedNote,
  decisionId,
  "Use one page",
  "Keeps it short and focused",
  t6,
);
if (!editedDecision) throw new Error("decision edit failed");
const decisionEntries = buildProjectActivity(editedDecision, [alphaAction]);
check(
  "editing a decision keeps one decision entry",
  decisionEntries.filter((entry) => entry.target.kind === "decision").length === 1,
);
check("editing a decision changes its kind", decisionEntries[0]?.kind === "decision-updated");
check("editing a decision uses the edit time", decisionEntries[0]?.at === t6);

const editedResume = updateProjectResumeRecord(editedDecision, "Next: edit the examples.", t7);
const resumeEntries = buildProjectActivity(editedResume, [alphaAction]);
check(
  "editing the resume keeps one resume entry",
  resumeEntries.filter((entry) => entry.target.kind === "resume").length === 1,
);
check("editing the resume changes its kind", resumeEntries[0]?.kind === "resume-updated");
check("editing the resume uses the edit time", resumeEntries[0]?.at === t7);

console.log("Action lifecycle in activity");

const lifecycleAction = createAction("Lifecycle", { projectId: editedResume.id }, t4);
const lifecycleCompleted = completeActionRecord(lifecycleAction, t6);
const lifecycleReopened = reopenActionRecord(lifecycleCompleted, t7);
const lifecycleRescheduled = updateActionRecord(lifecycleAction, { dueDate: "2026-10-30" }, t5);

const actionEntries = buildProjectActivity(editedResume, [lifecycleCompleted]).filter(
  (entry) => entry.target.kind === "action",
);
check("completing an action is the latest action entry", actionEntries[0]?.kind === "action-completed");
check("completion uses the completion time", actionEntries[0]?.at === t6);

const reopenedEntries = buildProjectActivity(editedResume, [lifecycleReopened]).filter(
  (entry) => entry.target.kind === "action",
);
check("reopening an action is reported as an update", reopenedEntries[0]?.kind === "action-updated");
check("reopening uses the reopen time", reopenedEntries[0]?.at === t7);

const rescheduledEntries = buildProjectActivity(editedResume, [lifecycleRescheduled]).filter(
  (entry) => entry.target.kind === "action",
);
check("rescheduling is reported as an update", rescheduledEntries[0]?.kind === "action-updated");
check("rescheduling uses the reschedule time", rescheduledEntries[0]?.at === t5);

console.log("Limit, ties, and invalid records");

const bare = createProject("Bare", "", t0);
if (!bare) throw new Error("project fixture failed");
const many = Array.from({ length: 8 }, (_, index) =>
  makeAction({
    id: `a${index}`,
    projectId: bare.id,
    createdAt: `2026-05-0${index + 1}T00:00:00.000Z`,
    updatedAt: `2026-05-0${index + 1}T00:00:00.000Z`,
  }),
);
const limited = buildProjectActivity(bare, many);
check("the default limit is six", PROJECT_ACTIVITY_LIMIT === 6);
check("the activity limit is applied", limited.length === 6);
check("the limited list keeps the newest items", limited[0]?.at === "2026-05-08T00:00:00.000Z");
check("a zero limit returns nothing", buildProjectActivity(bare, many, 0).length === 0);
check(
  "the input order does not decide activity order",
  buildProjectActivity(bare, [...many].reverse())[0]?.key === limited[0]?.key,
);

const tieA = makeAction({ id: "tie-a", projectId: bare.id, createdAt: t5, updatedAt: t5 });
const tieB = makeAction({ id: "tie-b", projectId: bare.id, createdAt: t5, updatedAt: t5 });
const tied = buildProjectActivity(bare, [tieB, tieA]);
check("ties resolve by stable key", tied[0]?.key === "action:tie-a" && tied[1]?.key === "action:tie-b");

const invalid = makeAction({
  id: "invalid",
  projectId: editedResume.id,
  createdAt: "not-a-date",
  updatedAt: "still-not-a-date",
});
check(
  "records without usable timestamps are omitted",
  !buildProjectActivity(editedResume, [invalid]).some((entry) => entry.key === "action:invalid"),
);

console.log("Deletion and unlinking leave no broken references");

const withoutNote = deleteProjectNote(editedResume, noteId, t8);
check(
  "a deleted note leaves no activity entry",
  !buildProjectActivity(withoutNote, [alphaAction]).some((entry) => entry.target.kind === "note"),
);

const withoutDecision = deleteProjectDecision(editedResume, decisionId, t8);
check(
  "a deleted decision leaves no activity entry",
  !buildProjectActivity(withoutDecision, [alphaAction]).some(
    (entry) => entry.target.kind === "decision",
  ),
);

const unlinked = updateActionRecord(rescheduled, { projectId: beta.id }, t9);
check(
  "an unlinked action leaves the old project's activity",
  !buildProjectActivity(editedResume, [unlinked]).some((entry) => entry.target.kind === "action"),
);
check(
  "an unlinked action appears in the new project's activity",
  buildProjectActivity(beta, [unlinked])[0]?.key === `action:${rescheduled.id}`,
);
check(
  "unlinking moves the action timestamp to the new project",
  projectLastActivityAt(beta, [unlinked]) === t9 &&
    projectLastActivityAt(editedResume, [unlinked]) === t7,
);

const archived = archiveProjectRecord(editedResume, t9);
check(
  "an archived project still shows its context activity",
  buildProjectActivity(archived, [alphaAction]).length === 4,
);

console.log("Consistency across surfaces");

const consistentEntries = buildProjectActivity(editedResume, [alphaAction]);
const lastActivity = projectLastActivityAt(editedResume, [alphaAction]);
check(
  "no activity entry is newer than the project's last activity",
  consistentEntries.every((entry) => entry.at <= lastActivity),
);
check(
  "the project's last activity matches its newest context item",
  lastActivity === consistentEntries[0]?.at,
);
const touchedProject = touchProjectsRecord([editedResume], [editedResume.id], t8)[0];
check(
  "an action-driven touch stays aligned with the newest activity",
  projectLastActivityAt(touchedProject, [alphaAction]) === t8,
);
check(
  "the touched project does not invent a new activity entry",
  buildProjectActivity(touchedProject, [alphaAction])[0]?.at === consistentEntries[0]?.at,
);

console.log("Blocked storage");

(globalThis as unknown as { window: unknown }).window = {
  localStorage: {
    getItem: () => {
      throw new Error("blocked");
    },
    setItem: () => {
      throw new Error("blocked");
    },
  },
};
check("blocked storage still loads an empty action store", loadActionStore().actions.length === 0);
check(
  "blocked storage reports a failed action write",
  !persistActionStore({ actions: [created], inbox: [] }).ok,
);

console.log("");
if (failures > 0) {
  console.log(`${failures} check(s) failed.`);
  process.exit(1);
}
console.log("All project activity checks passed.");
