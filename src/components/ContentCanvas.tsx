import { useMemo, useState } from "react";
import { getActionReasons, prioritizeActions } from "../actionStore";
import type { ActionsController } from "../hooks/useActions";
import type { ProjectsController } from "../hooks/useProjects";
import type { Project } from "../projectStore";
import type { Section, SectionId } from "../sections";
import {
  ActionForm,
  ActionList,
  ProjectPicker,
  focusAfterRowRemoval,
  todayKey,
} from "./ActionViews";
import { CheckIcon, EditIcon, MoonIcon, SunIcon, SystemIcon, TrashIcon } from "./icons";
import { HomeCanvas } from "./HomeCanvas";
import { ProjectsCanvas, type ProjectOpenIntent, type ProjectOpenTarget } from "./ProjectsCanvas";
import { useConfirm } from "./Overlays";
import type { ResolvedTheme, ThemePreference } from "../hooks/useTheme";

interface ContentCanvasProps {
  section: Section;
  actions: ActionsController;
  projects: ProjectsController;
  appearancePreference: ThemePreference;
  resolvedAppearance: ResolvedTheme;
  onAppearanceChange: (preference: ThemePreference) => void;
  /** A project opened from another surface, with the item to reveal in it. */
  projectTarget?: ProjectOpenTarget;
  /** Changes whenever the primary navigation asks for the Projects list. */
  projectsListResetToken: number;
  onOpenProject: (projectId: string, targetId?: string, intent?: ProjectOpenIntent) => void;
  onCloseProjectTarget: () => void;
  onNavigate: (id: SectionId) => void;
}
type ActionFilter = "active" | "completed" | "all";

function InboxRow({ item, actions, projects }: { item: { id: string; title: string }; actions: ActionsController; projects: Project[] }) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(item.title);
  const [projectId, setProjectId] = useState<string>();
  const confirm = useConfirm();
  const save = () => { if (title.trim()) actions.updateInboxItem(item.id, title); setEditing(false); };
  return <li className="action-row action-row--inbox">
    {editing ? <input autoFocus aria-label={`Edit ${item.title}`} className="action-row__edit" value={title} onChange={(event) => setTitle(event.target.value)} onBlur={save} onKeyDown={(event) => { if (event.key === "Enter") save(); if (event.key === "Escape") { setTitle(item.title); setEditing(false); } }} /> : <span className="action-row__title action-row__title--static">{item.title}</span>}
    <div className="inbox-row__actions">
      <ProjectPicker projectId={projectId} projects={projects} onChange={setProjectId} />
      <button type="button" className="action-button action-button--primary" onClick={() => actions.convertInboxItem(item.id, projectId)}>Convert</button>
    </div>
    <div className="action-row__operations">
      <button type="button" className="action-icon-button" title="Edit inbox item" aria-label={`Edit ${item.title}`} onClick={() => setEditing(true)}><EditIcon aria-hidden="true" /></button>
      <button type="button" className="action-icon-button action-icon-button--quiet" title="Delete inbox item" aria-label={`Delete ${item.title}`} onClick={(event) => { const row = event.currentTarget.closest(".action-row"); confirm({ title: "Delete inbox item?", description: `“${item.title}” will be removed from your inbox. This cannot be undone.`, confirmLabel: "Delete", trigger: event.currentTarget, onConfirm: () => { actions.deleteInboxItem(item.id); focusAfterRowRemoval(row, null, ".capture-form__input"); } }); }}><TrashIcon aria-hidden="true" /></button>
    </div>
  </li>;
}

function InboxCanvas({ actions, projects }: { actions: ActionsController; projects: ProjectsController }) {
  const [title, setTitle] = useState("");
  return <><form className="capture-form" onSubmit={(event) => { event.preventDefault(); if (title.trim()) { actions.addInboxItem(title); setTitle(""); } }}><input autoFocus aria-label="Capture intention" className="capture-form__input" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="What is on your mind?" /><button className="action-button action-button--primary" type="submit" disabled={!title.trim()}>Capture</button></form>{actions.inbox.length === 0 ? <div className="empty empty--compact"><h2 className="empty__title">The inbox is clear.</h2><p className="empty__body">Capture an intention above. You can turn it into an action when you are ready.</p></div> : <ul className="action-list">{actions.inbox.map((item) => <InboxRow key={item.id} item={item} actions={actions} projects={projects.projects} />)}</ul>}</>;
}

function FilterBar({ filter, onChange, counts }: { filter: ActionFilter; onChange: (filter: ActionFilter) => void; counts: Record<ActionFilter, number> }) {
  return <div className="filter-bar" aria-label="Filter actions">{(["active", "completed", "all"] as ActionFilter[]).map((option) => <button key={option} type="button" className={filter === option ? "filter-bar__button filter-bar__button--active" : "filter-bar__button"} aria-pressed={filter === option} onClick={() => onChange(option)}>{option[0].toUpperCase() + option.slice(1)} <span className="filter-bar__count">{counts[option]}</span></button>)}</div>;
}

function ActionsCanvas({ actions, projects }: { actions: ActionsController; projects: ProjectsController }) {
  const [filter, setFilter] = useState<ActionFilter>("active");
  const openActions = actions.actions.filter((action) => action.status === "open");
  const completedActions = actions.actions.filter((action) => action.status === "completed");
  const counts: Record<ActionFilter, number> = { active: openActions.length, completed: completedActions.length, all: actions.actions.length };
  const visibleActions = filter === "active" ? openActions : filter === "completed" ? completedActions : actions.actions;
  return <><ActionForm onSubmit={actions.addAction} projects={projects.projects} /><FilterBar filter={filter} onChange={setFilter} counts={counts} /><ActionList items={visibleActions} actions={actions} projects={projects.projects} todayDate={todayKey()} empty={filter === "completed" ? "No completed actions." : "No actions here yet."} /></>;
}

function TodayCanvas({ actions, projects }: { actions: ActionsController; projects: ProjectsController }) {
  const todayDate = todayKey();
  const todayActions = useMemo(() => prioritizeActions(actions.actions, todayDate), [actions.actions, todayDate]);
  const upNext = todayActions[0];
  const laterToday = todayActions.slice(1);
  return <><ActionForm onSubmit={actions.addAction} projects={projects.projects} />{upNext ? <section className="today-section"><div className="today-section__heading"><h2 className="today-section__title">Up Next</h2><span className="today-section__note">{getActionReasons(upNext, todayDate)[0]}</span></div><ActionList items={[upNext]} actions={actions} projects={projects.projects} todayDate={todayDate} empty="" showReason /></section> : <div className="empty today-empty"><h2 className="empty__title">Nothing is asking for your attention today.</h2><p className="empty__body">Choose an existing action to focus on today, or create a new one above. Focusing an action does not change its due date.</p></div>}{laterToday.length > 0 && <section className="today-section today-section--later"><h2 className="today-section__title">Also today</h2><ActionList items={laterToday} actions={actions} projects={projects.projects} todayDate={todayDate} empty="" showReason /></section>}</>;
}

const APPEARANCE_CHOICES: {
  value: ThemePreference;
  title: string;
  description: string;
  icon: typeof SunIcon;
}[] = [
  { value: "system", title: "System", description: "Match your Mac's appearance.", icon: SystemIcon },
  { value: "light", title: "Light", description: "Use the warm paper palette.", icon: SunIcon },
  { value: "dark", title: "Dark", description: "Use the low-light palette.", icon: MoonIcon },
];

function AppearanceCanvas({
  preference,
  resolved,
  onChange,
}: {
  preference: ThemePreference;
  resolved: ResolvedTheme;
  onChange: (preference: ThemePreference) => void;
}) {
  return (
    <section className="appearance-settings" aria-labelledby="appearance-heading">
      <div className="appearance-settings__intro">
        <h2 id="appearance-heading" className="appearance-settings__title">Appearance</h2>
        <p className="appearance-settings__description">
          Choose how Synchron looks. System follows the appearance set on your Mac.
        </p>
      </div>
      <div className="appearance-options" role="group" aria-label="Choose appearance">
        {APPEARANCE_CHOICES.map(({ value, title, description, icon: Icon }) => {
          const selected = preference === value;
          return (
            <button
              key={value}
              type="button"
              className={`appearance-option${selected ? " appearance-option--selected" : ""}`}
              aria-pressed={selected}
              onClick={() => onChange(value)}
            >
              <Icon className="appearance-option__icon" aria-hidden="true" />
              <span className="appearance-option__copy">
                <span className="appearance-option__title">{title}</span>
                <span className="appearance-option__description">{description}</span>
              </span>
              {selected && <CheckIcon className="appearance-option__check" aria-hidden="true" />}
            </button>
          );
        })}
      </div>
      <p className="appearance-settings__current" role="status">
        Currently using {resolved} appearance.
      </p>
    </section>
  );
}

export function ContentCanvas({
  section,
  actions,
  projects,
  appearancePreference,
  resolvedAppearance,
  onAppearanceChange,
  projectTarget,
  projectsListResetToken,
  onOpenProject,
  onCloseProjectTarget,
  onNavigate,
}: ContentCanvasProps) {
  if (section.id === "projects") {
    return (
      <main className="canvas" id="main-content" tabIndex={-1}>
        <div className="canvas__inner canvas__inner--projects">
          <ProjectsCanvas
            projects={projects}
            actions={actions}
            openTarget={projectTarget}
            listResetToken={projectsListResetToken}
            onOpenTargetClosed={onCloseProjectTarget}
          />
        </div>
      </main>
    );
  }

  if (section.id === "home") {
    return (
      <main className="canvas" id="main-content" tabIndex={-1}>
        <div className="canvas__inner canvas__inner--home">
          <HomeCanvas
            actions={actions}
            projects={projects}
            onOpenProject={onOpenProject}
            onOpenInbox={() => onNavigate("inbox")}
            onOpenProjects={() => onNavigate("projects")}
          />
        </div>
      </main>
    );
  }

  return (
    <main className="canvas" id="main-content" tabIndex={-1}>
      <div className={`canvas__inner canvas__inner--${section.id}`}>
        <header className="canvas-page-header">
          <h1 className="canvas__title">{section.label}</h1>
          <p className="canvas-page-header__description">
            {section.id === "today" && "A clear view of what is due and what you chose to focus on."}
            {section.id === "actions" && "Keep every next step visible, sortable, and connected to its project."}
            {section.id === "inbox" && "Capture first, then connect each thought to the work it belongs to."}
            {section.id === "settings" && "Make Synchron feel right for the way you work."}
          </p>
        </header>
        {actions.storageError && (
          <p className="storage-warning" role="status">
            {actions.storageError}
          </p>
        )}
        {section.id === "today" ? (
          <TodayCanvas actions={actions} projects={projects} />
        ) : section.id === "inbox" ? (
          <InboxCanvas actions={actions} projects={projects} />
        ) : section.id === "actions" ? (
          <ActionsCanvas actions={actions} projects={projects} />
        ) : section.id === "settings" ? (
          <AppearanceCanvas
            preference={appearancePreference}
            resolved={resolvedAppearance}
            onChange={onAppearanceChange}
          />
        ) : (
          <div className="empty">
            <h2 className="empty__title">{section.emptyTitle}</h2>
            <p className="empty__body">{section.emptyBody}</p>
          </div>
        )}
      </div>
    </main>
  );
}
