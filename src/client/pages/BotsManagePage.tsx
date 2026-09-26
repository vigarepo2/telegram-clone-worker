import { useState, type FormEvent } from "react";
import { api } from "../lib/api";
import { usePolling } from "../lib/usePolling";
import { useTasks } from "../lib/useTasksContext";
import { useToast } from "../components/Toast";
import { PageHero } from "../components/PageHero";
import { BotActivityModal } from "../components/BotActivityModal";
import { Modal } from "../components/Modal";
import { Icon } from "../components/Icon";
import type { BotSummary, TaskSummary } from "../../shared/rpcTypes";
export function BotsManagePage() {
  const {
    data: bots,
    loading,
    error,
    refetch,
  } = usePolling(() => api.get<BotSummary[]>("/api/bots"), 15000);
  const tasks = useTasks();
  const toast = useToast();
  const [connect, setConnect] = useState(false);
  const [token, setToken] = useState("");
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");
  const [rename, setRename] = useState<BotSummary | null>(null);
  const [remove, setRemove] = useState<{
    bot: BotSummary;
    count: number;
  } | null>(null);
  const [inspect, setInspect] = useState<BotSummary | null>(null);
  async function save(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setFormError("");
    const result = rename
      ? await api.patch(`/api/bots/${rename.id}`, { label: label.trim() })
      : await api.post<BotSummary>("/api/bots", {
          token: token.trim(),
          label: label.trim() || undefined,
        });
    setBusy(false);
    if (!result.ok) {
      setFormError(result.description);
      return;
    }
    setConnect(false);
    setRename(null);
    setToken("");
    setLabel("");
    toast.show("success", rename ? "Bot name updated." : "Bot connected.");
    await refetch();
  }
  async function prepareRemove(bot: BotSummary) {
    if (busy) return;
    setBusy(true);
    const result = await api.get<TaskSummary[]>(`/api/bots/${bot.id}/tasks`);
    setBusy(false);
    if (!result.ok) {
      toast.show("error", result.description);
      return;
    }
    setRemove({ bot, count: result.data.length });
  }
  async function deleteBot() {
    if (!remove || busy) return;
    setBusy(true);
    const result = await api.del(`/api/bots/${remove.bot.id}`);
    setBusy(false);
    if (!result.ok) {
      toast.show("error", result.description);
      return;
    }
    setRemove(null);
    toast.show("success", "Bot and its tasks removed.");
    await Promise.all([refetch(), tasks.refetch()]);
  }
  return (
    <div className="content-container">
      <PageHero
        title="Bots"
        subtitle="Connect the bots you use to copy messages."
      >
        <div className="option-help">
          <button
            className="button button-primary"
            disabled={busy}
            onClick={() => {
              setConnect(true);
              setLabel("");
              setToken("");
              setFormError("");
            }}
          >
            <Icon name="plus" />
            Connect bot
          </button>
        </div>
      </PageHero>
      {error && (
        <div className="alert alert-error" role="alert">
          {error}
          <button
            className="button button-secondary button-sm"
            onClick={() => void refetch()}
          >
            Retry
          </button>
        </div>
      )}
      <section className="card">
        {loading && <div className="loading-state">Loading bots…</div>}
        {!loading && !error && !bots?.length && (
          <div className="empty-state">
            <span className="empty-icon">
              <Icon name="bot" size={30} />
            </span>
            <h2>Connect your first bot</h2>
            <p>
              Create a bot with BotFather in Telegram, then paste its token
              here.
            </p>
            <button
              className="button button-primary"
              onClick={() => setConnect(true)}
            >
              Connect bot
              <Icon name="arrow-right" />
            </button>
          </div>
        )}
        <div className="task-list">
          {bots?.map((bot) => (
            <article className="task-row" key={bot.id}>
              <div className="task-icon">
                <Icon name="bot" />
              </div>
              <div className="task-main">
                <h2 className="task-title">{bot.label || bot.bot_username}</h2>
                <div className="task-meta">
                  <a
                    href={`https://t.me/${bot.bot_username}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    @{bot.bot_username}
                  </a>
                  <span>
                    {tasks.tasks.filter((t) => t.bot_id === bot.id).length}{" "}
                    tasks
                  </span>
                  <span>
                    Added {new Date(bot.created_at * 1000).toLocaleDateString()}
                  </span>
                </div>
              </div>
              <div className="task-actions">
                <div className="option-help">
                  <button
                    className="button button-secondary button-sm"
                    disabled={busy}
                    onClick={() => setInspect(bot)}
                  >
                    <Icon name="history" size={16} />
                    Status
                  </button>
                </div>
                <div className="option-help">
                  <button
                    className="icon-button"
                    aria-label={`Rename ${bot.label || bot.bot_username}`}
                    disabled={busy}
                    onClick={() => {
                      setRename(bot);
                      setLabel(bot.label);
                      setFormError("");
                    }}
                  >
                    <Icon name="edit" />
                  </button>
                </div>
                <div className="option-help">
                  <button
                    className="icon-button"
                    aria-label={`Remove ${bot.label || bot.bot_username}`}
                    disabled={busy}
                    onClick={() => void prepareRemove(bot)}
                  >
                    <Icon name="trash" />
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>
      <div className="helper row">
        <Icon name="info" size={16} />
        <span>
          To copy channel messages, add your bot as an administrator in both
          chats.
        </span>
      </div>
      {(connect || rename) && (
        <Modal
          title={rename ? "Rename bot" : "Connect a Telegram bot"}
          busy={busy}
          onClose={() => {
            setConnect(false);
            setRename(null);
            setToken("");
          }}
        >
          <form className="stack" onSubmit={save}>
            {!rename && (
              <>
                <p className="text-muted">
                  Open{" "}
                  <a
                    href="https://t.me/BotFather"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    BotFather
                  </a>{" "}
                  in Telegram and use /newbot to get a token.
                </p>
                <div className="field">
                  <label className="form-label" htmlFor="bot-token">
                    Bot token
                  </label>
                  <input
                    id="bot-token"
                    className="input"
                    type="password"
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    autoComplete="off"
                    spellCheck={false}
                    autoCapitalize="none"
                    aria-describedby="bot-token-help"
                    required
                    disabled={busy}
                  />
                  <p className="helper" id="bot-token-help">
                    Paste the whole token from BotFather. It stays on your
                    deployment and is not shown after saving.
                  </p>
                </div>
              </>
            )}
            <div className="field">
              <label className="form-label" htmlFor="bot-name">
                Name {rename ? "" : "(optional)"}
              </label>
              <input
                id="bot-name"
                className="input"
                value={label}
                maxLength={120}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="For example, News channel"
                aria-describedby="bot-name-help"
                required={!!rename}
                disabled={busy}
              />
              <p className="helper" id="bot-name-help">
                A name for this website. Your bot’s Telegram name stays the
                same.
              </p>
            </div>
            {formError && (
              <div className="alert alert-error" role="alert">
                {formError}
              </div>
            )}
            <div className="dialog-actions">
              <button
                type="button"
                className="button button-secondary"
                disabled={busy}
                onClick={() => {
                  setConnect(false);
                  setRename(null);
                  setToken("");
                }}
              >
                Cancel
              </button>
              <button className="button button-primary" disabled={busy}>
                {busy ? "Saving…" : rename ? "Save name" : "Connect bot"}
              </button>
            </div>
          </form>
        </Modal>
      )}
      {remove && (
        <Modal
          title="Remove this bot?"
          busy={busy}
          onClose={() => setRemove(null)}
          actions={
            <>
              <button
                className="button button-secondary"
                disabled={busy}
                onClick={() => setRemove(null)}
              >
                Keep bot
              </button>
              <button
                className="button button-danger"
                disabled={busy}
                onClick={() => void deleteBot()}
              >
                {busy ? "Removing…" : "Remove bot"}
              </button>
            </>
          }
        >
          <p>
            This will remove <strong>@{remove.bot.bot_username}</strong> and
            permanently delete its{" "}
            <strong>
              {remove.count} {remove.count === 1 ? "task" : "tasks"}
            </strong>
            .
          </p>
          <p className="text-muted">
            Copies already in Telegram will stay there. The Telegram bot itself
            is not deleted.
          </p>
        </Modal>
      )}
      {inspect && (
        <BotActivityModal
          botId={inspect.id}
          botUsername={inspect.bot_username}
          onClose={() => setInspect(null)}
          onWebhookDisconnected={() => void refetch()}
        />
      )}
    </div>
  );
}
