import { useId, useState, type CSSProperties } from "react";
import { THEMES } from "../../shared/themeCatalog";
import { useTheme } from "../lib/themes";

type ThemeFilter = "all" | "light" | "dark";
type ThemeOption = (typeof THEMES)[number];

const FILTERS = [
  { id: "all", label: "All" },
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
] as const;

const NAVIGATION_LABELS: Record<ThemeOption["navigation"], string> = {
  sidebar: "Left navigation",
  floating: "Floating navigation",
  top: "Top navigation",
  right: "Right navigation",
  rail: "Slim navigation",
  bottom: "Bottom navigation",
};

const TASK_LABELS: Record<ThemeOption["taskLayout"], string> = {
  cards: "Cards",
  rows: "Rows",
  compact: "Compact list",
  editorial: "Reading layout",
  board: "Task board",
};

function ThemePreview({ option }: { option: ThemeOption }) {
  return (
    <span
      className={`theme-preview theme-preview-${option.navigation} theme-preview-${option.id}`}
      data-navigation={option.navigation}
      data-task-layout={option.taskLayout}
      data-settings-layout={option.settingsLayout}
      data-control-style={option.controlStyle}
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
        <i />
      </span>
      <span className="theme-preview-content">
        <i className="theme-preview-title" />
        <i className="theme-preview-button" />
        <span className="theme-preview-tasks">
          <span className="theme-preview-cards">
            <i />
            <i />
            <i />
          </span>
          <i className="theme-preview-row" />
          <i className="theme-preview-row" />
        </span>
        <span className="theme-preview-settings">
          <i className="theme-preview-field" />
          <i className="theme-preview-field" />
        </span>
      </span>
    </span>
  );
}

export function AppearancePanel({ className = "" }: { className?: string }) {
  const { theme, setTheme, isSaving, error } = useTheme();
  const [filter, setFilter] = useState<ThemeFilter>("all");
  const groupId = useId();
  const currentTheme =
    THEMES.find((option) => option.id === theme) ?? THEMES[0];
  const visibleThemes = THEMES.filter(
    (option) => filter === "all" || option.mode === filter,
  );

  return (
    <fieldset className={`appearance-panel ${className}`}>
      <legend className="card-title">Appearance</legend>
      <p className="helper appearance-description">
        Choose a look for your workspace. Your choice is saved for this
        workspace.
      </p>
      <div className="theme-current">
        <span className="theme-current-label">Current theme</span>
        <strong>{currentTheme.name}</strong>
        <span>{currentTheme.description}</span>
      </div>
      <div className="theme-toolbar">
        <div className="theme-filters" role="group" aria-label="Filter themes">
          {FILTERS.map((option) => (
            <button
              type="button"
              className={`theme-filter${filter === option.id ? " is-active" : ""}`}
              key={option.id}
              aria-pressed={filter === option.id}
              aria-controls={`${groupId}-options`}
              onClick={() => setFilter(option.id)}
            >
              {option.label}
            </button>
          ))}
        </div>
        <span className="theme-count" role="status" aria-live="polite">
          {visibleThemes.length} themes
        </span>
      </div>
      <div className="theme-save-status" role="status" aria-live="polite">
        {isSaving ? "Saving your theme…" : error || ""}
      </div>
      <div className="theme-grid" id={`${groupId}-options`}>
        {visibleThemes.map((option) => (
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
              onChange={() => void setTheme(option.id)}
              aria-label={`${option.name} theme`}
              aria-describedby={`${groupId}-${option.id}-description ${groupId}-${option.id}-meta`}
            />
            <ThemePreview option={option} />
            <span className="theme-option-label">
              <strong>{option.name}</strong>
              <span className="theme-selection" aria-hidden="true">
                {theme === option.id ? "Selected" : ""}
              </span>
            </span>
            <span
              className="theme-option-description"
              id={`${groupId}-${option.id}-description`}
            >
              {option.description}
            </span>
            <span
              className="theme-option-meta"
              id={`${groupId}-${option.id}-meta`}
            >
              {NAVIGATION_LABELS[option.navigation]} ·{" "}
              {TASK_LABELS[option.taskLayout]}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
