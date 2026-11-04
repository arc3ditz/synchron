/**
 * Verification for note → action and decision → action relationships.
 * Run: node --experimental-strip-types scripts/verify-project-links.ts
 */

const localStorageMock = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
  clear: () => {},
};

(globalThis as unknown as { window: unknown }).window = { localStorage: localStorageMock };

const {
  addProjectDecision,
  addProjectNote,
  createProject,
  deleteProjectDecision,
  deleteProjectNote,
  removeRelatedActionReferences,
  setProjectDecisionRelatedActions,
  setProjectNoteRelatedActions,
  updateProjectNote,
  updateProjectDecision,
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

const now = "2026-10-25T10:00:00.000Z";
const earlier = "2026-10-20T10:00:00.000Z";

console.log("Linking a note to actions");

const seeded = createProject("Linked flows", "", earlier) ?? undefined;
if (seeded === undefined) {
  check("a seed project can be created", false);
  process.exit(1);
}
const noted = addProjectNote(seeded, "Research thread", "What the interviews said.", earlier) ?? seeded;
const decided = addProjectDecision(noted ?? seeded, "Keep interviews manual", "Turns out less work.", earlier);

if (decided === null || decided === undefined) {
  check("seed content exists", false);
  process.exit(1);
}

const notedRecord = decided.notes.find((candidate) => candidate.id !== undefined) ?? decided.notes[0];
const decisionRecord = decided.decisions[0];
if (notedRecord === undefined || decisionRecord === undefined) {
  check("seed note and decision exist", false);
  process.exit(1);
}

const withNoteLinks = setProjectNoteRelatedActions(decided, notedRecord.id, ["action-1", "action-2"], now);
const nextNote = withNoteLinks?.notes.find((candidate) => candidate.id === notedRecord.id);
check("a note can reference its project's actions", nextNote?.relatedActionIds?.join() === "action-1,action-2");
check("linking stamps the note", nextNote?.updatedAt === now);
check("linking stamps the project", withNoteLinks !== undefined && withNoteLinks.updatedAt === now);
check("linking leaves the decision alone", withNoteLinks?.decisions[0]?.relatedActionIds === undefined);

const normalized = setProjectNoteRelatedActions(
  withNoteLinks ?? decided,
  notedRecord.id,
  ["  action-2 ", "action-2", "action-1", "", 42],
  now,
);
check(
  "a link list is trimmed and deduplicated, keeping first-seen order",
  normalized?.notes.find((candidate) => candidate.id === notedRecord.id)?.relatedActionIds?.join() === "action-2,action-1",
);

check(
  "saving the same links is the same record",
  setProjectNoteRelatedActions(withNoteLinks ?? decided, notedRecord.id, ["action-1", "action-2"], now) === withNoteLinks,
);

const cleared = setProjectNoteRelatedActions(withNoteLinks ?? decided, notedRecord.id, [], now);
check("clearing links removes the field entirely", cleared?.notes.find((candidate) => candidate.id === notedRecord.id)?.relatedActionIds === undefined);

const nothingAfterClear = setProjectNoteRelatedActions(cleared ?? decided, notedRecord.id, [], now);
check("clearing an already-clear note is the same record", nothingAfterClear === cleared);

check("a missing note returns null", setProjectNoteRelatedActions(decided, "no-such-note", ["action-1"], now) === null);

console.log("Linking a decision to actions");

const withDecisionLinks = setProjectDecisionRelatedActions(decided, decisionRecord.id, ["action-1", "action-3"], now);
const nextDecision = withDecisionLinks?.decisions.find((candidate) => candidate.id === decisionRecord.id);
check("a decision can reference actions", nextDecision?.relatedActionIds?.join() === "action-1,action-3");
check("linking stamps the decision and not the note", nextDecision?.updatedAt === now && withDecisionLinks?.notes[0]?.updatedAt === notedRecord.updatedAt);

check("a missing decision returns null", setProjectDecisionRelatedActions(decided, "no-such-decision", ["action-1"], now) === null);
check(
  "saving the same decision links is the same record",
  setProjectDecisionRelatedActions(withDecisionLinks ?? decided, decisionRecord.id, ["action-1", "action-3"], now) === withDecisionLinks,
);

console.log("Editing content keeps the links");

const retitled = updateProjectNote(withNoteLinks ?? decided, notedRecord.id, "Research thread", "Rewritten content.", now) ?? decided;
const keptLinks = retitled.notes.find((candidate) => candidate.id === notedRecord.id)?.relatedActionIds;
check("rewriting a note's content keeps its links", keptLinks === undefined || keptLinks.join() === "action-1,action-2");

console.log("Deleting an action prunes every reference");

const withBoth = setProjectDecisionRelatedActions(withNoteLinks ?? decided, decisionRecord.id, ["action-1", "action-2"], now);

const unrelated = createProject("Unrelated", "", earlier) ?? undefined;
if (unrelated === undefined) {
  check("an unrelated project exists", false);
  process.exit(1);
}
const unrelatedNote = addProjectNote(unrelated, "Unrelated note", "", earlier) ?? unrelated;

const pruned = removeRelatedActionReferences(
  [withBoth ?? decided, unrelatedNote],
  "action-2",
  now,
);
const prunedProject = pruned[0];
const prunedNote = prunedProject?.notes.find((candidate) => candidate.id === notedRecord.id);
const prunedDecision = prunedProject?.decisions.find((candidate) => candidate.id === decisionRecord.id);
check("the note loses only the deleted action", prunedNote?.relatedActionIds?.join() === "action-1");
check("the decision loses only the deleted action", prunedDecision?.relatedActionIds?.join() === "action-1");
check("unrelated projects come out untouched", pruned[1] === unrelatedNote);

const emptyPruned = removeRelatedActionReferences(pruned, "action-1", now);
const afterEmptyNote = emptyPruned[0]?.notes.find((candidate) => candidate.id === notedRecord.id);
const afterEmptyDecision = emptyPruned[0]?.decisions.find((candidate) => candidate.id === decisionRecord.id);
check("a last reference is removed, not left as an empty list", afterEmptyNote?.relatedActionIds === undefined);
check("the same is true on decisions", afterEmptyDecision?.relatedActionIds === undefined);

const untouched = removeRelatedActionReferences(emptyPruned, "action-2", now);
check("pruning an id nothing references returns the same array", untouched === emptyPruned);

console.log("Deleting the linked records");

const noteRemoved = deleteProjectNote(withNoteLinks ?? decided, notedRecord.id, now);
check("deleting a note removes its links with it", noteRemoved?.notes.length === 0);

const decisionRemoved = deleteProjectDecision(
  noteRemoved ?? decided,
  decisionRecord.id,
  now,
);
check("deleting a decision removes its links with it", decisionRemoved?.decisions.length === 0);

console.log("");
if (failures > 0) {
  console.log(`${failures} check(s) failed.`);
  process.exit(1);
}
console.log("All project relationship checks passed.");
