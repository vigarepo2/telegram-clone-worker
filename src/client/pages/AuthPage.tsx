import { useState, type FormEvent } from "react";
import { useAuth } from "../lib/useAuth";
import { Icon } from "../components/Icon";
import { InfoLabel, InfoTip } from "../components/InfoTip";
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
    setError("");
    if (isSetup && password.length < 12) {
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
          <Icon name="copy" size={26} />
        </div>
        <span className="eyebrow">TELEGRAM COPY</span>
        <h1>
          Copy between
          <br />
          Telegram chats.
        </h1>
        <p>
          Copy messages between your Telegram channels. Set it up once, then
          follow every task in one place.
        </p>
        <div className="auth-feature">
          <Icon name="shield" />
          <span>Password-protected access</span>
        </div>
      </section>
      <section className="auth-card" aria-labelledby="auth-title">
        <div className="empty-icon">
          <Icon name={isSetup ? "shield" : "lock"} size={24} />
        </div>
        <h2 id="auth-title">
          {isSetup ? "Set up your workspace" : "Welcome back"}
        </h2>
        <p className="text-muted">
          {isSetup
            ? "Confirm you own this website, then choose a password."
            : "Enter your password to open your workspace."}
        </p>
        <form className="stack" onSubmit={submit}>
          {isSetup && (
            <div className="field">
              <InfoLabel htmlFor="setup-code" label="Setup code">
                This one-time code proves you control this website. It stops
                someone else from setting the password before you. Find it in
                your private Cloudflare database using the instructions below.
              </InfoLabel>
              <input
                className="input"
                id="setup-code"
                spellCheck={false}
                autoCapitalize="none"
                maxLength={32}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                autoComplete="off"
                required
                disabled={busy}
              />
              <details className="setup-help">
                <summary>Where do I find this?</summary>
                <p>
                  Open Cloudflare, go to Storage &amp; databases → D1 → your
                  database → Console. Run this query and paste its result above.
                </p>
                <code className="code-block">
                  SELECT value FROM app_settings WHERE key = 'setup_code';
                </code>
              </details>
            </div>
          )}
          <div className="field">
            <InfoLabel
              htmlFor="password"
              label={isSetup ? "Create password" : "Password"}
            >
              This password opens this website. It is separate from your
              Telegram password and bot token.{" "}
              {isSetup
                ? "Use at least 12 characters and keep it somewhere safe."
                : "Use the password chosen when this website was set up."}
            </InfoLabel>
            <div className="password-field">
              <input
                id="password"
                className="input"
                type={show ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={isSetup ? "new-password" : "current-password"}
                minLength={isSetup ? 12 : 1}
                maxLength={256}
                required
                disabled={busy}
              />
              <button
                type="button"
                className="icon-button"
                onClick={() => setShow(!show)}
                aria-label={show ? "Hide password" : "Show password"}
              >
                <Icon name={show ? "eye-off" : "eye"} />
              </button>
            </div>
            {isSetup && (
              <p className="helper">
                At least 12 characters. A few unrelated words work well.
              </p>
            )}
          </div>
          {isSetup && (
            <div className="field">
              <InfoLabel htmlFor="confirm-password" label="Confirm password">
                Type the same password again. This catches typing mistakes
                before the password is saved.
              </InfoLabel>
              <input
                className="input"
                id="confirm-password"
                type={show ? "text" : "password"}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
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
        <div className="option-help">
          <span className="helper">Why is sign-in required?</span>
          <InfoTip label="Workspace access">
            Anyone with this website’s password can use its connected bots and
            manage its tasks. Sign-in stays required even when no password was
            set during deployment.
          </InfoTip>
        </div>
        <p className="auth-footnote">
          <Icon name="lock" size={14} />
          Access is protected by your workspace password.
        </p>
      </section>
    </main>
  );
}
