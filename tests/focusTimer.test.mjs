import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  clampFocusDurationMinutes,
  COUNTDOWN_FIT_RATIO,
  fitCountdownFontSize,
  formatCountdownClock,
  getFocusSessionsForLogicalToday,
  isValidFocusDurationMinutes,
  MAX_FOCUS_DURATION_MINUTES,
  MIN_COUNTDOWN_FONT_PX,
  parseCountdownDuration,
} from "../src/domain/focusTimer.ts";

process.env.TZ = "Asia/Tokyo";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const timerSource = readFileSync(path.join(root, "src/components/FocusTimer.tsx"), "utf8");
const appSource = readFileSync(path.join(root, "src/App.tsx"), "utf8");

test("Daily Overview keeps after-midnight sessions in the prior logical day before reset", () => {
  const now = new Date(2026, 9, 2, 2, 30);
  const sessions = [
    { id: 1, timestamp: new Date(2026, 9, 2, 1, 15).getTime(), durationMinutes: 25 },
    { id: 2, timestamp: new Date(2026, 9, 1, 23, 30).getTime(), durationMinutes: 15 },
    { id: 3, timestamp: new Date(2026, 9, 2, 4, 0).getTime(), durationMinutes: 45 },
  ];

  assert.deepEqual(
    getFocusSessionsForLogicalToday(sessions, 4, now).map((session) => session.id),
    [1, 2],
  );
});

// --- Duration boundary: the timer never exceeds 999 minutes ---

test("the supported duration range tops out at 999 minutes", () => {
  assert.equal(MAX_FOCUS_DURATION_MINUTES, 999);
});

test("every valid duration up to 999 is accepted and round-trips unchanged", () => {
  for (const minutes of [1, 2, 5, 15, 25, 45, 60, 99, 100, 250, 500, 998, 999]) {
    assert.equal(isValidFocusDurationMinutes(String(minutes)), true, `${minutes}m is valid`);
    assert.equal(clampFocusDurationMinutes(String(minutes), 25), minutes, `${minutes}m is never rewritten`);
    assert.equal(clampFocusDurationMinutes(minutes, 25), minutes, `${minutes}m passes through as a number`);
  }
});

test("attempts to enter 1000 minutes or more are rejected live and clamped on commit", () => {
  for (const value of ["1000", "1001", "1234", "99999"]) {
    assert.equal(isValidFocusDurationMinutes(value), false, `${value}m never commits while typing`);
    assert.equal(clampFocusDurationMinutes(value, 25), 999, `${value}m clamps to the maximum on blur`);
  }
  assert.equal(clampFocusDurationMinutes(10000, 25), 999, "numeric overflows clamp too");

  // Below-range and malformed input resolve safely instead of throwing.
  for (const value of ["0", "-3", "25.5", "", "abc"]) {
    assert.equal(isValidFocusDurationMinutes(value), false, `${JSON.stringify(value)} never commits live`);
  }
  assert.equal(clampFocusDurationMinutes("0", 25), 1);
  assert.equal(clampFocusDurationMinutes("-10", 25), 1);
  assert.equal(clampFocusDurationMinutes("25.5", 25), 26, "non-integers round to the nearest minute");
  assert.equal(clampFocusDurationMinutes("", 25), 25, "empty input keeps the fallback");
  assert.equal(clampFocusDurationMinutes("abc", 25), 25, "garbage keeps the fallback");
});

test("inline countdown input accepts minutes and minutes:seconds within supported limits", () => {
  assert.equal(parseCountdownDuration("35:00"), 35 * 60000);
  assert.equal(parseCountdownDuration("1:30"), 90000);
  assert.equal(parseCountdownDuration("35"), 35 * 60000);
  assert.equal(parseCountdownDuration("999:00"), 999 * 60000);
  for (const value of ["", "0", "0:59", "-1", "-1:30", "1:60", "abc", "1000:00", "999:01"]) {
    assert.equal(parseCountdownDuration(value), null, `${JSON.stringify(value)} is rejected`);
  }
});

// --- Countdown rendering at the boundary ---

test("the largest supported countdown renders as 999:59", () => {
  assert.equal(formatCountdownClock(999 * 60000 + 59000), "999:59");
  assert.equal(formatCountdownClock(999 * 60000), "999:00");
  assert.equal(formatCountdownClock(100 * 60000), "100:00", "minutes grow to three digits");
  assert.equal(formatCountdownClock(65000), "01:05");
  assert.equal(formatCountdownClock(25000), "00:25");
  assert.equal(formatCountdownClock(999), "00:00");
  assert.equal(formatCountdownClock(0), "00:00");
  assert.equal(formatCountdownClock(-5000), "00:00", "negative drift displays as zero");
  // Defensive cap: the minutes field can never render past 999, so the
  // string stays within the largest shape (999:59) the ring fit covers.
  assert.equal(formatCountdownClock(1000 * 60000 + 30000), "999:30");
});

// --- Countdown fits inside the ring at every size ---

// Approximate tabular metrics used to simulate a measured render: digits are
// ~0.55em wide, the colon ~0.3em, and the line box is 1em tall.
function measure(text, fontSize) {
  const width = [...text].reduce((total, ch) => total + (ch === ":" ? 0.3 : 0.55) * fontSize, 0);
  return { textWidth: width, textHeight: fontSize, fontSize };
}

// Mirrors the component's geometry: RADIUS 80 with a 5-unit stroke inside a
// 200-unit viewBox, scaled to the stage's CSS px minus RING_TEXT_PADDING_PX.
function innerDiameterForStage(stagePx, paddingPx = 10) {
  return 2 * (((80 - 5 / 2) * stagePx) / 200 - paddingPx);
}

test("the fitted countdown always lands inside the ring, including 999:59", () => {
  const cases = [
    [340, "999:59"], // widest supported countdown at the full stage size
    [340, "25:00"], // common preset
    [300, "999:59"], // typical narrow window
    [240, "999:59"], // very narrow window
  ];
  for (const [stagePx, text] of cases) {
    const innerDiameter = innerDiameterForStage(stagePx);
    // Measure from the old fixed clamp's maximum (112px) so the 999:59 case
    // starts out overflowing, exactly like the original bug.
    const fitted = fitCountdownFontSize({ ...measure(text, 112), innerDiameter });
    const scaled = measure(text, fitted);
    const diagonal = Math.hypot(scaled.textWidth, scaled.textHeight);
    assert.ok(
      diagonal <= innerDiameter * COUNTDOWN_FIT_RATIO + 1e-9,
      `${text} at stage ${stagePx}px stays inside the ring with the safety gap`,
    );
    assert.ok(fitted >= MIN_COUNTDOWN_FONT_PX, "the fit stays legible");
  }
});

test("the fit converges from any measurement size and scales with text width", () => {
  const innerDiameter = innerDiameterForStage(340);
  const fromLarge = fitCountdownFontSize({ ...measure("999:59", 112), innerDiameter });
  const fromSmall = fitCountdownFontSize({ ...measure("999:59", 40), innerDiameter });
  assert.ok(Math.abs(fromLarge - fromSmall) < 1e-6, "font metrics scale linearly, so one step converges");

  const fiveChars = fitCountdownFontSize({ ...measure("25:00", 100), innerDiameter });
  const sixChars = fitCountdownFontSize({ ...measure("999:59", 100), innerDiameter });
  assert.ok(fiveChars > sixChars, "shorter countdowns scale up, longer ones scale down");
});

test("unmeasurable input returns the current size instead of collapsing", () => {
  assert.equal(
    fitCountdownFontSize({ textWidth: 0, textHeight: 100, fontSize: 50, innerDiameter: 200 }),
    50,
  );
  assert.equal(
    fitCountdownFontSize({ textWidth: 100, textHeight: 0, fontSize: 50, innerDiameter: 200 }),
    50,
  );
  assert.equal(
    fitCountdownFontSize({ textWidth: 100, textHeight: 100, fontSize: 50, innerDiameter: -10 }),
    50,
  );
  assert.equal(
    fitCountdownFontSize({ textWidth: Number.NaN, textHeight: 100, fontSize: 50, innerDiameter: 200 }),
    50,
  );
});

// --- Wiring: the boundary is enforced everywhere durations are configured ---

test("every duration input caps at the shared 999-minute maximum", () => {
  assert.ok(
    timerSource.includes("const MAX_DURATION_MINUTES = MAX_FOCUS_DURATION_MINUTES"),
    "the timer shares the domain maximum",
  );
  const maxAttrs = timerSource.match(/max=\{MAX_DURATION_MINUTES\}/g) ?? [];
  assert.equal(maxAttrs.length, 3, "timer, focus, and break inputs all cap at the maximum");
  assert.ok(
    appSource.includes("parsed.defaultFocusDuration! <= MAX_FOCUS_DURATION_MINUTES"),
    "persisted default durations are validated against the same maximum",
  );
  assert.ok(
    appSource.includes("Number.isInteger(parsed.defaultFocusDuration)"),
    "persisted defaults must be integers",
  );
});

test("the countdown scales from the measured ring instead of a fixed font size", () => {
  assert.ok(!timerSource.includes("clamp(4rem, 12vw, 7rem)"), "the oversized fixed clamp is gone");
  assert.ok(timerSource.includes("fitCountdownFontSize({"), "the fit uses the rendered text box");
  assert.ok(timerSource.includes("ref={digitsRef}"), "the digits are measured directly");
  assert.ok(timerSource.includes("ref={ringStageRef}"), "the ring stage provides the inner diameter");
  assert.ok(timerSource.includes("countdownFontSize !== null"), "the measured size drives the font size");
  assert.ok(timerSource.includes("new ResizeObserver("), "the fit re-runs when the stage resizes");
  assert.ok(
    timerSource.includes("RING_TEXT_PADDING_PX"),
    "the fit keeps padding between the glyphs and the ring",
  );
});

test("countdown editing is keyboard-accessible and linked context precedes duration controls", () => {
  assert.ok(timerSource.includes("Activate to edit in minutes and seconds."), "countdown has an accessible activation label");
  assert.ok(timerSource.includes('aria-label="Set remaining time in minutes or minutes:seconds'), "editor explains accepted input");
  assert.ok(timerSource.includes('event.key === "Enter"'), "Enter applies the edited duration");
  assert.ok(timerSource.includes('event.key === "Escape"'), "Escape cancels the edit");
  assert.ok(timerSource.includes("commitCountdownEdit(event.currentTarget.value)"), "blur applies the edited duration");

  const linkedContext = timerSource.indexOf('aria-label="Linked context"');
  const presets = timerSource.indexOf('aria-label="Duration Presets"');
  const durationSettings = timerSource.indexOf('aria-label="Duration settings"');
  assert.ok(linkedContext >= 0 && linkedContext < presets, "linked context is above quick presets");
  assert.ok(presets < durationSettings, "quick presets remain above duration settings");
});

test("inline countdown editor has no border, outline, shadow, or opaque field surface", () => {
  const editorStart = timerSource.indexOf('type="text"', timerSource.indexOf('countdownEditDraft === null'));
  const editorEnd = timerSource.indexOf("value={countdownEditDraft}", editorStart);
  const editor = timerSource.slice(editorStart, editorEnd);
  assert.ok(editor.includes("border: 0"), "border is absent in both focus states");
  assert.ok(editor.includes('outline: "none"'), "global focus outline is suppressed");
  assert.ok(editor.includes('boxShadow: "none"'), "global focus shadow is suppressed");
  assert.ok(editor.includes('background: "transparent"'), "field background does not form a rectangle");
  assert.ok(editor.includes("textAlign: \"center\""), "entered text remains centered");
});