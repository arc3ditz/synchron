/**
 * Verification for the four-state project lifecycle.
 * Run: node --experimental-strip-types scripts/verify-project-lifecycle.ts
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
  PROJECT_STATUSES,
  addProjectDecision,
  addProjectNote,
  archiveProjectRecord,
  createProject,
  isProjectLocked,
  loadProjectStore,
  persistProjectStore,
  projectStatusLabel,
  restoreProjectRecord,
  setProjectStatusRecord,
  updateProjectResumeRecord,
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
const earlier = "2026-10-20T10:00:00.000Z";

console.log("Status vocabulary");

check(
  "the lifecycle has exactly four states",
  JSON.stringify(PROJECT_STATUSES) === JSON.stringify(["active", "on-hold", "completed", "archived"]),
);
check("active reads as Active", projectStatusLabel("active") === "Active");
check("on-hold reads as On hold", projectStatusLabel("on-hold") === "On hold");
check("completed reads as Completed", projectStatusLabel("completed") === "Completed");
check("archived reads as Archived", projectStatusLabel("archived") === "Archived");
check(
  "only archived is read-only",
  isProjectLocked("archived") &&
    !isProjectLocked("active") &&
    !isProjectLocked("on-hold") &&
    !isProjectLocked("completed"),
);

console.log("Content survives every transition");

const seeded = createProject("Seed project", "Backstory", earlier);
if (seeded === null) {
  check("a seed project can be created", false);
  process.exit(1);
}
const withNote = addProjectNote(seeded, "Outline note", "First draft.", earlier) ?? seeded;
const withDecision = addProjectDecision(withNote, "Kept the changelog format", "It reads better.", earlier);
const seed = updateProjectResumeRecord(withDecision ?? withNote, "Stopped at the outline.", earlier);

check("the seed holds real content", seed.notes.length === 1 && seed.decisions.length === 1 && seed.resume !== undefined);

const held = setProjectStatusRecord(seed, "on-hold", now);
check("holding a project keeps its notes", held.notes.length === 1);
check("holding a project keeps its decisions", held.decisions.length === 1);
check("holding a project keeps the resume note", held.resume?.note === "Stopped at the outline.");
check("holding a project keeps the description", held.description === "Backstory");
check("a transition stamps the record", held.updatedAt === now && seed.updatedAt === earlier);
check("holding a project records no archivedAt", held.archivedAt === undefined);

const fromHeld = setProjectStatusRecord(held, "completed", now);
check("completing keeps the content", fromHeld.notes.length === 1 && fromHeld.decisions.length === 1);

const archivedByRoad = setProjectStatusRecord(fromHeld, "archived", now);
check("archiving from any state stamps archivedAt", archivedByRoad.archivedAt === now);

const revived = setProjectStatusRecord(archivedByRoad, "active", now);
check("leaving archived clears archivedAt", revived.archivedAt === undefined);
check("leaving archived keeps the content", revived.notes.length === 1 && revived.resume !== undefined);

console.log("Idempotence");

check("setting the same status returns the same record", setProjectStatusRecord(seed, "active", now) === seed);

console.log("Round trip through the store");

reset();
persistProjectStore({ projects: [seed] });
const fromStore = loadProjectStore().projects[0];
check("a project persists with a lifecycle state", fromStore?.status === "active");

persistProjectStore({ projects: [setProjectStatusRecord(fromStore ?? seed, "archived", now)] });
const archivedLoad = loadProjectStore().projects[0];
check("an archived project loads archived", archivedLoad?.status === "archived");
check("the archived stamp persists", archivedLoad?.archivedAt === now);

console.log("Normalization");

reset(
  JSON.stringify({
    projects: [
      {
        id: "unknown-status",
        name: "Unknown status",
        createdAt: earlier,
        updatedAt: earlier,
        status: "paused",
        notes: [],
        decisions: [],
      },
      {
        id: "no-status",
        name: "No status",
        createdAt: earlier,
        updatedAt: earlier,
        notes: [],
        decisions: [],
      },
      {
        id: "legacy-archived",
        name: "Legacy archived",
        createdAt: earlier,
        updatedAt: earlier,
        archivedAt: earlier,
        notes: [],
        decisions: [],
      },
    ],
  }),
);
const normalized = loadProjectStore();
const byId = new Map(normalized.projects.map((project) => [project.id, project]));
check("an unrecognized status normalizes to active", byId.get("unknown-status")?.status === "active");
check("a project without a status loads active", byId.get("no-status")?.status === "active");
check(
  "a legacy record that cannot prove its status resumes as active",
  byId.get("legacy-archived")?.status === "active" && byId.get("legacy-archived")?.archivedAt === undefined,
);

console.log("The dedicated movers keep their meaning");

const mover = createProject("Mover", "", earlier) ?? seed;
const plainArchive = archiveProjectRecord(mover, now);
check("archiveProjectRecord keeps a plain archive", plainArchive.status === "archived" && plainArchive.archivedAt === now);
check("archiving an archived project changes nothing", archiveProjectRecord(plainArchive, now) === plainArchive);
check("restoring an active project changes nothing", restoreProjectRecord(mover, now) === mover);
const revivedPlain = restoreProjectRecord(plainArchive, now);
check("restoreProjectRecord returns the project to active", revivedPlain.status === "active" && revivedPlain.archivedAt === undefined);
const backToHold = setProjectStatusRecord(setProjectStatusRecord(fromHeld, "archived", now), "on-hold", now);
check(
  "leaving archived for on-hold keeps content and clears the stamp",
  backToHold.status === "on-hold" && backToHold.archivedAt === undefined && backToHold.notes.length === 1,
);

console.log("");
if (failures > 0) {
  console.log(`${failures} check(s) failed.`);
  process.exit(1);
}
console.log("All project lifecycle checks passed.");
