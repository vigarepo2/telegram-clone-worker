import { useCallback, useState } from "react";
import { api } from "../lib/api";
import { usePolling } from "../lib/usePolling";
import { useToast } from "../components/Toast";
import { Icon } from "../components/Icon";
import { Modal } from "../components/Modal";
import { Badge } from "../components/Badge";
import { navigate } from "../lib/router";
import { useTasks, getTaskDisplayInfo } from "../lib/useTasksContext";
import { formatBytes } from "../../shared/messageFilter";
import type {
  ErrorReason,
  TaskDetail,
  TaskScope,
  TaskSummary,
} from "../../shared/rpcTypes";

interface ActivityEntry {
  id: number;
  kind: "live_forward" | "backfill_batch";
  detail: string | null;
  ok: number;
  error: string | null;
  at: number;
}

type TaskAction = Partial<{
  liveEnabled: boolean;
  backfillStatus: "running" | "paused" | "cancelled";
}>;
const scopeLabels: Record<TaskScope, string> = {
  live: "New messages",
  live_and_backfill: "Existing and new messages",
  backfill_only: "Existing messages",
};
const stopMessages: Record<ErrorReason, string> = {
  insufficient_permissions:
    "Check that the bot is an administrator in both chats and can post in the destination, then retry.",
  bot_not_in_chat: "Add the bot to both chats, then retry.",
  rate_limited:
    "Telegram has asked this bot to wait. Copying will resume after the waiting period.",
  invalid_request:
    "Telegram could not accept this request. Check the chat details and message range before retrying.",
  unauthorized:
    "The bot token is no longer valid. Reconnect it in Bots using a replacement token, then retry.",
  unknown:
    "Telegram could not complete the copy. Check the activity below, then retry.",
};
const mediaLabels: Record<string, string> = {
  document: "Documents",
  video: "Videos",
  photo: "Photos",
  audio: "Audio",
};

function positiveInteger(value: string): number | null {
  if (!/^\d+$/.test(value.trim())) return null;
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}

function dateTime(timestamp: number) {
  return new Date(timestamp * 1000).toLocaleString();
}

export function TaskDetailPage({ taskId }: { taskId: string }) {
  const toast = useToast();
  const { refetch: refetchGlobalTasks } = useTasks();
  const fetchTask = useCallback(
    () => api.get<TaskDetail>(`/api/tasks/${encodeURIComponent(taskId)}`),
    [taskId],
  );
  const {
    data: loadedTask,
    loading,
    error: loadError,
    refetch,
  } = usePolling(fetchTask, 5000, [taskId]);
  const task = loadedTask?.id === taskId ? loadedTask : null;
  const fetchActivity = useCallback(
    () =>
      api.get<ActivityEntry[]>(
        `/api/tasks/${encodeURIComponent(taskId)}/activity`,
      ),
    [taskId],
  );
  const { data: activity, error: activityError } = usePolling(
    fetchActivity,
    8000,
    [taskId],
  );
  const [busy, setBusy] = useState(false);
  const [confirmation, setConfirmation] = useState<"delete" | "cancel" | null>(
    null,
  );
  const [testCopyResult, setTestCopyResult] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);
  const [testingCopy, setTestingCopy] = useState(false);
  const [testMessageId, setTestMessageId] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editScope, setEditScope] = useState<TaskScope>("live");
  const [editStartId, setEditStartId] = useState("");
  const [editEndId, setEditEndId] = useState("");
  const [editCursor, setEditCursor] = useState("");
  const [resetProgress, setResetProgress] = useState(false);
  const [enableFilters, setEnableFilters] = useState(false);
  const [filterMediaTypes, setFilterMediaTypes] = useState<string[]>([]);
  const [minFileSizeMb, setMinFileSizeMb] = useState("");
  const [maxFileSizeMb, setMaxFileSizeMb] = useState("");

  function openEditModal() {
    if (!task) return;
    setEditLabel(task.label);
    setEditScope(task.scope);
    setEditStartId(task.start_id == null ? "" : String(task.start_id));
    setEditEndId(task.end_id == null ? "" : String(task.end_id));
    setEditCursor(task.cursor == null ? "" : String(task.cursor));
    setResetProgress(false);
    setEnableFilters(
      Boolean(
        task.filter_media_types ||
        task.filter_min_size_bytes != null ||
        task.filter_max_size_bytes != null,
      ),
    );
    setFilterMediaTypes(
      task.filter_media_types
        ?.split(",")
        .map((value) => value.trim())
        .filter(Boolean) ?? [],
    );
    setMinFileSizeMb(
      task.filter_min_size_bytes == null
        ? ""
        : String(task.filter_min_size_bytes / (1024 * 1024)),
    );
    setMaxFileSizeMb(
      task.filter_max_size_bytes == null
        ? ""
        : String(task.filter_max_size_bytes / (1024 * 1024)),
    );
    setEditError(null);
    setIsEditing(true);
  }

  async function refreshTasks() {
    await Promise.all([refetch(), refetchGlobalTasks()]);
  }

  async function patch(body: TaskAction, message: string) {
    if (busy) return;
    setBusy(true);
    const result = await api.patch<TaskSummary>(
      `/api/tasks/${encodeURIComponent(taskId)}`,
      body,
    );
    if (result.ok) {
      toast.show("success", message);
      setConfirmation(null);
      await refreshTasks();
    } else {
      toast.show("error", result.description);
    }
    setBusy(false);
  }

  async function handleSaveEdit() {
    if (!task || busy) return;
    setEditError(null);
    const wantsHistory = editScope !== "live";
    const wantsFilters = editScope !== "backfill_only" && enableFilters;
    const startId = wantsHistory ? positiveInteger(editStartId) : null;
    const endId = wantsHistory ? positiveInteger(editEndId) : null;
    const cursor =
      wantsHistory && editCursor.trim() && !resetProgress
        ? positiveInteger(editCursor)
        : null;
    if (wantsHistory && (startId == null || endId == null)) {
      setEditError(
        "Enter a positive whole number for the first and last message IDs.",
      );
      return;
    }
    if (startId != null && endId != null && startId > endId) {
      setEditError(
        "The last message ID must be the same as or greater than the first.",
      );
      return;
    }
    if (
      wantsHistory &&
      editCursor.trim() &&
      !resetProgress &&
      (cursor == null || cursor < startId! || cursor > endId! + 1)
    ) {
      setEditError(
        "The next message ID must fall within the range, or immediately after its last message.",
      );
      return;
    }
    const minBytes =
      wantsFilters && minFileSizeMb.trim()
        ? Math.round(Number(minFileSizeMb) * 1024 * 1024)
        : null;
    const maxBytes =
      wantsFilters && maxFileSizeMb.trim()
        ? Math.round(Number(maxFileSizeMb) * 1024 * 1024)
        : null;
    if (
      [minBytes, maxBytes].some(
        (value) => value != null && (!Number.isSafeInteger(value) || value < 0),
      )
    ) {
      setEditError("File sizes must be zero or a positive number.");
      return;
    }
    if (minBytes != null && maxBytes != null && minBytes > maxBytes) {
      setEditError("The maximum file size must be at least the minimum.");
      return;
    }
    setBusy(true);
    const result = await api.patch<TaskSummary>(
      `/api/tasks/${encodeURIComponent(taskId)}`,
      {
        label: editLabel.trim() || getTaskDisplayInfo(task).routeText,
        ...(editScope !== task.scope ? { scope: editScope } : {}),
        startId,
        endId,
        ...(cursor != null ? { cursor } : {}),
        resetProgress: wantsHistory && resetProgress,
        filterMediaTypes:
          wantsFilters && filterMediaTypes.length
            ? filterMediaTypes.join(",")
            : null,
        filterMinSizeBytes: minBytes,
        filterMaxSizeBytes: maxBytes,
      },
    );
    if (result.ok) {
      toast.show("success", "Task updated");
      setIsEditing(false);
      await refreshTasks();
    } else {
      setEditError(result.description);
    }
    setBusy(false);
  }

  async function runTestCopy() {
    if (!task || testingCopy) return;
    const messageId = testMessageId.trim()
      ? positiveInteger(testMessageId)
      : undefined;
    if (messageId === null) {
      setTestCopyResult({
        ok: false,
        message: "Enter a positive whole message ID, or leave the field empty.",
      });
      return;
    }
    setTestingCopy(true);
    setTestCopyResult(null);
    const result = await api.post<{ message_id: number }>(
      `/api/bots/${encodeURIComponent(task.bot_id)}/tasks/${encodeURIComponent(task.id)}/test-copy`,
      { messageId },
    );
    setTestCopyResult(
      result.ok
        ? {
            ok: true,
            message: `Copied to the destination as message ${result.data.message_id}.`,
          }
        : { ok: false, message: result.description },
    );
    setTestingCopy(false);
  }

  async function removeTask() {
    if (busy) return;
    setBusy(true);
    const result = await api.del(`/api/tasks/${encodeURIComponent(taskId)}`);
    if (result.ok) {
      toast.show("success", "Task deleted");
      await refetchGlobalTasks();
      navigate("");
    } else {
      toast.show("error", result.description);
    }
    setBusy(false);
  }

  if (!task) {
    return (
      <div className="content-container">
        <button className="button button-ghost" onClick={() => navigate("")}>
          <Icon name="arrow-left" />
          Tasks
        </button>
        <div className="card empty-state" aria-busy={loading}>
          <div className="empty-icon">
            <Icon name={loading ? "clock" : "alert"} />
          </div>
          <h1 className="card-title">
            {loading ? "Loading task…" : "Task unavailable"}
          </h1>
          <p className="text-muted">
            {loading
              ? "Getting the latest progress."
              : loadError || "This task may have been deleted."}
          </p>
          {!loading && (
            <button
              className="button button-secondary"
              onClick={() => void refetch()}
            >
              <Icon name="refresh" />
              Try again
            </button>
          )}
        </div>
      </div>
    );
  }

  const displayInfo = getTaskDisplayInfo(task);
  const hasHistory = task.scope !== "live";
  const hasLive = task.scope !== "backfill_only";
  const complete = task.backfill_status === "complete";
  const total = task.total ?? 0;
  const scanned = complete
    ? total
    : Math.min(
        total,
        Math.max(
          task.processed + task.failed,
          (task.cursor ?? task.start_id ?? 0) - (task.start_id ?? 0),
        ),
      );
  const progress =
    total > 0 ? Math.min(100, Math.round((scanned / total) * 100)) : 0;
  const historyRunning =
    task.backfill_status === "running" || task.backfill_status === "pending";
  const historyLabel = complete
    ? "Complete"
    : task.backfill_status === "cancelled"
      ? "Cancelled"
      : task.backfill_status === "failed"
        ? "Failed"
        : historyRunning
          ? "Copying"
          : "Paused";
  const hasFilters = Boolean(
    task.filter_media_types ||
    task.filter_min_size_bytes != null ||
    task.filter_max_size_bytes != null,
  );
  const retryBody: TaskAction = {
    ...(hasLive ? { liveEnabled: true } : {}),
    ...(hasHistory && !complete ? { backfillStatus: "running" as const } : {}),
  };

  return (
    <div className="content-container stack">
      <button className="button button-ghost" onClick={() => navigate("")}>
        <Icon name="arrow-left" />
        Tasks
      </button>
      <header className="page-header">
        <div className="page-heading">
          <h1 className="page-title">{displayInfo.title}</h1>
          <p className="page-description">{scopeLabels[task.scope]}</p>
        </div>
        <div className="page-actions">
          <button
            className="button button-secondary"
            onClick={openEditModal}
            disabled={busy}
          >
            <Icon name="edit" />
            Edit task
          </button>
        </div>
      </header>

      {loadError && (
        <div className="alert alert-error" role="status">
          Updates are unavailable. Showing the last loaded progress. {loadError}
        </div>
      )}
      {task.stop_reason && (
        <div className="alert alert-error" role="status">
          <div className="stack">
            <strong>Copying has stopped</strong>
            <p>{stopMessages[task.stop_reason]}</p>
            {task.stop_reason !== "rate_limited" && (
              <div>
                <button
                  className="button button-secondary button-sm"
                  disabled={busy}
                  onClick={() => void patch(retryBody, "Task restarted")}
                >
                  <Icon name="refresh" />
                  Retry task
                </button>
              </div>
            )}
          </div>
        </div>
      )}
      {task.rate_limited_until != null &&
        task.rate_limited_until > Date.now() / 1000 && (
          <div className="alert alert-info" role="status">
            Waiting for Telegram. Copying can continue after{" "}
            {dateTime(task.rate_limited_until)}.
          </div>
        )}

      <section className="card">
        <div className="card-body detail-grid">
          <div className="stack">
            <span className="text-muted">From</span>
            <strong>{task.source_chat_title || task.source_chat_id}</strong>
          </div>
          <div className="stack">
            <span className="text-muted">To</span>
            <strong>{task.dest_chat_title || task.dest_chat_id}</strong>
          </div>
        </div>
      </section>

      <div className={hasHistory && hasLive ? "detail-grid" : "stack"}>
        {hasHistory && (
          <section className="card">
            <header className="card-header">
              <h2 className="card-title">Existing messages</h2>
              <Badge
                variant={
                  task.stop_reason || task.backfill_status === "failed"
                    ? "failed"
                    : complete
                      ? "complete"
                      : historyRunning
                        ? "running"
                        : "paused"
                }
                label={task.stop_reason ? "Stopped" : historyLabel}
              />
            </header>
            <div className="card-body stack">
              <div className="stat-value">
                {task.processed.toLocaleString()}{" "}
                <span className="stat-label">copied</span>
              </div>
              <progress
                className="progress"
                max="100"
                value={progress}
                aria-label="Existing message range checked"
              />
              <p className="text-muted">
                {scanned.toLocaleString()} of {total.toLocaleString()} message
                IDs checked · {progress}%
              </p>
              {task.failed > 0 && (
                <p className="helper">
                  {task.failed.toLocaleString()} skipped or unavailable. Some
                  message IDs may be empty, deleted, or unable to be copied.
                </p>
              )}
              {!task.stop_reason && !complete && (
                <div className="row wrap">
                  <button
                    className={`button ${historyRunning ? "button-secondary" : "button-primary"}`}
                    disabled={busy}
                    onClick={() =>
                      void patch(
                        {
                          backfillStatus: historyRunning ? "paused" : "running",
                        },
                        historyRunning
                          ? "Existing messages paused"
                          : "Existing messages resumed",
                      )
                    }
                  >
                    <Icon name={historyRunning ? "pause" : "play"} />
                    {historyRunning ? "Pause" : "Resume"}
                  </button>
                  {task.backfill_status !== "cancelled" && (
                    <button
                      className="button button-ghost"
                      disabled={busy}
                      onClick={() => setConfirmation("cancel")}
                    >
                      Cancel copying
                    </button>
                  )}
                </div>
              )}
            </div>
          </section>
        )}
        {hasLive && (
          <section className="card">
            <header className="card-header">
              <h2 className="card-title">New messages</h2>
              <Badge
                variant={
                  task.stop_reason
                    ? "failed"
                    : task.live_enabled
                      ? "live"
                      : "paused"
                }
                label={
                  task.stop_reason
                    ? "Stopped"
                    : task.live_enabled
                      ? "Watching"
                      : "Paused"
                }
              />
            </header>
            <div className="card-body stack">
              <div className="stat-value">
                {task.live_processed.toLocaleString()}{" "}
                <span className="stat-label">copied</span>
              </div>
              <p className="text-muted">
                {task.live_enabled
                  ? "Checks for new messages every minute."
                  : "New messages are not being copied."}
              </p>
              {(task.pending_count ?? 0) > 0 && (
                <p className="helper">
                  {task.pending_count!.toLocaleString()} queued
                  {historyRunning
                    ? " while existing messages finish copying"
                    : " for copying"}
                  .
                </p>
              )}
              {task.live_skipped > 0 && (
                <p className="helper">
                  {task.live_skipped.toLocaleString()} skipped by your filters.
                </p>
              )}
              {task.live_failed > 0 && (
                <p className="helper">
                  {task.live_failed.toLocaleString()} could not be copied. See
                  recent activity for details.
                </p>
              )}
              {!task.stop_reason && (
                <div>
                  <button
                    className={`button ${task.live_enabled ? "button-secondary" : "button-primary"}`}
                    disabled={busy}
                    onClick={() =>
                      void patch(
                        { liveEnabled: !task.live_enabled },
                        task.live_enabled
                          ? "New messages paused"
                          : "New messages resumed",
                      )
                    }
                  >
                    <Icon name={task.live_enabled ? "pause" : "play"} />
                    {task.live_enabled ? "Pause" : "Resume"}
                  </button>
                </div>
              )}
            </div>
          </section>
        )}
      </div>

      <section className="card">
        <header className="card-header">
          <h2 className="card-title">Recent activity</h2>
        </header>
        <div className="card-body">
          {activityError && (
            <p className="error" role="status">
              Activity could not be refreshed. {activityError}
            </p>
          )}
          {!activity?.length ? (
            <p className="text-muted">No activity recorded yet.</p>
          ) : (
            <ul className="activity-list">
              {activity.slice(0, 8).map((entry) => {
                const filtered =
                  entry.error?.startsWith("Filtered:") ||
                  entry.detail?.includes("skipped:");
                const queued = entry.detail?.includes("Queued in buffer");
                return (
                  <li className="activity-row" key={entry.id}>
                    <Icon
                      name={
                        entry.ok
                          ? "check-circle"
                          : filtered
                            ? "filter"
                            : "alert"
                      }
                    />
                    <div className="activity-main">
                      <strong>
                        {filtered
                          ? "Skipped by filter"
                          : queued
                            ? "Message queued"
                            : entry.kind === "live_forward"
                              ? "New message"
                              : "Existing messages"}
                      </strong>
                      <p className="text-muted">
                        {entry.detail ||
                          (entry.ok
                            ? "Copied successfully"
                            : "Copy could not be completed")}
                      </p>
                      {entry.error && (
                        <p className={filtered ? "helper" : "error"}>
                          {entry.error}
                        </p>
                      )}
                    </div>
                    <time
                      className="activity-time"
                      dateTime={new Date(entry.at * 1000).toISOString()}
                    >
                      {dateTime(entry.at)}
                    </time>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>

      <details className="card disclosure">
        <summary>Task details and troubleshooting</summary>
        <div className="card-body stack">
          <dl className="detail-list">
            <div>
              <dt>Bot</dt>
              <dd>@{task.bot_username}</dd>
            </div>
            <div>
              <dt>Source chat ID</dt>
              <dd>{task.source_chat_id}</dd>
            </div>
            <div>
              <dt>Destination chat ID</dt>
              <dd>{task.dest_chat_id}</dd>
            </div>
            <div>
              <dt>Created</dt>
              <dd>{dateTime(task.created_at)}</dd>
            </div>
            {hasHistory && (
              <>
                <div>
                  <dt>Message range</dt>
                  <dd>
                    {task.start_id} to {task.end_id}
                  </dd>
                </div>
                <div>
                  <dt>Next message ID</dt>
                  <dd>{task.cursor ?? "Not started"}</dd>
                </div>
                <div>
                  <dt>Messages per batch</dt>
                  <dd>{task.pacing_batch_size}</dd>
                </div>
              </>
            )}
            {hasLive && (
              <div>
                <dt>New message filters</dt>
                <dd>
                  {hasFilters
                    ? [
                        task.filter_media_types
                          ?.split(",")
                          .map(
                            (type) => mediaLabels[type.trim()] || type.trim(),
                          )
                          .join(", ") || "All types",
                        task.filter_min_size_bytes != null
                          ? `Minimum ${formatBytes(task.filter_min_size_bytes)}`
                          : "",
                        task.filter_max_size_bytes != null
                          ? `Maximum ${formatBytes(task.filter_max_size_bytes)}`
                          : "",
                      ]
                        .filter(Boolean)
                        .join(" · ")
                    : "All messages"}
                </dd>
              </div>
            )}
            {task.stopped_at && (
              <div>
                <dt>Stopped</dt>
                <dd>{dateTime(task.stopped_at)}</dd>
              </div>
            )}
          </dl>
          <form
            className="stack"
            onSubmit={(event) => {
              event.preventDefault();
              void runTestCopy();
            }}
          >
            <h3 className="card-title">Test a copy</h3>
            <p className="helper">
              Sends a real copy to the destination. If you leave the ID empty,
              the bot posts a temporary message to the source to find the latest
              ID, then tries to delete it. Members may see a notification.
            </p>
            <div className="field">
              <label className="form-label" htmlFor="test-message-id">
                Message ID <span className="text-muted">(optional)</span>
              </label>
              <input
                id="test-message-id"
                className="input"
                inputMode="numeric"
                value={testMessageId}
                onChange={(event) => setTestMessageId(event.target.value)}
                placeholder="For example, 123"
              />
            </div>
            <div>
              <button
                className="button button-secondary"
                type="submit"
                disabled={testingCopy || busy}
              >
                <Icon name="send" />
                {testingCopy ? "Sending…" : "Send test copy"}
              </button>
            </div>
            {testCopyResult && (
              <p
                className={`alert ${testCopyResult.ok ? "alert-success" : "alert-error"}`}
                role="status"
              >
                {testCopyResult.message}
              </p>
            )}
          </form>
          {(activity?.length ?? 0) > 8 && (
            <details className="disclosure">
              <summary>More activity</summary>
              <ul className="activity-list">
                {activity!.slice(8).map((entry) => (
                  <li className="activity-row" key={entry.id}>
                    <div className="activity-main">
                      <p>{entry.detail || "Activity recorded"}</p>
                      {entry.error && <p className="error">{entry.error}</p>}
                    </div>
                    <time
                      className="activity-time"
                      dateTime={new Date(entry.at * 1000).toISOString()}
                    >
                      {dateTime(entry.at)}
                    </time>
                  </li>
                ))}
              </ul>
            </details>
          )}
          <div>
            <button
              className="button button-danger button-sm"
              disabled={busy}
              onClick={() => setConfirmation("delete")}
            >
              <Icon name="trash" />
              Delete task
            </button>
          </div>
        </div>
      </details>

      {isEditing && (
        <Modal
          title="Edit task"
          busy={busy}
          onClose={() => setIsEditing(false)}
          actions={
            <>
              <button
                className="button button-secondary"
                disabled={busy}
                onClick={() => setIsEditing(false)}
              >
                Cancel
              </button>
              <button
                className="button button-primary"
                type="submit"
                form="edit-task-form"
                disabled={busy}
              >
                {busy ? "Saving…" : "Save changes"}
              </button>
            </>
          }
        >
          <form
            id="edit-task-form"
            className="stack"
            onSubmit={(event) => {
              event.preventDefault();
              void handleSaveEdit();
            }}
          >
            {editError && (
              <p className="alert alert-error" role="alert">
                {editError}
              </p>
            )}
            <div className="field">
              <label className="form-label" htmlFor="edit-task-name">
                Task name
              </label>
              <input
                id="edit-task-name"
                className="input"
                maxLength={200}
                value={editLabel}
                onChange={(event) => setEditLabel(event.target.value)}
                placeholder={displayInfo.routeText}
              />
            </div>
            <div className="field">
              <label className="form-label" htmlFor="edit-task-scope">
                Messages to copy
              </label>
              <select
                id="edit-task-scope"
                className="select"
                value={editScope}
                onChange={(event) =>
                  setEditScope(event.target.value as TaskScope)
                }
              >
                <option value="live">New messages</option>
                <option value="live_and_backfill">
                  Existing and new messages
                </option>
                <option value="backfill_only">Existing messages</option>
              </select>
            </div>
            {editScope !== "live" && (
              <div className="stack">
                <div className="form-grid">
                  <div className="field">
                    <label className="form-label" htmlFor="edit-first-id">
                      First message ID
                    </label>
                    <input
                      id="edit-first-id"
                      className="input"
                      inputMode="numeric"
                      value={editStartId}
                      onChange={(event) => setEditStartId(event.target.value)}
                      required
                    />
                  </div>
                  <div className="field">
                    <label className="form-label" htmlFor="edit-last-id">
                      Last message ID
                    </label>
                    <input
                      id="edit-last-id"
                      className="input"
                      inputMode="numeric"
                      value={editEndId}
                      onChange={(event) => setEditEndId(event.target.value)}
                      required
                    />
                  </div>
                </div>
                <p className="helper">
                  The message ID is the final number in a Telegram message link.
                </p>
                <details className="disclosure">
                  <summary>Change copy progress</summary>
                  <div className="stack">
                    <div className="field">
                      <label className="form-label" htmlFor="edit-next-id">
                        Next message ID
                      </label>
                      <input
                        id="edit-next-id"
                        className="input"
                        inputMode="numeric"
                        disabled={resetProgress}
                        value={resetProgress ? editStartId : editCursor}
                        onChange={(event) => setEditCursor(event.target.value)}
                      />
                    </div>
                    <label className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={resetProgress}
                        onChange={(event) =>
                          setResetProgress(event.target.checked)
                        }
                      />
                      Restart from the first message
                    </label>
                    <p className="helper">
                      Restarting clears progress and can copy messages again.
                      Messages already in the destination stay there.
                    </p>
                  </div>
                </details>
              </div>
            )}
            {editScope !== "backfill_only" && (
              <details className="disclosure" open={enableFilters || undefined}>
                <summary>Filter new messages</summary>
                <div className="stack">
                  <p className="helper">
                    These filters apply to new messages only. Existing messages
                    are copied without filters.
                  </p>
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={enableFilters}
                      onChange={(event) =>
                        setEnableFilters(event.target.checked)
                      }
                    />
                    Use filters
                  </label>
                  {enableFilters && (
                    <>
                      <fieldset className="checkbox-group">
                        <legend className="form-label">Message types</legend>
                        {Object.entries(mediaLabels).map(([value, label]) => (
                          <label className="checkbox-label" key={value}>
                            <input
                              type="checkbox"
                              checked={filterMediaTypes.includes(value)}
                              onChange={(event) =>
                                setFilterMediaTypes((current) =>
                                  event.target.checked
                                    ? [...current, value]
                                    : current.filter((type) => type !== value),
                                )
                              }
                            />
                            {label}
                          </label>
                        ))}
                      </fieldset>
                      <p className="helper">
                        Leave all types unchecked to allow every type.
                      </p>
                      <div className="form-grid">
                        <div className="field">
                          <label className="form-label" htmlFor="edit-min-size">
                            Minimum size (MB)
                          </label>
                          <input
                            id="edit-min-size"
                            className="input"
                            inputMode="decimal"
                            value={minFileSizeMb}
                            onChange={(event) =>
                              setMinFileSizeMb(event.target.value)
                            }
                            placeholder="No minimum"
                          />
                        </div>
                        <div className="field">
                          <label className="form-label" htmlFor="edit-max-size">
                            Maximum size (MB)
                          </label>
                          <input
                            id="edit-max-size"
                            className="input"
                            inputMode="decimal"
                            value={maxFileSizeMb}
                            onChange={(event) =>
                              setMaxFileSizeMb(event.target.value)
                            }
                            placeholder="No maximum"
                          />
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </details>
            )}
          </form>
        </Modal>
      )}
      {confirmation && (
        <Modal
          title={
            confirmation === "delete"
              ? "Delete this task?"
              : "Cancel existing messages?"
          }
          busy={busy}
          onClose={() => setConfirmation(null)}
          actions={
            <>
              <button
                className="button button-secondary"
                disabled={busy}
                onClick={() => setConfirmation(null)}
              >
                Keep task
              </button>
              <button
                className="button button-danger"
                disabled={busy}
                onClick={() =>
                  confirmation === "delete"
                    ? void removeTask()
                    : void patch(
                        { backfillStatus: "cancelled" },
                        "Existing messages cancelled",
                      )
                }
              >
                {busy
                  ? "Saving…"
                  : confirmation === "delete"
                    ? "Delete task"
                    : "Cancel copying"}
              </button>
            </>
          }
        >
          <p className="confirmation-copy">
            {confirmation === "delete"
              ? `“${displayInfo.title}” will stop and be removed from your tasks. Messages already copied to Telegram will stay there.`
              : `Copying existing messages will stop. You can resume it later.${hasLive ? " New-message copying will continue if it is enabled." : ""}`}
          </p>
        </Modal>
      )}
    </div>
  );
}
