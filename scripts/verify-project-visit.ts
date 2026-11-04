/**
 * Verification for project visit stamping and how visits join continuation.
 * Run: node --experimental-strip-types scripts/verify-project-visit.ts
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

const { loadProjectStore, persistProjectStore, touchProjectVisitRecord } = await import(
  "../src/projectStore.ts"
);
const { projectLastActivityAt } = await import("../src/projectActivity.ts");
const { selectContinueProject } = await import("../src/homeOverview.ts");
const { createAction } = await import("../src/actionStore.ts");

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
const older = "2026-10-20T10:00:00.000Z";
const newer = "2026-10-24T12:00:00.000Z";
const newest = "2026-10-25T08:00:00.000Z";

console.log("Stored visits survive a round trip");

reset(
  JSON.stringify({
    projects: [
      {
        id: "visited",
        name: "Visited",
        createdAt: older,
        updatedAt: older,
        lastOpenedAt: newer,
        notes: [],
        decisions: [],
      },
      {
        id: "bad-visit",
        name: "Bad visit",
        createdAt: older,
        updatedAt: older,
        lastOpenedAt: 42,
        notes: [],
        decisions: [],
      },
    ],
  }),
);
const loaded = loadProjectStore();
const visited = loaded.projects.find((project) => project.id === "visited");
const badVisit = loaded.projects.find((project) => project.id === "bad-visit");
check("a persisted visit stamp loads unchanged", visited?.lastOpenedAt === newer);
check("a non-string visit stamp is dropped, not kept", badVisit?.lastOpenedAt === undefined);

reset(jsonOf(visited && { projects: [visited] }));
const repersisted = persistProjectStore(loadProjectStore());
if (repersisted.ok) {
  const reloaded = loadProjectStore().projects[0];
  check("a visit stamp survives persist and reload", reloaded?.lastOpenedAt === newer);
} else {
  check("a visit stamp survives persist and reload", false, repersisted);
}

console.log("Stamping a visit");

reset();
const base = {
  id: "probe",
  name: "Probe",
  createdAt: older,
  updatedAt: older,
  notes: [],
  decisions: [],
};

const firstStamp = touchProjectVisitRecord({ ...base }, now);
check("an undocumented project gains its first visit", firstStamp.lastOpenedAt === now);
check("stamping a visit does not touch updatedAt", firstStamp.updatedAt === base.updatedAt);

const repeatStamp = touchProjectVisitRecord(firstStamp, now);
check("repeating the same stamp is the same record", repeatStamp === firstStamp);

const backdated = touchProjectVisitRecord(firstStamp, older);
check("a stale stamp never rewrites history", backdated === firstStamp);

const tomorrow = "2026-10-25T18:00:00.000Z";
const forward = touchProjectVisitRecord(firstStamp, tomorrow);
check("a newer stamp moves the visit forward", forward.lastOpenedAt === tomorrow);
check("other fields are untouched by a stamp", forward.name === "Probe" && forward.notes.length === 0);

console.log("Visits join continuation");

const workedThen = projectRecord("worked", "Worked", newer);
workedThen.currentFocus = "Ship the beta";
const openedLater = projectRecord("opened", "Opened later", older);
// "opened" has older activity but a newer recorded visit: the visit is what
// the user did last, so it is the place to continue.
openedLater.currentFocus = "Finish the pricing page";
openedLater.lastOpenedAt = newest;
check(
  "a real visit beats older activity when the visit is newer",
  selectContinueProject([workedThen, openedLater], todayActions())?.id === "opened",
);

const staleBusy = projectRecord("stale-busy", "Stale busy", older);
staleBusy.currentFocus = "Ship the beta";
staleBusy.lastOpenedAt = older;
const quieter = projectRecord("quieter", "Quieter", newest);
quieter.currentFocus = "Finish the pricing page";
check(
  "a stale visit never outweighs newer recorded work",
  selectContinueProject([staleBusy, quieter], todayActions())?.id === "quieter",
);

const archivedVisit = projectRecord("archived-visit", "Archived visit", newest);
archivedVisit.status = "archived";
archivedVisit.currentFocus = "Ship the beta";
archivedVisit.lastOpenedAt = newest;
check(
  "only active projects can be the place to continue",
  selectContinueProject([archivedVisit, staleBusy], todayActions())?.id === "stale-busy",
);

console.log("Visits are stamped on the canonical activity record too");

reset();
const probe2 = projectRecord("probe2", "Probe two", older);
persistProjectStore({ projects: [probe2] });
const stampedStore = loadProjectStore();
const stamped = touchProjectVisitRecord(
  stampedStore.projects.find((project) => project.id === "probe2") ?? probe2,
  now,
);
check("a visit stamp alone does not inflate the recorded activity", projectLastActivityAt(stamped, []) === older);

console.log("");
if (failures > 0) {
  console.log(`${failures} check(s) failed.`);
  process.exit(1);
}
console.log("All project visit checks passed.");

/* --- Helpers -------------------------------------------------------------- */

function jsonOf(value: unknown): string {
  return JSON.stringify(value);
}

function projectRecord(id: string, name: string, updatedAt: string): import("../src/projectStore.ts").Project {
  return {
    id,
    name,
    status: "active",
    createdAt: older,
    updatedAt,
    notes: [],
    decisions: [],
  };
}

function todayActions(): import("../src/actionStore.ts").Action[] {
  return [createAction("One open thing", { projectId: "stale-busy" }, older)];
}
