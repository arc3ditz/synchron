/**
 * Ad-hoc verification for project focus, notes, and decisions.
 * Run: node --experimental-strip-types scripts/verify-project-context.ts
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
  deleteProjectDecision,
  deleteProjectNote,
  loadProjectStore,
  persistProjectStore,
  updateProjectDecision,
  updateProjectFocusRecord,
  updateProjectNote,
} = await import("../src/projectStore.ts");

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
const later4 = "2026-05-05T00:00:00.000Z";

console.log("Loading and normalization");

reset(
  JSON.stringify({
    projects: [{ id: "legacy", name: "Legacy project", createdAt: now }],
  }),
);
const legacy = loadProjectStore().projects[0];
check("a legacy project still loads", legacy?.id === "legacy");
check("legacy projects gain an empty notes list", Array.isArray(legacy?.notes) && legacy.notes.length === 0);
check(
  "legacy projects gain an empty decisions list",
  Array.isArray(legacy?.decisions) && legacy.decisions.length === 0,
);
check("legacy projects have no invented focus", legacy?.currentFocus === undefined);

reset(
  JSON.stringify({
    projects: [
      { id: "focus", name: "Focus", createdAt: now, currentFocus: "  Ship   the beta  " },
      { id: "blank-focus", name: "Blank", createdAt: now, currentFocus: "   " },
      { id: "bad-focus", name: "Bad", createdAt: now, currentFocus: 42 },
      { id: "no-focus", name: "None", createdAt: now, notes: "nope", decisions: null },
    ],
  }),
);
const focusLoaded = loadProjectStore();
const focusById = new Map(focusLoaded.projects.map((project) => [project.id, project]));
check("current focus is trimmed and whitespace is collapsed", focusById.get("focus")?.currentFocus === "Ship the beta");
check("blank current focus is dropped", focusById.get("blank-focus")?.currentFocus === undefined);
check("non-string current focus is dropped", focusById.get("bad-focus")?.currentFocus === undefined);
check("non-array notes normalize to an empty list", focusById.get("no-focus")?.notes.length === 0);
check("non-array decisions normalize to an empty list", focusById.get("no-focus")?.decisions.length === 0);

const noteNow = "2026-10-20T09:00:00.000Z";
reset(
  JSON.stringify({
    projects: [
      {
        id: "notes",
        name: "Notes",
        createdAt: now,
        notes: [
          { id: "n1", title: "  First   note ", content: "  Body text  ", createdAt: noteNow },
          { id: "n1", title: "Duplicate", content: "", createdAt: noteNow },
          { id: "", title: "No id", content: "", createdAt: noteNow },
          { id: "n2", title: "   ", content: "", createdAt: noteNow },
          { id: "n3", title: "Bad date", content: "", createdAt: "not-a-date" },
          { id: "n4", title: "No updated", content: "", createdAt: noteNow, updatedAt: "nope" },
        ],
      },
    ],
  }),
);
const notesLoaded = loadProjectStore().projects[0];
const noteById = new Map(notesLoaded.notes.map((note) => [note.id, note]));
check("only valid notes survive normalization", notesLoaded.notes.length === 2, notesLoaded.notes.map((note) => note.id));
check("duplicate note ids keep the first record", noteById.get("n1")?.title === "First note");
check("note titles are normalized", noteById.get("n1")?.title === "First note");
check("note content is trimmed", noteById.get("n1")?.content === "Body text");
check("a note without updatedAt falls back to createdAt", noteById.get("n4")?.updatedAt === noteNow);

const decisionNow = "2026-10-21T09:00:00.000Z";
reset(
  JSON.stringify({
    projects: [
      {
        id: "decisions",
        name: "Decisions",
        createdAt: now,
        decisions: [
          {
            id: "d1",
            statement: "  Choose   Postgres ",
            rationale: "  It fits the workload  ",
            createdAt: decisionNow,
          },
          { id: "d1", statement: "Duplicate", rationale: "x", createdAt: decisionNow },
          { id: "d2", statement: "   ", rationale: "x", createdAt: decisionNow },
          { id: "d3", statement: "Bad date", rationale: "x", createdAt: "not-a-date" },
          { id: "d4", statement: "No rationale", createdAt: decisionNow },
        ],
      },
    ],
  }),
);
const decisionsLoaded = loadProjectStore().projects[0];
const decisionById = new Map(decisionsLoaded.decisions.map((decision) => [decision.id, decision]));
check(
  "only valid decisions survive normalization",
  decisionsLoaded.decisions.length === 2,
  decisionsLoaded.decisions.map((decision) => decision.id),
);
check("duplicate decision ids keep the first record", decisionById.get("d1")?.statement === "Choose Postgres");
check("decision statements are normalized", decisionById.get("d1")?.statement === "Choose Postgres");
check("decision rationale is trimmed", decisionById.get("d1")?.rationale === "It fits the workload");
check("a decision without updatedAt falls back to createdAt", decisionById.get("d4")?.updatedAt === decisionNow);
check("a decision with no rationale keeps an empty string", decisionById.get("d4")?.rationale === "");

console.log("Project creation and focus");

const alpha = createProject("Alpha", "", year) as NonNullable<ReturnType<typeof createProject>>;
check("create initializes empty notes", Array.isArray(alpha.notes) && alpha.notes.length === 0);
check("create initializes empty decisions", Array.isArray(alpha.decisions) && alpha.decisions.length === 0);
check("create does not invent a current focus", alpha.currentFocus === undefined);

const focused = updateProjectFocusRecord(alpha, "  Ship   the beta  ", later);
check("focus is trimmed and whitespace is collapsed", focused.currentFocus === "Ship the beta");
check("focus updates bump project updatedAt", focused.updatedAt === later);
check("focus updates preserve identity", focused.id === alpha.id && focused.createdAt === year);
check("focus updates preserve notes", focused.notes === alpha.notes);
check(
  "an unchanged focus returns the same object",
  updateProjectFocusRecord(focused, "Ship the beta", later2) === focused,
);

const clearedFocus = updateProjectFocusRecord(focused, "   ", later2);
check("clearing focus removes the field", !("currentFocus" in clearedFocus));
check("clearing focus bumps updatedAt", clearedFocus.updatedAt === later2);

console.log("Notes");

check("a blank note title is rejected", addProjectNote(alpha, "   ", "body", later) === null);

const withNote = addProjectNote(alpha, "  First   note ", "  Body  ", later) as NonNullable<
  ReturnType<typeof addProjectNote>
>;
const firstNote = withNote.notes[0];
check("a note is added", withNote.notes.length === 1);
check("the note gets a stable id", typeof firstNote.id === "string" && firstNote.id.length > 0);
check("the note title is normalized", firstNote.title === "First note");
check("the note content is trimmed", firstNote.content === "Body");
check("the note gets creation and update timestamps", firstNote.createdAt === later && firstNote.updatedAt === later);
check("adding a note bumps project updatedAt", withNote.updatedAt === later);
check("adding a note keeps unrelated project data", withNote.name === alpha.name && withNote.decisions === alpha.decisions);

const withSecondNote = addProjectNote(withNote, "Second note", "", later2) as NonNullable<
  ReturnType<typeof addProjectNote>
>;
check("a second note is added", withSecondNote.notes.length === 2);
check("new notes are stored first", withSecondNote.notes[0].title === "Second note");
check("the earlier note is preserved", withSecondNote.notes[1].id === firstNote.id);

const noteEdited = updateProjectNote(
  withSecondNote,
  firstNote.id,
  "  Revised   note ",
  "  New body  ",
  later3,
) as NonNullable<ReturnType<typeof updateProjectNote>>;
const revisedNote = noteEdited.notes.find((note) => note.id === firstNote.id);
check("note title edits are normalized", revisedNote?.title === "Revised note");
check("note content edits are trimmed", revisedNote?.content === "New body");
check("editing a note preserves createdAt", revisedNote?.createdAt === later);
check("editing a note bumps its updatedAt", revisedNote?.updatedAt === later3);
check("editing a note leaves the other note alone", noteEdited.notes.find((note) => note.id !== firstNote.id)?.title === "Second note");
check("editing a note bumps project updatedAt", noteEdited.updatedAt === later3);
check(
  "an unchanged note edit returns the same project object",
  updateProjectNote(noteEdited, firstNote.id, "Revised note", "New body", later4) === noteEdited,
);
check("editing a missing note fails", updateProjectNote(noteEdited, "missing", "Title", "", later4) === null);
check("editing a note to a blank title fails", updateProjectNote(noteEdited, firstNote.id, "   ", "", later4) === null);

const noteDeleted = deleteProjectNote(noteEdited, firstNote.id, later4);
check("deleting a note removes only that note", noteDeleted.notes.length === 1);
check("the other note remains", noteDeleted.notes[0].title === "Second note");
check("deleting a note bumps project updatedAt", noteDeleted.updatedAt === later4);
check(
  "deleting a missing note is a no-op",
  deleteProjectNote(noteDeleted, "missing", later4) === noteDeleted,
);

console.log("Decisions");

check("a blank decision statement is rejected", addProjectDecision(alpha, "   ", "Because", later) === null);
check("a blank decision rationale is rejected", addProjectDecision(alpha, "Choose X", "   ", later) === null);

const withDecision = addProjectDecision(
  alpha,
  "  Choose   Postgres ",
  "  It fits the workload  ",
  later,
) as NonNullable<ReturnType<typeof addProjectDecision>>;
const firstDecision = withDecision.decisions[0];
check("a decision is added", withDecision.decisions.length === 1);
check("the decision gets a stable id", typeof firstDecision.id === "string" && firstDecision.id.length > 0);
check("the decision statement is normalized", firstDecision.statement === "Choose Postgres");
check("the decision rationale is trimmed", firstDecision.rationale === "It fits the workload");
check(
  "the decision gets creation and update timestamps",
  firstDecision.createdAt === later && firstDecision.updatedAt === later,
);
check("adding a decision bumps project updatedAt", withDecision.updatedAt === later);
check("adding a decision keeps unrelated project data", withDecision.name === alpha.name && withDecision.notes === alpha.notes);

const withSecondDecision = addProjectDecision(
  withDecision,
  "Ship weekly",
  "Keeps momentum",
  later2,
) as NonNullable<ReturnType<typeof addProjectDecision>>;
check("a second decision is added", withSecondDecision.decisions.length === 2);
check("new decisions are stored first", withSecondDecision.decisions[0].statement === "Ship weekly");
check("the earlier decision is preserved", withSecondDecision.decisions[1].id === firstDecision.id);

const decisionEdited = updateProjectDecision(
  withSecondDecision,
  firstDecision.id,
  "  Choose   SQLite ",
  "  Simpler to operate  ",
  later3,
) as NonNullable<ReturnType<typeof updateProjectDecision>>;
const revisedDecision = decisionEdited.decisions.find((decision) => decision.id === firstDecision.id);
check("decision statement edits are normalized", revisedDecision?.statement === "Choose SQLite");
check("decision rationale edits are trimmed", revisedDecision?.rationale === "Simpler to operate");
check("editing a decision preserves createdAt", revisedDecision?.createdAt === later);
check("editing a decision bumps its updatedAt", revisedDecision?.updatedAt === later3);
check(
  "editing a decision leaves the other decision alone",
  decisionEdited.decisions.find((decision) => decision.id !== firstDecision.id)?.statement === "Ship weekly",
);
check("editing a decision bumps project updatedAt", decisionEdited.updatedAt === later3);
check(
  "an unchanged decision edit returns the same project object",
  updateProjectDecision(decisionEdited, firstDecision.id, "Choose SQLite", "Simpler to operate", later4) ===
    decisionEdited,
);
check(
  "editing a missing decision fails",
  updateProjectDecision(decisionEdited, "missing", "Statement", "Rationale", later4) === null,
);
check(
  "editing a decision to a blank statement fails",
  updateProjectDecision(decisionEdited, firstDecision.id, "   ", "Rationale", later4) === null,
);
check(
  "editing a decision to a blank rationale fails",
  updateProjectDecision(decisionEdited, firstDecision.id, "Statement", "   ", later4) === null,
);

const decisionDeleted = deleteProjectDecision(decisionEdited, firstDecision.id, later4);
check("deleting a decision removes only that decision", decisionDeleted.decisions.length === 1);
check("the other decision remains", decisionDeleted.decisions[0].statement === "Ship weekly");
check("deleting a decision bumps project updatedAt", decisionDeleted.updatedAt === later4);
check(
  "deleting a missing decision is a no-op",
  deleteProjectDecision(decisionDeleted, "missing", later4) === decisionDeleted,
);

console.log("Project isolation");

const beta = createProject("Beta", "", year) as NonNullable<ReturnType<typeof createProject>>;
const alphaWithContext = addProjectNote(
  addProjectDecision(updateProjectFocusRecord(alpha, "Focus A", later), "Decision A", "Because A", later),
  "Note A",
  "Body A",
  later,
) as NonNullable<ReturnType<typeof addProjectNote>>;
const betaWithContext = addProjectNote(beta, "Note B", "Body B", later) as NonNullable<
  ReturnType<typeof addProjectNote>
>;
check("project A keeps its own focus", alphaWithContext.currentFocus === "Focus A");
check("project A keeps its own note", alphaWithContext.notes[0].title === "Note A");
check("project A keeps its own decision", alphaWithContext.decisions[0].statement === "Decision A");
check("project B keeps only its own note", betaWithContext.notes.length === 1 && betaWithContext.notes[0].title === "Note B");
check("project B has no inherited decisions", betaWithContext.decisions.length === 0);
check("project B has no inherited focus", betaWithContext.currentFocus === undefined);
check("project A does not gain project B's note", !alphaWithContext.notes.some((note) => note.title === "Note B"));

console.log("Persistence round trip");

reset();
const actionsBefore = JSON.stringify({
  actions: [{ id: "action-1", title: "Unrelated action", status: "open", createdAt: now, importance: "normal" }],
  inbox: [],
});
storeMap.set("synchron.actions.v1", actionsBefore);

check("persist reports success", persistProjectStore({ projects: [alphaWithContext, betaWithContext] }).ok);
check("persisting projects leaves the action store untouched", storeMap.get("synchron.actions.v1") === actionsBefore);

const roundTrip = loadProjectStore();
const roundTripById = new Map(roundTrip.projects.map((project) => [project.id, project]));
const roundTripAlpha = roundTripById.get(alpha.id);
const roundTripBeta = roundTripById.get(beta.id);
check("round trip keeps every project", roundTrip.projects.length === 2);
check("round trip keeps current focus", roundTripAlpha?.currentFocus === "Focus A");
check("round trip keeps the note", roundTripAlpha?.notes[0]?.title === "Note A");
check("round trip keeps note content", roundTripAlpha?.notes[0]?.content === "Body A");
check("round trip keeps the note id", roundTripAlpha?.notes[0]?.id === alphaWithContext.notes[0].id);
check("round trip keeps note timestamps", roundTripAlpha?.notes[0]?.createdAt === later);
check("round trip keeps the decision", roundTripAlpha?.decisions[0]?.statement === "Decision A");
check("round trip keeps the decision rationale", roundTripAlpha?.decisions[0]?.rationale === "Because A");
check("round trip keeps the decision id", roundTripAlpha?.decisions[0]?.id === alphaWithContext.decisions[0].id);
check("round trip keeps the decision timestamps", roundTripAlpha?.decisions[0]?.createdAt === later);
check("round trip keeps project B's note", roundTripBeta?.notes[0]?.title === "Note B");
check("round trip does not mix project context", roundTripBeta?.decisions.length === 0);

const stored = JSON.parse(storeMap.get("synchron.projects.v1") as string);
check("stored payload shape is still { projects }", Object.keys(stored).length === 1 && Array.isArray(stored.projects));
check("notes are stored inside the project record", Array.isArray(stored.projects[0].notes));
check("decisions are stored inside the project record", Array.isArray(stored.projects[0].decisions));
check("focus is stored inside the project record", stored.projects[0].currentFocus === "Focus A");
check("no second project storage key was introduced", !storeMap.has("synchron.project-context.v1"));

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
console.log("All project context checks passed.");
