import { useId, useState, type FormEvent, type ReactNode } from "react";
import { api } from "../lib/api";
import { useAuth } from "../lib/useAuth";
import { usePreferences, useTheme } from "../lib/themes";
import { THEMES } from "../../shared/themeCatalog";
import { useToast } from "../components/Toast";
import { PageHero } from "../components/PageHero";
import { AppearancePanel } from "../components/AppearancePanel";
import { Icon, type IconName } from "../components/Icon";
import { InfoTip, InfoLabel } from "../components/InfoTip";

type SectionId = "appearance" | "reading" | "defaults" | "security";
const sections: {
  id: SectionId;
  label: string;
  description: string;
  icon: IconName;
}[] = [
  {
    id: "appearance",
    label: "Appearance",
    description: "Theme and layout",
    icon: "palette",
  },
  {
    id: "reading",
    label: "Display",
    description: "Text, spacing, and motion",
    icon: "monitor",
  },
  {
    id: "defaults",
    label: "Task defaults",
    description: "Starting preferences",
    icon: "tasks",
  },
  {
    id: "security",
    label: "Security",
    description: "Workspace password",
    icon: "lock",
  },
];

function PreferenceChoices<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled,
  style,
}: {
  label: string;
  value: T;
  options: { value: T; label: string; detail?: string }[];
  onChange: (value: T) => void;
  disabled: boolean;
  style: string;
}) {
  const id = useId();
  if (style === "underline") {
    return (
      <select
        className="input settings-select"
        aria-label={label}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value as T)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    );
  }
  return (
    <fieldset
      className={
        style === "outlined" ? "preference-choice-grid" : "segmented-control"
      }
      aria-label={label}
      disabled={disabled}
    >
      <legend className="sr-only">{label}</legend>
      {options.map((option) => (
        <label
          key={option.value}
          className={`preference-choice${value === option.value ? " is-active" : ""}`}
        >
          <input
            type="radio"
            name={id}
            value={option.value}
            checked={value === option.value}
            onChange={() => onChange(option.value)}
          />
          <span>
            <strong>{option.label}</strong>
            {style === "outlined" && option.detail && (
              <small>{option.detail}</small>
            )}
          </span>
          {style === "outlined" && value === option.value && (
            <Icon name="check-circle" size={18} />
          )}
        </label>
      ))}
    </fieldset>
  );
}

function SettingOption({
  label,
  help,
  children,
}: {
  label: string;
  help: string;
  children: ReactNode;
}) {
  return (
    <div className="settings-option">
      <div className="settings-option-copy">
        <div className="settings-option-title">
          <span>{label}</span>
          <InfoTip label={label}>{help}</InfoTip>
        </div>
        <p className="helper">{help}</p>
      </div>
      <div className="settings-option-control">{children}</div>
    </div>
  );
}

export function SettingsPage() {
  const auth = useAuth();
  const toast = useToast();
  const { theme } = useTheme();
  const {
    preferences,
    loading,
    saving,
    error: preferencesError,
    updatePreferences,
    retry,
  } = usePreferences();
  const recipe = THEMES.find((item) => item.id === theme) ?? THEMES[0];
  const layout = recipe.settingsLayout;
  const focused = layout === "split" || layout === "rail";
  const [section, setSection] = useState<SectionId>("appearance");
  const [current, setCurrent] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const disabled = loading || saving;

  function selectSection(next: SectionId) {
    setSection(next);
    if (!focused)
      requestAnimationFrame(() =>
        document
          .getElementById(`settings-${next}`)
          ?.scrollIntoView({
            behavior: preferences.reduceMotion ? "instant" : "smooth",
            block: "start",
          }),
      );
  }

  async function changePassword(event: FormEvent) {
    event.preventDefault();
    setPasswordError("");
    if (password.trim().length < 12) {
      setPasswordError("Use at least 12 characters for your new password.");
      return;
    }
    if (password !== confirm) {
      setPasswordError("The new passwords do not match.");
      return;
    }
    setBusy(true);
    const result = await api.post("/api/auth/password", {
      currentPassword: current,
      password,
    });
    setBusy(false);
    if (!result.ok) {
      setPasswordError(result.description);
      return;
    }
    setCurrent("");
    setPassword("");
    setConfirm("");
    toast.show(
      "success",
      "Password changed. Other sessions have been signed out.",
    );
    await auth.refreshStatus();
  }

  const content: Record<SectionId, ReactNode> = {
    appearance: (
      <>
        <div className="settings-section-heading">
          <Icon name="palette" />
          <div>
            <h2 className="card-title">Appearance</h2>
            <p className="helper">
              Change the entire workspace layout, navigation, and controls.
            </p>
          </div>
          <InfoTip label="Workspace theme">
            Each theme has its own page layout, navigation, form style, and
            controls. Your choice is saved for this workspace. The sign-in
            screen always uses Canvas.
          </InfoTip>
        </div>
        <AppearancePanel />
      </>
    ),
    reading: (
      <>
        <div className="settings-section-heading">
          <Icon name="monitor" />
          <div>
            <h2 className="card-title">Display</h2>
            <p className="helper">
              Adjust the workspace for comfortable reading.
            </p>
          </div>
        </div>
        <SettingOption
          label="Spacing"
          help="Comfortable gives controls more room. Compact fits more information on each page."
        >
          <PreferenceChoices
            label="Spacing"
            value={preferences.density}
            options={[
              {
                value: "comfortable",
                label: "Comfortable",
                detail: "More room between controls",
              },
              {
                value: "compact",
                label: "Compact",
                detail: "More information per page",
              },
            ]}
            onChange={(density) => void updatePreferences({ density })}
            disabled={disabled}
            style={recipe.controlStyle}
          />
        </SettingOption>
        <SettingOption
          label="Text size"
          help="Large text makes labels, forms, and task information easier to read."
        >
          <PreferenceChoices
            label="Text size"
            value={preferences.textSize}
            options={[
              {
                value: "standard",
                label: "Standard",
                detail: "Default reading size",
              },
              {
                value: "large",
                label: "Large",
                detail: "Larger labels and body text",
              },
            ]}
            onChange={(textSize) => void updatePreferences({ textSize })}
            disabled={disabled}
            style={recipe.controlStyle}
          />
        </SettingOption>
        <SettingOption
          label="Reduce motion"
          help="Turns off decorative transitions. Your device’s reduced-motion setting is also respected."
        >
          <label className="switch-control">
            <input
              type="checkbox"
              role="switch"
              checked={preferences.reduceMotion}
              disabled={disabled}
              onChange={(event) =>
                void updatePreferences({ reduceMotion: event.target.checked })
              }
              aria-label="Reduce motion"
            />
            <span className="switch-track" aria-hidden="true" />
            <span>{preferences.reduceMotion ? "On" : "Off"}</span>
          </label>
        </SettingOption>
        <SettingOption
          label="Show task totals"
          help="Show the active-task, copied-message, and connected-bot totals above your task list."
        >
          <label className="switch-control">
            <input
              type="checkbox"
              role="switch"
              checked={preferences.showTaskStats}
              disabled={disabled}
              onChange={(event) =>
                void updatePreferences({ showTaskStats: event.target.checked })
              }
              aria-label="Show task totals"
            />
            <span className="switch-track" aria-hidden="true" />
            <span>{preferences.showTaskStats ? "On" : "Off"}</span>
          </label>
        </SettingOption>
      </>
    ),
    defaults: (
      <>
        <div className="settings-section-heading">
          <Icon name="tasks" />
          <div>
            <h2 className="card-title">Task defaults</h2>
            <p className="helper">
              Choose the starting values for new tasks. Existing tasks stay
              unchanged.
            </p>
          </div>
        </div>
        <SettingOption
          label="Messages to copy"
          help="Preselects which messages a new task will copy. You can change this before starting each task."
        >
          <PreferenceChoices
            label="Default messages to copy"
            value={preferences.defaultTaskScope}
            options={[
              {
                value: "live",
                label: "New messages",
                detail: "Keep copying new posts",
              },
              {
                value: "backfill_only",
                label: "Existing messages",
                detail: "Copy a history range once",
              },
              {
                value: "live_and_backfill",
                label: "Existing + new",
                detail: "Copy history, then new posts",
              },
            ]}
            onChange={(defaultTaskScope) =>
              void updatePreferences({ defaultTaskScope })
            }
            disabled={disabled}
            style={recipe.controlStyle}
          />
        </SettingOption>
        <SettingOption
          label="Save new setups"
          help="Preselects “Save this setup” when creating a task so you can reuse its bot, chats, and filters later."
        >
          <label className="switch-control">
            <input
              type="checkbox"
              role="switch"
              checked={preferences.defaultSaveSetup}
              disabled={disabled}
              onChange={(event) =>
                void updatePreferences({
                  defaultSaveSetup: event.target.checked,
                })
              }
              aria-label="Save new setups by default"
            />
            <span className="switch-track" aria-hidden="true" />
            <span>{preferences.defaultSaveSetup ? "On" : "Off"}</span>
          </label>
        </SettingOption>
      </>
    ),
    security: (
      <>
        <div className="settings-section-heading">
          <Icon name="lock" />
          <div>
            <h2 className="card-title">Workspace password</h2>
            <p className="helper">Control access to your bots and tasks.</p>
          </div>
          <InfoTip label="Workspace password">
            The password is required before anyone can view or change this
            workspace. Changing it signs out other sessions. Your bots and tasks
            keep running.
          </InfoTip>
        </div>
        {auth.source === "env" ? (
          <p className="text-muted">
            Your password is managed in your Cloudflare Worker’s ADMIN_PASSWORD
            secret. Update it there to change it.
          </p>
        ) : (
          <form className="stack settings-form" onSubmit={changePassword}>
            <div className="field">
              <InfoLabel htmlFor="current-password" label="Current password">
                Enter the password you used to sign in. This confirms that you
                can change workspace access.
              </InfoLabel>
              <input
                className="input"
                id="current-password"
                type="password"
                autoComplete="current-password"
                required
                value={current}
                disabled={busy}
                onChange={(event) => setCurrent(event.target.value)}
              />
            </div>
            <div className="form-grid">
              <div className="field">
                <InfoLabel htmlFor="new-password" label="New password">
                  Use at least 12 characters. A few unrelated words make a
                  password easier to remember.
                </InfoLabel>
                <input
                  className="input"
                  id="new-password"
                  type="password"
                  autoComplete="new-password"
                  minLength={12}
                  maxLength={256}
                  required
                  value={password}
                  disabled={busy}
                  onChange={(event) => setPassword(event.target.value)}
                />
                <p className="helper">At least 12 characters.</p>
              </div>
              <div className="field">
                <InfoLabel htmlFor="confirm-new" label="Confirm new password">
                  Enter your new password again to check for typing mistakes.
                </InfoLabel>
                <input
                  className="input"
                  id="confirm-new"
                  type="password"
                  autoComplete="new-password"
                  minLength={12}
                  maxLength={256}
                  required
                  value={confirm}
                  disabled={busy}
                  onChange={(event) => setConfirm(event.target.value)}
                />
              </div>
            </div>
            {passwordError && (
              <p className="alert alert-error" role="alert">
                {passwordError}
              </p>
            )}
            <div className="row wrap">
              <button className="button button-primary" disabled={busy}>
                {busy ? "Updating…" : "Change password"}
              </button>
              <p className="helper">Other sessions will be signed out.</p>
            </div>
          </form>
        )}
      </>
    ),
  };

  return (
    <div className="content-container settings-page">
      <PageHero
        title="Settings"
        subtitle="Appearance, task preferences, and workspace access."
      >
        <span className="settings-save-status" role="status" aria-live="polite">
          <Icon name={saving ? "clock" : "check-circle"} size={16} />
          {loading
            ? "Loading preferences…"
            : saving
              ? "Saving…"
              : "Changes save automatically"}
        </span>
      </PageHero>
      {preferencesError && (
        <div className="alert alert-error" role="alert">
          <span>{preferencesError}</span>
          <button
            className="button button-secondary button-sm"
            onClick={() => void retry()}
          >
            Retry
          </button>
        </div>
      )}
      <div className={`settings-layout settings-layout-${layout}`}>
        <nav className="settings-nav" aria-label="Settings sections">
          {sections.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`settings-nav-item${section === item.id ? " is-active" : ""}`}
              onClick={() => selectSection(item.id)}
              aria-current={section === item.id ? "true" : undefined}
              title={layout === "rail" ? item.label : undefined}
            >
              <Icon name={item.icon} />
              <span>
                <strong>{item.label}</strong>
                {layout === "split" && <small>{item.description}</small>}
              </span>
              <Icon
                className="settings-nav-arrow"
                name="chevron-right"
                size={15}
              />
            </button>
          ))}
        </nav>
        <div className="settings-content">
          {sections
            .filter((item) => !focused || item.id === section)
            .map((item) => (
              <section
                className={`card settings-section settings-section-${item.id}`}
                data-settings-section={item.id}
                id={`settings-${item.id}`}
                key={item.id}
                aria-label={item.label}
              >
                {content[item.id]}
              </section>
            ))}
        </div>
      </div>
    </div>
  );
}
