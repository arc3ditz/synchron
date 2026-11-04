import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { selectNextOpenAction } from "../actionStore";
import { formatRelativeProjectDate } from "../dates";
import { projectLastActivityAt } from "../projectActivity";
import {
  buildHomeAttention,
  selectContinueProject,
  selectTopNextAction,
  type HomeAttentionItem,
  type WorkspaceNextAction,
} from "../homeOverview";
import type { ActionsController } from "../hooks/useActions";
import type { ProjectsController } from "../hooks/useProjects";
import type { Project } from "../projectStore";
import { projectStatusLabel } from "../projectStore";
import { ActionRow, todayKey } from "./ActionViews";
import { PlusIcon } from "./icons";

interface HomeCanvasProps {
  actions: ActionsController;
  projects: ProjectsController;
  /** Opens a project, optionally revealing one item inside it. */
  onOpenProject: (projectId: string, targetId?: string) => void;
  onOpenInbox: () => void;
  onOpenProjects: () => void;
}

/**
 * Quick capture. It writes straight to the inbox the app already has, so
 * there is one capture flow and one place to triage what was captured.
 */
function HomeCapture({
  onCapture,
  onOpenInbox,
}: {
  onCapture: (title: string) => void;
  onOpenInbox: () => void;
}) {
  const [title, setTitle] = useState("");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) return;

    onCapture(trimmed);
    setTitle("");
  }

  return (
    <div className="home-capture">
      <form className="home-capture__form" onSubmit={submit}>
        <input
          className="home-capture__input"
          aria-label="Capture intention"
          placeholder="What is on your mind?"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
        <button
          className="home-capture__submit"
          type="submit"
          aria-label="Capture to the inbox"
          disabled={!title.trim()}
        >
          <PlusIcon aria-hidden="true" />
        </button>
      </form>
      <button type="button" className="home-capture__link" onClick={onOpenInbox}>
        Open inbox
      </button>
    </div>
  );
}

/**
 * The single most useful open action across every active project, chosen by
 * the same deterministic ranking each project's own next action uses. It
 * answers one question — "if I do one thing now, what is it?" — and states
 * the recorded reason, never an invented urgency. Completion and scheduling
 * work right here, and the project name in the row opens the project at the
 * action, using the anchor convention Home already uses.
 */
function HomeNextAction({
  item,
  actions,
  onOpenProject,
}: {
  item: WorkspaceNextAction;
  actions: ActionsController;
  onOpenProject: (projectId: string, targetId?: string) => void;
}) {
  return (
    <section className="home-section home-next" aria-labelledby="home-next-heading">
      <h2 id="home-next-heading" className="home-section__eyebrow">
        Do this next
      </h2>

      <ul className="action-list">
        <ActionRow
          key={item.action.id}
          action={item.action}
          actions={actions}
          todayDate={todayKey()}
          showReason
          onOpenProject={(projectId) => onOpenProject(projectId, item.targetId)}
        />
      </ul>

      <p className="home-next__project">
        In{" "}
        <button
          type="button"
          className="home-next__project-link"
          onClick={() => onOpenProject(item.project.id, item.targetId)}
        >
          {item.project.name}
        </button>
      </p>
    </section>
  );
}

/**
 * The project to continue: its name, the outcome being pursued, the user's
 * own note about where they stopped, and the next open action that follows
 * from it. Everything shown already exists in the project.
 */
function HomeContinue({
  project,
  actions,
  onOpenProject,
}: {
  project: Project;
  actions: ActionsController;
  onOpenProject: (projectId: string) => void;
}) {
  const todayDate = todayKey();
  const linked = actions.actions.filter((action) => action.projectId === project.id);
  const next = selectNextOpenAction(linked, todayDate);
  const openCount = linked.filter((action) => action.status === "open").length;

  return (
    <section className="home-section home-continue" aria-labelledby="home-continue-heading">
      <h2 id="home-continue-heading" className="home-section__eyebrow">
        Continue where you left off
      </h2>

      <button
        type="button"
        className="home-continue__name"
        onClick={() => onOpenProject(project.id)}
        aria-label={`Open project ${project.name}`}
      >
        {project.name}
      </button>

      {project.currentFocus ? (
        <p className="home-continue__focus">{project.currentFocus}</p>
      ) : (
        <p className="home-continue__focus home-continue__focus--empty">
          No focus recorded for this project yet.
        </p>
      )}

      {project.resume && (
        <blockquote className="home-continue__resume">
          <p className="home-continue__resume-text">{project.resume.note}</p>
          <p className="home-continue__resume-meta">
            Where you left off · {formatRelativeProjectDate(project.resume.updatedAt)}
          </p>
        </blockquote>
      )}

      {/* The activity line: how much work is open and when this project last
          moved, in the same relative-date language every other surface uses. */}
      <p className="home-continue__meta">
        {openCount === 0
          ? "No open actions"
          : openCount === 1
            ? "1 open action"
            : `${openCount} open actions`}
        <span className="home-continue__meta-sep" aria-hidden="true">·</span>
        Updated {formatRelativeProjectDate(projectLastActivityAt(project, actions.actions))}
      </p>

      <div className="home-continue__next">
        <p className="home-continue__next-label">Next action</p>
        {next ? (
          <ul className="action-list">
            {/* Keying by action keeps the row's edit state in step when
                completing one action reveals the next one. */}
            <ActionRow
              key={next.action.id}
              action={next.action}
              actions={actions}
              todayDate={todayDate}
              showReason
            />
          </ul>
        ) : (
          <p className="home-continue__next-empty">
            No open actions in this project yet. Open it to add the next one.
          </p>
        )}
      </div>
    </section>
  );
}

/**
 * Shown when projects exist but none holds anything to continue from. It names
 * the three signals that bring a project back here and points at the place to
 * record one, so the space above "Needs attention" still has a next step.
 */
function HomeContinueEmpty({ onOpenProjects }: { onOpenProjects: () => void }) {
  return (
    <section className="home-empty" aria-labelledby="home-continue-empty-heading">
      <h2 id="home-continue-empty-heading" className="home-empty__title">
        Nothing to pick up yet.
      </h2>
      <p className="home-empty__body">
        Open a project to record its current focus, add a resume note, or create an action.
        Home picks the project up from there.
      </p>
      <div className="home-empty__actions">
        <button
          type="button"
          className="action-button action-button--primary"
          onClick={onOpenProjects}
        >
          Open projects
        </button>
      </div>
    </section>
  );
}

/**
 * Projects with a recorded reason to come back to them. A card that names an
 * action opens the project at that action, using the same target the activity
 * view links with. The whole card stays one control: the action line is not a
 * second button inside it.
 */
function HomeAttention({
  items,
  onOpenProject,
}: {
  items: HomeAttentionItem[];
  onOpenProject: (projectId: string, targetId?: string) => void;
}) {
  return (
    <section className="home-section home-attention" aria-labelledby="home-attention-heading">
      <h2 id="home-attention-heading" className="home-section__eyebrow">
        Needs attention
      </h2>

      <ul className="home-attention__list">
        {items.map((item) => (
          <li key={item.project.id} className="home-attention__item">
            <button
              type="button"
              className="home-attention__open"
              onClick={() => onOpenProject(item.project.id, item.targetId)}
              aria-label={
                item.next
                  ? `Go to action: ${item.next.action.title} in ${item.project.name} (${item.reasonLabel})`
                  : `Open project ${item.project.name}`
              }
            >
              <span className="home-attention__name">{item.project.name}</span>
              <span className={`home-attention__reason home-attention__reason--${item.reason}`}>
                {item.reasonLabel}
              </span>
            </button>
            {item.next && (
              <p className="home-attention__next">{item.next.action.title}</p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * The first thing a new user sees. It invites the first project rather than
 * showing empty panels, and points at the inbox if something was captured
 * already.
 */
function HomeEmpty({
  inboxCount,
  parkedCount,
  onOpenProjects,
  onOpenInbox,
}: {
  inboxCount: number;
  parkedCount: number;
  onOpenProjects: () => void;
  onOpenInbox: () => void;
}) {
  const title =
    parkedCount > 0
      ? "Every project is on hold, completed, or archived."
      : "Start with the project you keep coming back to.";
  const body =
    parkedCount > 0
      ? "Bring one back to active — or start a new one — and Home will pick up its focus, notes, decisions, and open actions from there."
      : "A project holds the thread: the outcome you are pursuing, where you stopped, the notes and decisions along the way, and the actions waiting inside it. Home picks the story up from there.";

  return (
    <section className="home-empty" aria-labelledby="home-empty-heading">
      <h2 id="home-empty-heading" className="home-empty__title">
        {title}
      </h2>
      <p className="home-empty__body">{body}</p>
      {inboxCount > 0 && (
        <p className="home-empty__aside">
          {inboxCount === 1
            ? "One captured intention is waiting in your inbox."
            : `${inboxCount} captured intentions are waiting in your inbox.`}
        </p>
      )}
      <div className="home-empty__actions">
        <button
          type="button"
          className="action-button action-button--primary action-button--with-icon"
          onClick={onOpenProjects}
        >
          <PlusIcon aria-hidden="true" />
          <span>Open projects</span>
        </button>
        <button type="button" className="action-button" onClick={onOpenInbox}>
          Open the inbox
        </button>
      </div>
    </section>
  );
}

/**
 * Everything the lead card is not already carrying: each remaining project's
 * name, open work, last movement, and status, one hairline row per project.
 * Opening a project is the row button; the quiet meta never pretends to be
 * something to click.
 */
function HomeAcrossProjects({
  projects,
  actions,
  excludeProjectId,
  onOpenProject,
}: {
  projects: Project[];
  actions: ActionsController;
  excludeProjectId?: string;
  onOpenProject: (projectId: string) => void;
}) {
  const rows = projects.filter((project) => project.id !== excludeProjectId);
  if (rows.length === 0) return null;

  return (
    <section className="home-section home-across" aria-labelledby="home-across-heading">
      <h2 id="home-across-heading" className="home-section__eyebrow">
        Across your projects
      </h2>

      <ul className="home-across__list">
        {rows.map((project) => {
          const isNotActive = project.status !== "active";
          const openCount = actions.actions.filter(
            (action) => action.projectId === project.id && action.status === "open",
          ).length;
          return (
            <li key={project.id} className="home-across__item">
              <button
                type="button"
                className="home-across__open"
                onClick={() => onOpenProject(project.id)}
                aria-label={`Open project ${project.name}`}
              >
                <span
                  className={
                    isNotActive
                      ? "home-across__name home-across__name--archived"
                      : "home-across__name"
                  }
                >
                  {project.name}
                </span>
                {isNotActive && (
                  <span className="home-across__status">
                    {projectStatusLabel(project.status)}
                  </span>
                )}
              </button>
              <p className="home-across__meta">
                {openCount === 0
                  ? "No open actions"
                  : openCount === 1
                    ? "1 open action"
                    : `${openCount} open actions`}
                <span className="home-continue__meta-sep" aria-hidden="true">·</span>
                Updated {formatRelativeProjectDate(projectLastActivityAt(project, actions.actions))}
              </p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/**
 * Home is the workspace overview: the project to continue, the projects that
 * need a revisit, and the context that changed. It is derived entirely from
 * stored projects, actions, notes, and decisions.
 */
export function HomeCanvas({
  actions,
  projects,
  onOpenProject,
  onOpenInbox,
  onOpenProjects,
}: HomeCanvasProps) {
  const todayDate = todayKey();
  const activeProjects = useMemo(
    () => projects.projects.filter((project) => project.status === "active"),
    [projects.projects],
  );
  const parkedCount = projects.projects.length - activeProjects.length;
  const continueProject = useMemo(
    () => selectContinueProject(projects.projects, actions.actions),
    [projects.projects, actions.actions],
  );
  const nextAction = useMemo(
    () => selectTopNextAction(projects.projects, actions.actions, todayDate),
    [projects.projects, actions.actions, todayDate],
  );
  const attention = useMemo(
    () =>
      buildHomeAttention(projects.projects, actions.actions, todayDate, {
        excludeProjectId: continueProject?.id,
      }),
    [projects.projects, actions.actions, todayDate, continueProject?.id],
  );
  const hasProjectContext = attention.length > 0 || projects.projects.length > 1;
  return (
    <>
      <div className="home-header">
        <div className="home-header__intro">
          <h1 className="canvas__title home-title">Home</h1>
          <p className="home-header__tagline">Where your projects stand right now.</p>
        </div>
        <HomeCapture onCapture={actions.addInboxItem} onOpenInbox={onOpenInbox} />
      </div>

      {actions.storageError && (
        <p className="storage-warning" role="status">
          {actions.storageError}
        </p>
      )}

      {activeProjects.length === 0 ? (
        <HomeEmpty
          inboxCount={actions.inbox.length}
          parkedCount={parkedCount}
          onOpenProjects={onOpenProjects}
          onOpenInbox={onOpenInbox}
        />
      ) : (
        <div className={hasProjectContext ? "home-dashboard" : "home-dashboard home-dashboard--single"}>
          <div className="home-dashboard__main">
            {nextAction && (
              <HomeNextAction
                item={nextAction}
                actions={actions}
                onOpenProject={onOpenProject}
              />
            )}
            {continueProject ? (
              <HomeContinue
                project={continueProject}
                actions={actions}
                onOpenProject={onOpenProject}
              />
            ) : (
              <HomeContinueEmpty onOpenProjects={onOpenProjects} />
            )}
          </div>

          {hasProjectContext && (
            <aside className="home-dashboard__side" aria-label="Project updates">
              {attention.length > 0 && (
                <HomeAttention items={attention} onOpenProject={onOpenProject} />
              )}
              <HomeAcrossProjects
                projects={projects.projects}
                actions={actions}
                excludeProjectId={continueProject?.id}
                onOpenProject={onOpenProject}
              />
            </aside>
          )}
        </div>
      )}
    </>
  );
}
