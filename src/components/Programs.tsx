import { useState, useMemo, type CSSProperties } from "react";
import { Check, Flame, ChevronDown, ChevronUp, Pencil, Archive, ArchiveRestore, Trash2 } from "lucide-react";
import { CARD_SURFACE } from "../theme";
import type { Habit } from "../types";
import {
  groupHabitsIntoPrograms,
  getTodayProgramHabits,
  calculateTodayProgress,
  getDayByDayProgress,
  type Program,
} from "../domain/programLogic";
import { formatFullDate, getTodayKey } from "../utils/dates";

type ProgramsProps = {
  habits: Habit[];
  onToggleHabit: (id: number, dateKey?: string) => void;
  onCreateProgram: () => void;
  dayResetHour: number;
  onEditHabit: (habit: Habit) => void;
  onArchiveHabit: (id: number) => void;
  onUnarchiveHabit: (id: number) => void;
  onDeleteHabit: (habit: Habit) => void;
  onEditProgram: (program: Program) => void;
  onToggleProgramArchive: (programId: number) => void;
  onDeleteProgram: (program: Program) => void;
};

const styles: Record<string, CSSProperties> = {
  page: {
    maxWidth: "100%",
    width: "100%",
  },
  header: {
    marginBottom: 32,
  },
  headerRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
    flexWrap: "wrap",
  },
  headerAction: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: "10px 16px",
    background: "rgba(var(--accent-rgb), 0.1)",
    border: "1px solid rgba(var(--accent-rgb), 0.42)",
    borderRadius: 8,
    color: "var(--accent-teal)",
    fontSize: 14,
    fontWeight: 500,
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  title: {
    fontSize: 28,
    fontWeight: 700,
    color: "var(--text-primary)",
    margin: "0 0 8px",
  },
  date: {
    fontSize: 15,
    color: "var(--text-secondary)",
    margin: "0 0 16px",
  },
  section: {
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 600,
    color: "var(--text-primary)",
    margin: "0 0 16px",
  },
  programCard: {
    ...CARD_SURFACE,
    padding: 24,
    marginBottom: 16,
  },
  archivedProgramCard: {
    background: "var(--bg-completed)",
    opacity: 0.7,
  },
  programHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 16,
    marginBottom: 16,
  },
  programHeaderActions: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    paddingRight: 8,
    flexShrink: 0,
  },
  programActionButton: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: 32,
    height: 32,
    padding: 6,
    background: "transparent",
    border: "1px solid transparent",
    borderRadius: 8,
    color: "var(--text-muted)",
    cursor: "pointer",
    transition: "background 0.15s ease, color 0.15s ease",
    flexShrink: 0,
  },
  archivedToggle: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "8px 12px",
    background: "transparent",
    border: "1px solid var(--border-strong)",
    borderRadius: 8,
    color: "var(--text-secondary)",
    fontSize: 13,
    fontWeight: 500,
    cursor: "pointer",
    margin: "20px 0 12px",
  },
  programTitle: {
    fontSize: 20,
    fontWeight: 600,
    color: "var(--text-primary)",
    margin: "0 0 8px",
  },
  programMeta: {
    fontSize: 14,
    color: "var(--text-secondary)",
    margin: "0 0 8px",
  },
  programState: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "4px 12px",
    borderRadius: 12,
    fontSize: 12,
    fontWeight: 500,
  },
  stateUpcoming: {
    background: "rgba(156, 163, 175, 0.1)",
    color: "var(--text-secondary)",
    border: "1px solid rgba(156, 163, 175, 0.3)",
  },
  stateActive: {
    background: "rgba(var(--accent-rgb), 0.1)",
    color: "var(--accent-teal)",
    border: "1px solid rgba(var(--accent-rgb), 0.3)",
  },
  stateCompleted: {
    background: "rgba(34, 197, 94, 0.1)",
    color: "#22c55e",
    border: "1px solid rgba(34, 197, 94, 0.3)",
  },
  progressSection: {
    marginBottom: 20,
  },
  progressHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  progressLabel: {
    fontSize: 14,
    fontWeight: 500,
    color: "var(--text-body)",
  },
  progressValue: {
    fontSize: 14,
    fontWeight: 600,
    color: "var(--accent-teal)",
  },
  progressBar: {
    height: 8,
    background: "var(--bg-inset)",
    borderRadius: 4,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    background: "linear-gradient(90deg, var(--accent-teal-soft), var(--accent-teal))",
    transition: "width 0.3s ease",
  },
  todaySection: {
    marginTop: 20,
    paddingTop: 20,
    borderTop: "1px solid var(--border-color)",
  },
  habitList: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  habitCard: {
    ...CARD_SURFACE,
    display: "flex",
    alignItems: "center",
    gap: 16,
    padding: 16,
  },
  habitInfo: {
    flex: 1,
    minWidth: 0,
  },
  habitName: {
    fontSize: 15,
    fontWeight: 500,
    color: "var(--text-body)",
    margin: "0 0 6px",
  },
  habitCompleted: {
    color: "var(--text-dim)",
    textDecoration: "line-through",
  },
  habitActions: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    paddingRight: 8,
  },
  iconButton: {
    background: "transparent",
    border: "1px solid transparent",
    borderRadius: 8,
    width: 32,
    height: 32,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "var(--text-muted)",
    cursor: "pointer",
    padding: 6,
    transition: "background 0.15s ease, color 0.15s ease",
    flexShrink: 0,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    border: "2px solid var(--checkbox-border)",
    background: "transparent",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    transition: "all 0.15s ease",
  },
  checkboxChecked: {
    background: "var(--checkbox-checked-bg)",
    borderColor: "var(--checkbox-checked-border)",
    boxShadow: "var(--checkbox-checked-shadow)",
  },
  dayByDaySection: {
    marginTop: 20,
    paddingTop: 20,
    borderTop: "1px solid var(--border-color)",
  },
  dayByDayGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(60px, 1fr))",
    gap: 8,
  },
  dayCell: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 4,
    padding: 8,
    borderRadius: 8,
    fontSize: 12,
  },
  dayCellComplete: {
    background: "rgba(34, 197, 94, 0.1)",
    border: "1px solid rgba(34, 197, 94, 0.3)",
    color: "#22c55e",
  },
  dayCellPartial: {
    background: "rgba(251, 191, 36, 0.1)",
    border: "1px solid rgba(251, 191, 36, 0.3)",
    color: "#fbbf24",
  },
  dayCellUpcoming: {
    background: "var(--bg-inset)",
    border: "1px solid var(--border-color)",
    color: "var(--text-secondary)",
  },
  dayNumber: {
    fontWeight: 600,
  },
  dayStatus: {
    fontSize: 10,
  },
  emptyState: {
    ...CARD_SURFACE,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    padding: "48px 24px",
    textAlign: "center",
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: 600,
    color: "var(--text-primary)",
    margin: 0,
  },
  emptyText: {
    fontSize: 14,
    color: "var(--text-secondary)",
    margin: 0,
  },
  emptyButton: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    background: "rgba(var(--accent-rgb), 0.1)",
    border: "1px solid rgba(var(--accent-rgb), 0.42)",
    borderRadius: 8,
    padding: "10px 16px",
    fontSize: 14,
    fontWeight: 500,
    color: "var(--accent-teal)",
    cursor: "pointer",
    marginTop: 8,
  },
  expandButton: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "transparent",
    border: "1px solid transparent",
    borderRadius: 8,
    color: "var(--text-muted)",
    cursor: "pointer",
    padding: 6,
    transition: "background 0.15s ease, color 0.15s ease",
    width: 32,
    height: 32,
    flexShrink: 0,
  },
};

function ProgramCard({
  program,
  onToggleHabit,
  dayResetHour,
  isExpanded,
  onToggleExpand,
  onEditHabit,
  onArchiveHabit,
  onUnarchiveHabit,
  onDeleteHabit,
  onEditProgram,
  onToggleProgramArchive,
  onDeleteProgram,
  isArchived,
}: {
  program: Program;
  onToggleHabit: (id: number, dateKey?: string) => void;
  dayResetHour: number;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onEditHabit: (habit: Habit) => void;
  onArchiveHabit: (id: number) => void;
  onUnarchiveHabit: (id: number) => void;
  onDeleteHabit: (habit: Habit) => void;
  onEditProgram: (program: Program) => void;
  onToggleProgramArchive: (programId: number) => void;
  onDeleteProgram: (program: Program) => void;
  isArchived: boolean;
}) {
  const todayKey = getTodayKey(dayResetHour);
  const todayHabits = getTodayProgramHabits(program, todayKey, dayResetHour);
  const todayProgress = calculateTodayProgress(program, todayKey, dayResetHour);
  const dayByDayProgress = getDayByDayProgress(program);

  const stateStyle = {
    Upcoming: styles.stateUpcoming,
    Active: styles.stateActive,
    Completed: styles.stateCompleted,
  }[program.state];

  return (
    <div style={{ ...styles.programCard, ...(isArchived || program.state === "Completed" ? styles.archivedProgramCard : {}) }}>
      <div style={styles.programHeader}>
        <div style={{ minWidth: 0 }}>
          <h3 style={styles.programTitle}>{program.name}</h3>
          <p style={styles.programMeta}>
            {program.state === "Upcoming" && `Starts ${formatFullDate(program.startDate)}`}
            {program.state === "Active" && `Day ${program.currentDay} of ${program.totalDays}`}
            {program.state === "Completed" && `Completed ${formatFullDate(program.startDate)}`}
          </p>
          <span style={{ ...styles.programState, ...(isArchived || program.state === "Completed" ? styles.stateUpcoming : stateStyle) }}>
            {isArchived || program.state === "Completed" ? "Archived" : program.state}
          </span>
        </div>
        <div style={styles.programHeaderActions}>
          <button
            type="button"
            className="program-action-button"
            style={styles.programActionButton}
            onClick={() => onEditProgram(program)}
            aria-label={`Edit "${program.name}"`}
            title={`Edit "${program.name}"`}
          >
            <Pencil size={15} />
          </button>
          <button
            type="button"
            className="program-action-button"
            style={styles.programActionButton}
            onClick={() => onToggleProgramArchive(program.id)}
            aria-label={`${isArchived ? "Unarchive" : "Archive"} "${program.name}"`}
            title={`${isArchived ? "Unarchive" : "Archive"} "${program.name}"`}
          >
            {isArchived ? <ArchiveRestore size={15} /> : <Archive size={15} />}
          </button>
          <button
            type="button"
            className="program-action-button"
            style={styles.programActionButton}
            onClick={() => onDeleteProgram(program)}
            aria-label={`Delete "${program.name}"`}
            title={`Delete "${program.name}"`}
          >
            <Trash2 size={15} />
          </button>
          <button
            type="button"
            className="program-action-button"
            style={styles.expandButton}
            onClick={onToggleExpand}
            aria-label={isExpanded ? "Collapse" : "Expand"}
            aria-expanded={isExpanded}
          >
            {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        </div>
      </div>

      <div style={styles.progressSection}>
        <div style={styles.progressHeader}>
          <span style={styles.progressLabel}>Overall progress</span>
          <span style={styles.progressValue}>
            {Math.round(program.overallProgress)}%
          </span>
        </div>
        <div style={styles.progressBar}>
          <div
            style={{
              ...styles.progressFill,
              width: `${program.overallProgress}%`,
            }}
          />
        </div>
        <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 4 }}>
          {program.completedDays} / {program.totalDays} days completed
        </div>
      </div>

      {isExpanded && (
        <>
          {program.state === "Active" && todayHabits.length > 0 && (
            <div style={styles.todaySection}>
              <h4 style={styles.sectionTitle}>Today's habits</h4>
              <div style={styles.habitList}>
                {todayHabits.map((habit) => {
                  const isCompleted = habit.completedDates.includes(todayKey);
                  const isArchived = habit.isArchived;
                  return (
                    <div key={habit.id} style={{ ...styles.habitCard, opacity: isArchived ? 0.6 : 1 }}>
                      <button
                        type="button"
                        style={{
                          ...styles.checkbox,
                          ...(isCompleted ? styles.checkboxChecked : {}),
                        }}
                        onClick={() => !isArchived && onToggleHabit(habit.id, todayKey)}
                        aria-label={`Complete "${habit.name}"`}
                        aria-checked={isCompleted}
                        role="checkbox"
                        disabled={isArchived}
                      >
                        {isCompleted && <Check size={14} />}
                      </button>
                      <div style={styles.habitInfo}>
                        <span
                          style={{
                            ...styles.habitName,
                            ...(isCompleted ? styles.habitCompleted : {}),
                          }}
                        >
                          {habit.name}
                          {isArchived && <span style={{ fontSize: 12, color: "var(--text-dim)", marginLeft: 8 }}>(Archived)</span>}
                        </span>
                      </div>
                      <div style={styles.habitActions}>
                        <button
                          type="button"
                          className="program-action-button"
                          style={styles.iconButton}
                          onClick={() => onEditHabit(habit)}
                          aria-label={`Edit "${habit.name}"`}
                        >
                          <Pencil size={14} />
                        </button>
                        {!isArchived ? (
                          <button
                            type="button"
                            className="program-action-button"
                            style={styles.iconButton}
                            onClick={() => onArchiveHabit(habit.id)}
                            aria-label={`Archive "${habit.name}"`}
                          >
                            <Archive size={14} />
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="program-action-button"
                            style={styles.iconButton}
                            onClick={() => onUnarchiveHabit(habit.id)}
                            aria-label={`Unarchive "${habit.name}"`}
                          >
                            <ArchiveRestore size={14} />
                          </button>
                        )}
                        <button
                          type="button"
                          className="program-action-button"
                          style={styles.iconButton}
                          onClick={() => onDeleteHabit(habit)}
                          aria-label={`Delete "${habit.name}"`}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 8 }}>
                {todayProgress.completed} / {todayProgress.total} completed today
              </div>
            </div>
          )}

          <div style={styles.dayByDaySection}>
            <h4 style={styles.sectionTitle}>Day-by-day progress</h4>
            <div style={styles.dayByDayGrid}>
              {dayByDayProgress.map((day) => {
                const cellStyle = {
                  complete: styles.dayCellComplete,
                  partial: styles.dayCellPartial,
                  upcoming: styles.dayCellUpcoming,
                }[day.status];

                const statusLabel = {
                  complete: "✓",
                  partial: "◐",
                  upcoming: "○",
                }[day.status];

                return (
                  <div key={day.dayNumber} style={{ ...styles.dayCell, ...cellStyle }}>
                    <span style={styles.dayNumber}>{day.dayNumber}</span>
                    <span style={styles.dayStatus}>{statusLabel}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Programs({
  habits,
  onToggleHabit,
  onCreateProgram,
  dayResetHour,
  onEditHabit,
  onArchiveHabit,
  onUnarchiveHabit,
  onDeleteHabit,
  onEditProgram,
  onToggleProgramArchive,
  onDeleteProgram,
}: ProgramsProps) {
  const programs = useMemo(() => groupHabitsIntoPrograms(habits), [habits]);
  const [expandedPrograms, setExpandedPrograms] = useState<Set<number>>(new Set());
  const [showArchivedPrograms, setShowArchivedPrograms] = useState(false);
  const isProgramArchived = (programId: number) => {
    const members = habits.filter((habit) => habit.programId === programId);
    return members.length > 0 && members.every((habit) => habit.isArchived);
  };
  const activePrograms = programs.filter(
    (program) => program.state !== "Completed" && !isProgramArchived(program.id),
  );
  const archivedPrograms = programs.filter(
    (program) => program.state === "Completed" || isProgramArchived(program.id),
  );

  const toggleExpand = (programId: number) => {
    setExpandedPrograms((prev) => {
      const next = new Set(prev);
      if (next.has(programId)) {
        next.delete(programId);
      } else {
        next.add(programId);
      }
      return next;
    });
  };

  if (programs.length === 0) {
    return (
      <div style={styles.page}>
        <div style={styles.header}>
          <div style={styles.headerRow}>
            <div>
              <h1 style={styles.title}>Programs</h1>
              <p style={styles.date}>Structured multi-day experiences.</p>
            </div>
            <button style={styles.headerAction} onClick={onCreateProgram}>
              <Flame size={16} />
              Create Program
            </button>
          </div>
        </div>
        <div style={styles.emptyState}>
          <Flame size={48} style={{ color: "var(--text-muted)" }} />
          <h2 style={styles.emptyTitle}>No Active Programs</h2>
          <p style={styles.emptyText}>
            Create a structured program to work toward a specific outcome.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <div style={styles.headerRow}>
          <div>
            <h1 style={styles.title}>Programs</h1>
            <p style={styles.date}>{programs.length} program{programs.length !== 1 ? "s" : ""}</p>
          </div>
          <button style={styles.headerAction} onClick={onCreateProgram}>
            <Flame size={16} />
            Create Program
          </button>
        </div>
      </div>

      <div style={styles.section}>
        {activePrograms.map((program) => (
          <ProgramCard
            key={program.id}
            program={program}
            onToggleHabit={onToggleHabit}
            dayResetHour={dayResetHour}
            isExpanded={expandedPrograms.has(program.id)}
            onToggleExpand={() => toggleExpand(program.id)}
            onEditHabit={onEditHabit}
            onArchiveHabit={onArchiveHabit}
            onUnarchiveHabit={onUnarchiveHabit}
            onDeleteHabit={onDeleteHabit}
            onEditProgram={onEditProgram}
            onToggleProgramArchive={onToggleProgramArchive}
            onDeleteProgram={onDeleteProgram}
            isArchived={false}
          />
        ))}
        {activePrograms.length === 0 && archivedPrograms.length > 0 && (
          <p style={styles.emptyText}>No active programs.</p>
        )}
        {archivedPrograms.length > 0 && (
          <div>
            <button
              type="button"
              style={styles.archivedToggle}
              onClick={() => setShowArchivedPrograms((visible) => !visible)}
              aria-expanded={showArchivedPrograms}
            >
              <Archive size={15} />
              {showArchivedPrograms ? "Hide" : "Show"} Archived Programs ({archivedPrograms.length})
            </button>
            {showArchivedPrograms && archivedPrograms.map((program) => (
              <ProgramCard
                key={program.id}
                program={program}
                onToggleHabit={onToggleHabit}
                dayResetHour={dayResetHour}
                isExpanded={expandedPrograms.has(program.id)}
                onToggleExpand={() => toggleExpand(program.id)}
                onEditHabit={onEditHabit}
                onArchiveHabit={onArchiveHabit}
                onUnarchiveHabit={onUnarchiveHabit}
                onDeleteHabit={onDeleteHabit}
                onEditProgram={onEditProgram}
                onToggleProgramArchive={onToggleProgramArchive}
                onDeleteProgram={onDeleteProgram}
                isArchived={isProgramArchived(program.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default Programs;
