import { useState, useRef } from "react";
import {
  ArrowRight,
  ArrowLeft,
  Sparkles,
  Check,
  BookOpen,
  Dumbbell,
  Book,
  Sprout,
  CalendarDays,
  Play,
  BarChart3,
} from "lucide-react";
import type { Habit, Priority, FrequencyType } from "../types";
import { FORM_CONTROL } from "../theme";

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
    description: "Checking things off grows streaks and moves work forward.",
  },
  {
    icon: BarChart3,
    title: "Review, adjust, repeat",
    description: "History and Analytics show your trend — tune the plan and keep going.",
  },
];

const STEP_ORDER: Step[] = ["welcome", "focus", "habit", "ready"];

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

  const stepIndex = STEP_ORDER.indexOf(step);

  return (
    <div className="modal-overlay">
      <div
        className="ui-card"
        role="dialog"
        aria-modal="true"
        aria-label="Onboarding"
        style={{ width: "min(100%, 480px)", padding: 28, display: "flex", flexDirection: "column", gap: 20 }}
      >
        <div style={{ display: "flex", gap: 6, justifyContent: "center" }} aria-label={`Step ${stepIndex + 1} of 4`}>
          {STEP_ORDER.map((item, i) => (
            <span
              key={item}
              style={{
                width: i === stepIndex ? 24 : 8,
                height: 8,
                borderRadius: 4,
                background: i <= stepIndex ? "var(--color-accent)" : "var(--border-strong)",
                transition: "all var(--transition-standard)",
              }}
            />
          ))}
        </div>

        {step === "welcome" && (
          <>
            <div style={{ textAlign: "center", display: "flex", flexDirection: "column", gap: 8 }}>
              <p className="atelier-eyebrow" style={{ margin: 0 }}>
                How Synchron works
              </p>
              <h1 className="atelier-greeting" style={{ margin: 0, fontSize: "clamp(1.7rem, 4vw, 2.2rem)" }}>
                Turn plans into daily action
              </h1>
              <p className="atelier-sub" style={{ margin: 0 }}>
                Capture tasks and habits, focus on the work, and complete it. Today brings it all together — streaks
                and feedback show what to adjust next.
              </p>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
              <button type="button" className="ui-button ui-button--ghost" onClick={handleSkip}>
                Skip
              </button>
              <button type="button" className="ui-button ui-button--primary" onClick={handleNext}>
                Get Started
                <ArrowRight size={16} />
              </button>
            </div>
          </>
        )}

        {step === "focus" && (
          <>
            <div style={{ textAlign: "center", display: "flex", flexDirection: "column", gap: 8 }}>
              <p className="atelier-eyebrow" style={{ margin: 0 }}>
                Step 1 · Your focus
              </p>
              <h1 className="atelier-greeting" style={{ margin: 0, fontSize: "clamp(1.5rem, 4vw, 1.9rem)" }}>
                What do you want?
              </h1>
              <p className="atelier-sub" style={{ margin: 0 }}>
                Pick an area — your first habit will support it.
              </p>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
              {FOCUS_OPTIONS.map((option) => {
                const Icon = option.icon;
                const selected = selectedFocus === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    className="ui-card"
                    onClick={() => setSelectedFocus(option.id)}
                    aria-pressed={selected}
                    style={{
                      padding: 16,
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: 8,
                      cursor: "pointer",
                      background: selected ? "var(--accent-wash-soft)" : undefined,
                      borderColor: selected ? "var(--accent-border-soft)" : undefined,
                    }}
                  >
                    <Icon size={24} style={{ color: selected ? "var(--color-accent)" : "var(--text-secondary)" }} />
                    <span style={{ fontSize: "var(--type-sm)", fontWeight: 600 }}>{option.label}</span>
                  </button>
                );
              })}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
              <button type="button" className="ui-button" onClick={handleBack}>
                <ArrowLeft size={16} />
                Back
              </button>
              <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <button type="button" className="ui-button ui-button--ghost" onClick={handleSkip}>
                  Skip
                </button>
                <button type="button" className="ui-button ui-button--primary" onClick={handleNext}>
                  Continue
                  <ArrowRight size={16} />
                </button>
              </span>
            </div>
          </>
        )}

        {step === "habit" && (
          <>
            <div style={{ textAlign: "center", display: "flex", flexDirection: "column", gap: 8 }}>
              <p className="atelier-eyebrow" style={{ margin: 0 }}>
                Step 2 · Your first habit
              </p>
              <h1 className="atelier-greeting" style={{ margin: 0, fontSize: "clamp(1.5rem, 4vw, 1.9rem)" }}>
                What will you do repeatedly?
              </h1>
              <p className="atelier-sub" style={{ margin: 0 }}>
                Habits handle the recurring actions. One-off wins belong in Tasks.
              </p>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <label className="section-eyebrow" style={{ display: "block", marginBottom: 6 }} htmlFor="onboarding-habit-name">
                  Habit Name
                </label>
                <input
                  id="onboarding-habit-name"
                  className="ui-input"
                  style={{ width: "100%" }}
                  value={habitName}
                  onChange={(e) => setHabitName(e.target.value)}
                  placeholder="e.g., Exercise for 30 minutes"
                />
              </div>
              <div>
                <label className="section-eyebrow" style={{ display: "block", marginBottom: 6 }} htmlFor="onboarding-priority">
                  Priority
                </label>
                <select
                  id="onboarding-priority"
                  className="ui-select"
                  style={{ ...FORM_CONTROL, width: "100%" }}
                  value={habitPriority}
                  onChange={(e) => setHabitPriority(e.target.value as Priority)}
                >
                  <option value="Optional">Optional</option>
                  <option value="Mandatory">Mandatory</option>
                </select>
              </div>
              <div>
                <label className="section-eyebrow" style={{ display: "block", marginBottom: 6 }} htmlFor="onboarding-frequency">
                  Frequency
                </label>
                <select
                  id="onboarding-frequency"
                  className="ui-select"
                  style={{ ...FORM_CONTROL, width: "100%" }}
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
                  <p className="section-eyebrow" style={{ margin: "0 0 6px" }}>
                    Suggestions
                  </p>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {HABIT_SUGGESTIONS[selectedFocus].map((suggestion) => (
                      <button
                        key={suggestion}
                        type="button"
                        className="ui-button"
                        style={{ justifyContent: "flex-start" }}
                        onClick={() => handleSuggestionClick(suggestion)}
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
              <button type="button" className="ui-button" onClick={handleBack}>
                <ArrowLeft size={16} />
                Back
              </button>
              <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <button type="button" className="ui-button ui-button--ghost" onClick={handleSkip}>
                  Skip
                </button>
                <button
                  type="button"
                  className="ui-button ui-button--primary"
                  onClick={handleCreateHabit}
                  disabled={isCreating}
                >
                  {isCreating ? "Creating..." : "Create Habit"}
                  {!isCreating && <Check size={16} />}
                </button>
              </span>
            </div>
          </>
        )}

        {step === "ready" && (
          <>
            <div style={{ textAlign: "center", display: "flex", flexDirection: "column", gap: 8, alignItems: "center" }}>
              <span
                style={{
                  display: "grid",
                  placeItems: "center",
                  width: 64,
                  height: 64,
                  borderRadius: "50%",
                  background: "var(--accent-wash)",
                  color: "var(--color-accent)",
                }}
              >
                <CalendarDays size={30} />
              </span>
              <p className="atelier-eyebrow" style={{ margin: 0 }}>
                Step 3 · Your daily loop
              </p>
              <h1 className="atelier-greeting" style={{ margin: 0, fontSize: "clamp(1.5rem, 4vw, 1.9rem)" }}>
                Your habit is on Today
              </h1>
              <p className="atelier-sub" style={{ margin: 0 }}>
                Complete it, or start a Focus session on it. Then repeat — that loop is the whole product.
              </p>
            </div>
            <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 8 }}>
              {LOOP_STEPS.map((item) => {
                const Icon = item.icon;
                return (
                  <li key={item.title} className="atelier-group-row" style={{ border: "1px solid var(--border-color)", borderRadius: "var(--radius-md)", alignItems: "flex-start" }}>
                    <span
                      style={{
                        display: "grid",
                        placeItems: "center",
                        width: 32,
                        height: 32,
                        flexShrink: 0,
                        borderRadius: "var(--radius-md)",
                        background: "var(--accent-wash-soft)",
                        color: "var(--color-accent)",
                      }}
                    >
                      <Icon size={16} />
                    </span>
                    <span style={{ minWidth: 0 }}>
                      <span style={{ display: "block", fontSize: "var(--type-sm)", fontWeight: 600 }}>{item.title}</span>
                      <span className="atelier-sub" style={{ display: "block" }}>
                        {item.description}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
            <button
              type="button"
              className="ui-button ui-button--primary"
              style={{ width: "100%" }}
              onClick={onNavigateToToday}
            >
              Go to Today
              <CalendarDays size={16} />
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default Onboarding;
