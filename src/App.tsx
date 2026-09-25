import { useEffect, useState, type CSSProperties } from "react";
import {
  ListChecks,
  Timer as TimerIcon,
  Flame,
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
} from "lucide-react";
// Lines 18–22 in App.tsx
import FocusTimer from "./components/FocusTimer";
import History, { type FocusSessionRecord } from "./components/History";
import Analytics from "./components/Analytics";
import { CARD_SURFACE } from "./theme";
import "./styles/AppLayout.css";


type Priority = "Mandatory" | "Optional";
type HabitType = "Daily" | "Challenge";
type FrequencyType = "daily" | "weekdays" | "weekends" | "custom";
type View = "Habits" | "Timer" | "History" | "Analytics";

type Habit = {
  id: number;
  name: string;
  priority: Priority;
  type: HabitType;
  frequencyType?: FrequencyType;
  customDays?: string[];
  durationDays?: number; // only meaningful when type === "Challenge"
  startDate?: string; // "YYYY-MM-DD", only meaningful when type === "Challenge"
  completedDates: string[]; // "YYYY-MM-DD" local calendar days this habit was completed
  isArchived?: boolean; // if true, habit is archived and hidden from active list
  category?: string; // optional Title Case label, e.g. "School"
};

const STORAGE_KEY = "habits";
const FOCUS_SESSIONS_KEY = "focusSessions";
const STREAK_FREEZE_KEY = "streakFreeze";
const CUSTOM_CATEGORIES_KEY = "habitCategories";
const DEFAULT_DURATION = 30;
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
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
    color: "#e4e4e7",
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: "#71717a",
    marginBottom: 20,
  },
  summary: {
    display: "flex",
    flexDirection: "column",
    gap: 2,
    marginBottom: 32,
    paddingBottom: 20,
    borderBottom: "1px solid #232329",
  },
  summaryPrimary: {
    fontSize: 14,
    color: "#c4c5c9",
    fontWeight: 500,
  },
  summarySecondary: {
    fontSize: 12,
    color: "#6b6c72",
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
    background: "#16161a",
    border: "1px solid #303039",
    borderRadius: 20,
    padding: "7px 12px",
    color: "#a1a1aa",
    fontSize: 12,
    fontWeight: 500,
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  dateDisplay: {
    minWidth: 150,
    textAlign: "center",
    color: "#e4e4e7",
    fontSize: 14,
    fontWeight: 600,
  },
  currentDateLabel: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    textAlign: "center",
    color: "#8a8b91",
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
    background: "#16161a",
    border: "1px solid #303039",
    borderRadius: 8,
    padding: "10px 14px",
    color: "#e4e4e7",
    fontSize: 14,
    outline: "none",
  },
  select: {
    background: "#16161a",
    border: "1px solid #303039",
    borderRadius: 8,
    padding: "10px 12px",
    color: "#d4d4d8",
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
    background: "#16161a",
    border: "1px solid #303039",
    borderRadius: 8,
    padding: "10px 10px",
    color: "#e4e4e7",
    fontSize: 14,
    outline: "none",
  },
  durationLabel: {
    fontSize: 13,
    color: "#71717a",
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
    border: "1px solid #303039",
    background: "transparent",
    color: "#71717a",
    fontSize: 11,
    cursor: "pointer",
  },
  frequencyDayActive: {
    background: "rgba(0, 240, 255, 0.1)",
    borderColor: "rgba(0, 240, 255, 0.42)",
    color: "#00f0ff",
  },
  addButton: {
    background: "#1c1c21",
    border: "1px solid #303039",
    borderRadius: 8,
    padding: "10px 18px",
    color: "#d4d4d8",
    fontSize: 14,
    cursor: "pointer",
  },
  tableHeaderColors: {
    color: "#5c5d63",
    fontSize: 11,
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    borderBottom: "1px solid #232329",
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
    background: "#121215",
    opacity: 0.8,
  },
  habitName: {
    fontSize: 14,
    color: "#d4d4d8",
    wordBreak: "break-word",
    overflowWrap: "break-word",
  },
  habitNameDone: {
    color: "#6b7280",
    textDecoration: "line-through",
  },
  streak: {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    fontSize: 12,
    color: "#00f0ff",
    background: "rgba(0, 240, 255, 0.08)",
    border: "1px solid rgba(0, 240, 255, 0.3)",
    borderRadius: 20,
    padding: "2px 9px",
    whiteSpace: "nowrap",
    width: "fit-content",
  },
  streakZero: {
    color: "#5c5d63",
    background: "transparent",
    border: "1px solid #303039",
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
    color: "#00f0ff",
    background: "rgba(0, 240, 255, 0.08)",
    border: "1px solid rgba(0, 240, 255, 0.3)",
  },
  priorityOptional: {
    color: "#8a8f98",
    background: "transparent",
    border: "1px solid #303039",
  },
  challengeBadge: {
    ...typeBadgeBase,
    color: "#00f0ff",
    background: "rgba(0, 240, 255, 0.08)",
    border: "1px solid rgba(0, 240, 255, 0.3)",
  },
  challengeBadgeCompleted: {
    color: "#6f7580",
    background: "transparent",
    border: "1px solid #303039",
  },
  dailyBadge: {
    ...typeBadgeBase,
    color: "#00f0ff",
    background: "transparent",
    border: "1px solid #303039",
  },
  offDayBadge: {
    ...typeBadgeBase,
    color: "#666871",
    background: "transparent",
    border: "1px solid #303039",
  },
  toggleButton: {
    background: "#1c1c21",
    border: "1px solid #303039",
    borderRadius: 20,
    padding: "7px 14px",
    fontSize: 12,
    fontWeight: 500,
    color: "#a1a1aa",
    cursor: "pointer",
    whiteSpace: "nowrap",
    transition: "background 0.15s ease",
  },
  toggleButtonDone: {
    background: "rgba(0, 240, 255, 0.1)",
    border: "1px solid rgba(0, 240, 255, 0.42)",
    color: "#00f0ff",
  },
  iconButton: {
    background: "transparent",
    border: "1px solid #303039",
    borderRadius: 20,
    width: 28,
    height: 28,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#5c5d63",
    cursor: "pointer",
    padding: 0,
    transition: "color 0.15s ease, border-color 0.15s ease",
    flexShrink: 0,
  },
  archiveButton: {
    background: "transparent",
    border: "1px solid #303039",
    borderRadius: 20,
    width: 28,
    height: 28,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#5c5d63",
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
    border: "1px solid #303039",
    borderRadius: 20,
    padding: "6px 12px",
    fontSize: 12,
    fontWeight: 500,
    color: "#a1a1aa",
    cursor: "pointer",
    transition: "background 0.15s ease, color 0.15s ease, border-color 0.15s ease",
  },
  streakFreezeToggleActive: {
    background: "rgba(0, 240, 255, 0.08)",
    color: "#00f0ff",
    borderColor: "rgba(0, 240, 255, 0.3)",
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
    background: "#0f0f11",
    border: "1px solid #303039",
    borderRadius: 6,
    padding: "6px 10px",
    color: "#e4e4e7",
    fontSize: 14,
    outline: "none",
  },
  editSelect: {
    background: "#0f0f11",
    border: "1px solid #303039",
    borderRadius: 6,
    padding: "6px 10px",
    color: "#d4d4d8",
    fontSize: 14,
    outline: "none",
    cursor: "pointer",
  },
  editDurationInput: {
    width: 56,
    background: "#0f0f11",
    border: "1px solid #303039",
    borderRadius: 6,
    padding: "6px 8px",
    color: "#e4e4e7",
    fontSize: 14,
    outline: "none",
  },
  saveButton: {
    background: "rgba(0, 240, 255, 0.1)",
    border: "1px solid rgba(0, 240, 255, 0.42)",
    borderRadius: 20,
    padding: "8px 16px",
    fontSize: 12,
    fontWeight: 500,
    color: "#00f0ff",
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  cancelButton: {
    background: "transparent",
    border: "1px solid #303039",
    borderRadius: 20,
    padding: "8px 16px",
    fontSize: 12,
    fontWeight: 500,
    color: "#a1a1aa",
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  empty: {
    fontSize: 13,
    color: "#52525b",
    textAlign: "center",
    padding: "24px 0",
  },
  sectionHeader: {
    fontSize: 12,
    fontWeight: 600,
    color: "#5c5d63",
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
    background: "#16161a",
    border: "1px solid #303039",
    borderRadius: 8,
    padding: "10px 12px",
    color: "#d4d4d8",
    fontSize: 14,
    outline: "none",
  },
  categoryBadge: {
    fontSize: 11,
    fontWeight: 500,
    color: "#a1a1aa",
    background: "#0f0f11",
    border: "1px solid #303039",
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
    background: "#16161a",
    border: "1px solid #303039",
    borderRadius: 9,
    color: "#a1a1aa",
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
    background: "#16161a",
    border: "1px solid #303039",
    borderRadius: 10,
    boxShadow: "0 12px 28px rgba(0, 0, 0, 0.32)",
  },
  categoryManagerRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  categoryManagerName: {
    flex: 1,
    minWidth: 0,
    color: "#f4f4f5",
    fontSize: 13,
  },
};

// --- date helpers (local calendar days, not UTC, not a rolling timer) ---

function getDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getTodayKey(): string {
  return getDateKey(new Date());
}

function formatDateDisplay(key: string): string {
  const [year, month, day] = key.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  const today = new Date();
  const isToday = getDateKey(today) === key;
  
  if (isToday) {
    return `Today - ${date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`;
  }
  
  return date.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

function shiftDateKey(key: string, deltaDays: number): string {
  const [year, month, day] = key.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + deltaDays);
  return getDateKey(date);
}

function diffInDays(aKey: string, bKey: string): number {
  const [ay, am, ad] = aKey.split("-").map(Number);
  const [by, bm, bd] = bKey.split("-").map(Number);
  const a = new Date(ay, am - 1, ad).getTime();
  const b = new Date(by, bm - 1, bd).getTime();
  return Math.round((a - b) / 86400000);
}

function getFrequencyType(habit: Pick<Habit, "frequencyType">): FrequencyType {
  return habit.frequencyType ?? "daily";
}

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
  try {
    const raw = localStorage.getItem(CUSTOM_CATEGORIES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return Array.from(
      new Set(
        parsed
          .filter((category): category is string => typeof category === "string")
          .map(normalizeCategory)
          .filter(Boolean),
      ),
    ).sort();
  } catch {
    return [];
  }
}

function isHabitScheduledOnDate(
  habit: Pick<Habit, "frequencyType" | "customDays">,
  dateKey: string,
): boolean {
  const frequencyType = getFrequencyType(habit);
  if (frequencyType === "daily") return true;

  const [year, month, day] = dateKey.split("-").map(Number);
  const weekday = new Date(year, month - 1, day).getDay();
  if (frequencyType === "weekdays") return weekday >= 1 && weekday <= 5;
  if (frequencyType === "weekends") return weekday === 0 || weekday === 6;
  return habit.customDays?.includes(WEEKDAYS[weekday]) ?? false;
}

// Streak is fully derived from completedDates + the real current date,
// so a missed day breaks the chain automatically without any stored
// counter to keep in sync.
function calculateStreak(habit: Habit, streakFreeze = false): number {
  const dateSet = new Set(habit.completedDates);
  const todayKey = getTodayKey();

  if (getFrequencyType(habit) === "custom" && (habit.customDays?.length ?? 0) === 0) {
    return 0;
  }

  if (streakFreeze) {
    // Protection keeps missed days from breaking the active streak.
    return [...dateSet].filter(
      (date) => date <= todayKey && isHabitScheduledOnDate(habit, date),
    ).length;
  }

  let cursor = dateSet.has(todayKey) ? todayKey : shiftDateKey(todayKey, -1);
  let streak = 0;

  while (true) {
    if (!isHabitScheduledOnDate(habit, cursor)) {
      cursor = shiftDateKey(cursor, -1);
      continue;
    }
    if (!dateSet.has(cursor)) break;
    streak++;
    cursor = shiftDateKey(cursor, -1);
  }

  return streak;
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

type Summary = {
  total: number;
  doneCount: number;
  percent: number;
  mandatoryTotal: number;
  mandatoryDone: number;
};

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

function loadHabits(): Habit[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed.map((item: Partial<Habit> & { id: number; name: string }) => {
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
      };
    });
  } catch {
    return [];
  }
}

function App() {
  const [view, setView] = useState<View>("Habits");
  const [selectedDateKey, setSelectedDateKey] = useState(getTodayKey);

  const [habits, setHabits] = useState<Habit[]>(loadHabits);
  const [focusSessions, setFocusSessions] = useState<FocusSessionRecord[]>(() => {
    try {
      const raw = localStorage.getItem(FOCUS_SESSIONS_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
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
    } catch {
      return [];
    }
  });
  const [newHabit, setNewHabit] = useState("");
  const [newPriority, setNewPriority] = useState<Priority>("Optional");
  const [newType, setNewType] = useState<HabitType>("Daily");
  const [newFrequencyType, setNewFrequencyType] = useState<FrequencyType>("daily");
  const [newCustomDays, setNewCustomDays] = useState<string[]>([]);
  const [newDuration, setNewDuration] = useState(String(DEFAULT_DURATION));
  const [newCategory, setNewCategory] = useState("");
  const [newCategoryName, setNewCategoryName] = useState("");

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState("");
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
  const [showArchived, setShowArchived] = useState(false);
  const [streakFreeze, setStreakFreeze] = useState(() => {
    try {
      const stored = localStorage.getItem(STREAK_FREEZE_KEY);
      return stored === "true";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(habits));
    } catch {
      // localStorage unavailable (e.g. private browsing) — fail silently
    }
  }, [habits]);

  useEffect(() => {
    try {
      localStorage.setItem(FOCUS_SESSIONS_KEY, JSON.stringify(focusSessions));
    } catch {
      // localStorage unavailable (e.g. private browsing) — fail silently
    }
  }, [focusSessions]);

  useEffect(() => {
    try {
      localStorage.setItem(STREAK_FREEZE_KEY, String(streakFreeze));
    } catch {
      // localStorage unavailable (e.g. private browsing) — fail silently
    }
  }, [streakFreeze]);

  useEffect(() => {
    try {
      localStorage.setItem(CUSTOM_CATEGORIES_KEY, JSON.stringify(customCategories));
    } catch {
      // localStorage unavailable (e.g. private browsing) — fail silently
    }
  }, [customCategories]);

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
      category: category || undefined,
      priority: newPriority,
      type: newType,
      frequencyType: newFrequencyType,
      customDays: newFrequencyType === "custom" ? newCustomDays : [],
      ...(newType === "Challenge"
        ? {
            durationDays: Math.max(1, Math.round(Number(newDuration)) || DEFAULT_DURATION),
            startDate: getTodayKey(),
          }
        : {}),
      completedDates: [],
    };

    setHabits([...habits, habit]);
    setNewHabit("");
    setNewPriority("Optional");
    setNewType("Daily");
    setNewFrequencyType("daily");
    setNewCustomDays([]);
    setNewDuration(String(DEFAULT_DURATION));
    setNewCategory("");
    setNewCategoryName("");
  }

  function toggleHabit(id: number) {
    const updatedHabits: Habit[] = habits.map((habit): Habit => {
      if (habit.id !== id) return habit;

      const isDoneOnSelectedDate = habit.completedDates.includes(selectedDateKey);
      const completedDates = isDoneOnSelectedDate
        ? habit.completedDates.filter((date) => date !== selectedDateKey)
        : [...habit.completedDates, selectedDateKey];

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
  ) {
    const newRecord: FocusSessionRecord = {
      id: Date.now(),
      timestamp: Date.now(),
      sessionType,
      durationMinutes,
      habitName,
    };
    setFocusSessions((prev) => [...prev, newRecord]);
  }

  function deleteFocusSession(id: number) {
    setFocusSessions((prev) => prev.filter((session) => session.id !== id));
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
          <option value="">{NO_CATEGORY}</option>
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
    const streak = calculateStreak(habit, streakFreeze);
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

          <span
            className="streak-badge"
            style={{
              ...styles.streak,
              ...(streak === 0 ? styles.streakZero : {}),
            }}
          >
            <Flame size={12} />
            {streak}
          </span>
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
            className={`sidebar-item ${view === "Habits" ? "active" : ""}`}
            onClick={() => setView("Habits")}
          >
            <ListChecks size={20} />
            <span>My Habits</span>
          </button>
          <button
            className={`sidebar-item ${view === "Timer" ? "active" : ""}`}
            onClick={() => setView("Timer")}
          >
            <TimerIcon size={20} />
            <span>Timer</span>
          </button>
          <button
            className={`sidebar-item ${view === "History" ? "active" : ""}`}
            onClick={() => setView("History")}
          >
            <HistoryIcon size={20} />
            <span>History</span>
          </button>
          <button
            className={`sidebar-item ${view === "Analytics" ? "active" : ""}`}
            onClick={() => setView("Analytics")}
          >
            <BarChart3 size={20} />
            <span>Analytics</span>
          </button>
        </nav>

        <main className="main-content">
          {/* Both views stay mounted at all times — only visibility is
              toggled — so the Focus Timer's interval and state are
              never interrupted by switching sidebar tabs. */}
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
    onClick={() => setSelectedDateKey(getTodayKey())}
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
              {formatDateDisplay(selectedDateKey)}
              {streakFreeze && (
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    verticalAlign: "middle",
                    color: "#00f0ff",
                  }}
                >
                  <Snowflake size={14} />
                </span>
              )}
            </div>

            {summary.total > 0 && (
              <div style={styles.summary}>
                <span style={styles.summaryPrimary}>
                  {summary.doneCount} of {summary.total} complete ·{" "}
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
                  <strong style={{ color: "#f4f4f5", fontSize: 13 }}>
                    Custom Categories
                  </strong>
                  {customCategories.length === 0 ? (
                    <span style={{ color: "#71717a", fontSize: 12 }}>
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
              onDeleteFocusSession={deleteFocusSession}
              streakFreeze={streakFreeze}
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
            <Analytics habits={habits} focusSessions={focusSessions} streakFreeze={streakFreeze} />
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
    </div>
  );
}

export default App;