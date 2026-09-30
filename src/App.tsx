import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import {
  ListChecks,
  Timer as TimerIcon,
  Pencil,
  Trash2,
  History as HistoryIcon,
  ChevronLeft,
  ChevronRight,
  Check,
  BarChart3,
  Archive,
  ArchiveRestore,
  Snowflake,
  Settings,
  Target,
  Clock3,
  CalendarDays,
  Keyboard,
} from "lucide-react";
import { getVersion } from "@tauri-apps/api/app";
// Lines 18–22 in App.tsx
import FocusTimer from "./components/FocusTimer";
import History from "./components/History";
import Analytics from "./components/Analytics";
import Today from "./components/Today";
import Goals from "./components/Goals";
import StreakBadge from "./components/StreakBadge";
import KeyboardShortcutsModal from "./components/KeyboardShortcutsModal";
import { CARD_SURFACE } from "./theme";
import "./styles/AppLayout.css";
import type {
  Priority,
  HabitType,
  FrequencyType,
  WeekStart,
  Theme,
  View,
  AppSettings,
  Habit,
  Goal,
  Milestone,
  Task,
  Summary,
  FocusSessionRecord,
} from "./types";
import {
  STORAGE_KEYS,
  loadStorageData,
  saveStorageData,
  loadGoals,
  saveGoals,
  loadTasks,
  saveTasks,
  loadMilestones,
  saveMilestones,
  saveHabits,
} from "./utils/storage";
import { createGoal, updateGoal, updateGoalStatus, createMilestone, updateMilestone, toggleMilestone, deleteMilestone } from "./domain/goals";
import { createTask, toggleTaskCompletion, updateTask, deleteTask } from "./domain/tasks";
import {
  getTodayKey,
  formatDateDisplay,
  shiftDateKey,
  diffInDays,
  getFrequencyType,
  isHabitScheduledOnDate,
  calculateStreak,
  WEEKDAYS,
} from "./utils/dates";

const DEFAULT_DURATION = 30;
const DEFAULT_SETTINGS: AppSettings = {
  dayResetHour: 0,
  weekStart: "Sunday",
  defaultFocusDuration: 25,
  quickAdjustStepMinutes: 5,
  soundAlerts: true,
  showMandatoryHabitsInImportantItems: false,
  theme: "dark",
};
const FOCUS_DURATION_PRESETS = [15, 25, 45, 60];
const ALL_CATEGORIES = "All";
const NO_CATEGORY = "No Category";
const ADD_CATEGORY_VALUE = "__add_category__";
const FREQUENCY_LABELS: Record<FrequencyType, string> = {
  daily: "Daily",
  weekdays: "Weekdays",
  weekends: "Weekends",
  custom: "Custom Days",
};

const typeBadgeBase: CSSProperties = {
  fontSize: 11,
  fontWeight: 500,
  borderRadius: 12,
  padding: "3px 10px",
  lineHeight: 1.35,
  textAlign: "center",
  whiteSpace: "normal",
  overflowWrap: "anywhere",
  maxWidth: "100%",
  width: "fit-content",
};

const styles: Record<string, CSSProperties> = {
  h1: {
    fontSize: 22,
    fontWeight: 600,
    color: "var(--text-primary)",
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: "var(--text-secondary)",
    marginBottom: 20,
  },
  summary: {
    display: "flex",
    flexDirection: "column",
    gap: 2,
    marginBottom: 32,
    paddingBottom: 20,
    borderBottom: "1px solid var(--border-color)",
  },
  summaryPrimary: {
    fontSize: 14,
    color: "var(--text-body)",
    fontWeight: 500,
  },
  summarySecondary: {
    fontSize: 12,
    color: "var(--text-secondary)",
  },
  dateNavigator: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    flexWrap: "wrap",
    marginBottom: 16,
  },

  dateButton: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    background: "var(--bg-surface)",
    border: "1px solid var(--border-strong)",
    borderRadius: 20,
    padding: "7px 12px",
    color: "var(--text-secondary)",
    fontSize: 12,
    fontWeight: 500,
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  dateDisplay: {
    minWidth: 150,
    textAlign: "center",
    color: "var(--text-primary)",
    fontSize: 14,
    fontWeight: 600,
  },
  currentDateLabel: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    textAlign: "center",
    color: "var(--text-secondary)",
    fontSize: 13,
    marginTop: 12,
    marginBottom: 16,
  },
  inputRow: {
    display: "flex",
    gap: 8,
    marginBottom: 8,
    maxWidth: 640,
  },
  optionsRow: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
    alignItems: "center",
    marginBottom: 28,
  },
  input: {
    flex: 1,
    background: "var(--bg-surface)",
    border: "1px solid var(--border-strong)",
    borderRadius: 8,
    padding: "10px 14px",
    color: "var(--text-primary)",
    fontSize: 14,
    outline: "none",
  },
  select: {
    background: "var(--bg-surface)",
    border: "1px solid var(--border-strong)",
    borderRadius: 8,
    padding: "10px 12px",
    color: "var(--text-body)",
    fontSize: 14,
    outline: "none",
    cursor: "pointer",
  },
  durationField: {
    display: "flex",
    alignItems: "center",
    gap: 6,
  },
  durationInput: {
    width: 60,
    background: "var(--bg-surface)",
    border: "1px solid var(--border-strong)",
    borderRadius: 8,
    padding: "10px 10px",
    color: "var(--text-primary)",
    fontSize: 14,
    outline: "none",
  },
  durationLabel: {
    fontSize: 13,
    color: "var(--text-secondary)",
  },
  frequencyDays: {
    display: "flex",
    gap: 4,
    alignItems: "center",
  },
  frequencyDay: {
    width: 28,
    height: 28,
    padding: 0,
    borderRadius: 14,
    border: "1px solid var(--border-strong)",
    background: "transparent",
    color: "var(--text-muted)",
    fontSize: 11,
    cursor: "pointer",
  },
  frequencyDayActive: {
    background: "rgba(var(--accent-rgb), 0.1)",
    borderColor: "rgba(var(--accent-rgb), 0.42)",
    color: "var(--accent-teal)",
  },
  addButton: {
    background: "var(--bg-raised)",
    border: "1px solid var(--border-strong)",
    borderRadius: 8,
    padding: "10px 18px",
    color: "var(--text-body)",
    fontSize: 14,
    cursor: "pointer",
  },
  tableHeaderColors: {
    color: "var(--text-secondary)",
    fontSize: 11,
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    borderBottom: "1px solid var(--border-color)",
    marginBottom: 8,
  },
  headerActionsCell: {
    textAlign: "center",
  },
  list: {
    listStyle: "none",
    padding: 0,
    margin: 0,
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  itemColors: {
    ...CARD_SURFACE,
  },
  itemCompletedColors: {
    ...CARD_SURFACE,
    background: "var(--bg-completed)",
    opacity: 0.8,
  },
  habitName: {
    fontSize: 14,
    color: "var(--text-body)",
    wordBreak: "break-word",
    overflowWrap: "break-word",
  },
  habitNameDone: {
    color: "var(--text-dim)",
    textDecoration: "line-through",
  },
  priorityBadge: {
    fontSize: 11,
    fontWeight: 500,
    borderRadius: 20,
    padding: "2px 9px",
    whiteSpace: "nowrap",
    letterSpacing: 0.2,
    width: "fit-content",
  },
  priorityMandatory: {
    color: "var(--accent-teal)",
    background: "rgba(var(--accent-rgb), 0.08)",
    border: "1px solid rgba(var(--accent-rgb), 0.3)",
  },
  priorityOptional: {
    color: "var(--text-muted)",
    background: "transparent",
    border: "1px solid var(--border-strong)",
  },
  challengeBadge: {
    ...typeBadgeBase,
    color: "var(--accent-teal)",
    background: "rgba(var(--accent-rgb), 0.08)",
    border: "1px solid rgba(var(--accent-rgb), 0.3)",
  },
  challengeBadgeCompleted: {
    color: "var(--text-dim)",
    background: "transparent",
    border: "1px solid var(--border-strong)",
  },
  dailyBadge: {
    ...typeBadgeBase,
    color: "var(--accent-teal)",
    background: "transparent",
    border: "1px solid var(--border-strong)",
  },
  offDayBadge: {
    ...typeBadgeBase,
    color: "var(--text-dim)",
    background: "transparent",
    border: "1px solid var(--border-strong)",
  },
  toggleButton: {
    background: "var(--bg-raised)",
    border: "1px solid var(--border-strong)",
    borderRadius: 20,
    padding: "7px 14px",
    fontSize: 12,
    fontWeight: 500,
    color: "var(--text-secondary)",
    cursor: "pointer",
    whiteSpace: "nowrap",
    transition: "background 0.15s ease",
  },
  toggleButtonDone: {
    background: "rgba(var(--accent-rgb), 0.1)",
    border: "1px solid rgba(var(--accent-rgb), 0.42)",
    color: "var(--accent-teal)",
  },
  iconButton: {
    background: "transparent",
    border: "1px solid var(--border-strong)",
    borderRadius: 20,
    width: 28,
    height: 28,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "var(--text-dim)",
    cursor: "pointer",
    padding: 0,
    transition: "color 0.15s ease, border-color 0.15s ease",
    flexShrink: 0,
  },
  archiveButton: {
    background: "transparent",
    border: "1px solid var(--border-strong)",
    borderRadius: 20,
    width: 28,
    height: 28,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "var(--text-dim)",
    cursor: "pointer",
    padding: 0,
    transition: "color 0.15s ease, border-color 0.15s ease",
    flexShrink: 0,
  },
  streakFreezeToggle: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    background: "transparent",
    border: "1px solid var(--border-strong)",
    borderRadius: 20,
    padding: "6px 12px",
    fontSize: 12,
    fontWeight: 500,
    color: "var(--text-secondary)",
    cursor: "pointer",
    transition: "background 0.15s ease, color 0.15s ease, border-color 0.15s ease",
  },
  streakFreezeToggleActive: {
    background: "rgba(var(--accent-rgb), 0.08)",
    color: "var(--accent-teal)",
    borderColor: "rgba(var(--accent-rgb), 0.3)",
  },
  editRow: {
    gridColumn: "1 / -1",
    display: "flex",
    flexDirection: "column",
    gap: 10,
    width: "100%",
  },
  editFieldsRow: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
  },
  editInput: {
    flex: 1,
    minWidth: 120,
    background: "var(--bg-inset)",
    border: "1px solid var(--border-strong)",
    borderRadius: 6,
    padding: "6px 10px",
    color: "var(--text-primary)",
    fontSize: 14,
    outline: "none",
  },
  editSelect: {
    background: "var(--bg-inset)",
    border: "1px solid var(--border-strong)",
    borderRadius: 6,
    padding: "6px 10px",
    color: "var(--text-body)",
    fontSize: 14,
    outline: "none",
    cursor: "pointer",
  },
  editDurationInput: {
    width: 56,
    background: "var(--bg-inset)",
    border: "1px solid var(--border-strong)",
    borderRadius: 6,
    padding: "6px 8px",
    color: "var(--text-primary)",
    fontSize: 14,
    outline: "none",
  },
  saveButton: {
    background: "rgba(var(--accent-rgb), 0.1)",
    border: "1px solid rgba(var(--accent-rgb), 0.42)",
    borderRadius: 20,
    padding: "8px 16px",
    fontSize: 12,
    fontWeight: 500,
    color: "var(--accent-teal)",
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  cancelButton: {
    background: "transparent",
    border: "1px solid var(--border-strong)",
    borderRadius: 20,
    padding: "8px 16px",
    fontSize: 12,
    fontWeight: 500,
    color: "var(--text-secondary)",
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  empty: {
    fontSize: 13,
    color: "var(--text-dim)",
    textAlign: "center",
    padding: "24px 0",
  },
  sectionHeader: {
    fontSize: 12,
    fontWeight: 600,
    color: "var(--text-secondary)",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    margin: "24px 0 8px",
  },
  timerCenter: {
    display: "flex",
    justifyContent: "center",
    paddingTop: 24,
  },
  categoryInput: {
    width: 170,
    background: "var(--bg-surface)",
    border: "1px solid var(--border-strong)",
    borderRadius: 8,
    padding: "10px 12px",
    color: "var(--text-body)",
    fontSize: 14,
    outline: "none",
  },
  categoryBadge: {
    fontSize: 11,
    fontWeight: 500,
    color: "var(--text-secondary)",
    background: "var(--bg-inset)",
    border: "1px solid var(--border-strong)",
    borderRadius: 4,
    padding: "1px 7px",
    whiteSpace: "nowrap",
  },
  categoryManageButton: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: 34,
    height: 34,
    padding: 0,
    background: "var(--bg-surface)",
    border: "1px solid var(--border-strong)",
    borderRadius: 9,
    color: "var(--text-secondary)",
    cursor: "pointer",
  },
  categoryManager: {
    position: "absolute",
    top: "calc(100% + 8px)",
    left: "50%",
    transform: "translateX(-50%)",
    zIndex: 50,
    display: "flex",
    flexDirection: "column",
    gap: 10,
    width: "100%",
    maxWidth: 420,
    padding: 14,
    background: "var(--bg-surface)",
    border: "1px solid var(--border-strong)",
    borderRadius: 10,
    boxShadow: "0 12px 28px var(--shadow-medium)",
  },
  categoryManagerRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  categoryManagerName: {
    flex: 1,
    minWidth: 0,
    color: "var(--text-primary)",
    fontSize: 13,
  },
  settingsPage: {
    maxWidth: 760,
    width: "100%",
  },
  settingsCard: {
    ...CARD_SURFACE,
    display: "flex",
    flexDirection: "column",
    gap: 18,
    marginBottom: 14,
    padding: 20,
  },
  settingsCardTitle: {
    display: "flex",
    alignItems: "center",
    gap: 9,
    margin: 0,
    color: "var(--text-primary)",
    fontSize: 15,
    fontWeight: 600,
  },
  settingsRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 18,
    flexWrap: "wrap",
  },
  settingsLabel: {
    color: "var(--text-body)",
    fontSize: 14,
    fontWeight: 500,
  },
  settingsDescription: {
    display: "block",
    marginTop: 4,
    color: "var(--text-secondary)",
    fontSize: 12,
    lineHeight: 1.5,
  },
  settingsSelect: {
    minWidth: 190,
    background: "var(--bg-inset)",
    border: "1px solid var(--border-strong)",
    borderRadius: 8,
    padding: "9px 12px",
    color: "var(--text-body)",
    fontSize: 13,
    outline: "none",
    cursor: "pointer",
  },
  settingsSegment: {
    display: "inline-flex",
    gap: 4,
    padding: 3,
    background: "var(--bg-inset)",
    border: "1px solid var(--border-strong)",
    borderRadius: 9,
  },
  settingsSegmentButton: {
    border: "1px solid transparent",
    borderRadius: 6,
    padding: "7px 12px",
    background: "transparent",
    color: "var(--text-secondary)",
    fontSize: 12,
    cursor: "pointer",
  },
  settingsSegmentButtonActive: {
    color: "var(--accent-teal)",
    background: "rgba(var(--accent-rgb), 0.1)",
    border: "1px solid rgba(var(--accent-rgb), 0.3)",
  },
  settingsToggle: {
    width: 44,
    height: 26,
    padding: 3,
    border: "1px solid var(--border-strong)",
    borderRadius: 20,
    background: "var(--bg-toggle)",
    cursor: "pointer",
    transition: "background 0.15s ease, border-color 0.15s ease",
  },
  settingsToggleActive: {
    background: "rgba(var(--accent-rgb), 0.28)",
    border: "1px solid rgba(var(--accent-rgb), 0.6)",
  },
  settingsToggleThumb: {
    display: "block",
    width: 18,
    height: 18,
    borderRadius: "50%",
    background: "var(--text-secondary)",
    transition: "transform 0.15s ease, background 0.15s ease",
  },
  settingsToggleThumbActive: {
    transform: "translateX(18px)",
    background: "var(--accent-teal)",
  },
  settingsAboutRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
    flexWrap: "wrap",
  },
  settingsAppName: {
    color: "var(--text-primary)",
    fontSize: 15,
    fontWeight: 600,
  },
  settingsVersion: {
    display: "block",
    marginTop: 4,
    color: "var(--text-secondary)",
    fontSize: 12,
  },
  settingsActionButton: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    border: "1px solid var(--border-strong)",
    borderRadius: 8,
    padding: "9px 12px",
    background: "var(--bg-surface)",
    color: "var(--text-body)",
    fontSize: 13,
    cursor: "pointer",
  },
};

function formatFrequencyLabel(
  habit: Pick<Habit, "frequencyType" | "customDays">,
): string {
  const frequencyType = getFrequencyType(habit);
  const days = WEEKDAYS.filter((day) => habit.customDays?.includes(day));
  if (frequencyType === "custom" && days.length > 0) {
    return `${FREQUENCY_LABELS.custom}: ${days.join(", ")}`;
  }
  return FREQUENCY_LABELS[frequencyType];
}

// "school  work" -> "School Work" so filter tabs never split on casing.
function normalizeCategory(value: string): string {
  return value
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function loadCustomCategories(): string[] {
  const parsed = loadStorageData<string[]>(STORAGE_KEYS.CUSTOM_CATEGORIES, []);
  if (!Array.isArray(parsed)) return [];
  return Array.from(
    new Set(
      parsed
        .filter((category): category is string => typeof category === "string")
        .map(normalizeCategory)
        .filter(Boolean),
    ),
  ).sort();
}

function loadAppSettings(): AppSettings {
  const parsed = loadStorageData<Partial<AppSettings>>(STORAGE_KEYS.SETTINGS, {});
  return {
    dayResetHour: [0, 2, 3].includes(parsed.dayResetHour ?? -1)
      ? parsed.dayResetHour!
      : DEFAULT_SETTINGS.dayResetHour,
    weekStart: parsed.weekStart === "Monday" ? "Monday" : "Sunday",
    defaultFocusDuration: FOCUS_DURATION_PRESETS.includes(parsed.defaultFocusDuration ?? -1)
      ? parsed.defaultFocusDuration!
      : DEFAULT_SETTINGS.defaultFocusDuration,
    quickAdjustStepMinutes: Number.isInteger(parsed.quickAdjustStepMinutes)
      && parsed.quickAdjustStepMinutes! >= 1
      && parsed.quickAdjustStepMinutes! <= 180
      ? parsed.quickAdjustStepMinutes!
      : DEFAULT_SETTINGS.quickAdjustStepMinutes,
    soundAlerts: typeof parsed.soundAlerts === "boolean"
      ? parsed.soundAlerts
      : DEFAULT_SETTINGS.soundAlerts,
    showMandatoryHabitsInImportantItems: typeof parsed.showMandatoryHabitsInImportantItems === "boolean"
      ? parsed.showMandatoryHabitsInImportantItems
      : DEFAULT_SETTINGS.showMandatoryHabitsInImportantItems,
    theme: parsed.theme === "light" ? "light" : "dark",
  };
}

// Day number is (days since start) + 1, so starting today is Day 1.
function isChallengeActiveOnDate(habit: Habit, dateKey: string): boolean {
  if (habit.type !== "Challenge" || !habit.startDate || !habit.durationDays) {
    return false;
  }
  const daysElapsed = diffInDays(dateKey, habit.startDate);
  return daysElapsed >= 0 && daysElapsed < habit.durationDays;
}

function getChallengeDayNumber(habit: Habit, dateKey: string): number {
  if (!habit.startDate) return 1;
  const daysElapsed = diffInDays(dateKey, habit.startDate);
  return Math.max(1, daysElapsed + 1);
}

// Only counts completedDates that fall within this challenge's own
// window: from startDate through startDate + durationDays - 1.
function countCompletedInWindow(habit: Habit): number {
  if (habit.type !== "Challenge" || !habit.startDate || !habit.durationDays) {
    return 0;
  }
  const { startDate, durationDays } = habit;

  return habit.completedDates.filter((date) => {
    const offset = diffInDays(date, startDate);
    return offset >= 0 && offset < durationDays;
  }).length;
}

function formatCompletedDays(count: number): string {
  return `${count} ${count === 1 ? "Day" : "Days"} Completed`;
}

function computeSummary(habits: Habit[], dateKey: string): Summary {
  const total = habits.length;
  const doneCount = habits.filter((h) => h.completedDates.includes(dateKey))
    .length;
  const mandatoryHabits = habits.filter((h) => h.priority === "Mandatory");
  const mandatoryTotal = mandatoryHabits.length;
  const mandatoryDone = mandatoryHabits.filter((h) =>
    h.completedDates.includes(dateKey),
  ).length;
  const percent = total === 0 ? 0 : Math.round((doneCount / total) * 100);

  return { total, doneCount, percent, mandatoryTotal, mandatoryDone };
}

function App() {
  const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;
  const shortcutKey = isMac ? "⌘" : "Ctrl";

  const [appSettings, setAppSettings] = useState<AppSettings>(loadAppSettings);
  const [appVersion, setAppVersion] = useState<string | null>(null);
  const [view, setView] = useState<View>("Habits");
  const [selectedDateKey, setSelectedDateKey] = useState(() =>
    getTodayKey(appSettings.dayResetHour),
  );
  const lastLogicalDateKeyRef = useRef(getTodayKey(appSettings.dayResetHour));

  const [habits, setHabits] = useState<Habit[]>(() => {
    const localLoadHabits = (): Habit[] => {
      const parsed = loadStorageData<(Partial<Habit> & { id: number; name: string })[]>(STORAGE_KEYS.HABITS, []);
      if (!Array.isArray(parsed)) return [];

      return parsed.map((item) => {
        const hasValidChallengeFields =
          item.type === "Challenge" &&
          typeof item.startDate === "string" &&
          typeof item.durationDays === "number" &&
          item.durationDays > 0;

        const category =
          typeof item.category === "string" ? normalizeCategory(item.category) : "";

        return {
          id: item.id,
          name: item.name,
          goalId: typeof item.goalId === "string" ? item.goalId : undefined,
          priority: item.priority === "Mandatory" ? "Mandatory" : "Optional",
          type: hasValidChallengeFields ? "Challenge" : "Daily",
          frequencyType:
            item.frequencyType === "weekdays" ||
            item.frequencyType === "weekends" ||
            item.frequencyType === "custom"
              ? item.frequencyType
              : "daily",
          customDays: Array.isArray(item.customDays)
            ? item.customDays.filter((day): day is string => WEEKDAYS.includes(day))
            : [],
          durationDays: hasValidChallengeFields ? item.durationDays : undefined,
          startDate: hasValidChallengeFields ? item.startDate : undefined,
          completedDates: Array.isArray(item.completedDates)
            ? item.completedDates
            : [],
          isArchived: item.isArchived === true,
          category: category || undefined,
          scheduledTime: typeof item.scheduledTime === "string" ? item.scheduledTime : undefined,
          durationMinutes: typeof item.durationMinutes === "number" && item.durationMinutes > 0 ? item.durationMinutes : undefined,
        };
      });
    };
    return localLoadHabits();
  });
  const [goals, setGoals] = useState<Goal[]>(loadGoals);
  const [tasks, setTasks] = useState<Task[]>(loadTasks);
  const [milestones, setMilestones] = useState<Milestone[]>(loadMilestones);
  const [focusSessions, setFocusSessions] = useState<FocusSessionRecord[]>(() => {
    const parsed = loadStorageData<FocusSessionRecord[]>(STORAGE_KEYS.FOCUS_SESSIONS, []);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item: FocusSessionRecord) => {
      return (
        typeof item.id === "number" &&
        typeof item.timestamp === "number" &&
        (item.sessionType === "Timer" || item.sessionType === "Pomodoro Focus") &&
        typeof item.durationMinutes === "number" &&
        typeof item.habitName === "string"
      );
    });
  });
  const [newHabit, setNewHabit] = useState("");
  const [newGoalId, setNewGoalId] = useState("");
  const [newPriority, setNewPriority] = useState<Priority>("Optional");
  const [newType, setNewType] = useState<HabitType>("Daily");
  const [newFrequencyType, setNewFrequencyType] = useState<FrequencyType>("daily");
  const [newCustomDays, setNewCustomDays] = useState<string[]>([]);
  const [newDuration, setNewDuration] = useState(String(DEFAULT_DURATION));
  const [newCategory, setNewCategory] = useState("");
  const [newCategoryName, setNewCategoryName] = useState("");

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState("");
  const [editingGoalId, setEditingGoalId] = useState("");
  const [editingPriority, setEditingPriority] = useState<Priority>("Optional");
  const [editingType, setEditingType] = useState<HabitType>("Daily");
  const [editingFrequencyType, setEditingFrequencyType] = useState<FrequencyType>("daily");
  const [editingCustomDays, setEditingCustomDays] = useState<string[]>([]);
  const [editingDuration, setEditingDuration] = useState(
    String(DEFAULT_DURATION),
  );
  const [editingCategory, setEditingCategory] = useState("");
  const [editingCategoryName, setEditingCategoryName] = useState("");
  const [activeCategory, setActiveCategory] = useState(ALL_CATEGORIES);
  const [customCategories, setCustomCategories] = useState<string[]>(loadCustomCategories);
  const [showCategoryManager, setShowCategoryManager] = useState(false);
  const [editingCustomCategory, setEditingCustomCategory] = useState<string | null>(null);
  const [customCategoryDraft, setCustomCategoryDraft] = useState("");
  const [habitPendingDeletion, setHabitPendingDeletion] = useState<Habit | null>(null);
  const [focusSessionPendingDeletion, setFocusSessionPendingDeletion] = useState<FocusSessionRecord | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [showKeyboardShortcuts, setShowKeyboardShortcuts] = useState(false);
  const [streakFreeze, setStreakFreeze] = useState(() => {
    const stored = loadStorageData<string>(STORAGE_KEYS.STREAK_FREEZE, "false");
    return stored === "true";
  });
  const [initialFocusEntityId, setInitialFocusEntityId] = useState<{
    taskId?: string;
    habitId?: number;
    goalId?: string;
    title?: string;
  } | undefined>(undefined);

  useEffect(() => {
    saveStorageData(STORAGE_KEYS.SETTINGS, appSettings);
  }, [appSettings]);

  useLayoutEffect(() => {
    document.documentElement.setAttribute("data-theme", appSettings.theme);
  }, [appSettings.theme]);

  useEffect(() => {
    saveHabits(habits);
  }, [habits]);

  useEffect(() => {
    let cancelled = false;
    getVersion()
      .then((version) => {
        if (!cancelled) setAppVersion(version);
      })
      .catch(() => {
        if (!cancelled) setAppVersion(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    function syncHabitDay() {
      const currentDateKey = getTodayKey(appSettings.dayResetHour);
      const previousDateKey = lastLogicalDateKeyRef.current;
      if (currentDateKey === previousDateKey) return;

      lastLogicalDateKeyRef.current = currentDateKey;
      setSelectedDateKey((selected) =>
        selected === previousDateKey ? currentDateKey : selected,
      );
    }

    const intervalId = window.setInterval(syncHabitDay, 30_000);
    window.addEventListener("focus", syncHabitDay);
    document.addEventListener("visibilitychange", syncHabitDay);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", syncHabitDay);
      document.removeEventListener("visibilitychange", syncHabitDay);
    };
  }, [appSettings.dayResetHour]);

  useEffect(() => {
    saveGoals(goals);
  }, [goals]);

  useEffect(() => {
    saveTasks(tasks);
  }, [tasks]);

  useEffect(() => {
    saveMilestones(milestones);
  }, [milestones]);

  useEffect(() => {
    saveStorageData(STORAGE_KEYS.FOCUS_SESSIONS, focusSessions);
  }, [focusSessions]);

  useEffect(() => {
    saveStorageData(STORAGE_KEYS.STREAK_FREEZE, String(streakFreeze));
  }, [streakFreeze]);

  useEffect(() => {
    saveStorageData(STORAGE_KEYS.CUSTOM_CATEGORIES, customCategories);
  }, [customCategories]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;
      const modifier = isMac ? event.metaKey : event.ctrlKey;

      if (!modifier) return;

      switch (event.key) {
        case "1":
          event.preventDefault();
          setInitialFocusEntityId(undefined);
          setView("Today");
          break;
        case "2":
          event.preventDefault();
          setInitialFocusEntityId(undefined);
          setView("Habits");
          break;
        case "3":
          event.preventDefault();
          setInitialFocusEntityId(undefined);
          setView("goals");
          break;
        case "4":
          event.preventDefault();
          setView("Timer");
          break;
        case "5":
          event.preventDefault();
          setInitialFocusEntityId(undefined);
          setView("History");
          break;
        case "6":
          event.preventDefault();
          setInitialFocusEntityId(undefined);
          setView("Analytics");
          break;
        case ",":
          event.preventDefault();
          setInitialFocusEntityId(undefined);
          setView("Settings");
          break;
        case "/":
        case "?":
          event.preventDefault();
          setShowKeyboardShortcuts((prev) => !prev);
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const categoriesInUse = Array.from(
    new Set(
      habits
        .map((habit) => habit.category)
        .filter((category): category is string => !!category),
    ),
  ).sort();
  const categoryOptions = Array.from(
    new Set([...customCategories, ...categoriesInUse]),
  ).sort();
  const categoryTabs = [ALL_CATEGORIES, NO_CATEGORY, ...categoriesInUse];
  function navigateToView(nextView: View) {
    if (nextView !== "Timer") setInitialFocusEntityId(undefined);
    setView(nextView);
  }

  const currentCategory = categoryTabs.includes(activeCategory)
    ? activeCategory
    : ALL_CATEGORIES;
  const matchesCategory = (habit: Habit) => {
    if (currentCategory === ALL_CATEGORIES) return true;
    if (currentCategory === NO_CATEGORY) return !habit.category;
    return habit.category === currentCategory;
  };

  function rememberCategory(category: string) {
    if (!category) return;
    setCustomCategories((previous) =>
      previous.includes(category) ? previous : [...previous, category].sort(),
    );
  }

  function startCategoryRename(category: string) {
    setEditingCustomCategory(category);
    setCustomCategoryDraft(category);
  }

  function cancelCategoryRename() {
    setEditingCustomCategory(null);
    setCustomCategoryDraft("");
  }

  function renameCategory(category: string) {
    const nextCategory = normalizeCategory(customCategoryDraft);
    if (!nextCategory || nextCategory === category) {
      cancelCategoryRename();
      return;
    }

    if (customCategories.some((existing) => existing !== category && existing === nextCategory)) {
      return;
    }

    setCustomCategories((previous) =>
      previous.map((existing) => (existing === category ? nextCategory : existing)).sort(),
    );
    const updatedHabits = habits.map((habit) =>
      habit.category === category ? { ...habit, category: nextCategory } : habit,
    );
    setHabits(updatedHabits);
    setActiveCategory((current) => (current === category ? nextCategory : current));
    cancelCategoryRename();
  }

  function deleteCategory(category: string) {
    const confirmed = window.confirm(
      `Delete "${category}"? Habits in this category will become No Category.`,
    );
    if (!confirmed) return;

    setCustomCategories((previous) => previous.filter((existing) => existing !== category));
    const updatedHabits = habits.map((habit) =>
      habit.category === category ? { ...habit, category: undefined } : habit,
    );
    setHabits(updatedHabits);
    setActiveCategory((current) => (current === category ? ALL_CATEGORIES : current));
    if (editingCustomCategory === category) cancelCategoryRename();
  }

  function addHabit() {
    const name = newHabit.trim();

    if (name === "") {
      return;
    }

    const category = normalizeCategory(
      newCategory === ADD_CATEGORY_VALUE ? newCategoryName : newCategory,
    );
    rememberCategory(category);

    const habit: Habit = {
      id: Date.now(),
      name,
      goalId: newGoalId || undefined,
      category: category || undefined,
      priority: newPriority,
      type: newType,
      frequencyType: newFrequencyType,
      customDays: newFrequencyType === "custom" ? newCustomDays : [],
      ...(newType === "Challenge"
        ? {
            durationDays: Math.max(1, Math.round(Number(newDuration)) || DEFAULT_DURATION),
            startDate: getTodayKey(appSettings.dayResetHour),
          }
        : {}),
      completedDates: [],
    };

    setHabits([...habits, habit]);
    setNewHabit("");
    setNewGoalId("");
    setNewPriority("Optional");
    setNewType("Daily");
    setNewFrequencyType("daily");
    setNewCustomDays([]);
    setNewDuration(String(DEFAULT_DURATION));
    setNewCategory("");
    setNewCategoryName("");
  }

  function toggleHabit(id: number, dateKey?: string) {
    const targetDateKey = dateKey ?? selectedDateKey;
    const updatedHabits: Habit[] = habits.map((habit): Habit => {
      if (habit.id !== id) return habit;

      const isDoneOnTargetDate = habit.completedDates.includes(targetDateKey);
      const completedDates = isDoneOnTargetDate
        ? habit.completedDates.filter((date) => date !== targetDateKey)
        : [...habit.completedDates, targetDateKey];

      return { ...habit, completedDates };
    });
    setHabits(updatedHabits);
  }

  function requestHabitDeletion(habit: Habit) {
    setHabitPendingDeletion(habit);
  }

  function confirmHabitDeletion() {
    if (!habitPendingDeletion) return;

    setHabits((previous) =>
      previous.filter((habit) => habit.id !== habitPendingDeletion.id),
    );
    setHabitPendingDeletion(null);
  }

  function startEdit(habit: Habit) {
    setEditingId(habit.id);
    setEditingName(habit.name);
    setEditingGoalId(habit.goalId ?? "");
    setEditingPriority(habit.priority);
    setEditingType(habit.type);
    setEditingFrequencyType(getFrequencyType(habit));
    setEditingCustomDays(habit.customDays ?? []);
    setEditingDuration(String(habit.durationDays ?? DEFAULT_DURATION));
    setEditingCategory(habit.category ?? "");
    setEditingCategoryName("");
  }

  function cancelEdit() {
    setEditingId(null);
    setEditingName("");
    setEditingGoalId("");
    setEditingPriority("Optional");
    setEditingType("Daily");
    setEditingFrequencyType("daily");
    setEditingCustomDays([]);
    setEditingDuration(String(DEFAULT_DURATION));
    setEditingCategory("");
    setEditingCategoryName("");
  }

  function saveEdit(id: number) {
    const name = editingName.trim();

    if (name === "") {
      return;
    }

    const category = normalizeCategory(
      editingCategory === ADD_CATEGORY_VALUE
        ? editingCategoryName
        : editingCategory,
    );
    rememberCategory(category);

    const updatedHabits: Habit[] = habits.map((habit): Habit => {
        if (habit.id !== id) return habit;

        if (editingType === "Daily") {
          return {
            ...habit,
            name,
            goalId: editingGoalId || undefined,
            priority: editingPriority,
            type: "Daily",
            frequencyType: editingFrequencyType,
            customDays: editingFrequencyType === "custom" ? editingCustomDays : [],
            durationDays: undefined,
            startDate: undefined,
            category,
          };
        }

        // Switching into (or staying in) Challenge mode: keep the
        // original startDate if it already had one, otherwise the
        // challenge starts today.
        const startDate =
          habit.type === "Challenge" && habit.startDate
            ? habit.startDate
            : getTodayKey();

        return {
          ...habit,
          name,
          goalId: editingGoalId || undefined,
          priority: editingPriority,
          type: "Challenge",
          frequencyType: editingFrequencyType,
          customDays: editingFrequencyType === "custom" ? editingCustomDays : [],
          durationDays: Math.max(
            1,
            Math.round(Number(editingDuration)) || DEFAULT_DURATION,
          ),
          startDate,
          category,
        };
      });
    setHabits(updatedHabits);
    cancelEdit();
  }

  function addFocusSessionRecord(
    sessionType: "Timer" | "Pomodoro Focus",
    durationMinutes: number,
    habitName: string,
    goalId?: string,
    milestoneId?: string,
    taskId?: string,
    habitId?: number,
  ) {
    const newRecord: FocusSessionRecord = {
      id: Date.now(),
      timestamp: Date.now(),
      sessionType,
      durationMinutes,
      habitName,
      habitId,
      goalId,
      milestoneId,
      taskId,
    };
    setFocusSessions((prev) => [...prev, newRecord]);
  }

  function deleteFocusSession(id: number) {
    setFocusSessions((prev) => prev.filter((session) => session.id !== id));
  }

  function requestFocusSessionDeletion(id: number) {
    const session = focusSessions.find((item) => item.id === id);
    if (!session) return;
    setFocusSessionPendingDeletion(session);
  }

  function confirmFocusSessionDeletion() {
    if (!focusSessionPendingDeletion) return;

    deleteFocusSession(focusSessionPendingDeletion.id);
    setFocusSessionPendingDeletion(null);
  }

  function archiveHabit(id: number) {
    const updatedHabit = habits.find((habit) => habit.id === id);
    if (!updatedHabit) return;
    const archivedHabit = { ...updatedHabit, isArchived: true };
    setHabits(habits.map((habit) => (habit.id === id ? archivedHabit : habit)));
  }

  function unarchiveHabit(id: number) {
    const updatedHabit = habits.find((habit) => habit.id === id);
    if (!updatedHabit) return;
    const activeHabit = { ...updatedHabit, isArchived: false };
    setHabits(habits.map((habit) => (habit.id === id ? activeHabit : habit)));
  }

  const availableHabits = habits.filter(
    (habit) =>
      !habit.isArchived &&
      matchesCategory(habit) &&
      (habit.type === "Daily" || isChallengeActiveOnDate(habit, selectedDateKey)),
  );
  const archivedHabits = habits.filter(
    (habit) => habit.isArchived && matchesCategory(habit),
  );
  const activeHabits = availableHabits.filter((habit) =>
    isHabitScheduledOnDate(habit, selectedDateKey),
  );
  const offDayHabits = availableHabits.filter(
    (habit) => !isHabitScheduledOnDate(habit, selectedDateKey),
  );
  const summary = computeSummary(activeHabits, selectedDateKey);

  function renderFrequencyControls(
    frequencyType: FrequencyType,
    setFrequencyType: (value: FrequencyType) => void,
    customDays: string[],
    setCustomDays: (value: string[]) => void,
  ) {
    return (
      <>
        <select
          style={styles.select}
          value={frequencyType}
          onChange={(event) => setFrequencyType(event.target.value as FrequencyType)}
          aria-label="Frequency"
        >
          <option value="daily">Every Day</option>
          <option value="weekdays">Weekdays</option>
          <option value="weekends">Weekends</option>
          <option value="custom">Custom Days</option>
        </select>
        {frequencyType === "custom" && (
          <div style={styles.frequencyDays} aria-label="Custom frequency days">
            {WEEKDAYS.map((day) => {
              const selected = customDays.includes(day);
              return (
                <button
                  key={day}
                  type="button"
                  style={{
                    ...styles.frequencyDay,
                    ...(selected ? styles.frequencyDayActive : {}),
                  }}
                  onClick={() =>
                    setCustomDays(
                      selected
                        ? customDays.filter((selectedDay) => selectedDay !== day)
                        : [...customDays, day],
                    )
                  }
                  aria-label={day}
                  aria-pressed={selected}
                  title={day}
                >
                  {day[0]}
                </button>
              );
            })}
          </div>
        )}
      </>
    );
  }

  function renderCategorySelect(
    value: string,
    onChange: (nextValue: string) => void,
    customName: string,
    onCustomNameChange: (nextValue: string) => void,
    selectStyle: CSSProperties,
    inputStyle: CSSProperties,
  ) {
    return (
      <>
        <select
          style={selectStyle}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          aria-label="Category"
        >
          <option value="">No Category</option>
          {categoryOptions.map((category) => (
            <option key={category} value={category}>
              {category}
            </option>
          ))}
          <option value={ADD_CATEGORY_VALUE}>+ Add Custom Category...</option>
        </select>
        {value === ADD_CATEGORY_VALUE && (
          <input
            style={inputStyle}
            value={customName}
            onChange={(event) => onCustomNameChange(event.target.value)}
            placeholder="New category name"
            aria-label="New category name"
            autoFocus
          />
        )}
      </>
    );
  }

  function renderHabitRow(
    habit: Habit,
    completed: boolean,
    isArchived = false,
    isScheduled = true,
  ) {
    const doneOnSelectedDate = habit.completedDates.includes(selectedDateKey);
    const streak = calculateStreak(habit, streakFreeze, appSettings.dayResetHour);
    const isEditing = editingId === habit.id;

    const rowColorStyle = completed ? styles.itemCompletedColors : styles.itemColors;
    const archivedStyle = isArchived ? { opacity: 0.6 } : {};

    if (isEditing) {
      return (
        <li key={habit.id} className="habit-row" style={rowColorStyle}>
          <div style={styles.editRow}>
            <div style={styles.editFieldsRow}>
              <input
                style={styles.editInput}
                value={editingName}
                autoFocus
                onChange={(event) => setEditingName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") saveEdit(habit.id);
                  if (event.key === "Escape") cancelEdit();
                }}
              />
              <select
                style={styles.editSelect}
                value={editingPriority}
                onChange={(event) =>
                  setEditingPriority(event.target.value as Priority)
                }
                aria-label="Priority"
              >
                <option value="Optional">Optional</option>
                <option value="Mandatory">Mandatory</option>
              </select>
              <select
                style={styles.editSelect}
                value={editingType}
                onChange={(event) =>
                  setEditingType(event.target.value as HabitType)
                }
                aria-label="Type"
              >
                <option value="Daily">Daily Habit</option>
                <option value="Challenge">Challenge</option>
              </select>
              {editingType === "Challenge" && (
                <div style={styles.durationField}>
                  <input
                    style={styles.editDurationInput}
                    type="number"
                    min={1}
                    value={editingDuration}
                    onChange={(event) => setEditingDuration(event.target.value)}
                    aria-label="Duration in Days"
                  />
                  <span style={styles.durationLabel}>Days</span>
                </div>
              )}
              {renderFrequencyControls(
                editingFrequencyType,
                setEditingFrequencyType,
                editingCustomDays,
                setEditingCustomDays,
              )}
              {renderCategorySelect(
                editingCategory,
                setEditingCategory,
                editingCategoryName,
                setEditingCategoryName,
                styles.editSelect,
                styles.editInput,
              )}
              <select
                style={styles.editSelect}
                value={editingGoalId}
                onChange={(event) => setEditingGoalId(event.target.value)}
                aria-label="Linked Goal"
              >
                <option value="">No Linked Goal</option>
                {goals.map((goal) => (
                  <option key={goal.id} value={goal.id}>{goal.title}</option>
                ))}
              </select>
            </div>
            <div className="habit-cell-actions">
              <button style={styles.saveButton} onClick={() => saveEdit(habit.id)}>
                Save
              </button>
              <button style={styles.cancelButton} onClick={cancelEdit}>
                Cancel
              </button>
            </div>
          </div>
        </li>
      );
    }

    const completedInWindow = countCompletedInWindow(habit);

    return (
      <li key={habit.id} className="habit-row" style={{ ...rowColorStyle, ...archivedStyle }}>
        <div className="habit-info-cluster">
          <div className="habit-cell-name">
            <span
              style={{
                ...styles.habitName,
                ...(doneOnSelectedDate || completed ? styles.habitNameDone : {}),
              }}
            >
              {habit.name}
            </span>
            {habit.category && (
              <span style={styles.categoryBadge}>{habit.category}</span>
            )}
          </div>

          <span
            className="priority-badge"
            style={{
              ...styles.priorityBadge,
              ...(habit.priority === "Mandatory"
                ? styles.priorityMandatory
                : styles.priorityOptional),
            }}
          >
            {habit.priority}
          </span>

          <div className="habit-type-cell">
            {habit.type === "Challenge" && habit.durationDays ? (
              <span
                className="habit-type-badge"
                style={{
                  ...styles.challengeBadge,
                  ...(completed ? styles.challengeBadgeCompleted : {}),
                }}
              >
                {completed
                  ? `Completed · ${completedInWindow} of ${habit.durationDays} ${
                      completedInWindow === 1 ? "Day" : "Days"
                    } Completed`
                  : `Day ${Math.min(
                      getChallengeDayNumber(habit, selectedDateKey),
                      habit.durationDays,
                    )} of ${habit.durationDays} · ${formatCompletedDays(
                      completedInWindow,
                    )}`}
              </span>
            ) : (
              <span
                className="habit-type-badge"
                style={isScheduled ? styles.dailyBadge : styles.offDayBadge}
              >
                {isScheduled ? formatFrequencyLabel(habit) : "Off Day"}
              </span>
            )}
          </div>

          <StreakBadge className="my-habits-streak" streak={streak} />
        </div>

        <div className="habit-cell-actions">
          {!completed && !isArchived && isScheduled && (
            <button
              style={{
                ...styles.toggleButton,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                ...(doneOnSelectedDate ? styles.toggleButtonDone : {}),
              }}
              onClick={() => toggleHabit(habit.id)}
            >
              {doneOnSelectedDate ? (
                <>
                  <Check size={13} style={{ display: "block" }} />
                  Done
                </>
              ) : (
                "Mark Done"
              )}
            </button>
          )}
          <div className="habit-icon-group">
            <button
              style={styles.iconButton}
              onClick={() => startEdit(habit)}
              aria-label={`Edit ${habit.name}`}
            >
              <Pencil size={14} />
            </button>
            {!isArchived ? (
              <button
                style={styles.archiveButton}
                onClick={() => archiveHabit(habit.id)}
                aria-label={`Archive ${habit.name}`}
              >
                <Archive size={14} />
              </button>
            ) : (
              <button
                style={styles.archiveButton}
                onClick={() => unarchiveHabit(habit.id)}
                aria-label={`Unarchive ${habit.name}`}
              >
                <ArchiveRestore size={14} />
              </button>
            )}
            <button
              style={styles.iconButton}
              onClick={() => requestHabitDeletion(habit)}
              aria-label={`Delete ${habit.name}`}
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>
      </li>
    );
  }

  return (
    <div className="app-shell">
      <div className="app-body">
        <nav className="sidebar">
          <button
            className={`sidebar-item ${view === "Today" ? "active" : ""}`}
            onClick={() => navigateToView("Today")}
          >
            <CalendarDays size={20} />
            <span>Today</span>
            <span className="sidebar-shortcut">{shortcutKey}1</span>
          </button>
          <button
            className={`sidebar-item ${view === "Habits" ? "active" : ""}`}
            onClick={() => navigateToView("Habits")}
          >
            <ListChecks size={20} />
            <span>My Habits</span>
            <span className="sidebar-shortcut">{shortcutKey}2</span>
          </button>
          <button
            className={`sidebar-item ${view === "goals" ? "active" : ""}`}
            onClick={() => navigateToView("goals")}
          >
            <Target size={20} />
            <span>Goals</span>
            <span className="sidebar-shortcut">{shortcutKey}3</span>
          </button>
          <button
            className={`sidebar-item ${view === "Timer" ? "active" : ""}`}
            onClick={() => navigateToView("Timer")}
          >
            <TimerIcon size={20} />
            <span>Timer</span>
            <span className="sidebar-shortcut">{shortcutKey}4</span>
          </button>
          <button
            className={`sidebar-item ${view === "History" ? "active" : ""}`}
            onClick={() => navigateToView("History")}
          >
            <HistoryIcon size={20} />
            <span>History</span>
            <span className="sidebar-shortcut">{shortcutKey}5</span>
          </button>
          <button
            className={`sidebar-item ${view === "Analytics" ? "active" : ""}`}
            onClick={() => navigateToView("Analytics")}
          >
            <BarChart3 size={20} />
            <span>Analytics</span>
            <span className="sidebar-shortcut">{shortcutKey}6</span>
          </button>
          <div className="sidebar-spacer" />
          <button
            className={`sidebar-item ${view === "Settings" ? "active" : ""}`}
            onClick={() => navigateToView("Settings")}
          >
            <Settings size={20} />
            <span>Settings</span>
            <span className="sidebar-shortcut">{shortcutKey},</span>
          </button>
        </nav>

        <main className="main-content">
          {/* Both views stay mounted at all times — only visibility is
              toggled — so the Focus Timer's interval and state are
              never interrupted by switching sidebar tabs. */}
          <div
            style={{
              display: view === "Today" ? "flex" : "none",
              flexDirection: "column",
              alignItems: "center",
              width: "100%",
            }}
          >
            <Today
              habits={habits}
              tasks={tasks}
              goals={goals}
              milestones={milestones}
              focusSessions={focusSessions}
              onToggleHabit={(id, dateKey) => toggleHabit(id, dateKey)}
              onToggleTask={(taskId) =>
                setTasks((current) => current.map((task) =>
                  task.id === taskId ? toggleTaskCompletion(task) : task,
                ))
              }
              onStartFocus={(entityId) => {
                setInitialFocusEntityId(entityId);
                navigateToView("Timer");
              }}
              onNavigateToHabits={() => navigateToView("Habits")}
              streakFreeze={streakFreeze}
              dayResetHour={appSettings.dayResetHour}
              showMandatoryHabitsInImportantItems={appSettings.showMandatoryHabitsInImportantItems ?? false}
              onUpdateHabit={(updatedHabit) =>
                setHabits((current) => current.map((habit) =>
                  habit.id === updatedHabit.id ? updatedHabit : habit,
                ))
              }
              onUpdateTask={(updatedTask) =>
                setTasks((current) => current.map((task) =>
                  task.id === updatedTask.id ? updatedTask : task,
                ))
              }
            />
          </div>

          <div style={{ display: view === "Habits" ? "block" : "none" }}>
            <h1 style={styles.h1}>My Habits</h1>
            <p style={styles.subtitle}>Small steps count.</p>

            <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>
              <button
                style={{
                  ...styles.streakFreezeToggle,
                  ...(streakFreeze ? styles.streakFreezeToggleActive : {}),
                }}
                onClick={() => setStreakFreeze(!streakFreeze)}
                aria-pressed={streakFreeze}
              >
                <Snowflake size={14} />
                {streakFreeze ? "Streak Freeze ON" : "Streak Freeze OFF"}
              </button>
            </div>

<div className="date-navigator" style={styles.dateNavigator}>
  <button
    style={styles.dateButton}
    onClick={() => setSelectedDateKey((date) => shiftDateKey(date, -1))}
  >
    <ChevronLeft size={14} />
    Day Before
  </button>
  <button
    style={styles.dateButton}
    onClick={() => setSelectedDateKey(getTodayKey(appSettings.dayResetHour))}
  >
    Today
  </button>
  <button
    style={styles.dateButton}
    onClick={() => setSelectedDateKey((date) => shiftDateKey(date, 1))}
  >
    Day After
    <ChevronRight size={14} />
  </button>
</div>

            <div style={styles.currentDateLabel}>
              {formatDateDisplay(selectedDateKey, appSettings.dayResetHour)}
              {streakFreeze && (
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    verticalAlign: "middle",
                    color: "var(--accent-teal)",
                  }}
                >
                  <Snowflake size={14} />
                </span>
              )}
            </div>

            {summary.total > 0 && (
              <div style={styles.summary}>
                <span style={styles.summaryPrimary}>
                  {summary.doneCount} of {summary.total} Complete ·{" "}
                  {summary.percent}%
                </span>
                {summary.mandatoryTotal > 0 && (
                  <span style={styles.summarySecondary}>
                    {summary.mandatoryDone} of {summary.mandatoryTotal}{" "}
                    Mandatory done
                  </span>
                )}
              </div>
            )}

            <div className="category-section">
              <div className="category-tabs" role="group" aria-label="Filter habits by category">
                {categoryTabs.map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    className={`category-tab ${currentCategory === tab ? "active" : ""}`}
                    onClick={() => setActiveCategory(tab)}
                    aria-pressed={currentCategory === tab}
                  >
                    {tab}
                  </button>
                ))}
                <div className="category-settings">
                  <button
                    type="button"
                    style={styles.categoryManageButton}
                    onClick={() => setShowCategoryManager((visible) => !visible)}
                    aria-label="Manage custom categories"
                    aria-expanded={showCategoryManager}
                    title="Manage custom categories"
                  >
                    <Settings size={16} />
                  </button>
                </div>
              </div>
              {showCategoryManager && (
                <div style={styles.categoryManager}>
                  <strong style={{ color: "var(--text-primary)", fontSize: 13 }}>
                    Custom Categories
                  </strong>
                  {customCategories.length === 0 ? (
                    <span style={{ color: "var(--text-muted)", fontSize: 12 }}>
                      Add a category from the habit form to manage it here.
                    </span>
                  ) : (
                    customCategories.map((category) => (
                      <div key={category} style={styles.categoryManagerRow}>
                        {editingCustomCategory === category ? (
                          <input
                            style={{ ...styles.input, minWidth: 0, padding: "7px 10px" }}
                            value={customCategoryDraft}
                            onChange={(event) => setCustomCategoryDraft(event.target.value)}
                            aria-label={`Rename ${category}`}
                            autoFocus
                          />
                        ) : (
                          <span style={styles.categoryManagerName}>{category}</span>
                        )}
                        {editingCustomCategory === category ? (
                          <>
                            <button
                              style={styles.saveButton}
                              onClick={() => renameCategory(category)}
                            >
                              Save
                            </button>
                            <button style={styles.cancelButton} onClick={cancelCategoryRename}>
                              Cancel
                            </button>
                          </>
                        ) : (
                          <button
                            style={styles.cancelButton}
                            onClick={() => startCategoryRename(category)}
                          >
                            Rename
                          </button>
                        )}
                        <button
                          style={styles.iconButton}
                          onClick={() => deleteCategory(category)}
                          aria-label={`Delete ${category}`}
                          title={`Delete ${category}`}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>

          <div style={{ ...styles.inputRow, justifyContent: "center", margin: "0 auto", maxWidth: 500 }}>
              <input
                style={styles.input}
                value={newHabit}
                onChange={(event) => setNewHabit(event.target.value)}
                placeholder="Add a Habit"
              />
              <button style={styles.addButton} onClick={addHabit}>
                Add
              </button>
            </div>

                        <div style={{ ...styles.optionsRow, justifyContent: "center", marginTop: 12, marginBottom: 32 }}>
              <select
                style={styles.select}
                value={newPriority}
                onChange={(event) =>
                  setNewPriority(event.target.value as Priority)
                }
                aria-label="Priority"
              >
                <option value="Optional">Optional</option>
                <option value="Mandatory">Mandatory</option>
              </select>
              <select
                style={styles.select}
                value={newType}
                onChange={(event) => setNewType(event.target.value as HabitType)}
                aria-label="Type"
              >
                <option value="Daily">Daily Habit</option>
                <option value="Challenge">Challenge</option>
              </select>
              {newType === "Challenge" && (
                <div style={styles.durationField}>
                  <input
                    style={styles.durationInput}
                    type="number"
                    min={1}
                    value={newDuration}
                    onChange={(event) => setNewDuration(event.target.value)}
                    aria-label="Duration in Days"
                  />
                  <span style={styles.durationLabel}>Days</span>
                </div>
              )}
              {renderFrequencyControls(
                newFrequencyType,
                setNewFrequencyType,
                newCustomDays,
                setNewCustomDays,
              )}
              {renderCategorySelect(
                newCategory,
                setNewCategory,
                newCategoryName,
                setNewCategoryName,
                styles.select,
                styles.categoryInput,
              )}
              <select
                style={styles.select}
                value={newGoalId}
                onChange={(event) => setNewGoalId(event.target.value)}
                aria-label="Linked Goal"
              >
                <option value="">No Linked Goal</option>
                {goals.map((goal) => (
                  <option key={goal.id} value={goal.id}>{goal.title}</option>
                ))}
              </select>
            </div>

            {activeHabits.length === 0 && offDayHabits.length === 0 ? (
              <p style={styles.empty}>
                {habits.length === 0
                  ? "No habits yet — add your first one above."
                  : currentCategory !== ALL_CATEGORIES && !habits.some(matchesCategory)
                  ? `No habits in ${currentCategory} yet.`
                  : archivedHabits.length > 0
                  ? "No active habits. Show archived habits below to restore them."
                  : "No habits active on this date."}
              </p>
            ) : (
              <div>
                {activeHabits.length > 0 && (
                  <>
                    <div className="habit-table-header" style={styles.tableHeaderColors}>
                      <span>Habit Name</span>
                      <span>Priority</span>
                      <span className="habit-type-cell">Type / Progress</span>
                      <span>Streak</span>
                      <span style={styles.headerActionsCell}>Actions</span>
                    </div>

                    <ul style={styles.list}>
                      {activeHabits.map((habit) =>
                        renderHabitRow(habit, false, false),
                      )}
                    </ul>
                  </>
                )}

                {offDayHabits.length > 0 && (
                  <div style={{ marginTop: activeHabits.length > 0 ? 32 : 0 }}>
                    <h2 style={styles.sectionHeader}>Not Scheduled Today</h2>
                    <div className="habit-table-header" style={styles.tableHeaderColors}>
                      <span>Habit Name</span>
                      <span>Priority</span>
                      <span className="habit-type-cell">Type / Progress</span>
                      <span>Streak</span>
                      <span style={styles.headerActionsCell}>Actions</span>
                    </div>
                    <ul style={styles.list}>
                      {offDayHabits.map((habit) =>
                        renderHabitRow(habit, false, false, false),
                      )}
                    </ul>
                  </div>
                )}

              </div>
            )}

            {/* Archived Habits Section */}
            {archivedHabits.length > 0 && (
              <div style={{ marginTop: 32 }}>
                <button
                  style={{
                    ...styles.toggleButton,
                    marginBottom: 16,
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                  onClick={() => setShowArchived(!showArchived)}
                >
                  <Archive size={14} />
                  {showArchived ? "Hide" : "Show"} Archived Habits ({archivedHabits.length})
                </button>

                {showArchived && (
                  <div>
                    <div className="habit-table-header" style={styles.tableHeaderColors}>
                      <span>Habit Name</span>
                      <span>Priority</span>
                      <span className="habit-type-cell">Type / Progress</span>
                      <span>Streak</span>
                      <span style={styles.headerActionsCell}>Actions</span>
                    </div>

                    <ul style={styles.list}>
                      {archivedHabits.map((habit) =>
                        renderHabitRow(habit, false, true),
                      )}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>

          <div
            className="focus-view"
            style={{
              ...styles.timerCenter,
              display: view === "Timer" ? "flex" : "none",
            }}
          >
            <FocusTimer
              habits={habits}
              focusSessions={focusSessions}
              onSessionComplete={addFocusSessionRecord}
              defaultFocusDuration={appSettings.defaultFocusDuration}
              quickAdjustStepMinutes={appSettings.quickAdjustStepMinutes}
              onQuickAdjustStepChange={(minutes) =>
                setAppSettings((current) => ({ ...current, quickAdjustStepMinutes: minutes }))
              }
              soundAlerts={appSettings.soundAlerts}
              goals={goals}
              milestones={milestones}
              tasks={tasks}
              allHabits={habits}
              initialEntityId={initialFocusEntityId}
            />
          </div>

          <div
            style={{
              display: view === "History" ? "flex" : "none",
              flexDirection: "column",
              alignItems: "center",
              width: "100%",
            }}
          >
            <History
              habits={habits}
              focusSessions={focusSessions}
              onRequestDeleteFocusSession={requestFocusSessionDeletion}
              streakFreeze={streakFreeze}
              dayResetHour={appSettings.dayResetHour}
              weekStart={appSettings.weekStart}
            />
          </div>

          <div
            style={{
              display: view === "Analytics" ? "flex" : "none",
              flexDirection: "column",
              alignItems: "center",
              width: "100%",
            }}
          >
            <Analytics
              habits={habits}
              tasks={tasks}
              goals={goals}
              focusSessions={focusSessions}
              streakFreeze={streakFreeze}
              dayResetHour={appSettings.dayResetHour}
              weekStart={appSettings.weekStart}
            />
          </div>

          <div
            style={{
              display: view === "goals" ? "flex" : "none",
              flexDirection: "column",
              alignItems: "center",
              width: "100%",
            }}
          >
            <Goals
              goals={goals}
              tasks={tasks}
              habits={habits}
              focusSessions={focusSessions}
              streakFreeze={streakFreeze}
              dayResetHour={appSettings.dayResetHour}
              milestones={milestones}
              onAddGoal={(data) => setGoals((current) => [...current, createGoal(data)])}
              onAddTask={(data) => setTasks((current) => [...current, createTask(data)])}
              onToggleTask={(taskId) =>
                setTasks((current) => current.map((task) =>
                  task.id === taskId ? toggleTaskCompletion(task) : task,
                ))
              }
              onToggleGoalArchive={(goalId) =>
                setGoals((current) => current.map((goal) =>
                  goal.id === goalId
                    ? updateGoalStatus(goal, goal.status === "archived" ? "active" : "archived")
                    : goal,
                ))
              }
              onEditGoal={(goalId, data) =>
                setGoals((current) => current.map((goal) =>
                  goal.id === goalId ? updateGoal(goal, data) : goal,
                ))
              }
              onDeleteGoal={(goalId) => {
                setGoals((current) => current.filter((goal) => goal.id !== goalId));
                setTasks((current) => current.filter((task) => task.goalId !== goalId));
                setMilestones((current) => current.filter((milestone) => milestone.goalId !== goalId));
                setHabits((current) => current.map((habit) =>
                  habit.goalId === goalId ? { ...habit, goalId: undefined } : habit,
                ));
              }}
              onEditTask={(taskId, data) =>
                setTasks((current) => current.map((task) =>
                  task.id === taskId ? updateTask(task, data) : task,
                ))
              }
              onDeleteTask={(taskId) =>
                setTasks((current) => deleteTask(current, taskId))
              }
              onAddMilestone={(data) => setMilestones((current) => [...current, createMilestone(data)])}
              onEditMilestone={(milestoneId, data) =>
                setMilestones((current) => current.map((milestone) =>
                  milestone.id === milestoneId ? updateMilestone(milestone, data) : milestone,
                ))
              }
              onDeleteMilestone={(milestoneId) =>
                setMilestones((current) => deleteMilestone(current, milestoneId))
              }
              onToggleMilestone={(goalId, milestoneId) =>
                setMilestones((current) => current.map((milestone) =>
                  milestone.goalId === goalId && milestone.id === milestoneId
                    ? toggleMilestone(milestone)
                    : milestone,
                ))
              }
            />
          </div>

          <div
            style={{
              display: view === "Settings" ? "flex" : "none",
              flexDirection: "column",
              alignItems: "center",
              width: "100%",
            }}
          >
            <div style={styles.settingsPage}>
              <h1 style={styles.h1}>Settings</h1>
              <p style={styles.subtitle}>Manage your app preferences and defaults.</p>

              <section style={styles.settingsCard} aria-labelledby="general-settings-title">
                <h2 id="general-settings-title" style={styles.settingsCardTitle}>
                  <CalendarDays size={17} />
                  General
                </h2>
                <div className="settings-row" style={styles.settingsRow}>
                  <div>
                    <span style={styles.settingsLabel}>Appearance</span>
                    <span style={styles.settingsDescription}>Choose your preferred color theme.</span>
                  </div>
                  <div className="settings-segment" style={styles.settingsSegment} role="group" aria-label="Appearance theme">
                    {(["dark", "light"] as Theme[]).map((theme) => (
                      <button
                        key={theme}
                        type="button"
                        style={{
                          ...styles.settingsSegmentButton,
                          ...(appSettings.theme === theme ? styles.settingsSegmentButtonActive : {}),
                        }}
                        onClick={() => setAppSettings((current) => ({ ...current, theme }))}
                        aria-pressed={appSettings.theme === theme}
                      >
                        {theme === "dark" ? "Dark" : "Light"}
                      </button>
                    ))}
                  </div>
                </div>
                <div style={styles.settingsRow}>
                  <div>
                    <label htmlFor="day-reset-time" style={styles.settingsLabel}>Day Reset Time</label>
                    <span style={styles.settingsDescription}>Choose when a new habit day begins.</span>
                  </div>
                  <select
                    id="day-reset-time"
                    style={styles.settingsSelect}
                    value={appSettings.dayResetHour}
                    onChange={(event) => {
                      const dayResetHour = Number(event.target.value);
                      setAppSettings((current) => ({ ...current, dayResetHour }));
                      setSelectedDateKey(getTodayKey(dayResetHour));
                    }}
                  >
                    <option value={0}>12:00 AM</option>
                    <option value={1}>1:00 AM</option>
                    <option value={2}>2:00 AM</option>
                    <option value={3}>3:00 AM</option>
                  </select>
                </div>
                <div style={styles.settingsRow}>
                  <div>
                    <span style={styles.settingsLabel}>Start of Week</span>
                    <span style={styles.settingsDescription}>Used by calendar grids and weekly summaries.</span>
                  </div>
                  <div style={styles.settingsSegment} role="group" aria-label="Start of week">
                    {(["Sunday", "Monday"] as WeekStart[]).map((weekStart) => (
                      <button
                        key={weekStart}
                        type="button"
                        style={{
                          ...styles.settingsSegmentButton,
                          ...(appSettings.weekStart === weekStart ? styles.settingsSegmentButtonActive : {}),
                        }}
                        onClick={() => setAppSettings((current) => ({ ...current, weekStart }))}
                        aria-pressed={appSettings.weekStart === weekStart}
                      >
                        {weekStart}
                      </button>
                    ))}
                  </div>
                </div>
              </section>

              <section style={styles.settingsCard} aria-labelledby="today-task-settings-title">
                <h2 id="today-task-settings-title" style={styles.settingsCardTitle}>
                  <ListChecks size={17} />
                  Today &amp; Task Settings
                </h2>
                <div style={styles.settingsRow}>
                  <div>
                    <span style={styles.settingsLabel}>Show Mandatory Habits in Important Items</span>
                    <span style={styles.settingsDescription}>Include pending mandatory habits in today&apos;s important items.</span>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-label="Show Mandatory Habits in Important Items"
                    aria-checked={appSettings.showMandatoryHabitsInImportantItems ?? false}
                    style={{
                      ...styles.settingsToggle,
                      ...((appSettings.showMandatoryHabitsInImportantItems ?? false) ? styles.settingsToggleActive : {}),
                    }}
                    onClick={() => setAppSettings((current) => ({
                      ...current,
                      showMandatoryHabitsInImportantItems: !(current.showMandatoryHabitsInImportantItems ?? false),
                    }))}
                  >
                    <span
                      style={{
                        ...styles.settingsToggleThumb,
                        ...((appSettings.showMandatoryHabitsInImportantItems ?? false) ? styles.settingsToggleThumbActive : {}),
                      }}
                    />
                  </button>
                </div>
              </section>

              <section style={styles.settingsCard} aria-labelledby="focus-defaults-title">
                <h2 id="focus-defaults-title" style={styles.settingsCardTitle}>
                  <Clock3 size={17} />
                  Focus Timer Defaults
                </h2>
                <div style={styles.settingsRow}>
                  <div>
                    <span style={styles.settingsLabel}>Default Focus Duration</span>
                    <span style={styles.settingsDescription}>Applied to the Timer and Pomodoro focus duration.</span>
                  </div>
                  <div style={styles.settingsSegment} role="group" aria-label="Default focus duration">
                    {FOCUS_DURATION_PRESETS.map((minutes) => (
                      <button
                        key={minutes}
                        type="button"
                        style={{
                          ...styles.settingsSegmentButton,
                          ...(appSettings.defaultFocusDuration === minutes ? styles.settingsSegmentButtonActive : {}),
                        }}
                        onClick={() => setAppSettings((current) => ({ ...current, defaultFocusDuration: minutes }))}
                        aria-pressed={appSettings.defaultFocusDuration === minutes}
                      >
                        {minutes}M
                      </button>
                    ))}
                  </div>
                </div>
                <div style={styles.settingsRow}>
                  <div>
                    <span style={styles.settingsLabel}>Quick Adjust Step</span>
                    <span style={styles.settingsDescription}>Choose the time added or removed by the timer controls.</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <select
                      style={{ ...styles.settingsSelect, minWidth: 120 }}
                      value={[1, 5, 10].includes(appSettings.quickAdjustStepMinutes) ? appSettings.quickAdjustStepMinutes : "custom"}
                      onChange={(event) => {
                        if (event.target.value !== "custom") {
                          setAppSettings((current) => ({ ...current, quickAdjustStepMinutes: Number(event.target.value) }));
                        } else if ([1, 5, 10].includes(appSettings.quickAdjustStepMinutes)) {
                          setAppSettings((current) => ({ ...current, quickAdjustStepMinutes: 2 }));
                        }
                      }}
                      aria-label="Quick adjust step size"
                    >
                      <option value={1}>1 minute</option>
                      <option value={5}>5 minutes</option>
                      <option value={10}>10 minutes</option>
                      <option value="custom">Custom</option>
                    </select>
                    {!([1, 5, 10].includes(appSettings.quickAdjustStepMinutes)) && (
                      <input
                        type="number"
                        min={1}
                        max={180}
                        style={{ ...styles.settingsSelect, minWidth: 76, width: 76 }}
                        value={appSettings.quickAdjustStepMinutes}
                        onChange={(event) => {
                          const value = Number(event.target.value);
                          if (Number.isFinite(value) && value >= 1) {
                            setAppSettings((current) => ({
                              ...current,
                              quickAdjustStepMinutes: Math.min(180, Math.round(value)),
                            }));
                          }
                        }}
                        aria-label="Custom quick adjust step in minutes"
                      />
                    )}
                    {!([1, 5, 10].includes(appSettings.quickAdjustStepMinutes)) && (
                      <span style={styles.durationLabel}>min</span>
                    )}
                  </div>
                </div>
                <div style={styles.settingsRow}>
                  <div>
                    <span style={styles.settingsLabel}>Sound Alerts</span>
                    <span style={styles.settingsDescription}>Play chime on timer completion.</span>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-label="Play chime on timer completion"
                    aria-checked={appSettings.soundAlerts}
                    style={{
                      ...styles.settingsToggle,
                      ...(appSettings.soundAlerts ? styles.settingsToggleActive : {}),
                    }}
                    onClick={() => setAppSettings((current) => ({ ...current, soundAlerts: !current.soundAlerts }))}
                  >
                    <span
                      style={{
                        ...styles.settingsToggleThumb,
                        ...(appSettings.soundAlerts ? styles.settingsToggleThumbActive : {}),
                      }}
                    />
                  </button>
                </div>
              </section>

              <section style={styles.settingsCard} aria-labelledby="about-system-title">
                <h2 id="about-system-title" style={styles.settingsCardTitle}>About &amp; System Info</h2>
                <div style={styles.settingsAboutRow}>
                  <div>
                    <span style={styles.settingsAppName}>Synchron</span>
                    <span style={styles.settingsVersion}>
                      {appVersion ? `v${appVersion}` : "Version unavailable"}
                    </span>
                  </div>
                  <button
                    type="button"
                    style={styles.settingsActionButton}
                    onClick={() => setShowKeyboardShortcuts(true)}
                  >
                    <Keyboard size={15} />
                    Keyboard Shortcuts
                    <span style={{ color: "var(--text-secondary)", fontSize: 11 }}>{shortcutKey}/</span>
                  </button>
                </div>
              </section>
            </div>
          </div>

        </main>
      </div>
      {habitPendingDeletion && (
        <div
          className="modal-overlay"
          role="presentation"
          onClick={() => setHabitPendingDeletion(null)}
        >
          <div
            className="delete-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="delete-modal-title">Delete {habitPendingDeletion.name}?</h2>
            <p>This action cannot be undone.</p>
            <div className="delete-modal-actions">
              <button
                type="button"
                className="delete-modal-cancel"
                onClick={() => setHabitPendingDeletion(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="delete-modal-confirm"
                onClick={confirmHabitDeletion}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {focusSessionPendingDeletion && (
        <div
          className="modal-overlay"
          role="presentation"
          onClick={() => setFocusSessionPendingDeletion(null)}
        >
          <div
            className="delete-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-focus-session-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="delete-focus-session-modal-title">
              Delete this {focusSessionPendingDeletion.sessionType} session?
            </h2>
            <p>This action cannot be undone.</p>
            <div className="delete-modal-actions">
              <button
                type="button"
                className="delete-modal-cancel"
                onClick={() => setFocusSessionPendingDeletion(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="delete-modal-confirm"
                onClick={confirmFocusSessionDeletion}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {showKeyboardShortcuts && (
        <KeyboardShortcutsModal onClose={() => setShowKeyboardShortcuts(false)} shortcutKey={shortcutKey} />
      )}
    </div>
  );
}

export default App;