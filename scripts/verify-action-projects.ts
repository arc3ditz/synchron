/**
 * Ad-hoc verification for action ↔ project association.
 * Run: node --experimental-strip-types scripts/verify-action-projects.ts
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
  detachProjectActions,
  loadActionStore,
  persistActionStore,
  reopenActionRecord,
  updateActionRecord,
} = await import("../src/actionStore.ts");
const { archiveProjectRecord, createProject, persistProjectStore, loadProjectStore } = await import(
  "../src/projectStore.ts"
);

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
  if (raw !== undefined) storeMap.set("synchron.actions.v1", raw);
}

const now = "2026-10-25T10:00:00.000Z";
const legacyAction = {
  id: "legacy",
  title: "Existing action",
  status: "open",
  createdAt: now,
  important: true,
};

console.log("Loading and normalization");

reset(JSON.stringify({ actions: [legacyAction], inbox: [] }));
const legacyLoaded = loadActionStore();
check("a legacy action without a project still loads", legacyLoaded.actions.length === 1);
check("legacy actions remain unlinked", legacyLoaded.actions[0]?.projectId === undefined);
check("legacy importance migration still works", legacyLoaded.actions[0]?.importance === "high");

reset(
  JSON.stringify({
    actions: [
      { ...legacyAction, id: "linked", projectId: "project-1" },
      { ...legacyAction, id: "missing", projectId: "project-gone" },
      { ...legacyAction, id: "bad-number", projectId: 42 },
      { ...legacyAction, id: "bad-empty", projectId: "" },
    ],
    inbox: [],
  }),
);
const normalized = loadActionStore();
const byId = new Map(normalized.actions.map((action) => [action.id, action]));
check("all actions survive normalization", normalized.actions.length === 4);
check("a valid project reference is kept", byId.get("linked")?.projectId === "project-1");
check(
  "a reference to a missing project is preserved, not discarded",
  byId.get("missing")?.projectId === "project-gone",
);
check("a non-string project reference is dropped", byId.get("bad-number")?.projectId === undefined);
check("an empty project reference is dropped", byId.get("bad-empty")?.projectId === undefined);

console.log("Creation and mutation");

const linked = createAction("Write the brief", { projectId: "project-1" });
check("create stores a project reference", linked.projectId === "project-1");
const unlinked = createAction("Unlinked");
check("create omits the project field when none is supplied", !("projectId" in unlinked));

const relinked = updateActionRecord(linked, { projectId: "project-2" });
check("an existing action can be reassigned", relinked.projectId === "project-2");
check("reassignment does not mutate the original", linked.projectId === "project-1");

const cleared = updateActionRecord(relinked, { projectId: undefined });
check("unlinking removes the field entirely", !("projectId" in cleared));

const unrelated = updateActionRecord(linked, { title: "Write the short brief" });
check("unrelated edits keep the project reference", unrelated.projectId === "project-1");

const completed = completeActionRecord(linked, now);
check("completion keeps the project reference", completed.projectId === "project-1");
const reopened = reopenActionRecord(completed);
check("reopening keeps the project reference", reopened.projectId === "project-1");

console.log("Persistence round trip");

reset();
check("persist reports success", persistActionStore({ actions: [linked, cleared, unlinked], inbox: [] }).ok);
const roundTrip = loadActionStore();
check("round trip keeps every action", roundTrip.actions.length === 3);
check("round trip keeps the linked action's project", roundTrip.actions[0]?.projectId === "project-1");
check("round trip keeps the unlinked action unlinked", roundTrip.actions[1]?.projectId === undefined);

const stored = JSON.parse(storeMap.get("synchron.actions.v1") as string);
check("stored shape is unchanged { actions, inbox }", Array.isArray(stored.actions) && Array.isArray(stored.inbox));
check(
  "unlinked actions are stored without a project key",
  !Object.prototype.hasOwnProperty.call(stored.actions[2], "projectId"),
);

console.log("Archived and missing projects");

reset();
const project = createProject("Launch", "", now) as NonNullable<ReturnType<typeof createProject>>;
const archivedProject = archiveProjectRecord(project, now);
const projectAction = createAction("Prepare notes", { projectId: project.id });
persistProjectStore({ projects: [archivedProject] });
persistActionStore({ actions: [projectAction], inbox: [] });

const archivedRoundTrip = loadProjectStore().projects[0];
const archivedActionRoundTrip = loadActionStore().actions[0];
check("the project remains archived after reload", archivedRoundTrip?.status === "archived");
check(
  "archiving a project does not detach or discard its actions",
  archivedActionRoundTrip?.projectId === project.id,
);

console.log("Permanent project deletion");

const deletedAt = "2026-03-05T00:00:00.000Z";
const otherProjectAction = createAction("Read the notes", { projectId: "project-2" });
const detached = detachProjectActions(
  [projectAction, otherProjectAction, unlinked],
  project.id,
  deletedAt,
);
check("detaching keeps every action", detached.length === 3);
check("detaching removes the deleted project's reference", detached[0]?.projectId === undefined);
check("detaching stamps the changed action", detached[0]?.updatedAt === deletedAt);
check(
  "detaching keeps the action's own history",
  detached[0]?.title === projectAction.title && detached[0]?.createdAt === projectAction.createdAt,
);
check("detaching leaves other project links alone", detached[1]?.projectId === "project-2");
check("detaching leaves unlinked actions identical", detached[2] === unlinked);
const untouched = [unlinked];
check(
  "detaching with no matches returns the same array",
  detachProjectActions(untouched, project.id, deletedAt) === untouched,
);

console.log("Blocked storage");

reset(JSON.stringify({ actions: [projectAction, otherProjectAction], inbox: [] }));
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
check("blocked storage still loads safely", loadActionStore().actions.length === 0);
const blocked = persistActionStore({ actions: [projectAction], inbox: [] });
check("blocked storage reports failure with a message", !blocked.ok && Boolean(blocked.error));

console.log("");
if (failures > 0) {
  console.log(`${failures} check(s) failed.`);
  process.exit(1);
}
console.log("All action ↔ project checks passed.");
