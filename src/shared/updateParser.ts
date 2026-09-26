import type { TelegramUpdate } from "../telegram/types";
import { formatBytes } from "./messageFilter";

export interface ParsedBotActivity {
  update_id: number;
  kind:
    | "command"
    | "document"
    | "media"
    | "text"
    | "channel_post"
    | "member_event"
    | "other";
  icon: string;
  summary: string;
  chat_name: string;
  chat_type: string;
  sender_name?: string;
  date_iso?: string;
}

/**
 * Parses raw Telegram updates into intuitive, plain-English activity summaries.
 */
export function parseTelegramUpdate(update: TelegramUpdate): ParsedBotActivity {
  const msg = update.message ?? update.channel_post ?? update.edited_message;

  if (update.my_chat_member) {
    const mem = update.my_chat_member;
    const actor = mem.from.username
      ? `@${mem.from.username}`
      : mem.from.first_name;
    const chatTitle =
      mem.chat.title ??
      (mem.chat.username ? `@${mem.chat.username}` : `Chat #${mem.chat.id}`);
    return {
      update_id: update.update_id,
      kind: "member_event",
      icon: "user",
      summary: `Bot permissions changed to '${mem.new_chat_member.status}' by ${actor}`,
      chat_name: chatTitle,
      chat_type: mem.chat.type,
      sender_name: actor,
      date_iso: mem.date ? new Date(mem.date * 1000).toISOString() : undefined,
    };
  }

  if (update.chat_member) {
    const mem = update.chat_member;
    const targetUser = mem.new_chat_member.user.username
      ? `@${mem.new_chat_member.user.username}`
      : mem.new_chat_member.user.first_name;
    const chatTitle =
      mem.chat.title ??
      (mem.chat.username ? `@${mem.chat.username}` : `Chat #${mem.chat.id}`);
    return {
      update_id: update.update_id,
      kind: "member_event",
      icon: "users",
      summary: `User ${targetUser} became '${mem.new_chat_member.status}' in chat`,
      chat_name: chatTitle,
      chat_type: mem.chat.type,
      date_iso: mem.date ? new Date(mem.date * 1000).toISOString() : undefined,
    };
  }

  if (!msg) {
    return {
      update_id: update.update_id,
      kind: "other",
      icon: "activity",
      summary: "System notification or callback event",
      chat_name: "Unknown",
      chat_type: "unknown",
    };
  }

  const sender = msg.from
    ? msg.from.username
      ? `@${msg.from.username}`
      : msg.from.first_name
    : update.channel_post
      ? "Channel Post"
      : "Anonymous";

  const chatTitle =
    msg.chat.title ??
    (msg.chat.username ? `@${msg.chat.username}` : `Chat #${msg.chat.id}`);
  const isPost = Boolean(update.channel_post);
  const dateIso = msg.date
    ? new Date(msg.date * 1000).toISOString()
    : undefined;

  // 1. Bot Commands (e.g. /start, /copy, /help)
  if (msg.text?.startsWith("/")) {
    const parts = msg.text.trim().split(/\s+/);
    const cmd = parts[0];
    const args = parts.slice(1).join(" ");
    return {
      update_id: update.update_id,
      kind: "command",
      icon: "settings",
      summary: `Received command ${cmd}${args ? ` with arguments "${args.length > 30 ? `${args.slice(0, 30)}…` : args}"` : ""} from ${sender}`,
      chat_name: chatTitle,
      chat_type: msg.chat.type,
      sender_name: sender,
      date_iso: dateIso,
    };
  }

  // 2. Documents / Files
  if (msg.document) {
    const name = msg.document.file_name ?? "unnamed file";
    const sizeStr = msg.document.file_size
      ? ` (${formatBytes(msg.document.file_size)})`
      : "";
    return {
      update_id: update.update_id,
      kind: "document",
      icon: "file",
      summary: `Received file '${name}'${sizeStr} from ${sender}`,
      chat_name: chatTitle,
      chat_type: msg.chat.type,
      sender_name: sender,
      date_iso: dateIso,
    };
  }

  // 3. Videos
  if (msg.video) {
    const sizeStr = msg.video.file_size
      ? ` (${formatBytes(msg.video.file_size)})`
      : "";
    const durStr = msg.video.duration ? ` [${msg.video.duration}s]` : "";
    return {
      update_id: update.update_id,
      kind: "media",
      icon: "video",
      summary: `Received video${durStr}${sizeStr} from ${sender}`,
      chat_name: chatTitle,
      chat_type: msg.chat.type,
      sender_name: sender,
      date_iso: dateIso,
    };
  }

  // 4. Photos
  if (msg.photo && msg.photo.length > 0) {
    const captionSnippet = msg.caption
      ? `: "${msg.caption.length > 40 ? `${msg.caption.slice(0, 40)}…` : msg.caption}"`
      : "";
    return {
      update_id: update.update_id,
      kind: "media",
      icon: "photo",
      summary: `Received photo${captionSnippet} from ${sender}`,
      chat_name: chatTitle,
      chat_type: msg.chat.type,
      sender_name: sender,
      date_iso: dateIso,
    };
  }

  // 5. Audio / Voice / Animation
  if (msg.audio) {
    const name = msg.audio.file_name ?? "audio track";
    const sizeStr = msg.audio.file_size
      ? ` (${formatBytes(msg.audio.file_size)})`
      : "";
    return {
      update_id: update.update_id,
      kind: "media",
      icon: "audio",
      summary: `Received audio '${name}'${sizeStr} from ${sender}`,
      chat_name: chatTitle,
      chat_type: msg.chat.type,
      sender_name: sender,
      date_iso: dateIso,
    };
  }

  if (msg.voice) {
    const durStr = msg.voice.duration ? ` (${msg.voice.duration}s)` : "";
    return {
      update_id: update.update_id,
      kind: "media",
      icon: "microphone",
      summary: `Received voice message${durStr} from ${sender}`,
      chat_name: chatTitle,
      chat_type: msg.chat.type,
      sender_name: sender,
      date_iso: dateIso,
    };
  }

  if (msg.animation) {
    return {
      update_id: update.update_id,
      kind: "media",
      icon: "animation",
      summary: `Received GIF / animation from ${sender}`,
      chat_name: chatTitle,
      chat_type: msg.chat.type,
      sender_name: sender,
      date_iso: dateIso,
    };
  }

  // 6. Plain Text / Channel Posts
  const rawText = msg.text ?? msg.caption ?? "";
  const snippet = rawText.length > 60 ? `${rawText.slice(0, 60)}…` : rawText;

  if (isPost) {
    return {
      update_id: update.update_id,
      kind: "channel_post",
      icon: "channel",
      summary: snippet
        ? `Published channel post: "${snippet}"`
        : "Published channel post",
      chat_name: chatTitle,
      chat_type: msg.chat.type,
      date_iso: dateIso,
    };
  }

  return {
    update_id: update.update_id,
    kind: "text",
    icon: "message",
    summary: snippet
      ? `Message from ${sender}: "${snippet}"`
      : `Message received from ${sender}`,
    chat_name: chatTitle,
    chat_type: msg.chat.type,
    sender_name: sender,
    date_iso: dateIso,
  };
}
