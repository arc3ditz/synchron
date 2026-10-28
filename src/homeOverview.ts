// These imports carry the file extension so the module can be loaded directly
// by the verification scripts, the same way the other store modules are.
import { isOverdue, selectNextOpenAction } from "./actionStore.ts";
import type { Action, NextActionChoice } from "./actionStore.ts";
import {
  buildProjectActivity,
  projectActivityKindLabel,
  projectActivityTargetId,
  projectLastActivityAt,
} from "./projectActivity.ts";
import type { Project } from "./projectStore.ts";

/**
 * Home is derived from data the app already records. Every rule below reads
 * stored timestamps, the user's own focus and resume notes, and the open
 * actions that belong to a project. Nothing is scored by a model, and nothing
 * is shown that the user did not write or schedule.
 */

/** How many projects Home offers for a revisit before it stops. */
export const HOME_ATTENTION_LIMIT = 4;

/** How many recent context entries Home shows. */
export const HOME_CONTEXT_LIMIT = 5;

/** A project with a focus or a resume note is worth revisiting after this. */
export const HOME_QUIET_DAYS = 14;

/** Context older than this is not "recent" and is left off Home. */
export const HOME_CONTEXT_DAYS = 30;

/** Why a project is being asked for again. */
export type HomeAttentionReason = "overdue" | "no-next-action" | "quiet";

export interface HomeAttentionItem {
  project: Project;
  reason: HomeAttentionReason;
  /** The short, plain-language reason shown next to the project. */
  reasonLabel: string;
  /** Open actions in this project that are already past their due date. */
  overdue: Action[];
  /** The project's next open action, when it has one. */
  next?: NextActionChoice;
  /**
   * The DOM id of the action this card names, so opening the project can land
   * on it. Absent when the card names no action, in which case the project
   * opens at its own top.
   */
  targetId?: string;
}

export interface HomeContextEntry {
  /** Stable identity for React keys and deterministic ordering. */
  key: string;
  kind: string;
  /** The item's own wording, never a generated summary. */
  title: string;
  /** The recorded event, such as "Added" or "Recorded". */
  label: string;
  /** The item's actual stored timestamp. */
  at: string;
  project: Project;
  /** The DOM id of the item inside the project detail. */
  targetId: string;
}

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function parseDateKey(key: string): Date {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
}

/** Whole days between a stored timestamp and the given local day key. */
export function daysSince(timestamp: string, todayDate: string): number {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return 0;
  return Math.round((startOfDay(parseDateKey(todayDate)) - startOfDay(date)) / 86_400_000);
}

/** A plain-language span, used for "quiet for three weeks". */
export function formatQuietSpan(days: number): string {
  if (days < 7) return `${days} ${days === 1 ? "day" : "days"}`;
  if (days < 60) {
    const weeks = Math.round(days / 7);
    return weeks === 1 ? "a week" : `${weeks} weeks`;
  }
  return `${Math.round(days / 30)} months`;
}

/** Written text: a blank or whitespace-only value is treated as empty. */
function hasWrittenText(value?: string): boolean {
  return Boolean(value?.trim());
}

/**
 * Whether a project holds something the user can actually continue from: a
 * resume note, a current focus, or an open action of its own. A project that
 * has only been created, or emptied of all three, is nothing to return to
 * yet. Notes and decisions are not signals on their own; a project that has
 * them but no next step is raised under "Needs attention" instead.
 */
function hasContinuationSignal(project: Project, actions: Action[]): boolean {
  return (
    hasWrittenText(project.resume?.note) ||
    hasWrittenText(project.currentFocus) ||
    actions.some((action) => action.projectId === project.id && action.status === "open")
  );
}

/**
 * The project to continue: the active project that holds a continuation signal
 * and has the most recent recorded activity. The project's own timestamp
 * already includes its resume note, so writing "where I left off" is what
 * makes a project the one to return to. Eligibility only narrows the field;
 * the ordering among eligible projects is unchanged, and ties resolve by name
 * and then id, so the choice does not change between renders.
 */
export function selectContinueProject(
  projects: Project[],
  actions: Action[],
): Project | undefined {
  return [...projects]
    .filter((project) => project.status === "active")
    .filter((project) => hasContinuationSignal(project, actions))
    .sort((left, right) => {
      const byActivity = projectLastActivityAt(right, actions).localeCompare(
        projectLastActivityAt(left, actions),
      );
      if (byActivity !== 0) return byActivity;

      const byName = left.name.localeCompare(right.name);
      if (byName !== 0) return byName;
      return left.id.localeCompare(right.id);
    })[0];
}

/**
 * The projects worth revisiting, and why. Each reason is a fact the app
 * already holds: an action past its due date, a project with context but no
 * open action to continue, or a project that was pointed somewhere and has
 * been quiet for a while. A project with nothing recorded yet is never
 * flagged.
 *
 * A card that names an action carries that action's own navigation target, so
 * the project opens at the work the card is about rather than at its top. The
 * target is the established one, built by the same helper the activity view
 * uses; Home invents no second way of pointing into a project.
 */
export function buildHomeAttention(
  projects: Project[],
  actions: Action[],
  todayDate: string,
  options: { excludeProjectId?: string; limit?: number } = {},
): HomeAttentionItem[] {
  const limit = options.limit ?? HOME_ATTENTION_LIMIT;
  const items: HomeAttentionItem[] = [];

  for (const project of projects) {
    if (project.status !== "active") continue;
    if (project.id === options.excludeProjectId) continue;

    const linked = actions.filter((action) => action.projectId === project.id);
    const open = linked.filter((action) => action.status === "open");
    const overdue = open.filter((action) => isOverdue(action, todayDate));
    const next = selectNextOpenAction(linked, todayDate);

    const hasContext =
      Boolean(project.currentFocus) ||
      Boolean(project.resume) ||
      project.notes.length > 0 ||
      project.decisions.length > 0;
    const hasCompletedWork = linked.some((action) => action.status === "completed");
    const isQuiet =
      (Boolean(project.currentFocus) || Boolean(project.resume)) &&
      daysSince(projectLastActivityAt(project, actions), todayDate) >= HOME_QUIET_DAYS;

    let reason: HomeAttentionReason | undefined;
    let reasonLabel = "";

    if (overdue.length > 0) {
      reason = "overdue";
      reasonLabel =
        overdue.length === 1 ? "1 overdue action" : `${overdue.length} overdue actions`;
    } else if (open.length === 0 && (hasContext || hasCompletedWork)) {
      reason = "no-next-action";
      reasonLabel = "No next action";
    } else if (isQuiet) {
      reason = "quiet";
      reasonLabel = `Quiet for ${formatQuietSpan(
        daysSince(projectLastActivityAt(project, actions), todayDate),
      )}`;
    }

    if (!reason) continue;
    items.push({
      project,
      reason,
      reasonLabel,
      overdue,
      next,
      targetId: next
        ? projectActivityTargetId({ kind: "action", id: next.action.id })
        : undefined,
    });
  }

  const rank: Record<HomeAttentionReason, number> = {
    overdue: 0,
    "no-next-action": 1,
    quiet: 2,
  };

  items.sort((left, right) => {
    const byReason = rank[left.reason] - rank[right.reason];
    if (byReason !== 0) return byReason;

    if (left.reason === "overdue" && right.reason === "overdue") {
      const byCount = right.overdue.length - left.overdue.length;
      if (byCount !== 0) return byCount;
    }

    const byActivity = projectLastActivityAt(right.project, actions).localeCompare(
      projectLastActivityAt(left.project, actions),
    );
    if (byActivity !== 0) return byActivity;

    const byName = left.project.name.localeCompare(right.project.name);
    if (byName !== 0) return byName;
    return left.project.id.localeCompare(right.project.id);
  });

  return items.slice(0, limit);
}

/**
 * The recent updates worth re-reading: the newest notes, decisions, actions,
 * and resume notes across active projects. Every entry carries its own stored
 * timestamp and the DOM id of the item it describes, so it can lead straight
 * back to where it was written. Updates older than the recency window are
 * left off rather than presented as recent.
 */
export function buildHomeContext(
  projects: Project[],
  actions: Action[],
  todayDate: string,
  limit = HOME_CONTEXT_LIMIT,
): HomeContextEntry[] {
  const entries: HomeContextEntry[] = [];

  for (const project of projects) {
    if (project.status !== "active") continue;

    for (const entry of buildProjectActivity(project, actions, limit)) {
      if (daysSince(entry.at, todayDate) > HOME_CONTEXT_DAYS) continue;

      entries.push({
        key: `${project.id}:${entry.key}`,
        kind: projectActivityKindLabel(entry.kind),
        title: entry.title,
        label: entry.label,
        at: entry.at,
        project,
        targetId: projectActivityTargetId(entry.target),
      });
    }
  }

  entries.sort(
    (left, right) => right.at.localeCompare(left.at) || left.key.localeCompare(right.key),
  );

  return entries.slice(0, limit);
}
