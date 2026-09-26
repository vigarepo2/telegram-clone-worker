export type NormalizedChatInput =
  { ok: true; value: string } | { ok: false; error: string };

const CHAT_ID = /^(?:-?[1-9]\d{0,15}|@[a-zA-Z][a-zA-Z0-9_]{3,31})$/;
const USERNAME = /^[a-zA-Z][a-zA-Z0-9_]{3,31}$/;
const NUMBER = /^[1-9]\d*$/;

/** Extract a chat identifier from a Telegram chat or message link; never fetch the URL. */
export function normalizeChatInput(input: string): NormalizedChatInput {
  const value = input.trim();
  if (CHAT_ID.test(value)) return { ok: true, value };
  const invalid = {
    ok: false,
    error:
      "Enter an @username, numeric chat ID, or a Telegram chat or message link.",
  } as const;
  if (!value) return invalid;

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return invalid;
  }
  if (
    url.protocol !== "https:" ||
    url.hostname !== "t.me" ||
    url.port ||
    url.username ||
    url.password
  ) {
    return {
      ok: false,
      error:
        "Use a Telegram link beginning with https://t.me/. Links from other websites are not supported.",
    };
  }

  const parts = url.pathname.replace(/\/$/, "").split("/").slice(1);
  if (parts[0] === "joinchat" || parts[0]?.startsWith("+")) {
    return {
      ok: false,
      error:
        "Invite links cannot identify a chat for this bot. Add the bot, then paste a message link from that chat or its numeric ID.",
    };
  }
  if (parts[0] === "c") {
    if (
      parts.length !== 3 ||
      !NUMBER.test(parts[1]) ||
      !NUMBER.test(parts[2])
    ) {
      return {
        ok: false,
        error:
          "Paste a complete private-chat message link, such as https://t.me/c/1234567890/123.",
      };
    }
    const chatId = `-100${parts[1]}`;
    return CHAT_ID.test(chatId) ? { ok: true, value: chatId } : invalid;
  }
  if (
    (parts.length === 1 || (parts.length === 2 && NUMBER.test(parts[1]))) &&
    USERNAME.test(parts[0])
  ) {
    return { ok: true, value: `@${parts[0]}` };
  }
  return invalid;
}
