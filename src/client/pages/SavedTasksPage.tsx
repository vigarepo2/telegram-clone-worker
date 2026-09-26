import { useState } from "react";
import { api } from "../lib/api";
import { usePolling } from "../lib/usePolling";
import { useToast } from "../components/Toast";
import { PageHero } from "../components/PageHero";
import { Icon } from "../components/Icon";
import { Modal } from "../components/Modal";
import { InfoTip } from "../components/InfoTip";
import { SCOPE_LABELS } from "./TasksPage";
import type { SavedTaskSummary } from "../../shared/rpcTypes";
export function SavedTasksPage() {
  const { data, loading, error, refetch } = usePolling(
    () => api.get<SavedTaskSummary[]>("/api/saved-tasks"),
    15000,
  );
  const [remove, setRemove] = useState<SavedTaskSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  async function deleteSaved() {
    if (!remove) return;
    setBusy(true);
    const result = await api.del(`/api/saved-tasks/${remove.id}`);
    setBusy(false);
    if (!result.ok) {
      toast.show("error", result.description);
      return;
    }
    setRemove(null);
    toast.show("success", "Saved setup removed.");
    await refetch();
  }
  return (
    <div className="content-container">
      <PageHero
        title="Saved setups"
        subtitle="Keep useful choices ready for your next task."
      >
        <InfoTip label="Saved setups">
          A saved setup remembers your bot, chats, and message choices. It does
          not run by itself. Open one, review its choices, and start a new task
          when needed.
        </InfoTip>
      </PageHero>
      <section className="card">
        {error && (
          <div className="alert alert-error" role="alert">
            {error}
            <button
              className="button button-secondary"
              onClick={() => void refetch()}
            >
              Retry
            </button>
          </div>
        )}
        {loading && <div className="loading-state">Loading saved setups…</div>}
        {!loading && !error && !data?.length && (
          <div className="empty-state">
            <span className="empty-icon">
              <Icon name="save" size={30} />
            </span>
            <h2>No saved setups</h2>
            <p>
              Select “Save this setup” when creating a task. It will be ready
              here whenever you need it.
            </p>
            <a className="button button-primary" href="#wizard">
              Create a task
              <Icon name="arrow-right" />
            </a>
          </div>
        )}
        <div className="task-list">
          {data?.map((item) => (
            <article className="task-row" key={item.id}>
              <div className="task-icon">
                <Icon name="save" />
              </div>
              <div className="task-main">
                <h2 className="task-title">
                  {item.source_chat_title || item.source_chat_id}{" "}
                  <Icon name="arrow-right" size={17} />
                  {item.dest_chat_title || item.dest_chat_id}
                </h2>
                <div className="task-meta">
                  <span>@{item.bot_username}</span>
                  <span>{SCOPE_LABELS[item.scope]}</span>
                  {item.backfill_mode && (
                    <span>
                      {item.backfill_mode === "lastN"
                        ? `Last ${item.n ?? "saved"} message IDs`
                        : `IDs ${item.start_id}–${item.end_id}`}
                    </span>
                  )}
                </div>
              </div>
              <div className="task-actions">
                <div className="option-help">
                  <a
                    href={`#wizard/from/${item.id}`}
                    className="button button-secondary button-sm"
                  >
                    Use setup
                    <Icon name="arrow-right" size={15} />
                  </a>
                  <InfoTip label="Use setup">
                    Fill in a new task with these saved choices. Review the
                    message range before starting: copying a range again may
                    create duplicate messages.
                  </InfoTip>
                </div>
                <div className="option-help">
                  <button
                    className="icon-button"
                    aria-label="Remove saved setup"
                    onClick={() => setRemove(item)}
                  >
                    <Icon name="trash" />
                  </button>
                  <InfoTip label="Remove saved setup">
                    Delete this reusable set of choices. Its running tasks and
                    any messages already copied are not removed.
                  </InfoTip>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>
      {remove && (
        <Modal
          title="Remove saved setup?"
          busy={busy}
          onClose={() => setRemove(null)}
          actions={
            <>
              <button
                className="button button-secondary"
                onClick={() => setRemove(null)}
                disabled={busy}
              >
                Keep setup
              </button>
              <button
                className="button button-danger"
                onClick={() => void deleteSaved()}
                disabled={busy}
              >
                {busy ? "Removing…" : "Remove setup"}
              </button>
            </>
          }
        >
          <p>
            This removes the saved preferences. Your running tasks and copied
            messages will stay unchanged.
          </p>
        </Modal>
      )}
    </div>
  );
}
