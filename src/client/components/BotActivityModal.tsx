import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { useToast } from "./Toast";
import { Icon } from "./Icon";
import { Modal } from "./Modal";
import type { BotInspectionReport } from "../../shared/rpcTypes";

interface BotActivityModalProps {
  botId?: string;
  botToken?: string;
  botUsername?: string;
  onClose: () => void;
  onWebhookDisconnected?: () => void;
}

export function BotActivityModal({
  botId,
  botToken,
  botUsername,
  onClose,
  onWebhookDisconnected,
}: BotActivityModalProps) {
  const toast = useToast();
  const [report, setReport] = useState<BotInspectionReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const requestVersion = useRef(0);

  const loadReport = useCallback(async () => {
    const version = ++requestVersion.current;
    setLoading(true);
    setError(null);
    const result = await api.post<BotInspectionReport>("/api/bots/inspect", {
      botId: botId || undefined,
      token: botId ? undefined : botToken || undefined,
    });
    if (version !== requestVersion.current) return;
    setLoading(false);
    if (result.ok) setReport(result.data);
    else setError(result.description);
  }, [botId, botToken]);

  useEffect(() => {
    setReport(null);
    setConfirmDisconnect(false);
    void loadReport();
    return () => {
      requestVersion.current += 1;
    };
  }, [loadReport]);

  async function disconnect() {
    if (disconnecting) return;
    setDisconnecting(true);
    setError(null);
    const result = await api.post<{
      disconnected: boolean;
      pending_updates_preserved: boolean;
      pending_update_count: number;
    }>("/api/bots/disconnect-webhook", {
      botId: botId || undefined,
      token: botId ? undefined : botToken || undefined,
    });
    if (result.ok) {
      toast.show(
        "success",
        "Other service disconnected. Waiting Telegram updates were kept.",
      );
      setConfirmDisconnect(false);
      onWebhookDisconnected?.();
      await loadReport();
    } else setError(result.description);
    setDisconnecting(false);
  }

  const username = report?.bot_username || botUsername;
  const external =
    report?.webhook.is_active || report?.polling_session.conflict_detected;
  return (
    <Modal
      title="Bot status"
      onClose={onClose}
      busy={disconnecting}
      actions={
        <>
          <button
            type="button"
            className="button button-secondary"
            disabled={loading || disconnecting}
            onClick={() => void loadReport()}
          >
            <Icon name="refresh" />
            {loading ? "Checking…" : "Check again"}
          </button>
          <button
            type="button"
            className="button button-primary"
            disabled={disconnecting}
            onClick={onClose}
          >
            Done
          </button>
        </>
      }
    >
      <div className="stack" aria-busy={loading || disconnecting}>
        {username && <p className="text-muted">@{username}</p>}
        {loading && !report && (
          <p role="status">Checking the connection with Telegram…</p>
        )}
        {error && (
          <div className="alert alert-error" role="alert">
            {error}
          </div>
        )}
        {report && (
          <>
            <div
              className={`alert ${external ? "alert-info" : "alert-success"}`}
            >
              <Icon name={external ? "alert" : "check-circle"} />
              <div>
                <strong>
                  {external
                    ? "Another service is using this bot"
                    : "Telegram accepts this bot"}
                </strong>
                <p>
                  {report.webhook.is_active
                    ? "New-message notifications are being sent to another service. Use a separate bot, or disconnect that service below."
                    : report.polling_session.conflict_detected
                      ? "Stop the other app before using this bot here. Two apps cannot receive the same bot’s updates reliably."
                      : "The bot token works. Check individual tasks for chat permissions and copy progress."}
                </p>
              </div>
            </div>
            {report.rate_limits.is_cooling_down && (
              <div className="alert alert-info">
                <Icon name="clock" />
                <p>
                  Telegram has asked this bot to wait. Copying can continue in
                  about {report.rate_limits.cooldown_seconds_remaining} seconds.
                </p>
              </div>
            )}
            <section className="stack">
              <h3 className="card-title">Tasks using this bot</h3>
              {report.clone_worker_tasks.tasks.length ? (
                <ul className="activity-list">
                  {report.clone_worker_tasks.tasks.map((task) => (
                    <li key={task.id}>
                      {disconnecting ? (
                        <span>{task.label}</span>
                      ) : (
                        <a href={`#task/${task.id}`} onClick={onClose}>
                          {task.label}
                        </a>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted">No ongoing tasks use this bot.</p>
              )}
            </section>
            <details className="disclosure">
              <summary>Connection details</summary>
              <div className="stack">
                <dl className="detail-list">
                  <div>
                    <dt>Telegram bot ID</dt>
                    <dd>{report.bot_id}</dd>
                  </div>
                  <div>
                    <dt>Other service connection</dt>
                    <dd>
                      {report.webhook.is_active ? "Connected" : "None found"}
                    </dd>
                  </div>
                  <div>
                    <dt>Waiting Telegram updates</dt>
                    <dd>
                      {report.webhook.pending_update_count.toLocaleString()}
                    </dd>
                  </div>
                  {report.webhook.last_error_message && (
                    <div>
                      <dt>Latest connection error</dt>
                      <dd>{report.webhook.last_error_message}</dd>
                    </div>
                  )}
                </dl>
                <p className="helper">
                  This check does not read waiting messages. It may not detect
                  another app that is also checking the bot.
                </p>
                {report.webhook.is_active &&
                  (confirmDisconnect ? (
                    <div className="alert alert-info stack">
                      <strong>Disconnect the other service?</strong>
                      <p>
                        It will stop receiving this bot’s new-message
                        notifications. Waiting updates are kept. You may need to
                        resume stopped tasks here afterwards.
                      </p>
                      <div className="row wrap">
                        <button
                          type="button"
                          className="button button-secondary"
                          disabled={disconnecting}
                          onClick={() => setConfirmDisconnect(false)}
                        >
                          Keep connection
                        </button>
                        <button
                          type="button"
                          className="button button-danger"
                          disabled={disconnecting}
                          onClick={() => void disconnect()}
                        >
                          {disconnecting
                            ? "Disconnecting…"
                            : "Disconnect service"}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="button button-secondary align-start"
                      disabled={loading || disconnecting}
                      onClick={() => setConfirmDisconnect(true)}
                    >
                      Disconnect other service
                    </button>
                  ))}
              </div>
            </details>
          </>
        )}
      </div>
    </Modal>
  );
}
