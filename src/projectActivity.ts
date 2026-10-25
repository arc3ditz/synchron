import type { Action } from "./actionStore";
import type { Project } from "./projectStore";

/**
 * Project activity is derived from the timestamps the app already records. It
 * is deliberately not an event log: each action, note, decision, and the resume
 * note contributes at most one entry describing its latest state. That keeps the
 * view honest, avoids noisy duplicates, and means a deleted item simply leaves
 * the list instead of leaving a dangling reference behind.
 */
export type ProjectActivityKind =
  | "action-added"
  | "action-updated"
  | "action-completed"
  | "note-added"
  | "note-updated"
  | "decision-recorded"
  | "decision-updated"
  | "resume-written"
  | "resume-updated";

export type ProjectActivityTarget =
  | { kind: "action"; id: string }
  | { kind: "note"; id: string }
  | { kind: "decision"; id: string }
  | { kind: "resume" };

export interface ProjectActivityEntry {
  /** Stable identity for React keys and for deterministic ordering. */
  key: string;
  kind: ProjectActivityKind;
  /** The item's actual stored timestamp, never a guessed one. */
  at: string;
  /** Short event word such as "Added", "Updated", or "Completed". */
  label: string;
  /** The item's own name. Never a generated summary. */
  title: string;
  target: ProjectActivityTarget;
}

export const PROJECT_ACTIVITY_LIMIT = 6;

function isTimestamp(value: string | undefined): value is string {
  return typeof value === "string" && value.length > 0 && !Number.isNaN(Date.parse(value));
}

function latestTimestamp(current: string, candidate: string | undefined): string {
  return isTimestamp(candidate) && candidate > current ? candidate : current;
}

function latestOf(...candidates: (string | undefined)[]): string | undefined {
  let latest: string | undefined;
  for (const candidate of candidates) {
    if (!isTimestamp(candidate)) continue;
    if (!latest || candidate > latest) latest = candidate;
  }
  return latest;
}

/**
 * The most recent meaningful change to a project's context, including work on
 * its linked actions. Every surface that shows "Updated" uses this so the list,
 * the detail header, and the activity view can never disagree.
 */
export function projectLastActivityAt(project: Project, actions: Action[]): string {
  let latest = project.createdAt;
  latest = latestTimestamp(latest, project.updatedAt);
  latest = latestTimestamp(latest, project.archivedAt);
  latest = latestTimestamp(latest, project.resume?.createdAt);
  latest = latestTimestamp(latest, project.resume?.updatedAt);

  for (const note of project.notes) {
    latest = latestTimestamp(latest, note.createdAt);
    latest = latestTimestamp(latest, note.updatedAt);
  }
  for (const decision of project.decisions) {
    latest = latestTimestamp(latest, decision.createdAt);
    latest = latestTimestamp(latest, decision.updatedAt);
  }
  for (const action of actions) {
    if (action.projectId !== project.id) continue;
    latest = latestTimestamp(latest, action.createdAt);
    latest = latestTimestamp(latest, action.updatedAt);
    latest = latestTimestamp(latest, action.completedAt);
  }

  return latest;
}

/**
 * Builds the newest-first activity view for one project. Items from other
 * projects, or records without a usable timestamp, are ignored rather than
 * shown with a fabricated date.
 */
export function buildProjectActivity(
  project: Project,
  actions: Action[],
  limit = PROJECT_ACTIVITY_LIMIT,
): ProjectActivityEntry[] {
  if (limit <= 0) return [];

  const entries: ProjectActivityEntry[] = [];

  for (const action of actions) {
    if (action.projectId !== project.id) continue;

    const created = isTimestamp(action.createdAt) ? action.createdAt : undefined;
    const updated = isTimestamp(action.updatedAt) ? action.updatedAt : created;
    const completed = isTimestamp(action.completedAt) ? action.completedAt : undefined;
    const at = latestOf(created, updated, action.status === "completed" ? completed : undefined);
    if (!at) continue;

    // Completion is only the latest event when nothing was edited afterwards.
    const isCompletion = action.status === "completed" && completed === at;
    const isNew = !isCompletion && (!updated || !created || updated === created);
    entries.push({
      key: `action:${action.id}`,
      kind: isCompletion ? "action-completed" : isNew ? "action-added" : "action-updated",
      at,
      label: isCompletion ? "Completed" : isNew ? "Added" : "Updated",
      title: action.title,
      target: { kind: "action", id: action.id },
    });
  }

  for (const note of project.notes) {
    const created = isTimestamp(note.createdAt) ? note.createdAt : undefined;
    const updated = isTimestamp(note.updatedAt) ? note.updatedAt : created;
    const at = latestOf(created, updated);
    if (!at) continue;

    const isNew = !updated || !created || updated === created;
    entries.push({
      key: `note:${note.id}`,
      kind: isNew ? "note-added" : "note-updated",
      at,
      label: isNew ? "Added" : "Updated",
      title: note.title,
      target: { kind: "note", id: note.id },
    });
  }

  for (const decision of project.decisions) {
    const created = isTimestamp(decision.createdAt) ? decision.createdAt : undefined;
    const updated = isTimestamp(decision.updatedAt) ? decision.updatedAt : created;
    const at = latestOf(created, updated);
    if (!at) continue;

    const isNew = !updated || !created || updated === created;
    entries.push({
      key: `decision:${decision.id}`,
      kind: isNew ? "decision-recorded" : "decision-updated",
      at,
      label: isNew ? "Recorded" : "Updated",
      title: decision.statement,
      target: { kind: "decision", id: decision.id },
    });
  }

  if (project.resume) {
    const created = isTimestamp(project.resume.createdAt) ? project.resume.createdAt : undefined;
    const updated = isTimestamp(project.resume.updatedAt) ? project.resume.updatedAt : created;
    const at = latestOf(created, updated);
    if (at) {
      const isNew = !updated || !created || updated === created;
      entries.push({
        key: "resume:note",
        kind: isNew ? "resume-written" : "resume-updated",
        at,
        label: isNew ? "Written" : "Updated",
        // The note's wording stays in Resume. Activity only records that it moved.
        title: "Where I left off",
        target: { kind: "resume" },
      });
    }
  }

  entries.sort(
    (left, right) => right.at.localeCompare(left.at) || left.key.localeCompare(right.key),
  );

  return entries.slice(0, limit);
}

/** The DOM id of the item an activity entry points at. */
export function projectActivityTargetId(target: ProjectActivityTarget): string {
  switch (target.kind) {
    case "action":
      return `project-action-${target.id}`;
    case "note":
      return `project-note-${target.id}`;
    case "decision":
      return `project-decision-${target.id}`;
    case "resume":
      return "project-resume-note";
  }
}
