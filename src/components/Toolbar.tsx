import type { ResolvedTheme, ThemePreference } from "../hooks/useTheme";
import { MoonIcon, SunIcon, SystemIcon } from "./icons";
import { AnchoredPopover } from "./Overlays";
import { Check } from "lucide-react";

interface ToolbarProps {
  dateLabel: string;
  preference: ThemePreference;
  resolved: ResolvedTheme;
  onPreferenceChange: (preference: ThemePreference) => void;
}

const APPEARANCE_OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

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
  onPreferenceChange,
}: ToolbarProps) {
  return (
    <header className="toolbar">
      <span className="toolbar__date">{dateLabel}</span>

      <div className="toolbar__actions">
        <AnchoredPopover
          label={`Appearance, currently ${preference === "system" ? `following ${resolved}` : preference}`}
          triggerLabel="Appearance"
          className="toolbar__appearance"
          icon={<ThemeIcon preference={preference} />}
        >
          {(close) => (
            <div className="menu-list toolbar__appearance-menu">
              {APPEARANCE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`menu-option${preference === option.value ? " menu-option--selected" : ""}`}
                  aria-pressed={preference === option.value}
                  onClick={() => {
                    onPreferenceChange(option.value);
                    close();
                  }}
                >
                  <span className="menu-option__label">{option.label}</span>
                  {preference === option.value && <Check aria-hidden="true" />}
                </button>
              ))}
            </div>
          )}
        </AnchoredPopover>
      </div>
    </header>
  );
}
