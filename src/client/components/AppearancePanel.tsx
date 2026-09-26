import { useId, type CSSProperties } from "react";
import { THEMES, useTheme } from "../lib/themes";

export function AppearancePanel({ className = "" }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  const groupId = useId();
  return (
    <fieldset className={`appearance-panel ${className}`}>
      <legend className="card-title">Appearance</legend>
      <p className="helper appearance-description">
        Choose a layout and style. Your choice is saved on this browser.
      </p>
      <div className="theme-grid">
        {THEMES.map((option) => (
          <label
            className={`theme-option${theme === option.id ? " is-selected" : ""}`}
            key={option.id}
          >
            <input
              className="theme-radio"
              type="radio"
              name={groupId}
              value={option.id}
              checked={theme === option.id}
              onChange={() => setTheme(option.id)}
              aria-describedby={`${groupId}-${option.id}`}
            />
            <span
              className={`theme-preview theme-preview-${option.layout} theme-preview-${option.id}`}
              style={
                {
                  "--preview-bg": option.colors[0],
                  "--preview-surface": option.colors[1],
                  "--preview-accent": option.colors[2],
                  "--preview-line": option.colors[3],
                } as CSSProperties
              }
              aria-hidden="true"
            >
              <span className="theme-preview-nav">
                <i />
                <i />
                <i />
              </span>
              <span className="theme-preview-content">
                <i className="theme-preview-title" />
                <i className="theme-preview-button" />
                <span className="theme-preview-cards">
                  <i />
                  <i />
                  <i />
                </span>
                <i className="theme-preview-row" />
                <i className="theme-preview-row" />
              </span>
            </span>
            <span className="theme-option-label">
              <strong>{option.name}</strong>
              <span className="theme-selection" aria-hidden="true">
                {theme === option.id ? "Selected" : ""}
              </span>
            </span>
            <span
              className="theme-option-description"
              id={`${groupId}-${option.id}`}
            >
              {option.description}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
