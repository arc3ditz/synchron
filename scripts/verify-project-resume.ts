/**
 * Ad-hoc verification for the project resume note and next-action choice.
 * Run: node --experimental-strip-types scripts/verify-project-resume.ts
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
  addProjectDecision,
  addProjectNote,
  createProject,
  loadProjectStore,
  persistProjectStore,
  updateProjectFocusRecord,
  updateProjectResumeRecord,
} = await import("../src/projectStore.ts");
const { describeNextAction, selectNextOpenAction } = await import("../src/actionStore.ts");

let failures = 0;

function check(label: string, condition: boolean, detail?: unknown) {
  if (condition) {
    console.log(`  ok  ${label}`);
  } else {
    failures += 1;
    console.log(`FAIL  ${label}`, detail === undefined ? "" : detail);
  }
}

function reset(raw?: string) {
  storeMap.clear();
  if (raw !== undefined) storeMap.set("synchron.projects.v1", raw);
}

const now = "2026-10-25T10:00:00.000Z";
const year = "2026-01-01T00:00:00.000Z";
const later = "2026-02-02T00:00:00.000Z";
const later2 = "2026-03-03T00:00:00.000Z";
const later3 = "2026-04-04T00:00:00.000Z";
const today = "2026-10-25";

console.log("Loading and normalization");

reset(JSON.stringify({ projects: [{ id: "legacy", name: "Legacy project", createdAt: now }] }));
const legacy = loadProjectStore().projects[0];
check("a legacy project still loads", legacy?.id === "legacy");
check("legacy projects have no resume note", legacy?.resume === undefined);

reset(
  JSON.stringify({
    projects: [
      {
        id: "resume",
        name: "Resume",
        createdAt: now,
        resume: {
          note: "  Left off at the outline.\nNext: draft the intro.  ",
          createdAt: later,
          updatedAt: later2,
        },
      },
      {
        id: "blank",
        name: "Blank",
        createdAt: now,
        resume: { note: "   ", createdAt: later },
      },
      {
        id: "bad-note",
        name: "Bad note",
        createdAt: now,
        resume: { note: 42, createdAt: later },
      },
      {
        id: "bad-created",
        name: "Bad created",
        createdAt: now,
        resume: { note: "Something", createdAt: "not-a-date" },
      },
      {
        id: "fallback-updated",
        name: "Fallback",
        createdAt: now,
        resume: { note: "Something", createdAt: later, updatedAt: "nope" },
      },
      {
        id: "not-record",
        name: "Not record",
        createdAt: now,
        resume: "just a string",
      },
    ],
  }),
);

const loaded = loadProjectStore();
const resumeById = new Map(loaded.projects.map((project) => [project.id, project]));
check("valid resume notes survive normalization", resumeById.get("resume")?.resume !== undefined);
check(
  "resume notes are trimmed but keep internal line breaks",
  resumeById.get("resume")?.resume?.note === "Left off at the outline.\nNext: draft the intro.",
);
check("resume creation timestamps are kept", resumeById.get("resume")?.resume?.createdAt === later);
check("resume edit timestamps are kept", resumeById.get("resume")?.resume?.updatedAt === later2);
check("a blank resume note is dropped", resumeById.get("blank")?.resume === undefined);
check("a non-string resume note is dropped", resumeById.get("bad-note")?.resume === undefined);
check("a resume note with no valid createdAt is dropped", resumeById.get("bad-created")?.resume === undefined);
check(
  "a resume note without updatedAt falls back to createdAt",
  resumeById.get("fallback-updated")?.resume?.updatedAt === later,
);
check("a non-record resume is dropped", resumeById.get("not-record")?.resume === undefined);

console.log("Creating and editing the resume note");

const alpha = createProject("Alpha", "", year) as NonNullable<ReturnType<typeof createProject>>;
check("a new project has no resume note", alpha.resume === undefined);

const withResume = updateProjectResumeRecord(alpha, "  Drafted the intro.  ", later);
check("the resume note is trimmed", withResume.resume?.note === "Drafted the intro.");
check(
  "the first save records the same creation and edit time",
  withResume.resume?.createdAt === later && withResume.resume?.updatedAt === later,
);
check("saving the resume note bumps project updatedAt", withResume.updatedAt === later);
check(
  "saving the resume note preserves unrelated project data",
  withResume.name === alpha.name && withResume.createdAt === year && withResume.notes === alpha.notes,
);
check("saving does not mutate the original project", alpha.resume === undefined);

const editedResume = updateProjectResumeRecord(
  withResume,
  "  Drafted the intro.\nNext: edit the examples.  ",
  later2,
);
check("editing keeps the original createdAt", editedResume.resume?.createdAt === later);
check("editing bumps the resume updatedAt", editedResume.resume?.updatedAt === later2);
check(
  "editing keeps internal line breaks",
  editedResume.resume?.note === "Drafted the intro.\nNext: edit the examples.",
);
check(
  "an unchanged resume edit returns the same project object",
  updateProjectResumeRecord(editedResume, "Drafted the intro.\nNext: edit the examples.", later3) ===
    editedResume,
);

const clearedResume = updateProjectResumeRecord(editedResume, "   ", later3);
check("clearing the resume note removes the field", clearedResume.resume === undefined);
check("clearing the resume note bumps project updatedAt", clearedResume.updatedAt === later3);
check(
  "clearing an absent resume note is a no-op",
  updateProjectResumeRecord(alpha, "   ", later3) === alpha,
);

const focusedOnly = updateProjectFocusRecord(alpha, "Ship the beta", later);
check("setting focus does not invent a resume note", focusedOnly.resume === undefined);

console.log("Resume note isolation");

const beta = createProject("Beta", "", year) as NonNullable<ReturnType<typeof createProject>>;
const alphaWithContext = addProjectNote(
  addProjectDecision(
    updateProjectResumeRecord(
      updateProjectFocusRecord(alpha, "Focus A", later),
      "Alpha resume",
      later,
    ),
    "Decision A",
    "Because A",
    later,
  ),
  "Note A",
  "Body A",
  later,
) as NonNullable<ReturnType<typeof addProjectNote>>;
const betaWithResume = updateProjectResumeRecord(beta, "Beta resume", later);
check("project A keeps its own resume note", alphaWithContext.resume?.note === "Alpha resume");
check("project A keeps its focus", alphaWithContext.currentFocus === "Focus A");
check("project A keeps its note", alphaWithContext.notes[0].title === "Note A");
check("project A keeps its decision", alphaWithContext.decisions[0].statement === "Decision A");
check("project B keeps its own resume note", betaWithResume.resume?.note === "Beta resume");
check("project B does not inherit project A's resume note", betaWithResume.resume?.note !== "Alpha resume");

console.log("Persistence round trip");

reset();
const actionsBefore = JSON.stringify({
  actions: [{ id: "action-1", title: "Unrelated action", status: "open", createdAt: now, importance: "normal" }],
  inbox: [],
});
storeMap.set("synchron.actions.v1", actionsBefore);

check(
  "persist reports success",
  persistProjectStore({ projects: [alphaWithContext, betaWithResume] }).ok,
);
check(
  "persisting projects leaves the action store untouched",
  storeMap.get("synchron.actions.v1") === actionsBefore,
);

const roundTrip = loadProjectStore();
const roundTripById = new Map(roundTrip.projects.map((project) => [project.id, project]));
const roundTripAlpha = roundTripById.get(alpha.id);
const roundTripBeta = roundTripById.get(beta.id);
check("round trip keeps every project", roundTrip.projects.length === 2);
check("round trip keeps the resume note", roundTripAlpha?.resume?.note === "Alpha resume");
check("round trip keeps the resume createdAt", roundTripAlpha?.resume?.createdAt === later);
check("round trip keeps the resume updatedAt", roundTripAlpha?.resume?.updatedAt === later);
check("round trip keeps project B's resume note", roundTripBeta?.resume?.note === "Beta resume");
check("round trip does not mix resume notes", roundTripBeta?.resume?.note !== "Alpha resume");

const stored = JSON.parse(storeMap.get("synchron.projects.v1") as string);
check("stored payload shape is still { projects }", Object.keys(stored).length === 1 && Array.isArray(stored.projects));
check("the resume note is stored inside the project record", stored.projects[0].resume.note === "Alpha resume");
check("no second project storage key was introduced", !storeMap.has("synchron.project-resume.v1"));

console.log("Next action selection");

type TestAction = {
  id: string;
  title: string;
  status: "open" | "completed";
  createdAt: string;
  importance: "low" | "normal" | "high" | "critical";
  dueDate?: string;
  focusedDate?: string;
  completedAt?: string;
};

function action(overrides: Partial<TestAction> & { id: string; createdAt?: string }): TestAction {
  return {
    id: overrides.id,
    title: overrides.id,
    status: "open",
    createdAt: overrides.createdAt ?? later,
    importance: "normal",
    ...overrides,
  };
}

check("no actions means no next action", selectNextOpenAction([], today) === undefined);
check(
  "completed actions are ignored",
  selectNextOpenAction(
    [action({ id: "done", status: "completed", completedAt: now, dueDate: "2026-10-20" })],
    today,
  ) === undefined,
);

const overdueEarly = action({ id: "overdue-early", dueDate: "2026-10-20" });
const overdueLate = action({ id: "overdue-late", dueDate: "2026-10-24" });
const dueToday = action({ id: "due-today", dueDate: today });
const focusedToday = action({ id: "focused", focusedDate: today });
const upcomingSoon = action({ id: "upcoming-soon", dueDate: "2026-10-26" });
const upcomingLater = action({ id: "upcoming-later", dueDate: "2026-11-02" });
const criticalNoDue = action({ id: "critical", importance: "critical" });
const highNoDue = action({ id: "high", importance: "high" });
const normalOlder = action({ id: "normal-older", createdAt: year });
const normalNewer = action({ id: "normal-newer", createdAt: later });

const overdueChoice = selectNextOpenAction([overdueLate, overdueEarly], today);
check("the earliest overdue action is next", overdueChoice?.action.id === "overdue-early");
check("the overdue reason is stated", overdueChoice?.reason === "Overdue");

const dueTodayChoice = selectNextOpenAction([upcomingSoon, focusedToday, dueToday], today);
check("a due-today action beats focus and upcoming work", dueTodayChoice?.action.id === "due-today");
check("the due-today reason is stated", dueTodayChoice?.reason === "Due today");

const focusChoice = selectNextOpenAction([upcomingSoon, focusedToday], today);
check("today's focus beats upcoming work", focusChoice?.action.id === "focused");
check("the focus reason is stated", focusChoice?.reason === "In today’s focus");

const upcomingChoice = selectNextOpenAction([upcomingLater, upcomingSoon], today);
check("the soonest upcoming action is next", upcomingChoice?.action.id === "upcoming-soon");
check("an upcoming due date is named", Boolean(upcomingChoice?.reason.startsWith("Due ")));

const noDueChoice = selectNextOpenAction([highNoDue, criticalNoDue, normalNewer, normalOlder], today);
check("critical importance beats high importance", noDueChoice?.action.id === "critical");
check("the importance reason is stated", noDueChoice?.reason === "Critical importance");

const highChoice = selectNextOpenAction([normalOlder, highNoDue], today);
check("high importance beats normal importance", highChoice?.action.id === "high");
check("the high-importance reason is stated", highChoice?.reason === "High importance");

const oldestChoice = selectNextOpenAction([normalNewer, normalOlder], today);
check("the oldest open action wins a tie", oldestChoice?.action.id === "normal-older");
check("the oldest-action reason is stated", oldestChoice?.reason === "Oldest open action");

const tieA = action({ id: "tie-a", createdAt: later });
const tieB = action({ id: "tie-b", createdAt: later });
check("a full tie resolves by id", selectNextOpenAction([tieB, tieA], today)?.action.id === "tie-a");
check(
  "selection is deterministic across calls",
  selectNextOpenAction([tieB, tieA], today)?.action.id ===
    selectNextOpenAction([tieB, tieA], today)?.action.id,
);

const mixed = [upcomingLater, criticalNoDue, dueToday, overdueEarly, focusedToday];
const mixedCopy = [...mixed];
selectNextOpenAction(mixed, today);
check("selection does not mutate the input array", mixed.every((item, index) => item === mixedCopy[index]));
check(
  "a due commitment outranks an undated critical action",
  selectNextOpenAction([criticalNoDue, upcomingLater], today)?.action.id === "upcoming-later",
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
check("blocked storage still loads safely", loadProjectStore().projects.length === 0);
const blocked = persistProjectStore({ projects: [alphaWithContext] });
check("blocked storage reports failure with a message", !blocked.ok && Boolean(blocked.error));

console.log("");
if (failures > 0) {
  console.log(`${failures} check(s) failed.`);
  process.exit(1);
}
console.log("All project resume checks passed.");
