import { useState, type CSSProperties, type FormEvent } from "react";
import { Archive, ArchiveRestore, Check, ChevronLeft, Pencil, Plus, Trash2 } from "lucide-react";

import type { Milestone, Project, Task } from "../types";
import { FORM_CONTROL } from "../theme";
import { calculateProjectProgress, selectProjectTasks, type ProjectData } from "../domain/projects";
import { formatFullDate } from "../utils/dates";
import DatePicker from "./DatePicker";
import { PROJECT_STATUS_LABELS, TASK_PRIORITY_LABELS } from "../utils/displayLabels";

type ProjectsProps = {
  projects: Project[];
  milestones: Milestone[];
  tasks: Task[];
  selectedProjectId: string | null;
  onSelectProject: (projectId: string | null) => void;
  onAddProject: (data: ProjectData) => void;
  onEditProject: (projectId: string, data: ProjectData) => void;
  onToggleProjectArchive: (projectId: string) => void;
  onDeleteProject: (projectId: string) => void;
  onAddMilestone: (data: Omit<Milestone, "id" | "completed">) => void;
  onEditMilestone: (milestoneId: string, data: Omit<Milestone, "id" | "completed">) => void;
  onDeleteMilestone: (milestoneId: string) => void;
  onToggleMilestone: (milestoneId: string) => void;
  onAddTask: (data: Omit<Task, "id" | "createdAt" | "completed">) => void;
  onEditTask: (taskId: string, data: Omit<Task, "id" | "createdAt" | "completed">) => void;
  onDeleteTask: (taskId: string) => void;
  onToggleTask: (taskId: string) => void;
};

type PendingDeletion = {
  type: "project" | "milestone" | "task";
  id: string;
  title: string;
};

const STATUS_DOT: Record<Project["status"], string> = {
  active: "var(--color-accent)",
  completed: "var(--color-success)",
  archived: "var(--text-muted)",
};

const STATUS_BADGE_CLASS: Record<Project["status"], string> = {
  active: "ui-badge ui-badge--accent",
  completed: "ui-badge ui-badge--success",
  archived: "ui-badge ui-badge--subdued",
};

const PRIORITY_BADGE_CLASS: Record<Task["priority"], string> = {
  high: "ui-badge ui-badge--danger",
  medium: "ui-badge ui-badge--warning",
  low: "ui-badge ui-badge--subdued",
};

// Selects build on the shared control spec so every dropdown matches inputs.
const selectStyle: CSSProperties = { ...FORM_CONTROL, width: "auto" };

export default function Projects({
  projects,
  milestones,
  tasks,
  selectedProjectId,
  onSelectProject,
  onAddProject,
  onEditProject,
  onToggleProjectArchive,
  onDeleteProject,
  onAddMilestone,
  onEditMilestone,
  onDeleteMilestone,
  onToggleMilestone,
  onAddTask,
  onEditTask,
  onDeleteTask,
  onToggleTask,
}: ProjectsProps) {
  const [showProjectForm, setShowProjectForm] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [projectDescription, setProjectDescription] = useState("");
  const [projectStartDate, setProjectStartDate] = useState("");
  const [projectTargetDate, setProjectTargetDate] = useState("");
  const [showProjectDetails, setShowProjectDetails] = useState(false);

  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [projectEditName, setProjectEditName] = useState("");
  const [projectEditDescription, setProjectEditDescription] = useState("");
  const [projectEditStartDate, setProjectEditStartDate] = useState("");
  const [projectEditTargetDate, setProjectEditTargetDate] = useState("");

  const [showMilestoneForm, setShowMilestoneForm] = useState(false);
  const [milestoneTitle, setMilestoneTitle] = useState("");
  const [milestoneTargetDate, setMilestoneTargetDate] = useState("");
  const [editingMilestoneId, setEditingMilestoneId] = useState<string | null>(null);
  const [milestoneEditTitle, setMilestoneEditTitle] = useState("");
  const [milestoneEditTargetDate, setMilestoneEditTargetDate] = useState("");

  const [showTaskForm, setShowTaskForm] = useState(false);
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDueDate, setTaskDueDate] = useState("");
  const [taskEstimatedMinutes, setTaskEstimatedMinutes] = useState("");
  const [taskPriority, setTaskPriority] = useState<Task["priority"]>("medium");
  const [taskMilestoneId, setTaskMilestoneId] = useState("");
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [taskEditTitle, setTaskEditTitle] = useState("");
  const [taskEditDueDate, setTaskEditDueDate] = useState("");
  const [taskEditEstimatedMinutes, setTaskEditEstimatedMinutes] = useState("");
  const [taskEditPriority, setTaskEditPriority] = useState<Task["priority"]>("medium");
  const [taskEditMilestoneId, setTaskEditMilestoneId] = useState("");

  const [showArchivedProjects, setShowArchivedProjects] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<PendingDeletion | null>(null);

  // Reset transient detail-form state when moving between projects.
  // Render-phase adjustment (no effect) keeps the selection change atomic.
  const [prevProjectId, setPrevProjectId] = useState(selectedProjectId);
  if (prevProjectId !== selectedProjectId) {
    setPrevProjectId(selectedProjectId);
    setEditingProjectId(null);
    setShowMilestoneForm(false);
    setEditingMilestoneId(null);
    setShowTaskForm(false);
    setEditingTaskId(null);
    setItemToDelete(null);
  }

  const selectedProject = selectedProjectId
    ? projects.find((project) => project.id === selectedProjectId) ?? null
    : null;
  const activeProjects = projects.filter((project) => project.status !== "archived");
  const archivedProjects = projects.filter((project) => project.status === "archived");

  function confirmItemDeletion() {
    if (!itemToDelete) return;

    if (itemToDelete.type === "project") {
      onDeleteProject(itemToDelete.id);
      setEditingProjectId(null);
    }
    if (itemToDelete.type === "milestone") onDeleteMilestone(itemToDelete.id);
    if (itemToDelete.type === "task") onDeleteTask(itemToDelete.id);
    setItemToDelete(null);
  }

  function handleProjectSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedName = projectName.trim();
    if (!trimmedName) return;

    onAddProject({
      name: trimmedName,
      description: projectDescription.trim() || undefined,
      startDate: projectStartDate || undefined,
      targetDate: projectTargetDate || undefined,
    });
    setProjectName("");
    setProjectDescription("");
    setProjectStartDate("");
    setProjectTargetDate("");
    setShowProjectDetails(false);
    setShowProjectForm(false);
  }

  function beginProjectEdit(project: Project) {
    setEditingProjectId(project.id);
    setProjectEditName(project.name);
    setProjectEditDescription(project.description ?? "");
    setProjectEditStartDate(project.startDate ?? "");
    setProjectEditTargetDate(project.targetDate ?? "");
  }

  function handleProjectEditSubmit(event: FormEvent<HTMLFormElement>, projectId: string) {
    event.preventDefault();
    const trimmedName = projectEditName.trim();
    if (!trimmedName) return;

    // updateProject spreads over the existing record, so dates, description,
    // and any legacy links stay intact unless explicitly replaced here.
    onEditProject(projectId, {
      name: trimmedName,
      description: projectEditDescription.trim() || undefined,
      startDate: projectEditStartDate || undefined,
      targetDate: projectEditTargetDate || undefined,
    });
    setEditingProjectId(null);
  }

  function handleMilestoneSubmit(event: FormEvent<HTMLFormElement>, project: Project) {
    event.preventDefault();
    const trimmedTitle = milestoneTitle.trim();
    if (!trimmedTitle) return;

    onAddMilestone({
      title: trimmedTitle,
      projectId: project.id,
      targetDate: milestoneTargetDate || undefined,
    });
    setMilestoneTitle("");
    setMilestoneTargetDate("");
    setShowMilestoneForm(false);
  }

  function handleMilestoneEditSubmit(event: FormEvent<HTMLFormElement>, milestone: Milestone) {
    event.preventDefault();
    const trimmedTitle = milestoneEditTitle.trim();
    if (!trimmedTitle) return;

    onEditMilestone(milestone.id, {
      title: trimmedTitle,
      goalId: milestone.goalId,
      projectId: milestone.projectId,
      targetDate: milestoneEditTargetDate || undefined,
    });
    setEditingMilestoneId(null);
  }

  function handleTaskSubmit(event: FormEvent<HTMLFormElement>, project: Project) {
    event.preventDefault();
    const trimmedTitle = taskTitle.trim();
    if (!trimmedTitle) return;

    const estimatedMinutes = Number(taskEstimatedMinutes);
    onAddTask({
      title: trimmedTitle,
      projectId: project.id,
      milestoneId: taskMilestoneId || undefined,
      dueDate: taskDueDate || undefined,
      estimatedMinutes: Number.isFinite(estimatedMinutes) && estimatedMinutes > 0
        ? estimatedMinutes
        : undefined,
      priority: taskPriority,
    });
    setTaskTitle("");
    setTaskDueDate("");
    setTaskEstimatedMinutes("");
    setTaskPriority("medium");
    setTaskMilestoneId("");
    setShowTaskForm(false);
  }

  function handleTaskEditSubmit(event: FormEvent<HTMLFormElement>, task: Task) {
    event.preventDefault();
    const trimmedTitle = taskEditTitle.trim();
    if (!trimmedTitle) return;

    const estimatedMinutes = Number(taskEditEstimatedMinutes);
    onEditTask(task.id, {
      title: trimmedTitle,
      goalId: task.goalId,
      projectId: task.projectId,
      milestoneId: taskEditMilestoneId || undefined,
      dueDate: taskEditDueDate || undefined,
      isBacklog: taskEditDueDate ? false : task.isBacklog,
      estimatedMinutes: Number.isFinite(estimatedMinutes) && estimatedMinutes > 0
        ? estimatedMinutes
        : undefined,
      priority: taskEditPriority,
    });
    setEditingTaskId(null);
  }

  function projectTasksFor(project: Project): Task[] {
    return selectProjectTasks(project, milestones, tasks);
  }

  function renderProgressBar(percent: number, label: string) {
    return (
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        style={{ height: 6, borderRadius: "var(--radius-pill)", background: "var(--bg-inset)", overflow: "hidden" }}
      >
        <div style={{ height: "100%", width: `${percent}%`, background: "var(--color-accent)", borderRadius: "var(--radius-pill)" }} />
      </div>
    );
  }

  function renderStatusPill(project: Project) {
    return (
      <span className={`project-status-badge ${STATUS_BADGE_CLASS[project.status]}`} style={{ textTransform: "capitalize" }}>
        {PROJECT_STATUS_LABELS[project.status]}
      </span>
    );
  }

  function renderRailRow(project: Project) {
    const progress = calculateProjectProgress(project, milestones, tasks);
    const active = project.id === selectedProjectId;
    return (
      <li key={project.id} className="row-item" style={active ? { background: "var(--bg-hover)" } : undefined}>
        <span aria-hidden="true" style={{ width: 9, height: 9, borderRadius: "50%", flexShrink: 0, background: STATUS_DOT[project.status] }} />
        <button
          type="button"
          onClick={() => onSelectProject(project.id)}
          aria-current={active ? "true" : undefined}
          aria-label={`Open Project "${project.name}"`}
          style={{ display: "grid", flex: 1, minWidth: 0, gap: 6, padding: 0, border: "none", background: "transparent", color: "var(--text-primary)", textAlign: "left", cursor: "pointer" }}
        >
          <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
            <span className="truncate-1" style={{ fontWeight: 600 }}>{project.name}</span>
            <span className={`project-status-badge ${STATUS_BADGE_CLASS[project.status]}`} style={{ textTransform: "capitalize", flexShrink: 0 }}>{PROJECT_STATUS_LABELS[project.status]}</span>
          </span>
          <span style={{ fontSize: "var(--type-xs)", color: "var(--text-muted)" }}>
            Tasks {progress.taskCompleted}/{progress.taskTotal} · Milestones {progress.milestoneCompleted}/{progress.milestoneTotal}
          </span>
          {renderProgressBar(progress.percent, `"${project.name}" progress`)}
        </button>
        <button
          type="button"
          className="ui-button ui-button--ghost ui-button--sm"
          style={{ minHeight: 30, padding: "4px 8px" }}
          onClick={() => setItemToDelete({ type: "project", id: project.id, title: project.name })}
          aria-label={`Delete "${project.name}"`}
          title="Delete Project"
        >
          <Trash2 size={14} />
        </button>
      </li>
    );
  }

  function renderTaskRow(task: Task, projectMilestones: Milestone[]) {
    const linkedMilestone = projectMilestones.find((milestone) => milestone.id === task.milestoneId);

    if (editingTaskId === task.id) {
      return (
        <li key={task.id} className="project-work-item">
          <form style={{ display: "grid", flex: 1, minWidth: 0, gap: 6 }} onSubmit={(event) => handleTaskEditSubmit(event, task)}>
            <input
              autoFocus
              required
              maxLength={120}
              className="form-control"
              value={taskEditTitle}
              onChange={(event) => setTaskEditTitle(event.target.value)}
              aria-label="Task Title"
            />
            {projectMilestones.length > 0 && (
              <select
                className="form-control"
                style={selectStyle}
                value={taskEditMilestoneId}
                onChange={(event) => setTaskEditMilestoneId(event.target.value)}
                aria-label="Link to Milestone (Optional)"
              >
                <option value="">No Milestone</option>
                {projectMilestones.map((milestone) => (
                  <option key={milestone.id} value={milestone.id}>
                    {milestone.title}
                  </option>
                ))}
              </select>
            )}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 120px), 1fr))", gap: 6 }}>
              <DatePicker
                className="form-control"
                value={taskEditDueDate}
                onChange={setTaskEditDueDate}
                ariaLabel="Task Due Date"
              />
              <input
                type="number"
                min={1}
                step={1}
                className="form-control"
                value={taskEditEstimatedMinutes}
                onChange={(event) => setTaskEditEstimatedMinutes(event.target.value)}
                placeholder="Minutes"
                aria-label="Estimated Minutes"
              />
              <select
                className="form-control"
                style={selectStyle}
                value={taskEditPriority}
                onChange={(event) => setTaskEditPriority(event.target.value as Task["priority"])}
                aria-label="Task Priority"
              >
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "flex-end", gap: 8 }}>
              <button type="button" className="ui-button ui-button--sm" onClick={() => setEditingTaskId(null)}>
                Cancel
              </button>
              <button type="submit" className="ui-button ui-button--sm ui-button--primary">Save</button>
            </div>
          </form>
        </li>
      );
    }

    return (
      <li key={task.id} className="project-work-item">
        <button
          type="button"
          className="ring-check"
          style={{ width: 24, height: 24 }}
          onClick={() => onToggleTask(task.id)}
          aria-pressed={task.completed}
          aria-label={`${task.completed ? "Mark incomplete" : "Complete"} "${task.title}"`}
        >
          {task.completed && <Check size={13} />}
        </button>
        <button
          type="button"
          onClick={() => onToggleTask(task.id)}
          aria-label={`${task.completed ? "Mark incomplete" : "Complete"} "${task.title}"`}
          style={{ display: "grid", flex: 1, minWidth: 0, gap: 3, padding: 0, border: "none", background: "transparent", color: "var(--text-body)", textAlign: "left", cursor: "pointer" }}
        >
          <span className="truncate-1" style={{ textDecoration: task.completed ? "line-through" : "none", color: task.completed ? "var(--text-muted)" : "var(--text-primary)", fontWeight: 500 }}>
            {task.title}
          </span>
          <span style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 6, color: "var(--text-muted)", fontSize: "var(--type-xs)" }}>
            <span className={PRIORITY_BADGE_CLASS[task.priority]}>{TASK_PRIORITY_LABELS[task.priority]}</span>
            {task.dueDate && <time dateTime={task.dueDate}>Due {formatFullDate(task.dueDate)}</time>}
            {task.estimatedMinutes && <span>{task.estimatedMinutes} min</span>}
            {linkedMilestone && <span>{linkedMilestone.title}</span>}
          </span>
        </button>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 2, flexShrink: 0 }}>
          <button
            type="button"
            className="ui-button ui-button--ghost ui-button--sm"
            style={{ minHeight: 30, padding: "4px 8px" }}
            onClick={() => {
              setEditingTaskId(task.id);
              setTaskEditTitle(task.title);
              setTaskEditDueDate(task.dueDate ?? "");
              setTaskEditEstimatedMinutes(task.estimatedMinutes?.toString() ?? "");
              setTaskEditPriority(task.priority);
              setTaskEditMilestoneId(task.milestoneId ?? "");
            }}
            aria-label={`Edit "${task.title}"`}
            title="Edit Task"
          >
            <Pencil size={14} />
          </button>
          <button
            type="button"
            className="ui-button ui-button--ghost ui-button--sm"
            style={{ minHeight: 30, padding: "4px 8px" }}
            onClick={() => setItemToDelete({ type: "task", id: task.id, title: task.title })}
            aria-label={`Delete "${task.title}"`}
            title="Delete Task"
          >
            <Trash2 size={14} />
          </button>
        </span>
      </li>
    );
  }

  function renderMilestonesSection(project: Project) {
    const projectMilestones = milestones.filter((milestone) => milestone.projectId === project.id);
    const projectTasks = projectTasksFor(project);

    return (
      <section aria-label={`Milestones for "${project.name}"`} style={{ display: "grid", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
          <h3 className="section-eyebrow">Milestones · {projectMilestones.length}</h3>
        </div>
        {projectMilestones.length === 0 ? (
          <div className="atelier-group ui-empty-state" style={{ padding: "var(--space-6) var(--space-4)" }}>
            <strong>No Milestones Yet</strong>
            <span className="atelier-sub">Define key checkpoints for this project</span>
          </div>
        ) : (
          <ul className="project-work-list">
            {projectMilestones.map((milestone) => {
              const nested = projectTasks.filter((task) => task.milestoneId === milestone.id);
              return (
                <li key={milestone.id} className="project-work-item project-work-item--milestone">
                  {editingMilestoneId === milestone.id ? (
                    <form
                      style={{ display: "grid", gap: 8, flex: 1, width: "100%" }}
                      onSubmit={(event) => handleMilestoneEditSubmit(event, milestone)}
                    >
                      <input
                        autoFocus
                        required
                        maxLength={120}
                        className="form-control"
                        value={milestoneEditTitle}
                        onChange={(event) => setMilestoneEditTitle(event.target.value)}
                        aria-label="Milestone Title"
                      />
                      <DatePicker
                        className="form-control"
                        value={milestoneEditTargetDate}
                        onChange={setMilestoneEditTargetDate}
                        ariaLabel="Milestone Target Date"
                      />
                      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "flex-end", gap: 8 }}>
                        <button
                          type="button"
                          className="ui-button ui-button--sm"
                          onClick={() => setEditingMilestoneId(null)}
                        >
                          Cancel
                        </button>
                        <button type="submit" className="ui-button ui-button--sm ui-button--primary">Save</button>
                      </div>
                    </form>
                  ) : (
                    <>
                      <div style={{ display: "flex", alignItems: "flex-start", gap: 12, width: "100%" }}>
                        <button
                          type="button"
                          className="milestone-checkbox"
                          onClick={() => onToggleMilestone(milestone.id)}
                          aria-pressed={milestone.completed}
                          aria-label={`${milestone.completed ? "Mark incomplete" : "Complete"} milestone: "${milestone.title}"`}
                        >
                          {milestone.completed && (
                            <Check className="milestone-checkbox-icon" width={14} height={14} strokeWidth={2.5} />
                          )}
                        </button>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <h4 className="truncate-1" style={{ margin: 0, fontSize: "var(--type-sm)", fontWeight: 600, color: milestone.completed ? "var(--text-muted)" : "var(--text-primary)", textDecoration: milestone.completed ? "line-through" : "none" }}>
                            {milestone.title}
                          </h4>
                          {milestone.targetDate && (
                            <p style={{ margin: "2px 0 0", color: "var(--text-muted)", fontSize: "var(--type-xs)" }}>
                              Target: <time dateTime={milestone.targetDate}>{formatFullDate(milestone.targetDate)}</time>
                              <span> · {nested.filter((t) => t.completed).length}/{nested.length} tasks</span>
                            </p>
                          )}
                        </div>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 2, flexShrink: 0 }}>
                          <button
                            type="button"
                            className="ui-button ui-button--ghost ui-button--sm"
                            style={{ minHeight: 30, padding: "4px 8px" }}
                            onClick={() => {
                              setEditingMilestoneId(milestone.id);
                              setMilestoneEditTitle(milestone.title);
                              setMilestoneEditTargetDate(milestone.targetDate ?? "");
                            }}
                            aria-label={`Edit "${milestone.title}"`}
                            title="Edit Milestone"
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            type="button"
                            className="ui-button ui-button--ghost ui-button--sm"
                            style={{ minHeight: 30, padding: "4px 8px" }}
                            onClick={() =>
                              setItemToDelete({ type: "milestone", id: milestone.id, title: milestone.title })
                            }
                            aria-label={`Delete "${milestone.title}"`}
                            title="Delete Milestone"
                          >
                            <Trash2 size={14} />
                          </button>
                        </span>
                      </div>
                      {nested.length > 0 && (
                        <ul className="project-work-list project-work-list--nested">
                          {nested.map((task) => renderTaskRow(task, projectMilestones))}
                        </ul>
                      )}
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {showMilestoneForm ? (
          <form className="atelier-group" style={{ padding: 12, display: "grid", gap: 8 }} onSubmit={(event) => handleMilestoneSubmit(event, project)}>
            <input
              autoFocus
              required
              maxLength={120}
              className="form-control"
              value={milestoneTitle}
              onChange={(event) => setMilestoneTitle(event.target.value)}
              placeholder="Milestone Title"
              aria-label="Milestone Title"
            />
            <DatePicker
              className="form-control"
              value={milestoneTargetDate}
              onChange={setMilestoneTargetDate}
              ariaLabel="Milestone Target Date"
            />
            <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "flex-end", gap: 8 }}>
              <button
                type="button"
                className="ui-button ui-button--sm"
                onClick={() => setShowMilestoneForm(false)}
              >
                Cancel
              </button>
              <button type="submit" className="ui-button ui-button--sm ui-button--primary project-add-button">Add Milestone</button>
            </div>
          </form>
        ) : (
          <button type="button" className="ui-button ui-button--ghost ui-button--sm project-add-button" onClick={() => setShowMilestoneForm(true)}>
            <Plus size={14} />
            Add Milestone
          </button>
        )}
      </section>
    );
  }

  function renderTasksSection(project: Project) {
    const projectMilestones = milestones.filter((milestone) => milestone.projectId === project.id);
    const unassigned = projectTasksFor(project).filter((task) => task.milestoneId === undefined || !projectMilestones.some((m) => m.id === task.milestoneId));

    return (
      <section aria-label={`Tasks for "${project.name}"`} style={{ display: "grid", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
          <h3 className="section-eyebrow">Tasks · {projectTasksFor(project).length}</h3>
          <span style={{ color: "var(--text-muted)", fontSize: "var(--type-xs)" }}>Ungrouped Tasks</span>
        </div>
        {unassigned.length === 0 ? (
          <div className="atelier-group ui-empty-state" style={{ padding: "var(--space-6) var(--space-4)" }}>
            <strong>No Ungrouped Tasks</strong>
            <span className="atelier-sub">Add a task below — milestones are optional</span>
          </div>
        ) : (
          <ul className="project-work-list">
            {unassigned.map((task) => renderTaskRow(task, projectMilestones))}
          </ul>
        )}

        {showTaskForm ? (
          <form className="atelier-group" style={{ padding: 12, display: "grid", gap: 8 }} onSubmit={(event) => handleTaskSubmit(event, project)}>
            <input
              autoFocus
              required
              maxLength={120}
              className="form-control"
              value={taskTitle}
              onChange={(event) => setTaskTitle(event.target.value)}
              placeholder="Task Title"
              aria-label="Task Title"
            />
            {projectMilestones.length > 0 && (
              <select
                className="form-control"
                style={selectStyle}
                value={taskMilestoneId}
                onChange={(event) => setTaskMilestoneId(event.target.value)}
                aria-label="Link to Milestone (Optional)"
              >
                <option value="">No Milestone</option>
                {projectMilestones.map((milestone) => (
                  <option key={milestone.id} value={milestone.id}>
                    {milestone.title}
                  </option>
                ))}
              </select>
            )}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 120px), 1fr))", gap: 8 }}>
              <DatePicker
                className="form-control"
                value={taskDueDate}
                onChange={setTaskDueDate}
                ariaLabel="Task Due Date"
              />
              <input
                type="number"
                min={1}
                step={1}
                className="form-control"
                value={taskEstimatedMinutes}
                onChange={(event) => setTaskEstimatedMinutes(event.target.value)}
                placeholder="Minutes"
                aria-label="Estimated Minutes"
              />
              <select
                className="form-control"
                style={selectStyle}
                value={taskPriority}
                onChange={(event) => setTaskPriority(event.target.value as Task["priority"])}
                aria-label="Task Priority"
              >
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "flex-end", gap: 8 }}>
              <button type="button" className="ui-button ui-button--sm" onClick={() => setShowTaskForm(false)}>
                Cancel
              </button>
              <button type="submit" className="ui-button ui-button--sm ui-button--primary project-add-button">Add Task</button>
            </div>
          </form>
        ) : (
          <button type="button" className="ui-button ui-button--ghost ui-button--sm project-add-button" onClick={() => setShowTaskForm(true)}>
            <Plus size={14} />
            Add Task
          </button>
        )}
      </section>
    );
  }

  function renderDetail(project: Project) {
    const progress = calculateProjectProgress(project, milestones, tasks);

    return (
      <div className="project-detail" style={{ display: "grid", gap: 16, minWidth: 0 }}>
        <div className="atelier-group" style={{ padding: 16, display: "grid", gap: 10 }}>
          <button
            type="button"
            className="ui-button ui-button--ghost ui-button--sm"
            style={{ justifySelf: "start" }}
            onClick={() => onSelectProject(null)}
          >
            <ChevronLeft size={15} />
            All Projects
          </button>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
            <h2 id="project-detail-title" className="truncate-1" style={{ margin: 0, fontSize: "var(--type-lg)", fontWeight: 700, color: "var(--text-primary)" }}>{project.name}</h2>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
              <button
                type="button"
                className="ui-button ui-button--ghost ui-button--sm"
                style={{ minHeight: 30, padding: "4px 8px", flexShrink: 0 }}
                onClick={() => onToggleProjectArchive(project.id)}
                aria-label={`${project.status === "archived" ? "Unarchive" : "Archive"} "${project.name}"`}
                title={project.status === "archived" ? "Unarchive Project" : "Archive Project"}
              >
                {project.status === "archived" ? <ArchiveRestore size={14} /> : <Archive size={14} />}
              </button>
              <button
                type="button"
                className="ui-button ui-button--ghost ui-button--sm"
                style={{ minHeight: 30, padding: "4px 8px" }}
                onClick={() => beginProjectEdit(project)}
                aria-label={`Edit "${project.name}"`}
                title="Edit Project"
              >
                <Pencil size={14} />
              </button>
              <button
                type="button"
                className="ui-button ui-button--ghost ui-button--sm"
                style={{ minHeight: 30, padding: "4px 8px" }}
                onClick={() => setItemToDelete({ type: "project", id: project.id, title: project.name })}
                aria-label={`Delete "${project.name}"`}
                title="Delete Project"
              >
                <Trash2 size={14} />
              </button>
            </span>
          </div>

          {renderStatusPill(project)}

          {editingProjectId === project.id && (
            <form
              style={{ display: "grid", gap: 8, paddingTop: 10, borderTop: "1px solid var(--border-color)" }}
              onSubmit={(event) => handleProjectEditSubmit(event, project.id)}
            >
              <input
                required
                maxLength={120}
                className="form-control"
                value={projectEditName}
                onChange={(event) => setProjectEditName(event.target.value)}
                aria-label="Project Name"
              />
              <textarea
                maxLength={500}
                className="form-control"
                style={{ ...FORM_CONTROL, height: "auto", minHeight: 76 }}
                value={projectEditDescription}
                onChange={(event) => setProjectEditDescription(event.target.value)}
                placeholder="Description (optional)"
                aria-label="Project Description"
              />
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 160px), 1fr))", gap: 8 }}>
                <label style={{ display: "grid", gap: 5, color: "var(--text-secondary)", fontSize: "var(--type-xs)" }}>
                  Start Date
                  <DatePicker
                    className="form-control"
                    value={projectEditStartDate}
                    onChange={setProjectEditStartDate}
                    ariaLabel="Project Start Date"
                  />
                </label>
                <label style={{ display: "grid", gap: 5, color: "var(--text-secondary)", fontSize: "var(--type-xs)" }}>
                  Target Date
                  <DatePicker
                    className="form-control"
                    value={projectEditTargetDate}
                    onChange={setProjectEditTargetDate}
                    ariaLabel="Project Target Date"
                  />
                </label>
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                <button
                  type="button"
                  className="ui-button ui-button--sm"
                  onClick={() => setEditingProjectId(null)}
                >
                  Cancel
                </button>
                <button type="submit" className="ui-button ui-button--sm ui-button--primary">Save Project</button>
              </div>
            </form>
          )}

          {project.description && <p style={{ margin: 0, color: "var(--text-secondary)", fontSize: "var(--type-sm)", whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{project.description}</p>}

          <p style={{ margin: 0, color: "var(--text-muted)", fontSize: "var(--type-xs)" }}>
            {project.startDate && <>Start: {formatFullDate(project.startDate)}</>}
            {project.startDate && project.targetDate && " · "}
            {project.targetDate && <>Target: {formatFullDate(project.targetDate)}</>}
            {(project.startDate || project.targetDate) && " · "}
            Status: {PROJECT_STATUS_LABELS[project.status]}
          </p>

          <div style={{ display: "grid", gap: 6 }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
              <span style={{ color: "var(--text-primary)", fontSize: 13, fontWeight: 700 }}>{progress.percent}% Complete</span>
              <span style={{ color: "var(--text-muted)", fontSize: "var(--type-xs)" }}>{progress.completed} of {progress.total} items</span>
            </div>
            {renderProgressBar(progress.percent, `"${project.name}" progress`)}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              <span className="ui-badge ui-badge--accent">Tasks {progress.taskCompleted}/{progress.taskTotal} ({progress.taskPercent}%)</span>
              <span className="ui-badge ui-badge--subdued">Milestones {progress.milestoneCompleted}/{progress.milestoneTotal} ({progress.milestonePercent}%)</span>
            </div>
          </div>
        </div>

        <div className="project-detail-sections">
          {renderMilestonesSection(project)}
          {renderTasksSection(project)}
        </div>
      </div>
    );
  }

  function renderDeleteModal() {
    if (!itemToDelete) return null;

    return (
      <div className="modal-overlay" role="presentation" onClick={() => setItemToDelete(null)}>
        <div
          className="delete-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="projects-delete-modal-title"
          onClick={(event) => event.stopPropagation()}
        >
          <h2 id="projects-delete-modal-title">Delete "{itemToDelete.title}"?</h2>
          <p>
            {itemToDelete.type === "project"
              ? "Its milestones and tasks will be kept, but detached from this project. This action cannot be undone."
              : "This action cannot be undone."}
          </p>
          <div className="delete-modal-actions">
            <button
              type="button"
              className="delete-modal-cancel"
              onClick={() => setItemToDelete(null)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="delete-modal-confirm"
              onClick={confirmItemDeletion}
            >
              Delete
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <section className="projects-page" aria-labelledby="projects-title">
        <header className="page-head" style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
          <div>
            <h1 id="projects-title">Projects</h1>
            <p>{activeProjects.length} active · {archivedProjects.length} archived · Projects are optional — group milestones and tasks toward an outcome.</p>
          </div>
          <button
            type="button"
            className="ui-button ui-button--primary ui-button--sm"
            onClick={() => setShowProjectForm((visible) => !visible)}
            aria-expanded={showProjectForm}
          >
            <Plus size={15} />
            New Project
          </button>
        </header>

        {showProjectForm && (
          <form className="page-toolbar" style={{ display: "grid", gap: 8 }} onSubmit={handleProjectSubmit} aria-label="Create a Project">
            <strong style={{ color: "var(--text-primary)", fontSize: "var(--type-sm)" }}>Create a project</strong>
            <input
              autoFocus
              required
              maxLength={120}
              className="form-control"
              value={projectName}
              onChange={(event) => setProjectName(event.target.value)}
              placeholder="Project Name"
              aria-label="Project Name"
            />
            {showProjectDetails ? (
              <>
                <textarea
                  maxLength={500}
                  className="form-control"
                  style={{ ...FORM_CONTROL, height: "auto", minHeight: 76 }}
                  value={projectDescription}
                  onChange={(event) => setProjectDescription(event.target.value)}
                  placeholder="Description (optional)"
                  aria-label="Project Description"
                />
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 160px), 1fr))", gap: 8 }}>
                  <label style={{ display: "grid", gap: 5, color: "var(--text-secondary)", fontSize: "var(--type-xs)" }}>
                    Start Date (Optional)
                    <DatePicker
                      className="form-control"
                      value={projectStartDate}
                      onChange={setProjectStartDate}
                      ariaLabel="Project Start Date (Optional)"
                    />
                  </label>
                  <label style={{ display: "grid", gap: 5, color: "var(--text-secondary)", fontSize: "var(--type-xs)" }}>
                    Target Date (Optional)
                    <DatePicker
                      className="form-control"
                      value={projectTargetDate}
                      onChange={setProjectTargetDate}
                      ariaLabel="Project Target Date (Optional)"
                    />
                  </label>
                </div>
              </>
            ) : (
              <button
                type="button"
                className="ui-button ui-button--ghost ui-button--sm"
                style={{ justifySelf: "start" }}
                onClick={() => setShowProjectDetails(true)}
                aria-expanded={false}
              >
                <Plus size={14} />
                Add Details (Optional)
              </button>
            )}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button type="button" className="ui-button ui-button--sm" onClick={() => setShowProjectForm(false)}>
                Cancel
              </button>
              <button type="submit" className="ui-button ui-button--sm ui-button--primary">Create Project</button>
            </div>
          </form>
        )}

        <div className="projects-pane">
          <div style={{ display: "grid", gap: 12, minWidth: 0 }}>
            <nav aria-label="Project List" style={{ display: "grid", gap: 8 }}>
              <h2 className="section-eyebrow">All Projects · {activeProjects.length}</h2>
              {activeProjects.length === 0 ? (
                <div className="atelier-group ui-empty-state">
                  <strong>No Projects Yet</strong>
                  <span className="atelier-sub">Create one to group milestones and tasks toward an outcome.</span>
                </div>
              ) : (
                <ul className="atelier-group" style={{ margin: 0, padding: 0, listStyle: "none" }}>
                  {activeProjects.map((project) => renderRailRow(project))}
                </ul>
              )}
            </nav>

            {archivedProjects.length > 0 && (
              <section aria-label="Archived Projects" style={{ display: "grid", gap: 8 }}>
                <button
                  type="button"
                  className="ui-button ui-button--sm"
                  onClick={() => setShowArchivedProjects((visible) => !visible)}
                  aria-expanded={showArchivedProjects}
                >
                  <span>
                    {showArchivedProjects ? "Hide" : "Show"} Archived Projects ({archivedProjects.length})
                  </span>
                </button>
                {showArchivedProjects && (
                  <ul className="atelier-group" style={{ margin: 0, padding: 0, listStyle: "none" }}>
                    {archivedProjects.map((project) => renderRailRow(project))}
                  </ul>
                )}
              </section>
            )}
          </div>

          <div style={{ minWidth: 0, display: "grid", gap: 8 }}>
            {selectedProject ? (
              <>
                <h2 className="section-eyebrow" style={{ margin: 0 }}>Project Details</h2>
                {renderDetail(selectedProject)}
              </>
            ) : (
              <section aria-label="Project Details" style={{ display: "grid", alignContent: "start", gap: 8 }}>
                <h2 className="section-eyebrow" style={{ margin: 0 }}>Project Details</h2>
                <div className="atelier-group ui-empty-state">
                  <strong>{activeProjects.length === 0 ? "No Project Selected" : "Select a Project"}</strong>
                  <span className="atelier-sub">Choose a project from the list to see milestones, tasks, and progress.</span>
                </div>
              </section>
            )}
          </div>
        </div>
      </section>
      {renderDeleteModal()}
    </>
  );
}
