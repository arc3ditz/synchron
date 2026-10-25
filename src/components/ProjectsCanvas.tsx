import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { Archive, ArchiveRestore, ArrowLeft, ArrowRight } from "lucide-react";
import { selectNextOpenAction, type Action, type NextActionChoice } from "../actionStore";
import {
  buildProjectActivity,
  projectActivityTargetId,
  projectLastActivityAt,
  type ProjectActivityEntry,
  type ProjectActivityKind,
} from "../projectActivity";
import type {
  Project,
  ProjectDecision,
  ProjectNote,
  ProjectResume,
} from "../projectStore";
import type { ActionsController } from "../hooks/useActions";
import type { ProjectMutationResult, ProjectsController } from "../hooks/useProjects";
import { ActionForm, ActionList, ActionRow, todayKey } from "./ActionViews";
import { EditIcon, PlusIcon, TrashIcon } from "./icons";
import { useConfirm } from "./Overlays";

type ProjectFilter = "active" | "archived" | "all";

const PROJECT_FILTERS: ProjectFilter[] = ["active", "archived", "all"];

const fullDateFormatter = new Intl.DateTimeFormat(undefined, {
  day: "numeric",
  month: "short",
  year: "numeric",
});

const monthDayFormatter = new Intl.DateTimeFormat(undefined, {
  day: "numeric",
  month: "short",
});

const weekdayFormatter = new Intl.DateTimeFormat(undefined, { weekday: "long" });

function formatProjectDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : fullDateFormatter.format(date);
}

function formatRelativeProjectDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const daysAgo = Math.round((startOfToday - startOfDate) / 86_400_000);

  if (daysAgo <= 0) return "today";
  if (daysAgo === 1) return "yesterday";
  if (daysAgo < 7) return weekdayFormatter.format(date);
  if (date.getFullYear() === now.getFullYear()) return monthDayFormatter.format(date);
  return fullDateFormatter.format(date);
}

function sortByRecent(projects: Project[], actions: Action[]): Project[] {
  return [...projects].sort(
    (left, right) =>
      projectLastActivityAt(right, actions).localeCompare(projectLastActivityAt(left, actions)) ||
      left.name.localeCompare(right.name),
  );
}

const RECENT_CONTEXT_LIMIT = 3;

function sortContextItems<T extends { id: string; createdAt: string; updatedAt: string }>(
  items: T[],
): T[] {
  return [...items].sort(
    (left, right) =>
      right.updatedAt.localeCompare(left.updatedAt) ||
      right.createdAt.localeCompare(left.createdAt) ||
      left.id.localeCompare(right.id),
  );
}

function formatContextMeta(
  kind: "Note" | "Decision",
  item: { createdAt: string; updatedAt: string },
): string {
  const created = formatProjectDate(item.createdAt);
  return item.updatedAt === item.createdAt
    ? `${kind} · Created ${created}`
    : `${kind} · Updated ${formatRelativeProjectDate(item.updatedAt)} · Created ${created}`;
}

function formatResumeMeta(resume: ProjectResume): string {
  return resume.updatedAt === resume.createdAt
    ? `Written ${formatRelativeProjectDate(resume.createdAt)}`
    : `Edited ${formatRelativeProjectDate(resume.updatedAt)} · Written ${formatProjectDate(resume.createdAt)}`;
}

function focusContextTarget(id: string) {
  const target = document.getElementById(id);
  if (!target) return;
  // An instant jump keeps the target fully visible even when smooth scrolling
  // is unavailable or interrupted. The focus ring confirms where it landed.
  target.scrollIntoView({ block: "center", behavior: "auto" });
  target.focus({ preventScroll: true });
}

/**
 * Activity links can point at a note or decision that is still collapsed behind
 * "Show all". The reveal happens in a state update, so the target may not exist
 * yet on the first attempt; retry briefly instead of silently dropping the jump.
 */
function focusWhenAvailable(id: string, attempts = 4) {
  if (document.getElementById(id)) {
    focusContextTarget(id);
    return;
  }
  if (attempts > 0) window.setTimeout(() => focusWhenAvailable(id, attempts - 1), 20);
}

interface ContextLink {
  key: string;
  kind: string;
  text: string;
  meta: string;
  targetId: string;
  ariaLabel: string;
}

/**
 * One list shape for both "Worth remembering" and "Recent activity": a quiet
 * kind label, the item's own wording, its real timestamp, and a jump link.
 */
function ContextLinks({
  links,
  onJump,
}: {
  links: ContextLink[];
  onJump: (targetId: string) => void;
}) {
  return (
    <ul className="context-links">
      {links.map((link) => (
        <li key={link.key} className="context-links__item">
          <button
            type="button"
            className="context-links__link"
            aria-label={link.ariaLabel}
            onClick={() => onJump(link.targetId)}
          >
            <span className="context-links__kind">{link.kind}</span>
            <span className="context-links__text">{link.text}</span>
            <span className="context-links__meta">{link.meta}</span>
            <ArrowRight className="context-links__arrow" aria-hidden="true" />
          </button>
        </li>
      ))}
    </ul>
  );
}

function activityKindLabel(kind: ProjectActivityKind): string {
  if (kind.startsWith("action-")) return "Action";
  if (kind.startsWith("note-")) return "Note";
  if (kind.startsWith("decision-")) return "Decision";
  return "Resume";
}

function activityLink(entry: ProjectActivityEntry): ContextLink {
  const kind = activityKindLabel(entry.kind);
  const when = `${entry.label.toLowerCase()} ${formatRelativeProjectDate(entry.at)}`;
  return {
    key: entry.key,
    kind,
    text: entry.title,
    meta: when,
    targetId: projectActivityTargetId(entry.target),
    ariaLabel:
      entry.target.kind === "resume"
        ? `Go to where I left off (${when})`
        : `Go to ${kind.toLowerCase()}: ${entry.title} (${when})`,
  };
}

function focusAfterContextRemoval(row: Element | null, fallback: () => void) {
  window.setTimeout(() => {
    if (row?.isConnected) return;
    fallback();
  }, 0);
}

function focusAfterProjectRowChange(row: Element | null) {
  window.setTimeout(() => {
    if (row?.isConnected) return;
    const nextRow = document.querySelector<HTMLElement>(".project-row__open");
    const activeFilter = document.querySelector<HTMLElement>(
      '.filter-bar__button[aria-pressed="true"]',
    );
    const formInput = document.querySelector<HTMLElement>(".project-form__input");
    (nextRow ?? activeFilter ?? formInput)?.focus();
  }, 0);
}

function ProjectFilterBar({
  filter,
  counts,
  onChange,
}: {
  filter: ProjectFilter;
  counts: Record<ProjectFilter, number>;
  onChange: (filter: ProjectFilter) => void;
}) {
  return (
    <div className="filter-bar" role="group" aria-label="Filter projects">
      {PROJECT_FILTERS.map((option) => (
        <button
          key={option}
          type="button"
          className={
            filter === option
              ? "filter-bar__button filter-bar__button--active"
              : "filter-bar__button"
          }
          aria-pressed={filter === option}
          onClick={() => onChange(option)}
        >
          {option[0].toUpperCase() + option.slice(1)}{" "}
          <span className="filter-bar__count">{counts[option]}</span>
        </button>
      ))}
    </div>
  );
}

function ProjectForm({
  onCreate,
  onCancel,
  autoFocus = false,
}: {
  onCreate: (name: string) => ProjectMutationResult;
  onCancel?: () => void;
  autoFocus?: boolean;
}) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string>();
  const inputRef = useRef<HTMLInputElement>(null);
  const errorId = useId();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = onCreate(name);
    if (!result.ok) {
      setError(result.error);
      inputRef.current?.focus();
      inputRef.current?.select();
      return;
    }

    setName("");
    setError(undefined);
  }

  return (
    <form className="project-form" onSubmit={submit} noValidate>
      <input
        ref={inputRef}
        className="project-form__input"
        aria-label="Project name"
        placeholder="Name a project"
        value={name}
        autoFocus={autoFocus}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        onChange={(event) => {
          setName(event.target.value);
          if (error) setError(undefined);
        }}
      />
      <div className="project-form__actions">
        {onCancel && (
          <button type="button" className="action-button" onClick={onCancel}>
            Cancel
          </button>
        )}
        <button
          type="submit"
          className="action-button action-button--primary action-button--with-icon"
        >
          <PlusIcon aria-hidden="true" />
          <span>Create project</span>
        </button>
      </div>
      {error && (
        <p id={errorId} className="project-form__error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}

function ProjectRow({
  project,
  projects,
  actions,
  onOpen,
}: {
  project: Project;
  projects: ProjectsController;
  actions: Action[];
  onOpen: (id: string) => void;
}) {
  const isArchived = project.status === "archived";
  const lastActivityAt = projectLastActivityAt(project, actions);
  const meta = isArchived
    ? `Archived ${formatRelativeProjectDate(project.archivedAt ?? lastActivityAt)}`
    : `Updated ${formatRelativeProjectDate(lastActivityAt)}`;

  function toggleArchive(event: ReactMouseEvent<HTMLButtonElement>) {
    const row = event.currentTarget.closest(".project-row");
    if (isArchived) projects.restoreProject(project.id);
    else projects.archiveProject(project.id);
    focusAfterProjectRowChange(row);
  }

  return (
    <li className={isArchived ? "project-row project-row--archived" : "project-row"}>
      {/* The name and description are both visible inside the button, so the
          accessible name has to include them rather than override them. */}
      <button type="button" className="project-row__open" onClick={() => onOpen(project.id)}>
        <span className="visually-hidden">Open </span>
        <span className="project-row__name">{project.name}</span>
        {project.description && (
          <span className="project-row__description">{project.description}</span>
        )}
      </button>
      <span className="project-row__meta">{meta}</span>
      <div className="project-row__operations">
        <button
          type="button"
          className="action-icon-button"
          title={isArchived ? "Restore project" : "Archive project"}
          aria-label={isArchived ? `Restore ${project.name}` : `Archive ${project.name}`}
          onClick={toggleArchive}
        >
          {isArchived ? (
            <ArchiveRestore aria-hidden="true" />
          ) : (
            <Archive aria-hidden="true" />
          )}
        </button>
      </div>
    </li>
  );
}

function ProjectList({
  projects,
  projectsController,
  actions,
  filter,
  onOpen,
}: {
  projects: Project[];
  projectsController: ProjectsController;
  actions: Action[];
  filter: ProjectFilter;
  onOpen: (id: string) => void;
}) {
  if (projects.length === 0) {
    const copy =
      filter === "active"
        ? {
            title: "No active projects.",
            body: "Create a project above, or restore one from the archive.",
          }
        : filter === "archived"
          ? {
              title: "Nothing archived.",
              body: "Projects you archive keep their details and remain available here.",
            }
          : { title: "No projects yet.", body: "Create a project above to get started." };

    return (
      <div className="empty empty--compact">
        <h2 className="empty__title">{copy.title}</h2>
        <p className="empty__body">{copy.body}</p>
      </div>
    );
  }

  return (
    <ul className="project-list">
      {projects.map((project) => (
        <ProjectRow
          key={project.id}
          project={project}
          projects={projectsController}
          actions={actions}
          onOpen={onOpen}
        />
      ))}
    </ul>
  );
}

function ProjectsIndex({
  projects,
  actions,
  filter,
  onFilterChange,
  onOpen,
}: {
  projects: ProjectsController;
  actions: Action[];
  filter: ProjectFilter;
  onFilterChange: (filter: ProjectFilter) => void;
  onOpen: (id: string) => void;
}) {
  const [creating, setCreating] = useState(false);
  const firstProjectActionRef = useRef<HTMLButtonElement>(null);
  const activeProjects = useMemo(
    () =>
      sortByRecent(
        projects.projects.filter((project) => project.status === "active"),
        actions,
      ),
    [projects.projects, actions],
  );
  const archivedProjects = useMemo(
    () =>
      sortByRecent(
        projects.projects.filter((project) => project.status === "archived"),
        actions,
      ),
    [projects.projects, actions],
  );
  const counts: Record<ProjectFilter, number> = {
    active: activeProjects.length,
    archived: archivedProjects.length,
    all: projects.projects.length,
  };
  const visibleProjects =
    filter === "active"
      ? activeProjects
      : filter === "archived"
        ? archivedProjects
        : sortByRecent(projects.projects, actions);
  const isFirstProject = projects.projects.length === 0;

  function createProject(name: string): ProjectMutationResult {
    const result = projects.addProject(name);
    if (result.ok) onOpen(result.project.id);
    return result;
  }

  function cancelFirstProject() {
    setCreating(false);
    // The form disappears on cancel, so return focus to the control that
    // opened it rather than dropping focus onto the document.
    window.setTimeout(() => firstProjectActionRef.current?.focus(), 0);
  }

  return (
    <>
      <h1 className="canvas__title projects-index__title" tabIndex={-1}>
        Projects
      </h1>

      {projects.storageError && (
        <p className="storage-warning" role="status">
          {projects.storageError}
        </p>
      )}

      {isFirstProject && !creating ? (
        <section className="empty projects-empty" aria-labelledby="projects-empty-title">
          <h2 id="projects-empty-title" className="empty__title">
            Keep the thread of a project.
          </h2>
          <p className="empty__body projects-empty__body">
            Create a project for work you will return to. Its actions, notes, and decisions will
            gather here, so you can resume without reconstructing the context.
          </p>
          <button
            type="button"
            ref={firstProjectActionRef}
            className="action-button action-button--primary action-button--with-icon projects-empty__action"
            onClick={() => setCreating(true)}
          >
            <PlusIcon aria-hidden="true" />
            <span>Create your first project</span>
          </button>
        </section>
      ) : (
        <>
          <ProjectForm
            onCreate={createProject}
            onCancel={isFirstProject ? cancelFirstProject : undefined}
            autoFocus={isFirstProject}
          />

          {!isFirstProject && (
            <>
              <ProjectFilterBar filter={filter} counts={counts} onChange={onFilterChange} />
              <ProjectList
                projects={visibleProjects}
                projectsController={projects}
                actions={actions}
                filter={filter}
                onOpen={onOpen}
              />
            </>
          )}
        </>
      )}
    </>
  );
}

function ProjectActions({
  project,
  actions,
  projects,
  nextActionId,
  actionFormInputId,
}: {
  project: Project;
  actions: ActionsController;
  projects: Project[];
  nextActionId?: string;
  actionFormInputId: string;
}) {
  const titleId = useId();
  const todayDate = todayKey();
  const isArchived = project.status === "archived";
  const linkedActions = actions.actions.filter((action) => action.projectId === project.id);
  const openActions = linkedActions.filter((action) => action.status === "open");
  const otherOpenActions = nextActionId
    ? openActions.filter((action) => action.id !== nextActionId)
    : openActions;
  const completedActions = linkedActions
    .filter((action) => action.status === "completed")
    .sort(
      (left, right) =>
        (right.completedAt ?? "").localeCompare(left.completedAt ?? "") ||
        left.title.localeCompare(right.title),
    );
  const hasActions = linkedActions.length > 0;

  return (
    <section className="project-actions" aria-labelledby={titleId}>
      <div className="project-actions__heading">
        <h2 id={titleId} className="project-actions__title">
          Actions
        </h2>
        <span className="project-actions__count">
          {openActions.length} open
        </span>
      </div>
      <p className="project-actions__intro">
        {isArchived
          ? "This project is archived. Its actions remain part of Today and Actions."
          : nextActionId
            ? "Add work here. The next action is shown in Resume above."
            : "Add work here, or assign an existing action from Today and Actions."}
      </p>

      {isArchived ? (
        <p className="project-actions__note">
          Restore this project to add new actions.
        </p>
      ) : (
        <ActionForm
          projectId={project.id}
          inputId={actionFormInputId}
          onSubmit={(draft) => actions.addAction({ ...draft, projectId: project.id })}
        />
      )}

      {otherOpenActions.length > 0 && (
        <>
          {nextActionId && (
            <h3 className="project-actions__subtitle">Other open actions</h3>
          )}
          <ActionList
            items={otherOpenActions}
            actions={actions}
            projects={projects}
            todayDate={todayDate}
            empty=""
            anchorPrefix="project-action-"
          />
        </>
      )}
      {hasActions && openActions.length === 0 && (
        <p className="project-actions__empty">No open actions right now.</p>
      )}
      {!hasActions && (
        <p className="project-actions__empty">
          {isArchived
            ? "This project has no actions."
            : "Actions assigned to this project will gather here."}
        </p>
      )}

      {completedActions.length > 0 && (
        <>
          <h3 className="project-actions__subtitle">
            Completed
            <span className="project-actions__count">{completedActions.length}</span>
          </h3>
          <ActionList
            items={completedActions}
            actions={actions}
            projects={projects}
            todayDate={todayDate}
            empty=""
            anchorPrefix="project-action-"
          />
        </>
      )}
    </section>
  );
}

function ProjectFocus({
  project,
  projects,
}: {
  project: Project;
  projects: ProjectsController;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(project.currentFocus ?? "");
  const [error, setError] = useState<string>();
  const titleId = useId();
  const inputId = useId();
  const editButtonRef = useRef<HTMLButtonElement>(null);
  const isArchived = project.status === "archived";

  function beginEdit() {
    setDraft(project.currentFocus ?? "");
    setError(undefined);
    setEditing(true);
  }

  function cancelEdit() {
    setDraft(project.currentFocus ?? "");
    setError(undefined);
    setEditing(false);
    window.setTimeout(() => editButtonRef.current?.focus(), 0);
  }

  function save() {
    const result = projects.updateProjectFocus(project.id, draft);
    if (!result.ok) {
      setError(result.error);
      return;
    }

    setDraft(result.project.currentFocus ?? "");
    setError(undefined);
    setEditing(false);
    window.setTimeout(() => editButtonRef.current?.focus(), 0);
  }

  return (
    <section className="project-focus" aria-labelledby={titleId}>
      <div className="project-focus__heading">
        <h2 id={titleId} className="project-focus__title">
          Current focus
        </h2>
        {!isArchived && !editing && (
          <button
            ref={editButtonRef}
            type="button"
            className="context-action"
            onClick={beginEdit}
          >
            <EditIcon aria-hidden="true" />
            <span>{project.currentFocus ? "Edit focus" : "Set focus"}</span>
          </button>
        )}
      </div>

      {editing ? (
        <>
          <label className="visually-hidden" htmlFor={inputId}>
            Current focus
          </label>
          <textarea
            id={inputId}
            className="project-detail__textarea project-focus__textarea"
            value={draft}
            autoFocus
            placeholder="What outcome are you pursuing right now?"
            onChange={(event) => {
              setDraft(event.target.value);
              if (error) setError(undefined);
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                cancelEdit();
              } else if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                event.preventDefault();
                save();
              }
            }}
          />
          <div className="project-detail__edit-actions">
            <button type="button" className="action-button" onClick={cancelEdit}>
              Cancel
            </button>
            <button
              type="button"
              className="action-button action-button--primary"
              onClick={save}
            >
              Save focus
            </button>
          </div>
          {error && (
            <p className="project-detail__error" role="alert">
              {error}
            </p>
          )}
        </>
      ) : project.currentFocus ? (
        <p className="project-focus__value">{project.currentFocus}</p>
      ) : (
        <p className="project-focus__value project-focus__value--empty">
          {isArchived
            ? "No focus was recorded for this project."
            : "Name the outcome you are pursuing so this project stays pointed."}
        </p>
      )}
    </section>
  );
}

function ProjectResume({
  project,
  projects,
  actions,
  nextChoice,
  actionFormInputId,
  onJump,
}: {
  project: Project;
  projects: ProjectsController;
  actions: ActionsController;
  nextChoice?: NextActionChoice;
  actionFormInputId: string;
  onJump: (targetId: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(project.resume?.note ?? "");
  const [error, setError] = useState<string>();
  const titleId = useId();
  const inputId = useId();
  const errorId = useId();
  const editButtonRef = useRef<HTMLButtonElement>(null);
  const isArchived = project.status === "archived";
  const todayDate = todayKey();
  const latestDecision = useMemo(
    () => sortContextItems(project.decisions)[0],
    [project.decisions],
  );
  const latestNote = useMemo(() => sortContextItems(project.notes)[0], [project.notes]);

  const rememberLinks: ContextLink[] = [];
  if (latestDecision) {
    rememberLinks.push({
      key: `decision:${latestDecision.id}`,
      kind: "Decision",
      text: latestDecision.statement,
      meta: formatRelativeProjectDate(latestDecision.updatedAt),
      targetId: `project-decision-${latestDecision.id}`,
      ariaLabel: `Go to decision: ${latestDecision.statement} (updated ${formatRelativeProjectDate(latestDecision.updatedAt)})`,
    });
  }
  if (latestNote) {
    rememberLinks.push({
      key: `note:${latestNote.id}`,
      kind: "Note",
      text: latestNote.title,
      meta: formatRelativeProjectDate(latestNote.updatedAt),
      targetId: `project-note-${latestNote.id}`,
      ariaLabel: `Go to note: ${latestNote.title} (updated ${formatRelativeProjectDate(latestNote.updatedAt)})`,
    });
  }

  function beginEdit() {
    setDraft(project.resume?.note ?? "");
    setError(undefined);
    setEditing(true);
  }

  function cancelEdit() {
    setDraft(project.resume?.note ?? "");
    setError(undefined);
    setEditing(false);
    window.setTimeout(() => editButtonRef.current?.focus(), 0);
  }

  function save() {
    const result = projects.updateProjectResume(project.id, draft);
    if (!result.ok) {
      setError(result.error);
      return;
    }

    setDraft(result.project.resume?.note ?? "");
    setError(undefined);
    setEditing(false);
    window.setTimeout(() => editButtonRef.current?.focus(), 0);
  }

  function focusActionForm() {
    const input = document.getElementById(actionFormInputId);
    if (!input) return;
    input.scrollIntoView({ block: "center", behavior: "auto" });
    input.focus({ preventScroll: true });
  }

  return (
    <section className="project-resume" aria-labelledby={titleId}>
      <h2 id={titleId} className="project-resume__title">
        Resume
      </h2>
      <p className="project-resume__intro">
        Your own note about where you stopped, paired with the next action from this
        project’s open work.
      </p>
      {isArchived && (
        <p className="project-resume__archived">
          This project is archived. Restore it to change the resume note.
        </p>
      )}

      <div className="project-resume__block">
        <div className="project-resume__block-heading">
          <h3 className="project-resume__block-title">
            Where I left off
            <span className="project-resume__provenance">Written by you</span>
          </h3>
          {!isArchived && !editing && (
            <button
              ref={editButtonRef}
              type="button"
              className="context-action"
              onClick={beginEdit}
            >
              <EditIcon aria-hidden="true" />
              <span>{project.resume ? "Edit note" : "Add note"}</span>
            </button>
          )}
        </div>

        {editing ? (
          <>
            <label className="visually-hidden" htmlFor={inputId}>
              Where I left off
            </label>
            <textarea
              id={inputId}
              className="project-detail__textarea project-resume__textarea"
              value={draft}
              autoFocus
              placeholder="A sentence about where you stopped and what comes next."
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? errorId : undefined}
              onChange={(event) => {
                setDraft(event.target.value);
                if (error) setError(undefined);
              }}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  cancelEdit();
                } else if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                  event.preventDefault();
                  save();
                }
              }}
            />
            <div className="project-detail__edit-actions">
              <button type="button" className="action-button" onClick={cancelEdit}>
                Cancel
              </button>
              <button
                type="button"
                className="action-button action-button--primary"
                onClick={save}
              >
                Save note
              </button>
            </div>
            {error && (
              <p id={errorId} className="project-detail__error" role="alert">
                {error}
              </p>
            )}
          </>
        ) : project.resume ? (
          <>
            <p id="project-resume-note" tabIndex={-1} className="project-resume__note">
              {project.resume.note}
            </p>
            <p className="project-resume__meta">{formatResumeMeta(project.resume)}</p>
          </>
        ) : (
          <p className="project-resume__empty">
            {isArchived
              ? "No resume note was recorded for this project."
              : "No note yet. Write a line about where you stopped so returning takes less time."}
          </p>
        )}
      </div>

      <div className="project-resume__block">
        <div className="project-resume__block-heading">
          <h3 className="project-resume__block-title">
            Next action
            <span className="project-resume__provenance">From open actions</span>
          </h3>
        </div>
        {nextChoice ? (
          <>
            <p className="project-resume__reason">{nextChoice.reason}</p>
            <ul className="action-list project-resume__action-list">
              <ActionRow
                action={nextChoice.action}
                actions={actions}
                projects={projects.projects}
                todayDate={todayDate}
                anchorId={`project-action-${nextChoice.action.id}`}
              />
            </ul>
          </>
        ) : (
          <>
            <p className="project-resume__empty">
              {isArchived
                ? "No open actions."
                : "No open actions yet. Add one to give this project a next step."}
            </p>
            {!isArchived && (
              <button
                type="button"
                className="context-action project-resume__add-action"
                onClick={focusActionForm}
              >
                <PlusIcon aria-hidden="true" />
                <span>Add an action</span>
              </button>
            )}
          </>
        )}
      </div>

      <div className="project-resume__block">
        <div className="project-resume__block-heading">
          <h3 className="project-resume__block-title">Worth remembering</h3>
        </div>
        {rememberLinks.length > 0 ? (
          <ContextLinks links={rememberLinks} onJump={onJump} />
        ) : (
          <p className="project-resume__empty">No decisions or notes recorded yet.</p>
        )}
      </div>
    </section>
  );
}

function NoteForm({
  initialTitle = "",
  initialContent = "",
  submitLabel,
  onSave,
  onCancel,
}: {
  initialTitle?: string;
  initialContent?: string;
  submitLabel: string;
  onSave: (title: string, content: string) => string | undefined;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(initialTitle);
  const [content, setContent] = useState(initialContent);
  const [error, setError] = useState<string>();
  const fieldId = useId();
  const errorId = useId();
  const titleRef = useRef<HTMLInputElement>(null);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextError = onSave(title, content);
    if (nextError) {
      setError(nextError);
      titleRef.current?.focus();
      titleRef.current?.select();
    }
  }

  return (
    <form
      className="context-form"
      onSubmit={submit}
      noValidate
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          onCancel();
        } else if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
          event.preventDefault();
          event.currentTarget.requestSubmit();
        }
      }}
    >
      <div className="context-form__field">
        <label className="context-form__label" htmlFor={`${fieldId}-title`}>
          Note title
        </label>
        <input
          ref={titleRef}
          id={`${fieldId}-title`}
          className="context-form__input"
          value={title}
          autoFocus
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          onFocus={(event) => event.currentTarget.select()}
          onChange={(event) => {
            setTitle(event.target.value);
            if (error) setError(undefined);
          }}
        />
      </div>
      <div className="context-form__field">
        <label className="context-form__label" htmlFor={`${fieldId}-content`}>
          Note
        </label>
        <textarea
          id={`${fieldId}-content`}
          className="context-form__textarea"
          value={content}
          placeholder="What is worth remembering?"
          onChange={(event) => {
            setContent(event.target.value);
            if (error) setError(undefined);
          }}
        />
      </div>
      {error && (
        <p id={errorId} className="context-form__error" role="alert">
          {error}
        </p>
      )}
      <div className="context-form__actions">
        <button type="button" className="action-button" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="action-button action-button--primary">
          {submitLabel}
        </button>
      </div>
    </form>
  );
}

function DecisionForm({
  initialStatement = "",
  initialRationale = "",
  submitLabel,
  onSave,
  onCancel,
}: {
  initialStatement?: string;
  initialRationale?: string;
  submitLabel: string;
  onSave: (statement: string, rationale: string) => string | undefined;
  onCancel: () => void;
}) {
  const [statement, setStatement] = useState(initialStatement);
  const [rationale, setRationale] = useState(initialRationale);
  const [error, setError] = useState<string>();
  const fieldId = useId();
  const errorId = useId();
  const statementRef = useRef<HTMLTextAreaElement>(null);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextError = onSave(statement, rationale);
    if (nextError) {
      setError(nextError);
      statementRef.current?.focus();
      statementRef.current?.select();
    }
  }

  return (
    <form
      className="context-form"
      onSubmit={submit}
      noValidate
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          onCancel();
        } else if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
          event.preventDefault();
          event.currentTarget.requestSubmit();
        }
      }}
    >
      <div className="context-form__field">
        <label className="context-form__label" htmlFor={`${fieldId}-statement`}>
          Decision
        </label>
        <textarea
          ref={statementRef}
          id={`${fieldId}-statement`}
          className="context-form__textarea context-form__textarea--statement"
          value={statement}
          autoFocus
          placeholder="What was decided?"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          onChange={(event) => {
            setStatement(event.target.value);
            if (error) setError(undefined);
          }}
        />
      </div>
      <div className="context-form__field">
        <label className="context-form__label" htmlFor={`${fieldId}-rationale`}>
          Why
        </label>
        <textarea
          id={`${fieldId}-rationale`}
          className="context-form__textarea"
          value={rationale}
          placeholder="What makes this the right choice?"
          onChange={(event) => {
            setRationale(event.target.value);
            if (error) setError(undefined);
          }}
        />
      </div>
      {error && (
        <p id={errorId} className="context-form__error" role="alert">
          {error}
        </p>
      )}
      <div className="context-form__actions">
        <button type="button" className="action-button" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="action-button action-button--primary">
          {submitLabel}
        </button>
      </div>
    </form>
  );
}

function NoteItem({
  note,
  project,
  projects,
  isArchived,
  onRemoved,
}: {
  note: ProjectNote;
  project: Project;
  projects: ProjectsController;
  isArchived: boolean;
  onRemoved: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string>();
  const itemRef = useRef<HTMLLIElement>(null);
  const editButtonRef = useRef<HTMLButtonElement>(null);
  const confirm = useConfirm();

  function save(title: string, content: string): string | undefined {
    const result = projects.updateNote(project.id, note.id, title, content);
    if (!result.ok) return result.error;

    setError(undefined);
    setEditing(false);
    window.setTimeout(() => editButtonRef.current?.focus(), 0);
    return undefined;
  }

  function cancel() {
    setError(undefined);
    setEditing(false);
    window.setTimeout(() => editButtonRef.current?.focus(), 0);
  }

  return (
    <li
      ref={itemRef}
      id={`project-note-${note.id}`}
      tabIndex={-1}
      className="context-item"
    >
      {editing ? (
        <NoteForm
          initialTitle={note.title}
          initialContent={note.content}
          submitLabel="Save note"
          onSave={save}
          onCancel={cancel}
        />
      ) : (
        <>
          <div className="context-item__heading">
            <h4 className="context-item__title">{note.title}</h4>
            {!isArchived && (
              <div className="context-item__operations">
                <button
                  ref={editButtonRef}
                  type="button"
                  className="action-icon-button"
                  title="Edit note"
                  aria-label={`Edit note ${note.title} in ${project.name}`}
                  onClick={() => {
                    setError(undefined);
                    setEditing(true);
                  }}
                >
                  <EditIcon aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="action-icon-button action-icon-button--quiet"
                  title="Delete note"
                  aria-label={`Delete note ${note.title} in ${project.name}`}
                  onClick={(event) => {
                    const row = itemRef.current;
                    confirm({
                      title: "Delete note?",
                      description: `“${note.title}” will be removed from ${project.name}. This cannot be undone.`,
                      confirmLabel: "Delete",
                      trigger: event.currentTarget,
                      onConfirm: () => {
                        const result = projects.deleteNote(project.id, note.id);
                        if (!result.ok) {
                          setError(result.error);
                          return;
                        }
                        focusAfterContextRemoval(row, onRemoved);
                      },
                    });
                  }}
                >
                  <TrashIcon aria-hidden="true" />
                </button>
              </div>
            )}
          </div>
          {note.content && <p className="context-item__body">{note.content}</p>}
          <p className="context-item__meta">{formatContextMeta("Note", note)}</p>
          {error && (
            <p className="project-detail__error" role="alert">
              {error}
            </p>
          )}
        </>
      )}
    </li>
  );
}

function DecisionItem({
  decision,
  project,
  projects,
  isArchived,
  onRemoved,
}: {
  decision: ProjectDecision;
  project: Project;
  projects: ProjectsController;
  isArchived: boolean;
  onRemoved: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string>();
  const itemRef = useRef<HTMLLIElement>(null);
  const editButtonRef = useRef<HTMLButtonElement>(null);
  const confirm = useConfirm();

  function save(statement: string, rationale: string): string | undefined {
    const result = projects.updateDecision(project.id, decision.id, statement, rationale);
    if (!result.ok) return result.error;

    setError(undefined);
    setEditing(false);
    window.setTimeout(() => editButtonRef.current?.focus(), 0);
    return undefined;
  }

  function cancel() {
    setError(undefined);
    setEditing(false);
    window.setTimeout(() => editButtonRef.current?.focus(), 0);
  }

  return (
    <li
      ref={itemRef}
      id={`project-decision-${decision.id}`}
      tabIndex={-1}
      className="context-item"
    >
      {editing ? (
        <DecisionForm
          initialStatement={decision.statement}
          initialRationale={decision.rationale}
          submitLabel="Save decision"
          onSave={save}
          onCancel={cancel}
        />
      ) : (
        <>
          <div className="context-item__heading">
            <h4 className="context-item__title">{decision.statement}</h4>
            {!isArchived && (
              <div className="context-item__operations">
                <button
                  ref={editButtonRef}
                  type="button"
                  className="action-icon-button"
                  title="Edit decision"
                  aria-label={`Edit decision ${decision.statement} in ${project.name}`}
                  onClick={() => {
                    setError(undefined);
                    setEditing(true);
                  }}
                >
                  <EditIcon aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="action-icon-button action-icon-button--quiet"
                  title="Delete decision"
                  aria-label={`Delete decision ${decision.statement} in ${project.name}`}
                  onClick={(event) => {
                    const row = itemRef.current;
                    confirm({
                      title: "Delete decision?",
                      description: `“${decision.statement}” and its reasoning will be removed from ${project.name}. This cannot be undone.`,
                      confirmLabel: "Delete",
                      trigger: event.currentTarget,
                      onConfirm: () => {
                        const result = projects.deleteDecision(project.id, decision.id);
                        if (!result.ok) {
                          setError(result.error);
                          return;
                        }
                        focusAfterContextRemoval(row, onRemoved);
                      },
                    });
                  }}
                >
                  <TrashIcon aria-hidden="true" />
                </button>
              </div>
            )}
          </div>
          <div className="context-item__why">
            <span className="context-item__label">Why</span>
            <p
              className={
                decision.rationale
                  ? "context-item__body"
                  : "context-item__body context-item__body--empty"
              }
            >
              {decision.rationale || "No rationale was recorded."}
            </p>
          </div>
          <p className="context-item__meta">{formatContextMeta("Decision", decision)}</p>
          {error && (
            <p className="project-detail__error" role="alert">
              {error}
            </p>
          )}
        </>
      )}
    </li>
  );
}

function ProjectNotes({
  project,
  projects,
  revealId,
}: {
  project: Project;
  projects: ProjectsController;
  revealId?: string;
}) {
  const [creating, setCreating] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const titleId = useId();
  const addButtonRef = useRef<HTMLButtonElement>(null);
  const isArchived = project.status === "archived";
  const notes = useMemo(() => sortContextItems(project.notes), [project.notes]);
  const visibleNotes = showAll ? notes : notes.slice(0, RECENT_CONTEXT_LIMIT);

  useEffect(() => {
    // A link from activity or Resume may point at a note that is collapsed.
    if (!revealId?.startsWith("project-note-")) return;
    if (document.getElementById(revealId)) return;
    setShowAll(true);
  }, [revealId]);

  function focusAddButton() {
    addButtonRef.current?.focus();
  }

  function closeCreate() {
    setCreating(false);
    window.setTimeout(focusAddButton, 0);
  }

  return (
    <section className="context-section" aria-labelledby={titleId}>
      <div className="context-section__heading">
        <h3 id={titleId} className="context-section__title">
          Notes
          <span className="context-section__count">{notes.length}</span>
        </h3>
        {!isArchived && !creating && (
          <button
            ref={addButtonRef}
            type="button"
            className="context-action"
            onClick={() => setCreating(true)}
          >
            <PlusIcon aria-hidden="true" />
            <span>Add note</span>
          </button>
        )}
      </div>

      {creating && (
        <NoteForm
          submitLabel="Add note"
          onSave={(title, content) => {
            const result = projects.addNote(project.id, title, content);
            if (!result.ok) return result.error;
            closeCreate();
            return undefined;
          }}
          onCancel={closeCreate}
        />
      )}

      {!creating && notes.length === 0 && (
        <p className="context-section__empty">
          {isArchived
            ? "This project has no notes."
            : "No notes yet. Write down what you learn so it survives the next interruption."}
        </p>
      )}

      {notes.length > 0 && (
        <>
          <ul className="context-list">
            {visibleNotes.map((note) => (
              <NoteItem
                key={note.id}
                note={note}
                project={project}
                projects={projects}
                isArchived={isArchived}
                onRemoved={focusAddButton}
              />
            ))}
          </ul>
          {notes.length > RECENT_CONTEXT_LIMIT && (
            <button
              type="button"
              className="context-more"
              aria-expanded={showAll}
              onClick={() => setShowAll((current) => !current)}
            >
              {showAll ? "Show recent" : `Show all ${notes.length}`}
            </button>
          )}
        </>
      )}
    </section>
  );
}

function ProjectDecisions({
  project,
  projects,
  revealId,
}: {
  project: Project;
  projects: ProjectsController;
  revealId?: string;
}) {
  const [creating, setCreating] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const titleId = useId();
  const addButtonRef = useRef<HTMLButtonElement>(null);
  const isArchived = project.status === "archived";
  const decisions = useMemo(() => sortContextItems(project.decisions), [project.decisions]);
  const visibleDecisions = showAll ? decisions : decisions.slice(0, RECENT_CONTEXT_LIMIT);

  useEffect(() => {
    // A link from activity or Resume may point at a decision that is collapsed.
    if (!revealId?.startsWith("project-decision-")) return;
    if (document.getElementById(revealId)) return;
    setShowAll(true);
  }, [revealId]);

  function focusAddButton() {
    addButtonRef.current?.focus();
  }

  function closeCreate() {
    setCreating(false);
    window.setTimeout(focusAddButton, 0);
  }

  return (
    <section className="context-section" aria-labelledby={titleId}>
      <div className="context-section__heading">
        <h3 id={titleId} className="context-section__title">
          Decisions
          <span className="context-section__count">{decisions.length}</span>
        </h3>
        {!isArchived && !creating && (
          <button
            ref={addButtonRef}
            type="button"
            className="context-action"
            onClick={() => setCreating(true)}
          >
            <PlusIcon aria-hidden="true" />
            <span>Add decision</span>
          </button>
        )}
      </div>

      {creating && (
        <DecisionForm
          submitLabel="Add decision"
          onSave={(statement, rationale) => {
            const result = projects.addDecision(project.id, statement, rationale);
            if (!result.ok) return result.error;
            closeCreate();
            return undefined;
          }}
          onCancel={closeCreate}
        />
      )}

      {!creating && decisions.length === 0 && (
        <p className="context-section__empty">
          {isArchived
            ? "This project has no decisions."
            : "No decisions yet. Record what you chose and why, so you do not relitigate it later."}
        </p>
      )}

      {decisions.length > 0 && (
        <>
          <ul className="context-list">
            {visibleDecisions.map((decision) => (
              <DecisionItem
                key={decision.id}
                decision={decision}
                project={project}
                projects={projects}
                isArchived={isArchived}
                onRemoved={focusAddButton}
              />
            ))}
          </ul>
          {decisions.length > RECENT_CONTEXT_LIMIT && (
            <button
              type="button"
              className="context-more"
              aria-expanded={showAll}
              onClick={() => setShowAll((current) => !current)}
            >
              {showAll ? "Show recent" : `Show all ${decisions.length}`}
            </button>
          )}
        </>
      )}
    </section>
  );
}

function ProjectContinuity({
  project,
  projects,
  revealId,
}: {
  project: Project;
  projects: ProjectsController;
  revealId?: string;
}) {
  const titleId = useId();
  const isArchived = project.status === "archived";

  return (
    <section className="project-continuity" aria-labelledby={titleId}>
      <h2 id={titleId} className="project-continuity__title">
        Continuity
      </h2>
      <p className="project-continuity__intro">
        Notes and decisions for {project.name}, kept apart from its actions.
      </p>
      {isArchived && (
        <p className="project-continuity__note">
          This project is archived. Restore it to change its focus, notes, or decisions.
        </p>
      )}
      <ProjectNotes project={project} projects={projects} revealId={revealId} />
      <ProjectDecisions project={project} projects={projects} revealId={revealId} />
    </section>
  );
}

function ProjectActivity({
  project,
  actions,
  onJump,
}: {
  project: Project;
  actions: Action[];
  onJump: (targetId: string) => void;
}) {
  const titleId = useId();
  const entries = useMemo(() => buildProjectActivity(project, actions), [project, actions]);
  const links = entries.map(activityLink);

  return (
    <section className="project-activity" aria-labelledby={titleId}>
      <h2 id={titleId} className="project-activity__title">
        Recent activity
      </h2>
      <p className="project-activity__intro">
        What changed in this project and its work, newest first. Your resume note stays
        in your own words above.
      </p>
      {links.length > 0 ? (
        <ContextLinks links={links} onJump={onJump} />
      ) : (
        <p className="project-activity__empty">
          No activity recorded yet. Adding an action, note, or decision will appear here.
        </p>
      )}
    </section>
  );
}

function ProjectDetail({
  project,
  projects,
  actions,
  onBack,
}: {
  project: Project;
  projects: ProjectsController;
  actions: ActionsController;
  onBack: () => void;
}) {
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(project.name);
  const [nameError, setNameError] = useState<string>();
  const [editingDescription, setEditingDescription] = useState(false);
  const [descriptionDraft, setDescriptionDraft] = useState(project.description ?? "");
  const [descriptionError, setDescriptionError] = useState<string>();
  const [actionError, setActionError] = useState<string>();
  const [revealId, setRevealId] = useState<string>();
  const titleRef = useRef<HTMLHeadingElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const descriptionInputRef = useRef<HTMLTextAreaElement>(null);
  const descriptionActionRef = useRef<HTMLButtonElement>(null);
  const descriptionId = useId();
  const actionFormInputId = useId();
  const todayDate = todayKey();
  const lastActivityAt = projectLastActivityAt(project, actions.actions);
  const nextChoice = useMemo(
    () =>
      selectNextOpenAction(
        actions.actions.filter((action) => action.projectId === project.id),
        todayDate,
      ),
    [actions.actions, project.id, todayDate],
  );

  useEffect(() => {
    // Focus returns to the title whenever inline renaming ends, and lands there
    // when the project opens so the next Tab reaches the project controls.
    if (!editingName) titleRef.current?.focus();
  }, [editingName]);

  const isArchived = project.status === "archived";

  function beginRename() {
    setNameDraft(project.name);
    setNameError(undefined);
    setEditingName(true);
  }

  function saveName(fromBlur = false) {
    const result = projects.renameProject(project.id, nameDraft);
    if (!result.ok) {
      setNameError(result.error);
      if (fromBlur) {
        setNameDraft(project.name);
        setEditingName(false);
      } else {
        nameInputRef.current?.focus();
        nameInputRef.current?.select();
      }
      return;
    }

    setNameDraft(result.project.name);
    setNameError(undefined);
    setEditingName(false);
  }

  function cancelRename() {
    setNameDraft(project.name);
    setNameError(undefined);
    setEditingName(false);
  }

  function beginDescriptionEdit() {
    setDescriptionDraft(project.description ?? "");
    setDescriptionError(undefined);
    setEditingDescription(true);
    window.setTimeout(() => descriptionInputRef.current?.focus(), 0);
  }

  function saveDescription() {
    const result = projects.updateProjectDescription(project.id, descriptionDraft);
    if (!result.ok) {
      setDescriptionError(result.error);
      return;
    }

    setDescriptionDraft(result.project.description ?? "");
    setDescriptionError(undefined);
    setEditingDescription(false);
    window.setTimeout(() => descriptionActionRef.current?.focus(), 0);
  }

  function cancelDescriptionEdit() {
    setDescriptionDraft(project.description ?? "");
    setDescriptionError(undefined);
    setEditingDescription(false);
    window.setTimeout(() => descriptionActionRef.current?.focus(), 0);
  }

  function toggleArchive() {
    const result = isArchived
      ? projects.restoreProject(project.id)
      : projects.archiveProject(project.id);
    setActionError(result.ok ? undefined : result.error);
  }

  function jumpTo(targetId: string) {
    setRevealId(targetId);
    focusWhenAvailable(targetId);
  }

  return (
    <div className="project-detail">
      <button type="button" className="project-detail__back" onClick={onBack}>
        <ArrowLeft aria-hidden="true" />
        <span>Projects</span>
      </button>

      <div className="project-detail__identity">
        <div className="project-detail__title-group">
          {editingName ? (
            <input
              ref={nameInputRef}
              className="project-detail__name-input"
              aria-label="Project name"
              value={nameDraft}
              autoFocus
              onFocus={(event) => event.currentTarget.select()}
              onChange={(event) => {
                setNameDraft(event.target.value);
                if (nameError) setNameError(undefined);
              }}
              onBlur={() => saveName(true)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  saveName();
                } else if (event.key === "Escape") {
                  event.preventDefault();
                  cancelRename();
                }
              }}
            />
          ) : (
            <h1 ref={titleRef} tabIndex={-1} className="canvas__title project-detail__title">
              {project.name}
            </h1>
          )}

          <div className="project-detail__meta">
            <span>Created {formatProjectDate(project.createdAt)}</span>
            <span aria-hidden="true">·</span>
            <span>Updated {formatRelativeProjectDate(lastActivityAt)}</span>
            {isArchived && (
              <>
                <span aria-hidden="true">·</span>
                <span className="project-detail__status">Archived</span>
              </>
            )}
          </div>
        </div>

        <div className="project-detail__operations">
          {!editingName && (
            <button
              type="button"
              className="action-icon-button"
              title="Rename project"
              aria-label={`Rename ${project.name}`}
              onClick={beginRename}
            >
              <EditIcon aria-hidden="true" />
            </button>
          )}
          <button
            type="button"
            className="action-button action-button--with-icon project-detail__archive"
            aria-label={isArchived ? `Restore ${project.name}` : `Archive ${project.name}`}
            onClick={toggleArchive}
          >
            {isArchived ? (
              <ArchiveRestore aria-hidden="true" />
            ) : (
              <Archive aria-hidden="true" />
            )}
            <span>{isArchived ? "Restore" : "Archive"}</span>
          </button>
        </div>
      </div>

      {nameError && (
        <p className="project-detail__error" role="alert">
          {nameError}
        </p>
      )}
      {actionError && (
        <p className="project-detail__error" role="alert">
          {actionError}
        </p>
      )}

      <div className="project-detail__description-block">
        {editingDescription ? (
          <>
            <label className="visually-hidden" htmlFor={descriptionId}>
              Project description
            </label>
            <textarea
              ref={descriptionInputRef}
              id={descriptionId}
              className="project-detail__textarea"
              value={descriptionDraft}
              placeholder="What is this project for?"
              onChange={(event) => {
                setDescriptionDraft(event.target.value);
                if (descriptionError) setDescriptionError(undefined);
              }}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  cancelDescriptionEdit();
                } else if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                  event.preventDefault();
                  saveDescription();
                }
              }}
            />
            <div className="project-detail__edit-actions">
              <button
                type="button"
                className="action-button"
                onClick={cancelDescriptionEdit}
              >
                Cancel
              </button>
              <button
                type="button"
                className="action-button action-button--primary"
                onClick={saveDescription}
              >
                Save description
              </button>
            </div>
            {descriptionError && (
              <p className="project-detail__error" role="alert">
                {descriptionError}
              </p>
            )}
          </>
        ) : (
          <>
            {project.description ? (
              <p className="project-detail__description">{project.description}</p>
            ) : (
              <p className="project-detail__description project-detail__description--empty">
                Add a description to keep this project’s purpose close at hand.
              </p>
            )}
            <button
              type="button"
              className="project-detail__text-action"
              ref={descriptionActionRef}
              onClick={beginDescriptionEdit}
            >
              <EditIcon aria-hidden="true" />
              <span>{project.description ? "Edit description" : "Add description"}</span>
            </button>
          </>
        )}
      </div>

      <ProjectFocus project={project} projects={projects} />

      <ProjectResume
        project={project}
        projects={projects}
        actions={actions}
        nextChoice={nextChoice}
        actionFormInputId={actionFormInputId}
        onJump={jumpTo}
      />

      <ProjectActions
        project={project}
        actions={actions}
        projects={projects.projects}
        nextActionId={nextChoice?.action.id}
        actionFormInputId={actionFormInputId}
      />

      <ProjectContinuity project={project} projects={projects} revealId={revealId} />

      <ProjectActivity project={project} actions={actions.actions} onJump={jumpTo} />
    </div>
  );
}

export function ProjectsCanvas({ projects, actions }: { projects: ProjectsController; actions: ActionsController }) {
  const [selectedId, setSelectedId] = useState<string>();
  const [filter, setFilter] = useState<ProjectFilter>("active");
  const selectedProject = selectedId
    ? projects.projects.find((project) => project.id === selectedId)
    : undefined;

  function backToList() {
    setSelectedId(undefined);
    window.setTimeout(() => {
      document.querySelector<HTMLElement>(".projects-index__title")?.focus();
    }, 0);
  }

  if (selectedProject) {
    return (
      <ProjectDetail
        key={selectedProject.id}
        project={selectedProject}
        projects={projects}
        actions={actions}
        onBack={backToList}
      />
    );
  }

  return (
    <ProjectsIndex
      projects={projects}
      actions={actions.actions}
      filter={filter}
      onFilterChange={setFilter}
      onOpen={setSelectedId}
    />
  );
}
