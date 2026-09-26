import { useState, type FormEvent, type ReactNode } from "react";
import { api } from "../lib/api";
import { useAuth } from "../lib/useAuth";
import { usePreferences } from "../lib/preferences";
import { useToast } from "../components/Toast";
import { PageHero } from "../components/PageHero";
import { AppearancePanel } from "../components/AppearancePanel";
import { Icon } from "../components/Icon";
function SettingRow({
  label,
  help,
  children,
}: {
  label: string;
  help?: string;
  children: ReactNode;
}) {
  return (
    <div className="settings-option">
      <div className="settings-option-copy">
        <span className="settings-option-title">{label}</span>
        {help && <p className="helper">{help}</p>}
      </div>
      <div className="settings-option-control">{children}</div>
    </div>
  );
}
function Switch({
  label,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="switch-control">
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        aria-label={label}
      />
      <span className="switch-track" aria-hidden="true" />
      <span className="sr-only">{checked ? "On" : "Off"}</span>
    </label>
  );
}
export function SettingsPage() {
  const auth = useAuth();
  const toast = useToast();
  const { preferences, loading, saving, error, updatePreferences, retry } =
    usePreferences();
  const [current, setCurrent] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const disabled = loading || saving;
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
  return (
    <div className="content-container settings-page">
      <PageHero
        title="Settings"
        subtitle="Make the workspace comfortable for you."
      >
        <span className="settings-save-status" role="status" aria-live="polite">
          {saving
            ? "Saving…"
            : error
              ? "Could not save changes"
              : "Changes save automatically"}
        </span>
      </PageHero>
      {error && (
        <div className="alert alert-error" role="alert">
          <span>{error}</span>
          <button
            className="button button-secondary button-sm"
            onClick={() => void retry()}
          >
            Try again
          </button>
        </div>
      )}
      <div className="settings-stack">
        <section
          className="card settings-section"
          aria-labelledby="display-title"
        >
          <div className="section-heading">
            <Icon name="monitor" size={20} />
            <h2 id="display-title">Display</h2>
          </div>
          <AppearancePanel />
          <SettingRow
            label="Larger text"
            help="Make labels and messages easier to read."
          >
            <Switch
              label="Larger text"
              checked={preferences.textSize === "large"}
              disabled={disabled}
              onChange={(value) =>
                void updatePreferences({
                  textSize: value ? "large" : "standard",
                })
              }
            />
          </SettingRow>
          <SettingRow
            label="Reduce motion"
            help="Keep screen changes and transitions still."
          >
            <Switch
              label="Reduce motion"
              checked={preferences.reduceMotion}
              disabled={disabled}
              onChange={(value) =>
                void updatePreferences({ reduceMotion: value })
              }
            />
          </SettingRow>
          <details className="settings-disclosure">
            <summary>
              More display options
              <Icon name="chevron-down" size={16} />
            </summary>
            <SettingRow label="Spacing">
              <select
                className="input settings-select"
                aria-label="Spacing"
                value={preferences.density}
                disabled={disabled}
                onChange={(event) =>
                  void updatePreferences({
                    density: event.target.value as "comfortable" | "compact",
                  })
                }
              >
                <option value="comfortable">Comfortable</option>
                <option value="compact">Compact</option>
              </select>
            </SettingRow>
            <SettingRow
              label="Show task totals"
              help="Show a summary above your task list."
            >
              <Switch
                label="Show task totals"
                checked={preferences.showTaskStats}
                disabled={disabled}
                onChange={(value) =>
                  void updatePreferences({ showTaskStats: value })
                }
              />
            </SettingRow>
          </details>
        </section>
        <details className="card settings-section settings-disclosure">
          <summary>
            <span className="section-heading">
              <Icon name="tasks" size={20} />
              <span>New task defaults</span>
            </span>
            <Icon name="chevron-down" size={17} />
          </summary>
          <p className="helper">
            Starting choices for new tasks. You can change them during setup.
          </p>
          <SettingRow label="Messages to copy">
            <select
              className="input settings-select"
              aria-label="Default messages to copy"
              value={preferences.defaultTaskScope}
              disabled={disabled}
              onChange={(event) =>
                void updatePreferences({
                  defaultTaskScope: event.target
                    .value as typeof preferences.defaultTaskScope,
                })
              }
            >
              <option value="live">New messages</option>
              <option value="backfill_only">Existing messages</option>
              <option value="live_and_backfill">Existing + new messages</option>
            </select>
          </SettingRow>
          <SettingRow
            label="Save setups for reuse"
            help="Keep the bot and chat choices for another task."
          >
            <Switch
              label="Save new setups by default"
              checked={preferences.defaultSaveSetup}
              disabled={disabled}
              onChange={(value) =>
                void updatePreferences({ defaultSaveSetup: value })
              }
            />
          </SettingRow>
        </details>
        <section
          className="card settings-section"
          aria-labelledby="access-title"
        >
          <div className="section-heading">
            <Icon name="lock" size={20} />
            <h2 id="access-title">Account access</h2>
          </div>
          <details className="settings-disclosure">
            <summary>
              Change password
              <Icon name="chevron-down" size={16} />
            </summary>
            {auth.source === "env" ? (
              <p className="helper">
                Your password is set in your Cloudflare Worker’s ADMIN_PASSWORD
                secret. Change it there.
              </p>
            ) : (
              <form className="stack settings-form" onSubmit={changePassword}>
                <p className="helper">
                  Changing your password signs out other sessions. Your tasks
                  keep running.
                </p>
                <div className="field">
                  <label className="form-label" htmlFor="current-password">
                    Current password
                  </label>
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
                    <label className="form-label" htmlFor="new-password">
                      New password
                    </label>
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
                    <label className="form-label" htmlFor="confirm-new">
                      Confirm new password
                    </label>
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
                <div>
                  <button className="button button-primary" disabled={busy}>
                    {busy ? "Updating…" : "Change password"}
                  </button>
                </div>
              </form>
            )}
          </details>
          <SettingRow
            label="Sign out"
            help="Your copy tasks will continue running."
          >
            <button
              className="button button-secondary"
              onClick={() => void auth.logout()}
            >
              <Icon name="logout" size={17} />
              Sign out
            </button>
          </SettingRow>
        </section>
      </div>
    </div>
  );
}
