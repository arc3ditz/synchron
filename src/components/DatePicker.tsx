import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";

import { getDateKey, formatFullDate } from "../utils/dates";

type DatePickerProps = {
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
  className?: string;
  style?: CSSProperties;
};

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const POPOVER_WIDTH = 288;
const POPOVER_HEIGHT = 326;

function parseDateKey(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return getDateKey(date) === value ? date : null;
}

export default function DatePicker({
  value,
  onChange,
  ariaLabel,
  className = "form-control",
  style,
}: DatePickerProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState(value);
  const [previousValue, setPreviousValue] = useState(value);
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const [displayMonth, setDisplayMonth] = useState(() =>
    parseDateKey(value) ?? new Date(),
  );

  if (previousValue !== value) {
    setPreviousValue(value);
    setDraft(value);
    const parsed = parseDateKey(value);
    if (parsed) setDisplayMonth(parsed);
  }

  useEffect(() => {
    inputRef.current?.setCustomValidity(
      draft !== "" && !parseDateKey(draft) ? "Enter a valid date in YYYY-MM-DD format." : "",
    );
  }, [draft]);

  const updatePosition = useCallback(() => {
    const bounds = wrapperRef.current?.getBoundingClientRect();
    if (!bounds) return;
    const left = Math.max(8, Math.min(bounds.left, window.innerWidth - POPOVER_WIDTH - 8));
    const below = bounds.bottom + 8;
    const top = below + POPOVER_HEIGHT <= window.innerHeight
      ? below
      : Math.max(8, bounds.top - POPOVER_HEIGHT - 8);
    setPosition({ top, left });
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!wrapperRef.current?.contains(target) && !popoverRef.current?.contains(target)) {
        setIsOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
        inputRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    document.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
      document.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
    };
  }, [isOpen, updatePosition]);

  const firstOfMonth = new Date(displayMonth.getFullYear(), displayMonth.getMonth(), 1);
  const firstCalendarDay = new Date(
    firstOfMonth.getFullYear(),
    firstOfMonth.getMonth(),
    1 - firstOfMonth.getDay(),
  );
  const calendarDays = Array.from({ length: 42 }, (_, index) => {
    const date = new Date(firstCalendarDay.getFullYear(), firstCalendarDay.getMonth(), firstCalendarDay.getDate() + index);
    return { key: getDateKey(date), day: date.getDate(), inMonth: date.getMonth() === displayMonth.getMonth() };
  });

  function setSelectedDate(dateKey: string) {
    setDraft(dateKey);
    onChange(dateKey);
    setIsOpen(false);
    inputRef.current?.focus();
  }

  return (
    <div ref={wrapperRef} className="date-picker" style={style}>
      <input
        ref={inputRef}
        type="text"
        inputMode="numeric"
        className={className}
        value={draft}
        onChange={(event) => {
          const nextValue = event.target.value;
          setDraft(nextValue);
          const parsed = parseDateKey(nextValue);
          event.target.setCustomValidity(
            nextValue !== "" && !parsed ? "Enter a valid date in YYYY-MM-DD format." : "",
          );
          if (nextValue === "" || parsed) onChange(nextValue);
          if (parsed) setDisplayMonth(parsed);
        }}
        placeholder="YYYY-MM-DD"
        aria-label={ariaLabel}
        aria-invalid={draft !== "" && !parseDateKey(draft)}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
      />
      <button
        type="button"
        className="date-picker-trigger"
        onClick={() => {
          if (isOpen) {
            setIsOpen(false);
            return;
          }
          const parsed = parseDateKey(draft);
          if (parsed) setDisplayMonth(parsed);
          updatePosition();
          setIsOpen(true);
        }}
        aria-label={`Choose ${ariaLabel}`}
        title="Choose Date"
      >
        <CalendarDays size={15} />
      </button>
      {isOpen && position && createPortal(
        <div
          ref={popoverRef}
          className="date-picker-popover"
          role="dialog"
          aria-label={`Choose ${ariaLabel}`}
          style={{ top: position.top, left: position.left }}
        >
          <div className="date-picker-header">
            <button
              type="button"
              className="date-picker-nav"
              onClick={() => setDisplayMonth(new Date(displayMonth.getFullYear(), displayMonth.getMonth() - 1, 1))}
              aria-label="Previous Month"
            >
              <ChevronLeft size={16} />
            </button>
            <strong>
              {displayMonth.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
            </strong>
            <button
              type="button"
              className="date-picker-nav"
              onClick={() => setDisplayMonth(new Date(displayMonth.getFullYear(), displayMonth.getMonth() + 1, 1))}
              aria-label="Next Month"
            >
              <ChevronRight size={16} />
            </button>
          </div>
          <div className="date-picker-grid" role="group" aria-label="Calendar Dates">
            {WEEKDAYS.map((weekday) => (
              <span key={weekday} className="date-picker-weekday">{weekday}</span>
            ))}
            {calendarDays.map(({ key, day, inMonth }) => (
              <button
                key={key}
                type="button"
                className={`date-picker-day${inMonth ? "" : " is-outside"}${key === value ? " is-selected" : ""}`}
                onClick={() => setSelectedDate(key)}
                aria-label={formatFullDate(key)}
                aria-pressed={key === value}
              >
                {day}
              </button>
            ))}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
