import { useState, type FormEvent } from "react";
import { useAuth } from "../lib/useAuth";
import { Icon } from "../components/Icon";

export function AuthPage({ mode }: { mode?: "login" | "setup" }) {
  const auth = useAuth();
  const isSetup = mode === "setup" || auth.mode === "setup_required";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [code, setCode] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setError("");
    if (isSetup && password.trim().length < 12) {
      setError("Use at least 12 characters for your password.");
      return;
    }
    if (isSetup && password !== confirm) {
      setError("The passwords do not match.");
      return;
    }
    setBusy(true);
    const result = isSetup
      ? await auth.setup(password, code.trim())
      : await auth.login(password);
    setBusy(false);
    if (!result.ok) setError(result.error ?? "Could not sign in. Try again.");
  }
  return (
    <main className="auth-layout">
      <section className="auth-brand">
        <div className="brand-mark">
          <Icon name="logo" size={26} />
        </div>
        <h1>Telegram Copy</h1>
        <p>Copy messages between chats you manage.</p>
      </section>
      <section className="auth-card" aria-labelledby="auth-title">
        <h2 id="auth-title">{isSetup ? "Set up your workspace" : "Sign in"}</h2>
        <p className="text-muted">
          {isSetup
            ? "Confirm you own this website, then choose a password."
            : "Enter your workspace password to continue."}
        </p>
        <form className="stack" onSubmit={submit}>
          {isSetup && (
            <div className="field">
              <label className="form-label" htmlFor="setup-code">
                Setup code
              </label>
              <input
                className="input"
                id="setup-code"
                spellCheck={false}
                autoCapitalize="none"
                maxLength={64}
                value={code}
                onChange={(event) => setCode(event.target.value)}
                autoComplete="off"
                required
                disabled={busy}
                aria-describedby="setup-code-help"
              />
              <p className="helper" id="setup-code-help">
                A one-time check that you control this website.
              </p>
              <details className="setup-help">
                <summary>Where do I find the code?</summary>
                <p>
                  In Cloudflare, open Storage &amp; databases → D1 → your
                  database → Console. Run this query and paste the result above.
                </p>
                <code className="code-block">
                  SELECT value FROM app_settings WHERE key = 'setup_code';
                </code>
              </details>
            </div>
          )}
          <div className="field">
            <label className="form-label" htmlFor="password">
              {isSetup ? "Create password" : "Password"}
            </label>
            <div className="password-field">
              <input
                id="password"
                className="input"
                type={show ? "text" : "password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete={isSetup ? "new-password" : "current-password"}
                minLength={isSetup ? 12 : 1}
                maxLength={256}
                required
                disabled={busy}
                aria-describedby={isSetup ? "password-help" : undefined}
              />
              <button
                type="button"
                className="icon-button"
                disabled={busy}
                onClick={() => setShow(!show)}
                aria-label={show ? "Hide password" : "Show password"}
                aria-pressed={show}
              >
                <Icon name={show ? "eye-off" : "eye"} />
              </button>
            </div>
            {isSetup && (
              <p className="helper" id="password-help">
                At least 12 characters. Use a separate password from Telegram.
              </p>
            )}
          </div>
          {isSetup && (
            <div className="field">
              <label className="form-label" htmlFor="confirm-password">
                Confirm password
              </label>
              <input
                className="input"
                id="confirm-password"
                type={show ? "text" : "password"}
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
                autoComplete="new-password"
                maxLength={256}
                required
                disabled={busy}
              />
            </div>
          )}
          {error && (
            <div className="alert alert-error" role="alert">
              {error}
            </div>
          )}
          <button className="button button-primary" disabled={busy}>
            {busy ? "Please wait…" : isSetup ? "Create workspace" : "Sign in"}
            <Icon name="arrow-right" />
          </button>
        </form>
      </section>
    </main>
  );
}
