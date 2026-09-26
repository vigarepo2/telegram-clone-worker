import { useState } from "react";
import {
  useTasks,
  getTaskDisplayInfo,
  isTaskActive,
} from "../lib/useTasksContext";
import { api } from "../lib/api";
import { usePolling } from "../lib/usePolling";
import { useToast } from "../components/Toast";
import { PageHero } from "../components/PageHero";
import { Icon } from "../components/Icon";
import { InfoTip } from "../components/InfoTip";
import { usePreferences, THEMES } from "../lib/themes";
import { Badge } from "../components/Badge";
import { ProgressBar } from "../components/ProgressBar";
import type { BotSummary, TaskSummary } from "../../shared/rpcTypes";
export const SCOPE_LABELS = {
  live: "New messages",
  live_and_backfill: "Existing + new messages",
  backfill_only: "Existing messages",
};
export function TasksPage({
  view = "active",
}: {
  view?: "active" | "paused" | "history";
}) {
  const context = useTasks();
  const { preferences, theme } = usePreferences();
  const recipe = THEMES.find((option) => option.id === theme)!;
  const toast = useToast();
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const { data: bots } = usePolling(
    () => api.get<BotSummary[]>("/api/bots"),
    30000,
  );
  const tasks =
    view === "active"
      ? context.activeTasks
      : view === "paused"
        ? context.pausedTasks
        : context.completedTasks;
  const displayed = tasks.filter((t) =>
    `${getTaskDisplayInfo(t).title} ${getTaskDisplayInfo(t).routeText}`
      .toLowerCase()
      .includes(query.trim().toLowerCase()),
  );
  const copied = context.tasks.reduce(
    (sum, t) => sum + (t.processed ?? 0) + (t.live_processed ?? 0),
    0,
  );
  async function toggle(task: TaskSummary) {
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
    setBusy(null);
    if (result.ok) {
      toast.show("success", active ? "Task paused." : "Task resumed.");
      await context.refetch();
    } else toast.show("error", result.description);
  }
  const title =
    view === "active"
      ? "Active tasks"
      : view === "paused"
        ? "Paused & attention"
        : "Task history";
  function renderTask(task: TaskSummary, index: number) {
    const display = getTaskDisplayInfo(task);
    const attention = !!task.stop_reason || task.backfill_status === "failed";
    return (
      <article className="task-row" key={task.id}>
        {recipe.taskLayout === "editorial" && (
          <span className="task-number" aria-hidden="true">
            {String(index + 1).padStart(2, "0")}
          </span>
        )}
        <div className="task-icon">
          <Icon name={task.scope === "backfill_only" ? "history" : "copy"} />
        </div>
        <div className="task-main">
          <div className="task-title">
            <a href={`#task/${task.id}`}>{display.title}</a>
            <Badge
              variant={
                attention
                  ? "failed"
                  : view === "paused"
                    ? "paused"
                    : view === "history"
                      ? task.backfill_status === "complete"
                        ? "complete"
                        : "idle"
                      : task.backfill_status === "running" ||
                          task.backfill_status === "pending"
                        ? "running"
                        : task.live_enabled
                          ? "live"
                          : "paused"
              }
            />
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
            <span>{new Date(task.created_at * 1000).toLocaleDateString()}</span>
          </div>
          {task.total != null &&
            task.total > 0 &&
            task.backfill_status !== "complete" && (
              <ProgressBar
                processed={task.processed}
                failed={task.failed}
                total={task.total}
              />
            )}
        </div>
        <div className="task-actions">
          {view !== "history" && !attention && (
            <button
              className="button button-secondary button-sm"
              disabled={busy === task.id}
              onClick={() => void toggle(task)}
            >
              <Icon name={view === "paused" ? "play" : "pause"} size={15} />
              {busy === task.id
                ? "Updating…"
                : view === "paused"
                  ? "Resume"
                  : "Pause"}
            </button>
          )}
          {view !== "history" && !attention && (
            <InfoTip label={isTaskActive(task) ? "Pause task" : "Resume task"}>
              {isTaskActive(task)
                ? "Stops this task from copying more messages. Anything already copied stays in Telegram. You can resume later."
                : "Continues copying from the saved position. Messages already waiting in this task stay in its queue."}
            </InfoTip>
          )}
          <a
            className="icon-button"
            href={`#task/${task.id}`}
            aria-label={`Open ${display.title}`}
          >
            <Icon name="arrow-right" />
          </a>
        </div>
      </article>
    );
  }
  const boardGroups =
    view === "active"
      ? [
          {
            title: "Copying history",
            description: "Working through existing messages",
            items: displayed.filter((task) =>
              ["running", "pending"].includes(task.backfill_status),
            ),
          },
          {
            title: "Watching for new messages",
            description: "Copying new posts as they arrive",
            items: displayed.filter(
              (task) => !["running", "pending"].includes(task.backfill_status),
            ),
          },
        ]
      : view === "paused"
        ? [
            {
              title: "Paused",
              description: "Ready when you want to continue",
              items: displayed.filter(
                (task) =>
                  !task.stop_reason && task.backfill_status !== "failed",
              ),
            },
            {
              title: "Needs your attention",
              description: "Open a task to see what needs fixing",
              items: displayed.filter(
                (task) => task.stop_reason || task.backfill_status === "failed",
              ),
            },
          ]
        : [
            {
              title: "Finished",
              description: "Selected message ranges are complete",
              items: displayed.filter(
                (task) => task.backfill_status === "complete",
              ),
            },
            {
              title: "Stopped",
              description: "Tasks you cancelled or stopped",
              items: displayed.filter(
                (task) => task.backfill_status !== "complete",
              ),
            },
          ];
  return (
    <div className="content-container tasks-page">
      <PageHero
        title={title}
        subtitle={
          view === "active"
            ? "Copying between your chats, all in one place."
            : view === "paused"
              ? "Resume a paused task or review one that needs attention."
              : "Completed and cancelled tasks stay here for reference."
        }
      >
        <a href="#wizard" className="button button-primary">
          <Icon name="plus" />
          New task
        </a>
        <InfoTip label="New task">
          Choose a Telegram bot, the chat to copy from, and the chat to copy to.
          You can check everything before copying starts.
        </InfoTip>
      </PageHero>
      {view === "active" && preferences.showTaskStats && (
        <div className="stat-grid">
          <div className="stat-card">
            <div className="stat-label">
              <Icon name="tasks" size={17} />
              Active tasks
            </div>
            <strong className="stat-value">
              {context.loading ? "—" : context.activeCount}
            </strong>
            <span className="stat-note">Currently copying or listening</span>
          </div>
          <div className="stat-card">
            <div className="stat-label">
              <Icon name="copy" size={17} />
              Messages copied
            </div>
            <strong className="stat-value">
              {context.loading ? "—" : copied.toLocaleString()}
            </strong>
            <span className="stat-note">Across your retained tasks</span>
          </div>
          <div className="stat-card">
            <div className="stat-label">
              <Icon name="bot" size={17} />
              Connected bots
            </div>
            <strong className="stat-value">{bots?.length ?? "—"}</strong>
            <a className="stat-note" href="#bots">
              Manage your bots <Icon name="arrow-right" size={13} />
            </a>
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
            Retry
          </button>
        </div>
      )}
      <section className="card task-list-card">
        <div className="card-header">
          <div>
            <h2 className="card-title">
              {view === "history" ? "Past tasks" : "Your tasks"}
            </h2>
            <p className="helper">
              {context.loading
                ? "Loading tasks…"
                : `${tasks.length} ${tasks.length === 1 ? "task" : "tasks"}`}
            </p>
          </div>
          {tasks.length > 0 && (
            <div className="task-search-tools">
              <div className="search-field">
                <Icon name="search" size={18} />
                <input
                  className="input"
                  aria-label="Search tasks"
                  placeholder="Search tasks"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
              <InfoTip label="Search tasks">
                Find a task by its name or either chat name. This only filters
                the list on this page; it does not change your tasks.
              </InfoTip>
            </div>
          )}
        </div>
        {context.loading && (
          <div className="loading-state" role="status">
            Loading your tasks…
          </div>
        )}
        {!context.loading && !context.error && tasks.length === 0 && (
          <div className="empty-state">
            <span className="empty-icon">
              <Icon
                name={
                  view === "active"
                    ? "copy"
                    : view === "paused"
                      ? "pause"
                      : "history"
                }
                size={30}
              />
            </span>
            <h2>
              {view === "active"
                ? "No active tasks"
                : view === "paused"
                  ? "Nothing on hold"
                  : "No past tasks yet"}
            </h2>
            <p>
              {view === "active"
                ? "Choose a bot, pick two chats, and decide which messages to copy."
                : view === "paused"
                  ? "Paused tasks and tasks needing a fix will appear here."
                  : "Finished tasks will appear here with their progress and activity."}
            </p>
            {view === "active" ? (
              <a href="#wizard" className="button button-primary">
                <Icon name="plus" />
                Create your first task
              </a>
            ) : (
              <a href="#" className="button button-secondary">
                View active tasks
              </a>
            )}
            {view === "active" && (
              <a href="#help" className="text-link">
                How it works <Icon name="arrow-right" size={14} />
              </a>
            )}
          </div>
        )}
        {!context.loading && tasks.length > 0 && displayed.length === 0 && (
          <div className="empty-state">
            <Icon name="search" size={26} />
            <h2>No matching tasks</h2>
            <button
              className="button button-secondary"
              onClick={() => setQuery("")}
            >
              Clear search
            </button>
          </div>
        )}
        {recipe.taskLayout === "board" && displayed.length > 0 ? (
          <div className="task-board">
            {boardGroups.map((group) => (
              <section
                className="task-board-column"
                key={group.title}
                aria-label={group.title}
              >
                <header className="task-board-heading">
                  <h3>
                    {group.title} <span>{group.items.length}</span>
                  </h3>
                  <p>{group.description}</p>
                </header>
                <div className="task-list">{group.items.map(renderTask)}</div>
                {group.items.length === 0 && (
                  <p className="board-empty">No tasks here.</p>
                )}
              </section>
            ))}
          </div>
        ) : (
          <div className="task-list">{displayed.map(renderTask)}</div>
        )}
      </section>
      {view === "active" && !context.loading && context.tasks.length === 0 && (
        <div className="quick-guide">
          <div>
            <span className="step-number">1</span>
            <h3>Connect a bot</h3>
            <p>Use a token from Telegram’s BotFather.</p>
          </div>
          <div>
            <span className="step-number">2</span>
            <h3>Choose your chats</h3>
            <p>Add your bot to the source and destination.</p>
          </div>
          <div>
            <span className="step-number">3</span>
            <h3>Start copying</h3>
            <p>Choose existing messages, new ones, or both.</p>
          </div>
        </div>
      )}
    </div>
  );
}
