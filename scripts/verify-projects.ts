/**
 * Ad-hoc verification for the Projects foundation store.
 * Run: node --experimental-strip-types scripts/verify-projects.ts
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
  loadProjectStore,
  persistProjectStore,
  createProject,
  normalizeProjectName,
  findProjectByName,
  renameProjectRecord,
  updateProjectDescriptionRecord,
  updateProjectFocusRecord,
  updateProjectResumeRecord,
  updateProjectRecord,
  deleteProjectRecord,
  addProjectNote,
  addProjectDecision,
  archiveProjectRecord,
  restoreProjectRecord,
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

console.log("Loading and normalization");

reset();
check("empty storage yields no projects", loadProjectStore().projects.length === 0);

reset("not json");
check("invalid JSON yields no projects", loadProjectStore().projects.length === 0);

reset(JSON.stringify({ projects: "nope" }));
check("non-array projects yields no projects", loadProjectStore().projects.length === 0);

reset(JSON.stringify({ projects: [null, 42, "x", {}] }));
check("junk records are dropped", loadProjectStore().projects.length === 0);

const now = "2026-10-25T10:00:00.000Z";
reset(
  JSON.stringify({
    projects: [
      { id: "a", name: "  Launch   Notes ", createdAt: now },
      { id: "a", name: "Duplicate id", createdAt: now },
      { id: "b", name: "   ", createdAt: now },
      { id: "c", name: "Bad date", createdAt: "not-a-date" },
      { id: "d", name: "Archived one", status: "archived", createdAt: now, archivedAt: now },
      { id: "e", name: "No status", createdAt: now, updatedAt: "nope" },
    ],
  }),
);

const loaded = loadProjectStore();
const byId = new Map(loaded.projects.map((project) => [project.id, project]));
check("only valid records survive", loaded.projects.length === 3, loaded.projects.map((p) => p.id));
check("duplicate id deduped to the first record", byId.get("a")?.name === "Launch Notes");
check("whitespace in names is collapsed", byId.get("a")?.name === "Launch Notes");
check("missing status defaults to active", byId.get("e")?.status === "active");
check("invalid updatedAt falls back to createdAt", byId.get("e")?.updatedAt === now);
check("archived status preserved", byId.get("d")?.status === "archived");
check("archivedAt preserved on archived record", byId.get("d")?.archivedAt === now);

console.log("Name handling");

check("normalize trims and collapses spaces", normalizeProjectName("  A   B  ") === "A B");

const year = "2026-01-01T00:00:00.000Z";
const alpha = createProject("Alpha", "", year) as NonNullable<ReturnType<typeof createProject>>;
check("create returns a record", Boolean(alpha));
check("create assigns a stable id", typeof alpha.id === "string" && alpha.id.length > 0);
check("create assigns active status", alpha.status === "active");
check("create sets timestamps", alpha.createdAt === year && alpha.updatedAt === year);
check("create omits an empty description", alpha.description === undefined);
check("create rejects a blank name", createProject("   ") === null);

const beta = createProject("Beta", "  Some context  ", year) as NonNullable<
  ReturnType<typeof createProject>
>;
check("create trims description", beta.description === "Some context");

check("case-insensitive duplicate lookup", findProjectByName([alpha, beta], "  alpha ")?.id === alpha.id);
check("lookup can exclude an id", findProjectByName([alpha, beta], "Alpha", alpha.id) === undefined);
check("blank lookup matches nothing", findProjectByName([alpha, beta], "   ") === undefined);

console.log("Mutations");

const later = "2026-02-02T00:00:00.000Z";
const renamed = renameProjectRecord(alpha, "Alpha Prime", later);
check("rename applies new name", renamed.name === "Alpha Prime");
check("rename bumps updatedAt", renamed.updatedAt === later);
check("rename does not mutate the original", alpha.name === "Alpha");
check("no-op rename returns the same object", renameProjectRecord(alpha, "  Alpha  ", later) === alpha);
check("case-only rename is allowed", renameProjectRecord(alpha, "ALPHA", later).name === "ALPHA");

const described = updateProjectDescriptionRecord(alpha, "  New copy  ", later);
check("description is trimmed on update", described.description === "New copy");
check("description update bumps updatedAt", described.updatedAt === later);
check(
  "clearing a description removes the field",
  updateProjectDescriptionRecord(described, "   ", later).description === undefined,
);
check(
  "unchanged description returns the same object",
  updateProjectDescriptionRecord(alpha, "", later) === alpha,
);

const archived = archiveProjectRecord(beta, later);
check("archive marks status", archived.status === "archived");
check("archive records archivedAt", archived.archivedAt === later);
check("archive keeps name and description", archived.name === "Beta" && archived.description === "Some context");
check("archive keeps createdAt", archived.createdAt === year);
check("double archive returns the same object", archiveProjectRecord(archived, later) === archived);

const restored = restoreProjectRecord(archived, later);
check("restore returns to active", restored.status === "active");
check("restore clears archivedAt", restored.archivedAt === undefined);
check("restore keeps the description", restored.description === "Some context");
check("restore keeps id and createdAt", restored.id === beta.id && restored.createdAt === year);
check("double restore returns the same object", restoreProjectRecord(restored, later) === restored);

console.log("Combined edit");

const withHistory =
  addProjectDecision(
    addProjectNote(restored, "Opening", "  Drafted the introduction.  ", later) as NonNullable<
      ReturnType<typeof addProjectNote>
    >,
    "Keep the tone quiet",
    "Calm reading matters more than density.",
    later,
  ) as NonNullable<ReturnType<typeof addProjectDecision>>;
const edited = updateProjectRecord(
  withHistory,
  {
    name: "  Beta  Revised ",
    description: "  A clearer purpose.  ",
    currentFocus: "  Finish the opening.  ",
    resume: "  Stopped after the first paragraph.  ",
  },
  "2026-03-03T00:00:00.000Z",
);
check("combined edit normalizes the name", edited.name === "Beta Revised");
check("combined edit trims the description", edited.description === "A clearer purpose.");
check("combined edit trims the focus", edited.currentFocus === "Finish the opening.");
check("combined edit stores the resume note", edited.resume?.note === "Stopped after the first paragraph.");
check("combined edit applies one updatedAt", edited.updatedAt === "2026-03-03T00:00:00.000Z");
check("combined edit keeps notes", edited.notes.length === 1 && edited.notes[0].title === "Opening");
check("combined edit keeps decisions", edited.decisions.length === 1);
check("combined edit keeps id and createdAt", edited.id === beta.id && edited.createdAt === year);
check(
  "unchanged combined edit returns the same object",
  updateProjectRecord(edited, {
    name: edited.name,
    description: edited.description ?? "",
    currentFocus: edited.currentFocus ?? "",
    resume: edited.resume?.note ?? "",
  }) === edited,
);

const withoutFocus = updateProjectRecord(
  edited,
  {
    name: edited.name,
    description: edited.description ?? "",
    currentFocus: "   ",
    resume: edited.resume?.note ?? "",
  },
  "2026-03-04T00:00:00.000Z",
);
check("combined edit can clear the focus", withoutFocus.currentFocus === undefined);
check("clearing focus keeps the resume", withoutFocus.resume?.note === edited.resume?.note);

console.log("Permanent deletion");

const kept = createProject("Kept", "", year) as NonNullable<ReturnType<typeof createProject>>;
const collection = [kept, edited];
const afterDelete = deleteProjectRecord(collection, edited.id);
check("delete removes only the requested project", afterDelete.length === 1 && afterDelete[0].id === kept.id);
check("delete leaves the surviving project intact", afterDelete[0] === kept);
check("deleting a missing project returns the same array", deleteProjectRecord(collection, "missing") === collection);

console.log("Persistence round trip");

reset();
const saved = { projects: [renamed, archived] };
check("persist reports success", persistProjectStore(saved).ok);
const roundTrip = loadProjectStore();
check("round trip keeps project count", roundTrip.projects.length === 2);
check("round trip keeps names", roundTrip.projects[0].name === "Alpha Prime");
check("round trip keeps archive state", roundTrip.projects[1].status === "archived");
check("round trip keeps archivedAt", roundTrip.projects[1].archivedAt === later);

const stored = JSON.parse(storeMap.get("synchron.projects.v1") as string);
check("stored payload shape is { projects }", Array.isArray(stored.projects));
check("stored under the projects-only key", !storeMap.has("synchron.actions.v1"));

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
const blocked = persistProjectStore(saved);
check("blocked storage reports failure with a message", !blocked.ok && Boolean(blocked.error));

console.log("");
if (failures > 0) {
  console.log(`${failures} check(s) failed.`);
  process.exit(1);
}
console.log("All project store checks passed.");
