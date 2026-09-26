import { useId } from "react";
import { usePreferences } from "../lib/preferences";
import { Icon, type IconName } from "./Icon";
const MODES = [
  { value: "light", label: "Light", icon: "sun" },
  { value: "dark", label: "Dark", icon: "moon" },
  { value: "system", label: "Follow device", icon: "monitor" },
] as const;
export function AppearancePanel() {
  const { colorMode, setColorMode, loading, saving } = usePreferences();
  const name = useId();
  return (
    <fieldset className="appearance-panel" disabled={loading || saving}>
      <legend className="form-label">Color mode</legend>
      <div className="mode-picker">
        {MODES.map((mode) => (
          <label
            key={mode.value}
            className={`mode-option${colorMode === mode.value ? " is-selected" : ""}`}
          >
            <input
              type="radio"
              name={name}
              value={mode.value}
              checked={colorMode === mode.value}
              onChange={() => void setColorMode(mode.value)}
            />
            <Icon name={mode.icon as IconName} size={23} />
            <span>{mode.label}</span>
            {colorMode === mode.value && (
              <Icon className="mode-check" name="check-circle" size={16} />
            )}
          </label>
        ))}
      </div>
      <p className="helper">Saved for the next time you sign in.</p>
    </fieldset>
  );
}
