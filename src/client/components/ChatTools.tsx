import { useId, useState, type ReactNode } from "react";
import { api } from "../lib/api";
import { Icon } from "./Icon";
import { Modal } from "./Modal";
import { InfoTip } from "./InfoTip";

type Action = {
  action: string;
  label: string;
  description: string;
  success?: string;
  destructive?: boolean;
  body?: unknown;
};
function ToolOption({
  label,
  explanation,
  technical = false,
  children,
}: {
  label: string;
  explanation: string;
  technical?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="chat-tool-option">
      <div>
        <div className="info-label">
          <strong>{label}</strong>
          {technical && <InfoTip label={label}>{explanation}</InfoTip>}
        </div>
        {!technical && <p className="helper">{explanation}</p>}
      </div>
      {children}
    </div>
  );
}
export function ChatTools({
  botId,
  chatId,
}: {
  botId: string;
  chatId: string;
}) {
  const id = useId();
  const [userId, setUserId] = useState("");
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState("");
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState<Action | null>(null);
  async function run() {
    if (!confirm || busy) return;
    const action = confirm;
    setBusy(true);
    setError("");
    setResult("");
    const response = await api.post<{
      invite_link?: string;
      latestMessageId?: number;
      cleanupOk?: boolean;
    }>(
      `/api/chats/${encodeURIComponent(chatId)}/${action.action}?botId=${encodeURIComponent(botId)}`,
      action.body,
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
          : action.success || "Done."),
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
        More chat tools
      </summary>
      <div className="stack">
        <p className="helper">
          Optional tools for the chat you are copying from. These actions change
          Telegram directly.
        </p>
        <div className="chat-tool-grid">
          <ToolOption
            label="Find latest message ID"
            technical
            explanation="A message ID is the number at the end of its Telegram link. This check finds the most recent number by posting a temporary message and trying to delete it. Members may see a notification. You can avoid this by copying a message link yourself."
          >
            <button
              type="button"
              className="button button-secondary button-sm"
              onClick={() =>
                setConfirm({
                  action: "latest-message-id",
                  label: "Find latest message ID",
                  description:
                    "Post a temporary message in the source chat to find its latest message number? The bot will try to delete it afterwards. Members may receive a notification.",
                })
              }
            >
              Check latest ID
            </button>
          </ToolOption>
          <ToolOption
            label="Send a test message"
            explanation="Post a visible test in the source. It stays there until someone deletes it."
          >
            <button
              type="button"
              className="button button-secondary button-sm"
              onClick={() =>
                setConfirm({
                  action: "send-test-message",
                  label: "Send test message",
                  description:
                    "Send “Test message from Telegram Copy” to the source chat? It will remain there until someone deletes it.",
                  success: "Test message sent to the source chat.",
                  body: { text: "Test message from Telegram Copy" },
                })
              }
            >
              Send test
            </button>
          </ToolOption>
        </div>
        <details className="disclosure">
          <summary>Invite links</summary>
          <div className="stack">
            <ToolOption
              label="Create an invite link"
              explanation="Create a link people can use to join the source chat."
            >
              <button
                type="button"
                className="button button-secondary button-sm"
                onClick={() =>
                  setConfirm({
                    action: "invite-link",
                    label: "Create invite link",
                    description:
                      "Create a new link people can use to join the source chat?",
                  })
                }
              >
                Create link
              </button>
            </ToolOption>
            <div className="field">
              <label className="form-label" htmlFor={`${id}-link`}>
                Invite link to cancel
              </label>
              <p className="helper">
                Use a link created by this bot. People who already joined will
                stay in the chat.
              </p>
              <div className="row wrap">
                <input
                  className="input"
                  id={`${id}-link`}
                  value={link}
                  onChange={(event) => setLink(event.target.value)}
                  placeholder="https://t.me/+…"
                  type="url"
                />
                <button
                  type="button"
                  className="button button-secondary"
                  disabled={!link.trim()}
                  onClick={() =>
                    setConfirm({
                      action: "revoke-invite-link",
                      label: "Cancel invite link",
                      description:
                        "Stop this invite link from working? People who already joined will stay in the chat.",
                      success: "Invite link cancelled.",
                      destructive: true,
                      body: { inviteLink: link.trim() },
                    })
                  }
                >
                  Cancel link
                </button>
              </div>
            </div>
          </div>
        </details>
        <details className="disclosure">
          <summary>Manage a member</summary>
          <div className="stack">
            <div className="field">
              <label className="form-label" htmlFor={`${id}-member`}>
                Telegram user ID
              </label>
              <p className="helper">
                The person’s numeric ID, not their phone number or username.
                Check it before making changes.
              </p>
              <input
                className="input"
                id={`${id}-member`}
                inputMode="numeric"
                value={userId}
                onChange={(event) => setUserId(event.target.value.trim())}
                placeholder="Numeric user ID"
              />
            </div>
            <ToolOption
              label="Ban a member"
              explanation="Remove this person and prevent them from rejoining."
            >
              <button
                type="button"
                className="button button-secondary button-sm"
                disabled={!validUser}
                onClick={() =>
                  setConfirm({
                    action: "ban",
                    label: "Ban member",
                    description: `Remove user ${userId} and prevent them from rejoining the source chat?`,
                    success: "Member banned.",
                    destructive: true,
                    body: { userId: Number(userId) },
                  })
                }
              >
                Ban member
              </button>
            </ToolOption>
            <ToolOption
              label="Allow a member to rejoin"
              explanation="Remove the ban so this person can join again."
            >
              <button
                type="button"
                className="button button-secondary button-sm"
                disabled={!validUser}
                onClick={() =>
                  setConfirm({
                    action: "unban",
                    label: "Allow member to rejoin",
                    description: `Remove the ban for user ${userId}? They will be able to join again.`,
                    success: "Ban removed. This person can join again.",
                    body: { userId: Number(userId) },
                  })
                }
              >
                Remove ban
              </button>
            </ToolOption>
            <ToolOption
              label="Make an administrator"
              explanation="Allow this person to delete messages, invite people, and restrict members."
            >
              <button
                type="button"
                className="button button-secondary button-sm"
                disabled={!validUser}
                onClick={() =>
                  setConfirm({
                    action: "promote",
                    label: "Make administrator",
                    description: `Give user ${userId} permission to delete messages, invite people, and restrict members in the source chat?`,
                    success: "Administrator permissions updated.",
                    destructive: true,
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
            </ToolOption>
          </div>
        </details>
        {result && (
          <p className="alert alert-success tool-result" role="status">
            {result}
          </p>
        )}
        {error && (
          <p className="alert alert-error tool-result" role="alert">
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
                type="button"
                className="button button-secondary"
                disabled={busy}
                onClick={() => setConfirm(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className={`button ${confirm.destructive ? "button-danger" : "button-primary"}`}
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
