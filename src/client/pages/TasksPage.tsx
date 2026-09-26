import { useState } from "react";
import {
  useTasks,
  getTaskDisplayInfo,
  isTaskActive,
  isTaskCompleted,
} from "../lib/useTasksContext";
import { api } from "../lib/api";
import { useToast } from "../components/Toast";
import { PageHero } from "../components/PageHero";
import { Icon } from "../components/Icon";
import { usePreferences } from "../lib/preferences";
import { Badge, type BadgeVariant } from "../components/Badge";
import { ProgressBar } from "../components/ProgressBar";
import type { TaskSummary } from "../../shared/rpcTypes";
export const SCOPE_LABELS = {
  live: "New messages",
  live_and_backfill: "Existing + new messages",
  backfill_only: "Existing messages",
};
type TaskView = "all" | "active" | "paused" | "history";
export function TasksPage({ view = "all" }: { view?: TaskView }) {
  const context = useTasks();
  const { preferences } = usePreferences();
  const toast = useToast();
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const tasks =
    view === "all"
      ? context.tasks
      : view === "active"
        ? context.activeTasks
        : view === "paused"
          ? context.pausedTasks
          : context.completedTasks;
  const displayed = tasks.filter((task) =>
    `${getTaskDisplayInfo(task).title} ${getTaskDisplayInfo(task).routeText}`
      .toLowerCase()
      .includes(query.trim().toLowerCase()),
  );
  const copied = context.tasks.reduce(
    (sum, task) => sum + (task.processed ?? 0) + (task.live_processed ?? 0),
    0,
  );
  const tabs = [
    { id: "all", path: "", label: "All", count: context.tasks.length },
    {
      id: "active",
      path: "active",
      label: "Active",
      count: context.activeCount,
    },
    {
      id: "paused",
      path: "paused",
      label: "Paused",
      count: context.pausedCount,
    },
    {
      id: "history",
      path: "completed",
      label: "History",
      count: context.completedCount,
    },
  ];
  async function toggle(task: TaskSummary) {
    if (busy) return;
    setBusy(task.id);
    const active = isTaskActive(task);
    const patch: {
      liveEnabled?: boolean;
      backfillStatus?: "paused" | "running";
    } = {};
    if (active) {
      if (task.live_enabled) patch.liveEnabled = false;
      if (["running", "pending"].includes(task.backfill_status))
        patch.backfillStatus = "paused";
    } else {
      if (task.scope !== "backfill_only") patch.liveEnabled = true;
      if (task.backfill_status === "paused") patch.backfillStatus = "running";
    }
    const result = await api.patch(`/api/tasks/${task.id}`, patch);
    if (result.ok) {
      toast.show("success", active ? "Task paused." : "Task resumed.");
      await context.refetch();
    } else toast.show("error", result.description);
    setBusy(null);
  }
  function renderTask(task: TaskSummary) {
    const display = getTaskDisplayInfo(task);
    const attention = !!task.stop_reason || task.backfill_status === "failed";
    const active = isTaskActive(task);
    const finished = isTaskCompleted(task);
    const status: BadgeVariant = attention
      ? "failed"
      : finished
        ? task.backfill_status === "complete"
          ? "complete"
          : "idle"
        : active
          ? ["running", "pending"].includes(task.backfill_status)
            ? "running"
            : "live"
          : "paused";
    return (
      <article className="task-row" key={task.id}>
        <span className="task-icon">
          <Icon
            name={task.scope === "backfill_only" ? "history" : "copy"}
            size={21}
          />
        </span>
        <div className="task-main">
          <div className="task-title">
            <a href={`#task/${task.id}`}>{display.title}</a>
            <Badge variant={status} />
          </div>
          {display.isCustomLabel && (
            <p className="task-route">{display.routeText}</p>
          )}
          <div className="task-meta">
            <span>{SCOPE_LABELS[task.scope]}</span>
            <span>
              {(
                (task.processed ?? 0) + (task.live_processed ?? 0)
              ).toLocaleString()}{" "}
              copied
            </span>
          </div>
          {task.total != null && task.total > 0 && !finished && (
            <ProgressBar
              processed={task.processed}
              failed={task.failed}
              total={task.total}
            />
          )}
          {attention && (
            <p className="task-attention">
              Open this task to see what needs fixing.
            </p>
          )}
        </div>
        <div className="task-actions">
          {!finished && !attention && (
            <button
              className="button button-secondary button-sm"
              disabled={busy !== null}
              onClick={() => void toggle(task)}
            >
              <Icon name={active ? "pause" : "play"} size={16} />
              {busy === task.id ? "Updating…" : active ? "Pause" : "Resume"}
            </button>
          )}
          <a
            className={`button ${attention ? "button-primary" : "button-ghost"} button-sm`}
            href={`#task/${task.id}`}
            aria-label={`View ${display.title}`}
          >
            {attention ? "Review" : "Details"}
            <Icon name="chevron-right" size={15} />
          </a>
        </div>
      </article>
    );
  }
  const emptyTitle =
    view === "all"
      ? "Copy your first messages"
      : view === "active"
        ? "No active tasks"
        : view === "paused"
          ? "Nothing is paused"
          : "No finished tasks yet";
  const emptyCopy =
    view === "all"
      ? "Connect a bot, choose two chats, and start copying."
      : view === "active"
        ? "Start a new task or resume one from the Paused tab."
        : view === "paused"
          ? "Paused tasks and tasks that need attention appear here."
          : "Completed and stopped tasks will appear here.";
  return (
    <div className="content-container tasks-page">
      <PageHero
        title="Tasks"
        subtitle="Copy messages between your Telegram chats."
      >
        <a href="#wizard" className="button button-primary">
          <Icon name="plus" size={18} />
          New task
        </a>
      </PageHero>
      {preferences.showTaskStats && context.tasks.length > 0 && (
        <div className="task-overview" aria-label="Task totals">
          <div className="overview-stat">
            <span className="overview-icon">
              <Icon name="play" size={18} />
            </span>
            <div>
              <strong>{context.activeCount}</strong>
              <span>Active</span>
            </div>
          </div>
          <div className="overview-stat">
            <span className="overview-icon">
              <Icon name="pause" size={18} />
            </span>
            <div>
              <strong>{context.pausedCount}</strong>
              <span>Paused or needs attention</span>
            </div>
          </div>
          <div className="overview-stat">
            <span className="overview-icon">
              <Icon name="copy" size={18} />
            </span>
            <div>
              <strong>{copied.toLocaleString()}</strong>
              <span>Messages copied</span>
            </div>
          </div>
        </div>
      )}
      {context.error && (
        <div className="alert alert-error" role="alert">
          <Icon name="alert" />
          <span>{context.error}</span>
          <button
            className="button button-secondary button-sm"
            onClick={() => void context.refetch()}
          >
            Try again
          </button>
        </div>
      )}
      <section className="card task-list-card" aria-label="Your tasks">
        <div className="task-toolbar">
          <nav className="task-tabs" aria-label="Task views">
            {tabs.map((tab) => (
              <a
                key={tab.id}
                href={`#${tab.path}`}
                className={`task-tab${view === tab.id ? " is-active" : ""}`}
                aria-current={view === tab.id ? "page" : undefined}
              >
                {tab.label}
                <span>{tab.count}</span>
              </a>
            ))}
          </nav>
          {context.tasks.length > 0 && (
            <div className="search-field">
              <Icon name="search" size={18} />
              <input
                className="input"
                type="search"
                aria-label="Search tasks"
                placeholder="Search tasks…"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
          )}
        </div>
        {context.loading && (
          <div className="loading-state" role="status">
            Loading tasks…
          </div>
        )}
        {!context.loading && !context.error && tasks.length === 0 && (
          <div className="empty-state">
            <span className="empty-icon">
              <Icon
                name={
                  view === "history"
                    ? "history"
                    : view === "paused"
                      ? "pause"
                      : "copy"
                }
                size={30}
              />
            </span>
            <h2>{emptyTitle}</h2>
            <p>{emptyCopy}</p>
            {view === "all" && (
              <a href="#wizard" className="button button-primary">
                <Icon name="plus" />
                Create a task
              </a>
            )}
            <a href={view === "all" ? "#help" : "#"} className="text-link">
              {view === "all" ? "See how it works" : "View all tasks"}
              <Icon name="arrow-right" size={15} />
            </a>
          </div>
        )}
        {!context.loading && tasks.length > 0 && displayed.length === 0 && (
          <div className="empty-state">
            <Icon name="search" size={28} />
            <h2>No matching tasks</h2>
            <p>Try another name or chat.</p>
            <button
              className="button button-secondary"
              onClick={() => setQuery("")}
            >
              Clear search
            </button>
          </div>
        )}
        <div className="task-list">{displayed.map(renderTask)}</div>
      </section>
    </div>
  );
}
