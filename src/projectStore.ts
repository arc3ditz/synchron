/**
 * The four states a project moves through. States are names, not scores: the
 * user chooses them, and every transition keeps the project's data intact.
 */
export const PROJECT_STATUSES = ["active", "on-hold", "completed", "archived"] as const;

export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

/** The plain-language name of a status, used by every surface that shows it. */
export function projectStatusLabel(status: ProjectStatus): string {
  if (status === "on-hold") return "On hold";
  return status[0].toUpperCase() + status.slice(1);
}

/** Whether a project carries the same restrictions archiving always had. */
export function isProjectLocked(status: ProjectStatus): boolean {
  return status === "archived";
}

/**
 * A note is project-owned context, not an action. It records something worth
 * remembering; it has no completion state and never appears in Today. It may
 * reference the project's own actions it relates to.
 */
export interface ProjectNote {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  /**
   * References to actions in the same project. Absent means "no links";
   * ids are kept deduplicated in order. Actions stay canonical — this is a
   * reference list, never a copy — and a removed action's id is simply
   * ignored wherever the list is read.
   */
  relatedActionIds?: string[];
}

/**
 * A decision keeps both what was chosen and why. The statement and rationale
 * stay together so the reasoning is not separated from the choice later. It
 * may reference the project's own actions it led to.
 */
export interface ProjectDecision {
  id: string;
  statement: string;
  rationale: string;
  createdAt: string;
  updatedAt: string;
  /** Same rules as ProjectNote.relatedActionIds. */
  relatedActionIds?: string[];
}

/**
 * The user's own account of where they stopped. It is written deliberately and
 * never inferred from edit history, so Synchron can show it as first-hand
 * resume context without pretending to know more than the user recorded.
 */
export interface ProjectResume {
  note: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * A project is an organizing context, not a kind of action. Actions reference
 * a project by its stable `id`; notes and decisions belong to the project and
 * are stored inside this record so there is only one persistence system.
 */
export interface Project {
  id: string;
  name: string;
  description?: string;
  /** The outcome the user is pursuing right now. User-maintained only. */
  currentFocus?: string;
  /** The user's own note about where they left off. User-maintained only. */
  resume?: ProjectResume;
  status: ProjectStatus;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string;
  /**
   * The last time the project was actually opened for reading or editing —
   * stamped once per visit, never on every render, and never backdated.
   * Absent means the stored record predates visit tracking; nothing is
   * fabricated, and continuation falls back to recorded activity.
   */
  lastOpenedAt?: string;
  notes: ProjectNote[];
  decisions: ProjectDecision[];
}

/** The fields a project's own edit form can change in one commit. */
export interface ProjectEditableFields {
  name: string;
  description: string;
  currentFocus: string;
  resume: string;
}

export interface ProjectStoreData {
  projects: Project[];
}

export interface ProjectStorageResult {
  ok: boolean;
  error?: string;
}

const STORAGE_KEY = "synchron.projects.v1";

function createId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isTimestamp(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && !Number.isNaN(Date.parse(value));
}

export function normalizeProjectName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

function normalizeStatus(value: unknown): ProjectStatus {
  if (value === "archived" || value === "on-hold" || value === "completed") return value;
  // Unknown or missing statuses fall back to active rather than being
  // guessed: a record that cannot prove where it stopped resumes as active
  // and the user can move it again from there.
  return "active";
}

/**
 * Related-action references are normalized the same way other optional
 * context is: only clean, non-empty ids survive, in first-order, deduplicated.
 * An invalid or absent field simply means "no links".
 */
function normalizeRelatedActionIds(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;

  const seen = new Set<string>();
  const ids: string[] = [];
  for (const candidate of value) {
    if (typeof candidate !== "string") continue;
    const id = candidate.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids.length > 0 ? ids : undefined;
}

function normalizeNote(value: unknown): ProjectNote | null {
  if (!isRecord(value)) return null;
  if (typeof value.id !== "string" || !value.id.trim()) return null;
  if (typeof value.title !== "string") return null;
  if (!isTimestamp(value.createdAt)) return null;

  const title = normalizeProjectName(value.title);
  if (!title) return null;

  const note: ProjectNote = {
    id: value.id,
    title,
    content: typeof value.content === "string" ? value.content.trim() : "",
    createdAt: value.createdAt,
    updatedAt: isTimestamp(value.updatedAt) ? value.updatedAt : value.createdAt,
  };
  const relatedActionIds = normalizeRelatedActionIds(value.relatedActionIds);
  if (relatedActionIds) note.relatedActionIds = relatedActionIds;
  return note;
}

function normalizeDecision(value: unknown): ProjectDecision | null {
  if (!isRecord(value)) return null;
  if (typeof value.id !== "string" || !value.id.trim()) return null;
  if (typeof value.statement !== "string") return null;
  if (!isTimestamp(value.createdAt)) return null;

  const statement = normalizeProjectName(value.statement);
  if (!statement) return null;

  const decision: ProjectDecision = {
    id: value.id,
    statement,
    rationale: typeof value.rationale === "string" ? value.rationale.trim() : "",
    createdAt: value.createdAt,
    updatedAt: isTimestamp(value.updatedAt) ? value.updatedAt : value.createdAt,
  };
  const relatedActionIds = normalizeRelatedActionIds(value.relatedActionIds);
  if (relatedActionIds) decision.relatedActionIds = relatedActionIds;
  return decision;
}

function normalizeResume(value: unknown): ProjectResume | null {
  if (!isRecord(value)) return null;
  if (typeof value.note !== "string") return null;
  if (!isTimestamp(value.createdAt)) return null;

  const note = value.note.trim();
  if (!note) return null;

  return {
    note,
    createdAt: value.createdAt,
    updatedAt: isTimestamp(value.updatedAt) ? value.updatedAt : value.createdAt,
  };
}

function normalizeCollection<T extends { id: string }>(
  value: unknown,
  normalize: (candidate: unknown) => T | null,
): T[] {
  if (!Array.isArray(value)) return [];

  // Duplicate identifiers would make later edits ambiguous, so the first
  // valid record wins and repeats are ignored rather than rewritten.
  const seen = new Set<string>();
  const items: T[] = [];
  for (const candidate of value) {
    const item = normalize(candidate);
    if (!item || seen.has(item.id)) continue;
    seen.add(item.id);
    items.push(item);
  }
  return items;
}

function emptyStore(): ProjectStoreData {
  return { projects: [] };
}

function normalizeProject(value: unknown): Project | null {
  if (!isRecord(value)) return null;
  if (typeof value.id !== "string" || !value.id.trim()) return null;
  if (typeof value.name !== "string") return null;
  if (!isTimestamp(value.createdAt)) return null;

  const name = normalizeProjectName(value.name);
  if (!name) return null;

  const status = normalizeStatus(value.status);
  const updatedAt = isTimestamp(value.updatedAt) ? value.updatedAt : value.createdAt;
  const project: Project = {
    id: value.id,
    name,
    status,
    createdAt: value.createdAt,
    updatedAt,
    notes: normalizeCollection(value.notes, normalizeNote),
    decisions: normalizeCollection(value.decisions, normalizeDecision),
  };

  if (typeof value.description === "string") {
    const description = value.description.trim();
    if (description) project.description = description;
  }
  if (typeof value.currentFocus === "string") {
    const currentFocus = normalizeProjectName(value.currentFocus);
    if (currentFocus) project.currentFocus = currentFocus;
  }
  const resume = normalizeResume(value.resume);
  if (resume) project.resume = resume;
  if (status === "archived" && isTimestamp(value.archivedAt)) {
    project.archivedAt = value.archivedAt;
  }
  // A visit record is kept only when it is real. Missing or malformed values
  // stay absent, so nothing invents a time the user did not spend here.
  if (isTimestamp(value.lastOpenedAt)) {
    project.lastOpenedAt = value.lastOpenedAt;
  }

  return project;
}

export function loadProjectStore(): ProjectStoreData {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyStore();

    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed) || !Array.isArray(parsed.projects)) return emptyStore();

    // A duplicated identifier would make later references ambiguous, so the
    // first valid record wins and any repeat is ignored rather than rewritten.
    const seen = new Set<string>();
    const projects: Project[] = [];
    for (const candidate of parsed.projects) {
      const project = normalizeProject(candidate);
      if (!project || seen.has(project.id)) continue;
      seen.add(project.id);
      projects.push(project);
    }

    return { projects };
  } catch {
    return emptyStore();
  }
}

export function persistProjectStore(data: ProjectStoreData): ProjectStorageResult {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    return { ok: true };
  } catch {
    return {
      ok: false,
      error: "Changes are only in memory because local storage is unavailable.",
    };
  }
}

export function findProjectByName(
  projects: Project[],
  name: string,
  excludeId?: string,
): Project | undefined {
  const target = normalizeProjectName(name).toLocaleLowerCase();
  if (!target) return undefined;

  return projects.find(
    (project) =>
      project.id !== excludeId &&
      normalizeProjectName(project.name).toLocaleLowerCase() === target,
  );
}

export function createProject(
  name: string,
  description = "",
  now = new Date().toISOString(),
): Project | null {
  const normalizedName = normalizeProjectName(name);
  if (!normalizedName) return null;

  const normalizedDescription = description.trim();
  return {
    id: createId(),
    name: normalizedName,
    ...(normalizedDescription ? { description: normalizedDescription } : {}),
    status: "active",
    createdAt: now,
    updatedAt: now,
    notes: [],
    decisions: [],
  };
}

export function renameProjectRecord(
  project: Project,
  name: string,
  now = new Date().toISOString(),
): Project {
  const normalizedName = normalizeProjectName(name);
  if (!normalizedName || normalizedName === project.name) return project;

  return { ...project, name: normalizedName, updatedAt: now };
}

export function updateProjectDescriptionRecord(
  project: Project,
  description: string,
  now = new Date().toISOString(),
): Project {
  const normalizedDescription = description.trim();
  if (normalizedDescription === (project.description ?? "")) return project;

  const next = { ...project, updatedAt: now };
  if (normalizedDescription) next.description = normalizedDescription;
  else delete next.description;
  return next;
}

/**
 * Marks projects as active after linked action work changes. The timestamp only
 * moves forward, so a delayed update can never rewind a project's history.
 * Projects that are not referenced are returned untouched.
 */
export function touchProjectsRecord(
  projects: Project[],
  projectIds: string[],
  at = new Date().toISOString(),
): Project[] {
  if (projectIds.length === 0) return projects;

  const ids = new Set(projectIds);
  let changed = false;
  const next = projects.map((project) => {
    if (!ids.has(project.id) || project.updatedAt >= at) return project;
    changed = true;
    return { ...project, updatedAt: at };
  });

  return changed ? next : projects;
}

export function archiveProjectRecord(
  project: Project,
  now = new Date().toISOString(),
): Project {
  if (project.status === "archived") return project;

  return {
    ...project,
    status: "archived",
    archivedAt: now,
    updatedAt: now,
  };
}

export function restoreProjectRecord(
  project: Project,
  now = new Date().toISOString(),
): Project {
  if (project.status === "active") return project;

  const { archivedAt: _archivedAt, ...restored } = project;
  return {
    ...restored,
    status: "active",
    updatedAt: now,
  };
}

/**
 * Moves a project to any other lifecycle state in one record change. Only the
 * status and its own bookkeeping change: notes, decisions, the resume note,
 * and linked actions are carried over untouched, so remembering is never
 * destructive. Leaving archived clears archivedAt; entering it records it.
 * A same-status request is a no-op that returns the same object.
 */
export function setProjectStatusRecord(
  project: Project,
  status: ProjectStatus,
  now = new Date().toISOString(),
): Project {
  if (project.status === status) return project;

  const next: Project = { ...project, status, updatedAt: now };
  if (status === "archived") next.archivedAt = now;
  else if ("archivedAt" in next) delete next.archivedAt;
  return next;
}

/**
 * Stamps the moment the project was actually opened. The stamp only moves
 * forward, so a stale pending write can never rewrite history backwards, and
 * a repeat with the same value is a no-op. Nothing here invents a visit for a
 * record that has none.
 */
export function touchProjectVisitRecord(
  project: Project,
  at = new Date().toISOString(),
): Project {
  if (project.lastOpenedAt && project.lastOpenedAt >= at) return project;
  return { ...project, lastOpenedAt: at };
}

/**
 * Permanently removes one project from the collection. Notes, decisions, and
 * the resume note live inside the project record, so they are removed with it.
 * Linked actions are kept separately in the action store and must be detached
 * by the caller before the project disappears.
 */
export function deleteProjectRecord(projects: Project[], projectId: string): Project[] {
  const next = projects.filter((project) => project.id !== projectId);
  return next.length === projects.length ? projects : next;
}

export function updateProjectFocusRecord(
  project: Project,
  focus: string,
  now = new Date().toISOString(),
): Project {
  const normalizedFocus = normalizeProjectName(focus);
  if (normalizedFocus === (project.currentFocus ?? "")) return project;

  const next = { ...project, updatedAt: now };
  if (normalizedFocus) next.currentFocus = normalizedFocus;
  else delete next.currentFocus;
  return next;
}

export function updateProjectResumeRecord(
  project: Project,
  note: string,
  now = new Date().toISOString(),
): Project {
  const normalizedNote = note.trim();
  const existing = project.resume;

  if (!normalizedNote) {
    if (!existing) return project;
    const { resume: _resume, ...withoutResume } = project;
    return { ...withoutResume, updatedAt: now };
  }

  // The note is the user's own wording, so only the outer whitespace changes.
  // Internal line breaks and spacing are preserved as written.
  if (existing?.note === normalizedNote) return project;

  const resume: ProjectResume = existing
    ? { ...existing, note: normalizedNote, updatedAt: now }
    : { note: normalizedNote, createdAt: now, updatedAt: now };

  return { ...project, resume, updatedAt: now };
}

/**
 * Applies one project edit as a single record change, so a save cannot leave
 * the name updated but the description behind. Each field keeps the same
 * normalization and no-op rules as its dedicated editor.
 */
export function updateProjectRecord(
  project: Project,
  fields: ProjectEditableFields,
  now = new Date().toISOString(),
): Project {
  const renamed = renameProjectRecord(project, fields.name, now);
  const described = updateProjectDescriptionRecord(renamed, fields.description, now);
  const focused = updateProjectFocusRecord(described, fields.currentFocus, now);
  return updateProjectResumeRecord(focused, fields.resume, now);
}

function createNoteRecord(
  title: string,
  content: string,
  now: string,
): ProjectNote | null {
  const normalizedTitle = normalizeProjectName(title);
  if (!normalizedTitle) return null;

  return {
    id: createId(),
    title: normalizedTitle,
    content: content.trim(),
    createdAt: now,
    updatedAt: now,
  };
}

export function addProjectNote(
  project: Project,
  title: string,
  content = "",
  now = new Date().toISOString(),
): Project | null {
  const note = createNoteRecord(title, content, now);
  if (!note) return null;

  return {
    ...project,
    notes: [note, ...project.notes],
    updatedAt: now,
  };
}

export function updateProjectNote(
  project: Project,
  noteId: string,
  title: string,
  content: string,
  now = new Date().toISOString(),
): Project | null {
  const note = project.notes.find((candidate) => candidate.id === noteId);
  if (!note) return null;

  const normalizedTitle = normalizeProjectName(title);
  if (!normalizedTitle) return null;
  const normalizedContent = content.trim();
  if (normalizedTitle === note.title && normalizedContent === note.content) return project;

  const nextNote: ProjectNote = {
    ...note,
    title: normalizedTitle,
    content: normalizedContent,
    updatedAt: now,
  };
  return {
    ...project,
    notes: project.notes.map((candidate) => (candidate.id === noteId ? nextNote : candidate)),
    updatedAt: now,
  };
}

export function deleteProjectNote(
  project: Project,
  noteId: string,
  now = new Date().toISOString(),
): Project {
  const notes = project.notes.filter((candidate) => candidate.id !== noteId);
  if (notes.length === project.notes.length) return project;

  return { ...project, notes, updatedAt: now };
}

function createDecisionRecord(
  statement: string,
  rationale: string,
  now: string,
): ProjectDecision | null {
  const normalizedStatement = normalizeProjectName(statement);
  const normalizedRationale = rationale.trim();
  if (!normalizedStatement || !normalizedRationale) return null;

  return {
    id: createId(),
    statement: normalizedStatement,
    rationale: normalizedRationale,
    createdAt: now,
    updatedAt: now,
  };
}

export function addProjectDecision(
  project: Project,
  statement: string,
  rationale: string,
  now = new Date().toISOString(),
): Project | null {
  const decision = createDecisionRecord(statement, rationale, now);
  if (!decision) return null;

  return {
    ...project,
    decisions: [decision, ...project.decisions],
    updatedAt: now,
  };
}

export function updateProjectDecision(
  project: Project,
  decisionId: string,
  statement: string,
  rationale: string,
  now = new Date().toISOString(),
): Project | null {
  const decision = project.decisions.find((candidate) => candidate.id === decisionId);
  if (!decision) return null;

  const normalizedStatement = normalizeProjectName(statement);
  const normalizedRationale = rationale.trim();
  if (!normalizedStatement || !normalizedRationale) return null;
  if (
    normalizedStatement === decision.statement &&
    normalizedRationale === decision.rationale
  ) {
    return project;
  }

  const nextDecision: ProjectDecision = {
    ...decision,
    statement: normalizedStatement,
    rationale: normalizedRationale,
    updatedAt: now,
  };
  return {
    ...project,
    decisions: project.decisions.map((candidate) =>
      candidate.id === decisionId ? nextDecision : candidate,
    ),
    updatedAt: now,
  };
}

export function deleteProjectDecision(
  project: Project,
  decisionId: string,
  now = new Date().toISOString(),
): Project {
  const decisions = project.decisions.filter((candidate) => candidate.id !== decisionId);
  if (decisions.length === project.decisions.length) return project;

  return { ...project, decisions, updatedAt: now };
}

/**
 * Replaces a note's related-action references. The list is normalized the same
 * way load-time normalization would do it: clean ids only, deduplicated, and
 * an empty result removes the field entirely. Editing the links is a real
 * edit, so the note and the project both record the change.
 */
export function setProjectNoteRelatedActions(
  project: Project,
  noteId: string,
  relatedActionIds: string[],
  now = new Date().toISOString(),
): Project | null {
  const note = project.notes.find((candidate) => candidate.id === noteId);
  if (!note) return null;

  const normalized = normalizeRelatedActionIds(relatedActionIds);
  if (
    normalized === undefined
      ? note.relatedActionIds === undefined
      : normalized.length === (note.relatedActionIds?.length ?? 0) &&
        normalized.every((id, index) => id === note.relatedActionIds?.[index])
  ) {
    return project;
  }

  const nextNote: ProjectNote =
    normalized
      ? { ...note, relatedActionIds: normalized, updatedAt: now }
      : (() => {
          const { relatedActionIds: _drop, ...withoutLinks } = note;
          return { ...withoutLinks, updatedAt: now };
        })();
  return {
    ...project,
    notes: project.notes.map((candidate) => (candidate.id === noteId ? nextNote : candidate)),
    updatedAt: now,
  };
}

/** Same rules as setProjectNoteRelatedActions, for a decision. */
export function setProjectDecisionRelatedActions(
  project: Project,
  decisionId: string,
  relatedActionIds: string[],
  now = new Date().toISOString(),
): Project | null {
  const decision = project.decisions.find((candidate) => candidate.id === decisionId);
  if (!decision) return null;

  const normalized = normalizeRelatedActionIds(relatedActionIds);
  if (
    normalized === undefined
      ? decision.relatedActionIds === undefined
      : normalized.length === (decision.relatedActionIds?.length ?? 0) &&
        normalized.every((id, index) => id === decision.relatedActionIds?.[index])
  ) {
    return project;
  }

  const nextDecision: ProjectDecision =
    normalized
      ? { ...decision, relatedActionIds: normalized, updatedAt: now }
      : (() => {
          const { relatedActionIds: _drop, ...withoutLinks } = decision;
          return { ...withoutLinks, updatedAt: now };
        })();
  return {
    ...project,
    decisions: project.decisions.map((candidate) =>
      candidate.id === decisionId ? nextDecision : candidate,
    ),
    updatedAt: now,
  };
}

/**
 * Removes one action id from every note and decision that references it — the
 * record's own project only. Used when an action is deleted so no stored
 * reference is left pointing at work that no longer exists.
 */
export function removeRelatedActionReferences(
  projects: Project[],
  actionId: string,
  now = new Date().toISOString(),
): Project[] {
  let changed = false;
  const next = projects.map((project) => {
    let projectChanged = false;
    const noteResult = project.notes.map((note) => {
      if (!note.relatedActionIds?.includes(actionId)) return note;
      projectChanged = true;
      const remaining = note.relatedActionIds.filter((id) => id !== actionId);
      return remaining.length > 0
        ? { ...note, relatedActionIds: remaining, updatedAt: now }
        : (() => {
            const { relatedActionIds: _drop, ...withoutLinks } = note;
            return { ...withoutLinks, updatedAt: now };
          })();
    });
    const decisionResult = project.decisions.map((decision) => {
      if (!decision.relatedActionIds?.includes(actionId)) return decision;
      projectChanged = true;
      const remaining = decision.relatedActionIds.filter((id) => id !== actionId);
      return remaining.length > 0
        ? { ...decision, relatedActionIds: remaining, updatedAt: now }
        : (() => {
            const { relatedActionIds: _drop, ...withoutLinks } = decision;
            return { ...withoutLinks, updatedAt: now };
          })();
    });

    if (projectChanged) changed = true;
    else return project;
    return {
      ...project,
      notes: noteResult,
      decisions: decisionResult,
      updatedAt: now,
    };
  });

  // An action id nothing references returns the same array, so no write or
  // timestamp churn happens for a removal that changes nothing.
  return changed ? next : projects;
}
