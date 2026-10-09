import { useState, useRef, type CSSProperties } from "react";
import { ArrowRight, ArrowLeft, Sparkles, Check, BookOpen, Dumbbell, Book, Sprout, CalendarDays, Play, BarChart3 } from "lucide-react";
import { CARD_SURFACE, FORM_CONTROL } from "../theme";
import type { Habit, Priority, FrequencyType } from "../types";

type Step = "welcome" | "focus" | "habit" | "ready";

type OnboardingProps = {
  onComplete: (createdHabit?: Habit) => void;
  onSkip: () => void;
  onNavigateToToday: () => void;
};

const FOCUS_OPTIONS = [
  { id: "studying", label: "Studying", icon: BookOpen },
  { id: "fitness", label: "Fitness", icon: Dumbbell },
  { id: "reading", label: "Reading", icon: Book },
  { id: "personal-growth", label: "Personal Growth", icon: Sprout },
  { id: "other", label: "Other", icon: Sparkles },
];

const HABIT_SUGGESTIONS: Record<string, string[]> = {
  studying: ["Study for 30 Minutes", "Review Flashcards", "Read Course Material"],
  fitness: ["Exercise for 30 Minutes", "Go for a Run", "Do Yoga"],
  reading: ["Read for 20 Minutes", "Read One Chapter", "Read Before Sleeping"],
  "personal-growth": ["Journal for 10 Minutes", "Meditate", "Learn a New Skill"],
  other: ["Start a Morning Routine", "Practice a Hobby", "Stay Hydrated"],
};

// The daily loop, in product terms: Today brings the plan together,
// Focus executes it, Complete records it, Feedback shows what to adjust.
const LOOP_STEPS = [
  {
    icon: CalendarDays,
    title: "Today brings it together",
    description: "Your habits and tasks land in one place — open Today and pick what's next.",
  },
  {
    icon: Play,
    title: "Focus to execute",
    description: "Start a Focus session on any action and work it through with the timer.",
  },
  {
    icon: Check,
    title: "Complete to build momentum",
    description: "Checking things off grows streaks and moves goals forward.",
  },
  {
    icon: BarChart3,
    title: "Review, adjust, repeat",
    description: "History and Analytics show your trend — tune the plan and keep going.",
  },
];

const styles: Record<string, CSSProperties> = {
  overlay: {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: "var(--bg-surface)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "var(--space-4)",
    zIndex: 1000,
  },
  container: {
    ...CARD_SURFACE,
    background: "var(--bg-surface)",
    maxWidth: 500,
    width: "100%",
    padding: "var(--space-6)",
    display: "flex",
    flexDirection: "column",
    gap: "var(--space-5)",
  },
  header: {
    display: "flex",
    flexDirection: "column",
    gap: "var(--space-2)",
    textAlign: "center",
  },
  eyebrow: {
    fontSize: "var(--type-xs)",
    fontWeight: "var(--font-semibold)",
    color: "var(--color-accent)",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    margin: 0,
    textAlign: "center",
  },
  title: {
    fontSize: "var(--type-xl)",
    fontWeight: "var(--font-bold)",
    color: "var(--text-primary)",
    margin: 0,
  },
  description: {
    fontSize: "var(--type-base)",
    color: "var(--text-secondary)",
    margin: 0,
    lineHeight: 1.5,
  },
  focusGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: "var(--space-3)",
  },
  focusCard: {
    background: "transparent",
    border: "1px solid var(--border-color)",
    borderRadius: "var(--radius-lg)",
    padding: "var(--space-4)",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "var(--space-2)",
    cursor: "pointer",
    transition: "border-color var(--transition-standard), background-color var(--transition-standard)",
  },
  focusCardSelected: {
    borderColor: "transparent",
    background: "var(--accent-wash-soft)",
  },
  focusIcon: {
    width: 32,
    height: 32,
  },
  focusLabel: {
    fontSize: "var(--type-sm)",
    fontWeight: "var(--font-medium)",
    color: "var(--text-body)",
  },
  input: {
    ...FORM_CONTROL,
    width: "100%",
  },
  select: {
    ...FORM_CONTROL,
    width: "100%",
    cursor: "pointer",
  },
  suggestions: {
    display: "flex",
    flexDirection: "column",
    gap: "var(--space-2)",
  },
  suggestionButton: {
    background: "transparent",
    border: "1px solid var(--border-color)",
    borderRadius: "var(--radius-md)",
    padding: "var(--space-2) var(--space-3)",
    color: "var(--text-secondary)",
    fontSize: "var(--type-sm)",
    cursor: "pointer",
    textAlign: "left",
    transition: "background-color var(--transition-standard), border-color var(--transition-standard)",
  },
  suggestionButtonHover: {
    background: "var(--bg-raised)",
    borderColor: "var(--border-color)",
  },
  actions: {
    display: "flex",
    justifyContent: "space-between",
    gap: "var(--space-3)",
    marginTop: "var(--space-2)",
  },
  button: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "var(--space-2)",
    padding: "var(--space-3) var(--space-4)",
    borderRadius: "var(--radius-lg)",
    fontSize: "var(--type-base)",
    fontWeight: "var(--font-semibold)",
    cursor: "pointer",
    transition: "background-color var(--transition-standard), border-color var(--transition-standard), color var(--transition-standard)",
  },
  primaryButton: {
    background: "var(--color-accent)",
    border: "1px solid transparent",
    color: "var(--color-accent-contrast)",
  },
  secondaryButton: {
    background: "transparent",
    border: "1px solid var(--border-color)",
    color: "var(--text-secondary)",
  },
  skipButton: {
    background: "transparent",
    border: "none",
    color: "var(--text-muted)",
    fontSize: "var(--type-sm)",
    padding: "var(--space-2)",
    cursor: "pointer",
  },
  stepIndicator: {
    display: "flex",
    gap: "var(--space-2)",
    justifyContent: "center",
  },
  stepDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    background: "var(--border-strong)",
    transition: "background-color var(--transition-standard)",
  },
  stepDotActive: {
    background: "var(--color-accent)",
  },
  readyIcon: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: 64,
    height: 64,
    borderRadius: "50%",
    background: "var(--accent-wash)",
    color: "var(--color-accent)",
    margin: "0 auto",
  },
  loopList: {
    display: "flex",
    flexDirection: "column",
    gap: "var(--space-2)",
    margin: 0,
    padding: 0,
    listStyle: "none",
  },
  loopItem: {
    display: "flex",
    alignItems: "flex-start",
    gap: "var(--space-3)",
    padding: "var(--space-3)",
    border: "1px solid var(--border-color)",
    borderRadius: "var(--radius-md)",
    background: "transparent",
  },
  loopIcon: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: 32,
    height: 32,
    flexShrink: 0,
    borderRadius: "var(--radius-md)",
    background: "var(--accent-wash-soft)",
    color: "var(--color-accent)",
  },
  loopText: {
    display: "flex",
    flexDirection: "column",
    gap: 2,
    minWidth: 0,
  },
  loopTitle: {
    fontSize: "var(--type-sm)",
    fontWeight: "var(--font-semibold)",
    color: "var(--text-primary)",
    margin: 0,
  },
  loopDescription: {
    fontSize: "var(--type-sm)",
    color: "var(--text-secondary)",
    margin: 0,
    lineHeight: 1.5,
  },
};

function Onboarding({ onComplete, onSkip, onNavigateToToday }: OnboardingProps) {
  const [step, setStep] = useState<Step>("welcome");
  const [selectedFocus, setSelectedFocus] = useState<string | null>(null);
  const [habitName, setHabitName] = useState("");
  const [habitPriority, setHabitPriority] = useState<Priority>("Optional");
  const [habitFrequency, setHabitFrequency] = useState<FrequencyType>("daily");
  const [isCreating, setIsCreating] = useState(false);
  const isCreatingRef = useRef(false);

  const handleNext = () => {
    if (step === "welcome") {
      setStep("focus");
    } else if (step === "focus") {
      setStep("habit");
    } else if (step === "habit") {
      handleCreateHabit();
    }
  };

  const handleBack = () => {
    if (step === "focus") {
      setStep("welcome");
    } else if (step === "habit") {
      setStep("focus");
    }
  };

  const handleSkip = () => {
    onSkip();
  };

  const handleCreateHabit = () => {
    if (isCreatingRef.current) return;
    isCreatingRef.current = true;
    setIsCreating(true);

    const habit: Habit = {
      id: Date.now(),
      name: habitName.trim() || "My First Habit",
      createdAt: new Date().toISOString().split("T")[0],
      priority: habitPriority,
      type: "Daily",
      frequencyType: habitFrequency,
      customDays: [],
      completedDates: [],
    };

    onComplete(habit);
    setStep("ready");
    isCreatingRef.current = false;
    setIsCreating(false);
  };

  const handleSuggestionClick = (suggestion: string) => {
    setHabitName(suggestion);
  };

  const getStepNumber = () => {
    const stepNumbers: Record<Step, number> = {
      welcome: 1,
      focus: 2,
      habit: 3,
      ready: 4,
    };
    return stepNumbers[step];
  };

  const totalSteps = 4;

  return (
    <div style={styles.overlay}>
      <div style={styles.container}>
        <div style={styles.stepIndicator}>
          {Array.from({ length: totalSteps }).map((_, i) => (
            <div
              key={i}
              style={{
                ...styles.stepDot,
                ...(i + 1 === getStepNumber() ? styles.stepDotActive : {}),
              }}
            />
          ))}
        </div>

        {step === "welcome" && (
          <>
            <div style={styles.header}>
              <p style={styles.eyebrow}>How Synchron works</p>
              <h1 style={styles.title}>Turn goals into daily action</h1>
              <p style={styles.description}>
                Set a goal, plan it into habits and tasks, focus on the work, and complete it.
                Today brings it all together — streaks and feedback show what to adjust next.
              </p>
            </div>
            <div style={styles.actions}>
              <button
                type="button"
                style={{ ...styles.button, ...styles.skipButton }}
                onClick={handleSkip}
              >
                Skip
              </button>
              <button
                type="button"
                style={{ ...styles.button, ...styles.primaryButton }}
                onClick={handleNext}
              >
                Get Started
                <ArrowRight size={18} />
              </button>
            </div>
          </>
        )}

        {step === "focus" && (
          <>
            <div style={styles.header}>
              <p style={styles.eyebrow}>Step 1 · Your goal</p>
              <h1 style={styles.title}>What do you want?</h1>
              <p style={styles.description}>
                A goal is the outcome you want. Pick an area — your first habit will feed into it.
              </p>
            </div>
            <div style={styles.focusGrid}>
              {FOCUS_OPTIONS.map((option) => {
                const Icon = option.icon;
                return (
                  <button
                    key={option.id}
                    type="button"
                    style={{
                      ...styles.focusCard,
                      ...(selectedFocus === option.id ? styles.focusCardSelected : {}),
                    }}
                    onClick={() => setSelectedFocus(option.id)}
                    aria-pressed={selectedFocus === option.id}
                  >
                    <Icon style={styles.focusIcon} />
                    <span style={styles.focusLabel}>{option.label}</span>
                  </button>
                );
              })}
            </div>
            <div style={styles.actions}>
              <button
                type="button"
                style={{ ...styles.button, ...styles.secondaryButton }}
                onClick={handleBack}
              >
                <ArrowLeft size={18} />
                Back
              </button>
              <div style={{ display: "flex", gap: "var(--space-2)" }}>
                <button
                  type="button"
                  style={{ ...styles.button, ...styles.skipButton }}
                  onClick={handleSkip}
                >
                  Skip
                </button>
                <button
                  type="button"
                  style={{ ...styles.button, ...styles.primaryButton }}
                  onClick={handleNext}
                >
                  Continue
                  <ArrowRight size={18} />
                </button>
              </div>
            </div>
          </>
        )}

        {step === "habit" && (
          <>
            <div style={styles.header}>
              <p style={styles.eyebrow}>Step 2 · Your first habit</p>
              <h1 style={styles.title}>What will you do repeatedly?</h1>
              <p style={styles.description}>
                Habits handle the recurring actions toward your goal. One-off wins belong in Tasks.
              </p>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
              <div>
                <label style={{ fontSize: 13, fontWeight: 500, color: "var(--text-secondary)", display: "block", marginBottom: 6 }}>
                  Habit Name
                </label>
                <input
                  style={styles.input}
                  value={habitName}
                  onChange={(e) => setHabitName(e.target.value)}
                  placeholder="e.g., Exercise for 30 minutes"
                />
              </div>
              <div>
                <label style={{ fontSize: 13, fontWeight: 500, color: "var(--text-secondary)", display: "block", marginBottom: 6 }}>
                  Priority
                </label>
                <select
                  style={styles.select}
                  value={habitPriority}
                  onChange={(e) => setHabitPriority(e.target.value as Priority)}
                >
                  <option value="Optional">Optional</option>
                  <option value="Mandatory">Mandatory</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize: 13, fontWeight: 500, color: "var(--text-secondary)", display: "block", marginBottom: 6 }}>
                  Frequency
                </label>
                <select
                  style={styles.select}
                  value={habitFrequency}
                  onChange={(e) => setHabitFrequency(e.target.value as FrequencyType)}
                >
                  <option value="daily">Every Day</option>
                  <option value="weekdays">Weekdays</option>
                  <option value="weekends">Weekends</option>
                </select>
              </div>
              {selectedFocus && HABIT_SUGGESTIONS[selectedFocus] && (
                <div>
                  <label style={{ fontSize: 13, fontWeight: 500, color: "var(--text-secondary)", display: "block", marginBottom: 6 }}>
                    Suggestions
                  </label>
                  <div style={styles.suggestions}>
                    {HABIT_SUGGESTIONS[selectedFocus].map((suggestion) => (
                      <button
                        key={suggestion}
                        type="button"
                        style={styles.suggestionButton}
                        onClick={() => handleSuggestionClick(suggestion)}
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div style={styles.actions}>
              <button
                type="button"
                style={{ ...styles.button, ...styles.secondaryButton }}
                onClick={handleBack}
              >
                <ArrowLeft size={18} />
                Back
              </button>
              <div style={{ display: "flex", gap: "var(--space-2)" }}>
                <button
                  type="button"
                  style={{ ...styles.button, ...styles.skipButton }}
                  onClick={handleSkip}
                >
                  Skip
                </button>
                <button
                  type="button"
                  style={{ ...styles.button, ...styles.primaryButton }}
                  onClick={handleCreateHabit}
                  disabled={isCreating}
                >
                  {isCreating ? "Creating..." : "Create Habit"}
                  {!isCreating && <Check size={18} />}
                </button>
              </div>
            </div>
          </>
        )}

        {step === "ready" && (
          <>
            <div style={styles.header}>
              <div style={styles.readyIcon}>
                <CalendarDays size={32} />
              </div>
              <p style={styles.eyebrow}>Step 3 · Your daily loop</p>
              <h1 style={styles.title}>Your habit is on Today</h1>
              <p style={styles.description}>
                Complete it, or start a Focus session on it. Then repeat — that loop is the whole product.
              </p>
            </div>
            <ul style={styles.loopList}>
              {LOOP_STEPS.map((item) => {
                const Icon = item.icon;
                return (
                  <li key={item.title} style={styles.loopItem}>
                    <span style={styles.loopIcon}>
                      <Icon size={16} />
                    </span>
                    <span style={styles.loopText}>
                      <span style={styles.loopTitle}>{item.title}</span>
                      <span style={styles.loopDescription}>{item.description}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
            <div style={styles.actions}>
              <button
                type="button"
                style={{ ...styles.button, ...styles.primaryButton, width: "100%" }}
                onClick={onNavigateToToday}
              >
                Go to Today
                <CalendarDays size={18} />
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default Onboarding;
