import { useState, type FormEvent } from "react";
import { api } from "../lib/api";
import { useAuth } from "../lib/useAuth";
import { useToast } from "../components/Toast";
import { PageHero } from "../components/PageHero";
import { AppearancePanel } from "../components/AppearancePanel";
import { Icon } from "../components/Icon";
export function SettingsPage() {
  const auth = useAuth();
  const toast = useToast();
  const [current, setCurrent] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function changePassword(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (password.length < 12) {
      setError("Use at least 12 characters for your new password.");
      return;
    }
    if (password !== confirm) {
      setError("The new passwords do not match.");
      return;
    }
    setBusy(true);
    const result = await api.post("/api/auth/password", {
      currentPassword: current,
      password,
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.description);
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
    <div className="content-container">
      <PageHero
        title="Settings"
        subtitle="Make the workspace comfortable for you."
      />
      <section className="card">
        <AppearancePanel />
      </section>
      <section className="card">
        <div className="card-header">
          <div>
            <h2 className="card-title">Workspace password</h2>
            <p className="helper">Protect access to your bots and tasks.</p>
          </div>
          <Icon name="lock" />
        </div>
        {auth.source === "env" ? (
          <p className="text-muted">
            Your password is managed in your Cloudflare Worker’s ADMIN_PASSWORD
            secret. Update it there to change it.
          </p>
        ) : (
          <form className="stack settings-form" onSubmit={changePassword}>
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
                onChange={(e) => setCurrent(e.target.value)}
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
                  onChange={(e) => setPassword(e.target.value)}
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
                  onChange={(e) => setConfirm(e.target.value)}
                />
              </div>
            </div>
            {error && (
              <p className="alert alert-error" role="alert">
                {error}
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
      </section>
    </div>
  );
}
