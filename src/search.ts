// These imports carry the file extension so the module can be loaded directly
// by the verification scripts, the same way the other pure modules are.
import type { Action, InboxItem } from "./actionStore.ts";
import type { Project } from "./projectStore.ts";

/**
 * Workspace search is a pure reader over the two canonical stores. It never
 * persists anything, never rewrites a record, and its results are references
 * to existing records — ids plus the strings needed to present the match — so
 * there is exactly one source of truth and every result lands, when opened,
 * on the very item it matched.
 */

/** What kind of record matched, in the app's own vocabulary. */
export type SearchKind = "project" | "action" | "note" | "decision" | "inbox";

export interface SearchQuery {
  projects: Project[];
  actions: Action[];
  inbox: InboxItem[];
}

export interface WorkspaceSearchHit {
  /** Stable identity for React keys and deterministic ordering. */
  key: string;
  kind: SearchKind;
  /** The matched record's own name, as stored. */
  title: string;
  /** The stored id of the matched record. */
  recordId: string;
  /** The owning project's id, when the match lives inside one. */
  projectId?: string;
  /**
   * The DOM anchor inside the owning project that opens the matched record —
   * the established convention, never a second scheme. Absent when the match
   * is the project itself or an inbox item.
   */
  targetId?: string;
  /** Which stored field matched, phrased the way records show it. */
  matchField: "Name" | "Description" | "Title" | "Content" | "Decision" | "Why";
  /** A short, literal excerpt around the match. Empty for title matches. */
  snippet: string;
  /** The record's own most recent timestamp, for honest ordering. */
  at: string;
}

/** How many results one workspace search may return. */
export const SEARCH_RESULT_LIMIT = 40;

/** A blank or whitespace-only query matches nothing, deliberately. */
export function normalizeSearchQuery(query: string): string {
  return query.trim().replace(/\s+/g, " ");
}

function textOf(value: string | undefined): string {
  return typeof value === "string" ? value : "";
}

/**
 * A short literal excerpt around the first match, expanded to word bounds
 * where possible. The snippet is the stored text, unmodified; it is never a
 * generated summary.
 */
function snippetAround(text: string, lowerNeedle: string, radius = 48): string {
  const lowerText = text.toLowerCase();
  const index = lowerText.indexOf(lowerNeedle);
  if (index < 0) return "";

  const start = Math.max(0, index - radius);
  const end = Math.min(text.length, index + lowerNeedle.length + radius);
  const leading = start > 0 ? "…" : "";
  const trailing = end < text.length ? "…" : "";
  return `${leading}${text.slice(start, end).trim()}${trailing}`;
}

interface Candidate {
  key: string;
  kind: SearchKind;
  title: string;
  recordId: string;
  projectId?: string;
  targetId?: string;
  at: string;
  /** Priority: projects first, then the work they hold, then the inbox. */
  order: number;
  fields: { field: WorkspaceSearchHit["matchField"]; text: string }[];
}

/**
 * Searches the whole workspace: project names and descriptions, action
 * titles, note titles and content, decision statements and rationales, and
 * inbox titles. Matching is case-insensitive substring matching over stored
 * text — the same text the record shows where it lives. Empty queries match
 * nothing. Results are ordered deterministically: by kind, then recency,
 * then title, then key.
 */
export function searchWorkspace(query: string, data: SearchQuery): WorkspaceSearchHit[] {
  const normalized = normalizeSearchQuery(query);
  if (!normalized) return [];

  const needle = normalized.toLowerCase();
  const candidates: Candidate[] = [];

  for (const project of data.projects) {
    candidates.push({
      key: `project:${project.id}`,
      kind: "project",
      title: project.name,
      recordId: project.id,
      at: project.updatedAt ?? project.createdAt,
      order: 0,
      fields: [
        { field: "Name", text: project.name },
        { field: "Description", text: textOf(project.description) },
      ],
    });

    for (const note of project.notes) {
      candidates.push({
        key: `project:${project.id}:note:${note.id}`,
        kind: "note",
        title: note.title,
        recordId: note.id,
        projectId: project.id,
        targetId: `project-note-${note.id}`,
        at: note.updatedAt,
        order: 2,
        fields: [
          { field: "Title", text: note.title },
          { field: "Content", text: textOf(note.content) },
        ],
      });
    }

    for (const decision of project.decisions) {
      candidates.push({
        key: `project:${project.id}:decision:${decision.id}`,
        kind: "decision",
        title: decision.statement,
        recordId: decision.id,
        projectId: project.id,
        targetId: `project-decision-${decision.id}`,
        at: decision.updatedAt,
        order: 3,
        fields: [
          { field: "Decision", text: decision.statement },
          { field: "Why", text: textOf(decision.rationale) },
        ],
      });
    }
  }

  for (const action of data.actions) {
    candidates.push({
      key: `action:${action.id}`,
      kind: "action",
      title: action.title,
      recordId: action.id,
      projectId: action.projectId,
      // A linked action lands on its row inside its project; an unlinked one
      // can only take the reader to the Actions view it already lives in.
      targetId: action.projectId
        ? `project-action-${action.id}`
        : undefined,
      at: action.updatedAt ?? action.createdAt,
      order: 1,
      fields: [{ field: "Title", text: action.title }],
    });
  }

  for (const item of data.inbox) {
    candidates.push({
      key: `inbox:${item.id}`,
      kind: "inbox",
      title: item.title,
      recordId: item.id,
      at: item.createdAt,
      order: 4,
      fields: [{ field: "Title", text: item.title }],
    });
  }

  const hits: (WorkspaceSearchHit & { order: number })[] = [];
  for (const candidate of candidates) {
    let matchedField: Candidate["fields"][number] | undefined;
    for (const field of candidate.fields) {
      if (field.text.toLowerCase().includes(needle)) {
        matchedField = field;
        break;
      }
    }
    if (!matchedField) continue;

    hits.push({
      key: candidate.key,
      kind: candidate.kind,
      title: candidate.title,
      recordId: candidate.recordId,
      projectId: candidate.projectId,
      targetId: candidate.targetId,
      matchField: matchedField.field,
      snippet:
        matchedField.field === "Name" ||
        matchedField.field === "Title" ||
        matchedField.field === "Decision"
          ? ""
          : snippetAround(matchedField.text, needle),
      at: candidate.at,
      order: candidate.order,
    });
  }

  hits.sort((left, right) => {
    if (left.order !== right.order) return left.order - right.order;

    const byRecency = right.at.localeCompare(left.at);
    if (byRecency !== 0) return byRecency;

    const byTitle = left.title.localeCompare(right.title);
    if (byTitle !== 0) return byTitle;
    return left.key.localeCompare(right.key);
  });

  return hits.slice(0, SEARCH_RESULT_LIMIT).map(({ order: _order, ...hit }) => hit);
}
