import type { ResolvedTheme, ThemePreference } from "../hooks/useTheme";
import { MoonIcon, SunIcon, SystemIcon } from "./icons";

interface ToolbarProps {
  dateLabel: string;
  preference: ThemePreference;
  resolved: ResolvedTheme;
  onCyclePreference: () => void;
}

const THEME_LABEL: Record<ThemePreference, string> = {
  system: "System",
  light: "Light",
  dark: "Dark",
};

const NEXT_THEME: Record<ThemePreference, ThemePreference> = {
  system: "light",
  light: "dark",
  dark: "system",
};

function ThemeIcon({ preference }: { preference: ThemePreference }) {
  if (preference === "light") {
    return <SunIcon width={16} height={16} />;
  }
  if (preference === "dark") {
    return <MoonIcon width={16} height={16} />;
  }
  return <SystemIcon width={16} height={16} />;
}

/**
 * Restrained toolbar at the top of the content area: contextual date on the
 * left, appearance control on the right.
 */
export function Toolbar({
  dateLabel,
  preference,
  resolved,
  onCyclePreference,
}: ToolbarProps) {
  const next = NEXT_THEME[preference];
  const description = `Appearance: ${THEME_LABEL[preference]}. Switch to ${THEME_LABEL[next]}.`;

  return (
    <header className="toolbar">
      <span className="toolbar__date">{dateLabel}</span>

      <div className="toolbar__actions">
        <button
          type="button"
          className="icon-button"
          onClick={onCyclePreference}
          title={description}
          aria-label={description}
          data-appearance={resolved}
        >
          <ThemeIcon preference={preference} />
        </button>
      </div>
    </header>
  );
}
