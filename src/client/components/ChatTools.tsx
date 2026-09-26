import { useState } from "react";
import { api } from "../lib/api";
import { Icon } from "./Icon";
import { Modal } from "./Modal";
export function ChatTools({
  botId,
  chatId,
}: {
  botId: string;
  chatId: string;
}) {
  const [userId, setUserId] = useState("");
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState("");
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState<{
    action: string;
    label: string;
    description: string;
    body?: unknown;
  } | null>(null);
  async function run() {
    if (!confirm) return;
    setBusy(true);
    setError("");
    setResult("");
    const response = await api.post<{
      invite_link?: string;
      latestMessageId?: number;
      cleanupOk?: boolean;
    }>(
      `/api/chats/${encodeURIComponent(chatId)}/${confirm.action}?botId=${encodeURIComponent(botId)}`,
      confirm.body,
    );
    setBusy(false);
    setConfirm(null);
    if (!response.ok) {
      setError(response.description);
      return;
    }
    setResult(
      response.data?.invite_link ||
        (response.data?.latestMessageId != null
          ? `Latest message ID: ${response.data.latestMessageId}.${response.data.cleanupOk === false ? " The temporary message could not be deleted. Remove it in Telegram." : ""}`
          : `${confirm.label} completed.`),
    );
  }
  const validUser =
    /^\d+$/.test(userId) &&
    Number.isSafeInteger(Number(userId)) &&
    Number(userId) > 0;
  return (
    <details className="advanced-section">
      <summary>
        <Icon name="settings" size={17} />
        Chat tools
      </summary>
      <div className="stack">
        <p className="helper">
          Optional actions for this source chat. Changes take effect in
          Telegram.
        </p>
        <div className="row wrap">
          <button
            className="button button-secondary button-sm"
            onClick={() =>
              setConfirm({
                action: "invite-link",
                label: "Create invite link",
                description: "Create a new invite link for this source chat?",
              })
            }
          >
            Create invite link
          </button>
          <button
            className="button button-secondary button-sm"
            onClick={() =>
              setConfirm({
                action: "send-test-message",
                label: "Send test message",
                description: "Send a visible test message to this source chat?",
                body: { text: "Test message from Telegram Copy" },
              })
            }
          >
            Send test message
          </button>
          <button
            className="button button-secondary button-sm"
            onClick={() =>
              setConfirm({
                action: "latest-message-id",
                label: "Find latest message ID",
                description:
                  "This sends a temporary message to the source chat, reads its ID, then tries to delete it. Members may see a notification.",
              })
            }
          >
            Find latest message ID
          </button>
        </div>
        <div className="field">
          <label className="form-label" htmlFor="revoke-link">
            Invite link to revoke
          </label>
          <div className="row">
            <input
              className="input"
              id="revoke-link"
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder="https://t.me/+…"
            />
            <button
              className="button button-secondary"
              disabled={!link.trim()}
              onClick={() =>
                setConfirm({
                  action: "revoke-invite-link",
                  label: "Revoke link",
                  description:
                    "Revoke this invite link? Anyone using it will no longer be able to join.",
                  body: { inviteLink: link.trim() },
                })
              }
            >
              Revoke
            </button>
          </div>
        </div>
        <div className="field">
          <label className="form-label" htmlFor="member-id">
            Telegram user ID
          </label>
          <input
            className="input"
            id="member-id"
            inputMode="numeric"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
          />
          <div className="row wrap">
            <button
              className="button button-secondary button-sm"
              disabled={!validUser}
              onClick={() =>
                setConfirm({
                  action: "ban",
                  label: "Ban user",
                  description: `Ban user ${userId} from this chat?`,
                  body: { userId: Number(userId) },
                })
              }
            >
              Ban user
            </button>
            <button
              className="button button-secondary button-sm"
              disabled={!validUser}
              onClick={() =>
                setConfirm({
                  action: "unban",
                  label: "Unban user",
                  description: `Allow user ${userId} to rejoin this chat?`,
                  body: { userId: Number(userId) },
                })
              }
            >
              Unban user
            </button>
            <button
              className="button button-secondary button-sm"
              disabled={!validUser}
              onClick={() =>
                setConfirm({
                  action: "promote",
                  label: "Make administrator",
                  description: `Give user ${userId} permission to delete messages, invite users, and restrict members?`,
                  body: {
                    userId: Number(userId),
                    rights: {
                      can_delete_messages: true,
                      can_invite_users: true,
                      can_restrict_members: true,
                    },
                  },
                })
              }
            >
              Make administrator
            </button>
          </div>
        </div>
        {result && (
          <p className="alert alert-success" role="status">
            {result}
          </p>
        )}
        {error && (
          <p className="alert alert-error" role="alert">
            {error}
          </p>
        )}
      </div>
      {confirm && (
        <Modal
          title={confirm.label}
          busy={busy}
          onClose={() => setConfirm(null)}
          actions={
            <>
              <button
                className="button button-secondary"
                disabled={busy}
                onClick={() => setConfirm(null)}
              >
                Cancel
              </button>
              <button
                className="button button-primary"
                disabled={busy}
                onClick={() => void run()}
              >
                {busy ? "Working…" : confirm.label}
              </button>
            </>
          }
        >
          <p>{confirm.description}</p>
        </Modal>
      )}
    </details>
  );
}
