import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { useToast } from "./Toast";
import { Icon } from "./Icon";
import { Modal } from "./Modal";
import { InfoTip } from "./InfoTip";
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

  async function handleDisconnectWebhook() {
    if (disconnecting) return;
    setDisconnecting(true);
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
        `Other service disconnected. ${result.data.pending_update_count.toLocaleString()} waiting updates kept.`,
      );
      setConfirmDisconnect(false);
      onWebhookDisconnected?.();
      await loadReport();
    } else {
      setError(result.description);
    }
    setDisconnecting(false);
  }

  const username = report?.bot_username || botUsername;
  return (
    <Modal
      title="Bot status"
      onClose={onClose}
      busy={disconnecting}
      actions={
        <>
          <div className="option-help">
            <button
              className="button button-secondary"
              disabled={loading || disconnecting}
              onClick={() => void loadReport()}
            >
              <Icon name="refresh" />
              {loading ? "Checking…" : "Refresh"}
            </button>
            <InfoTip label="Refresh bot status">
              Ask Telegram for the latest connection status. This does not send
              a message or read the bot’s waiting messages.
            </InfoTip>
          </div>
          <button
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
          <p className="text-muted" role="status">
            Checking the connection with Telegram…
          </p>
        )}
        {error && (
          <div className="alert alert-error" role="alert">
            {error}
          </div>
        )}
        {report && (
          <>
            <div
              className={`alert ${report.webhook.is_active || report.polling_session.conflict_detected ? "alert-info" : "alert-success"}`}
            >
              <Icon
                name={
                  report.webhook.is_active ||
                  report.polling_session.conflict_detected
                    ? "alert"
                    : "check-circle"
                }
              />
              <div>
                <strong>
                  {report.webhook.is_active
                    ? "Connected to another service"
                    : report.polling_session.conflict_detected
                      ? "Another app is using this bot"
                      : "Connected to Telegram"}
                </strong>
                <p>
                  {report.webhook.is_active
                    ? "This bot sends new-message notifications to another service. Disconnect that service below only if you want to stop it receiving those notifications."
                    : report.polling_session.conflict_detected
                      ? "Stop the other app before using this bot here. Only one app can receive this bot’s updates at a time."
                      : "No direct connection to another service was found. Another app may still be checking this bot; this status check cannot detect every competing app."}
                </p>
              </div>
            </div>
            {report.webhook.is_active &&
              report.polling_session.conflict_detected && (
                <div className="alert alert-info">
                  Another app is also requesting this bot’s updates. Stop it
                  before using new-message copying here.
                </div>
              )}
            <div className="stat-grid">
              <div className="stat-card">
                <div className="info-label">
                  <span className="stat-label">Active tasks</span>
                  <InfoTip label="Active bot tasks">
                    Tasks using this bot that are watching for new messages or
                    have existing messages running or paused. Open an individual
                    task for its progress.
                  </InfoTip>
                </div>
                <strong className="stat-value">
                  {report.clone_worker_tasks.active_count.toLocaleString()}
                </strong>
              </div>
              <div className="stat-card">
                <div className="info-label">
                  <span className="stat-label">Telegram waiting period</span>
                  <InfoTip label="Telegram waiting period">
                    Telegram sometimes asks the bot to wait before sending more
                    messages. The task keeps its place and retries after the
                    wait. Ready means this workspace has no recorded wait right
                    now.
                  </InfoTip>
                </div>
                <strong className="stat-value">
                  {report.rate_limits.is_cooling_down ? "Waiting" : "Ready"}
                </strong>
                <span className="helper">
                  {report.rate_limits.is_cooling_down
                    ? `Try again in ${report.rate_limits.cooldown_seconds_remaining} seconds`
                    : "No wait recorded here"}
                </span>
              </div>
            </div>
            <section className="stack">
              <h3 className="card-title">Copy activity</h3>
              {report.recent_activities.length ? (
                <ul className="activity-list">
                  {report.recent_activities.map((activity) => (
                    <li className="activity-row" key={activity.update_id}>
                      <Icon
                        name={
                          activity.kind === "document"
                            ? "folder"
                            : activity.kind === "member_event"
                              ? "shield"
                              : activity.kind === "command"
                                ? "settings"
                                : activity.kind === "channel_post"
                                  ? "channel"
                                  : "inbox"
                        }
                      />
                      <div className="activity-main">
                        <p>{activity.summary}</p>
                        <p className="text-muted">
                          {activity.chat_name}
                          {activity.sender_name
                            ? ` · ${activity.sender_name}`
                            : ""}
                        </p>
                        {activity.date_iso && (
                          <time
                            className="activity-time"
                            dateTime={activity.date_iso}
                          >
                            {new Date(activity.date_iso).toLocaleString()}
                          </time>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="stack">
                  <p className="text-muted">
                    This status check does not read your waiting messages. Open
                    a task to see what it has copied.
                  </p>
                  {report.clone_worker_tasks.tasks.length > 0 ? (
                    <ul className="activity-list">
                      {report.clone_worker_tasks.tasks.map((task) => (
                        <li key={task.id}>
                          <a href={`#task/${task.id}`} onClick={onClose}>
                            {task.label}
                          </a>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="helper">No ongoing tasks use this bot yet.</p>
                  )}
                </div>
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
                    <dt>
                      <span className="option-help">
                        Other service connection
                        <InfoTip label="Other service connection">
                          Telegram calls this a webhook. When active, Telegram
                          sends new-message notifications directly to another
                          service instead of making them available to this app.
                        </InfoTip>
                      </span>
                    </dt>
                    <dd>{report.webhook.is_active ? "Active" : "None"}</dd>
                  </div>
                  {report.webhook.url && (
                    <div>
                      <dt>Webhook URL</dt>
                      <dd>{report.webhook.url}</dd>
                    </div>
                  )}
                  <div>
                    <dt>
                      <span className="option-help">
                        Waiting updates
                        <InfoTip label="Waiting updates">
                          Notifications Telegram is waiting to deliver to the
                          connected service. This is not the number of messages
                          waiting in your copy tasks.
                        </InfoTip>
                      </span>
                    </dt>
                    <dd>
                      {report.webhook.pending_update_count.toLocaleString()}
                    </dd>
                  </div>
                  <div>
                    <dt>
                      <span className="option-help">
                        Recorded waits in 24 hours
                        <InfoTip label="Recorded Telegram waits">
                          Waiting periods found in this workspace’s recent
                          activity records. This is not a complete history of
                          every limit Telegram has applied to the bot.
                        </InfoTip>
                      </span>
                    </dt>
                    <dd>
                      {report.rate_limits.events_last_24h.toLocaleString()}
                    </dd>
                  </div>
                  {report.webhook.last_error_message && (
                    <div>
                      <dt>Last delivery error</dt>
                      <dd>{report.webhook.last_error_message}</dd>
                    </div>
                  )}
                  {report.webhook.last_error_date && (
                    <div>
                      <dt>Error time</dt>
                      <dd>
                        {new Date(
                          report.webhook.last_error_date * 1000,
                        ).toLocaleString()}
                      </dd>
                    </div>
                  )}
                  {report.polling_session.message && (
                    <div>
                      <dt>Update connection</dt>
                      <dd>{report.polling_session.message}</dd>
                    </div>
                  )}
                </dl>
              </div>
            </details>
            {report.webhook.is_active && (
              <div className="stack">
                {confirmDisconnect ? (
                  <div className="alert alert-info stack">
                    <strong>Disconnect the existing service?</strong>
                    <p>
                      That service will stop receiving this bot’s updates.
                      Updates still queued in Telegram will be preserved.
                    </p>
                    <div className="row wrap">
                      <button
                        className="button button-secondary"
                        disabled={disconnecting}
                        onClick={() => setConfirmDisconnect(false)}
                      >
                        Keep connection
                      </button>
                      <button
                        className="button button-danger"
                        disabled={disconnecting}
                        onClick={() => void handleDisconnectWebhook()}
                      >
                        {disconnecting
                          ? "Disconnecting…"
                          : "Disconnect other service"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="option-help">
                    <button
                      className="button button-secondary"
                      disabled={loading || disconnecting}
                      onClick={() => setConfirmDisconnect(true)}
                    >
                      <Icon name="link" />
                      Disconnect other service
                    </button>
                    <InfoTip label="Disconnect other service">
                      Stop Telegram from delivering this bot’s new-message
                      notifications to the other connected service. Its bot
                      features may stop working. Notifications still waiting at
                      Telegram are kept, but you may need to resume stopped
                      tasks here.
                    </InfoTip>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
