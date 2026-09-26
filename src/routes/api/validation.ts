import { TelegramApiError } from "../../telegram/errors";

export const CHAT_ID = /^(?:-?[1-9]\d{0,15}|@[a-zA-Z][a-zA-Z0-9_]{3,31})$/;
export const BOT_TOKEN = /^\d{5,20}:[A-Za-z0-9_-]{20,100}$/;
const SCOPES = ["live", "live_and_backfill", "backfill_only"];
const MEDIA_TYPES = new Set([
  "text",
  "document",
  "photo",
  "video",
  "audio",
  "voice",
  "animation",
]);
export function invalid(description: string): Response {
  return Response.json(
    { ok: false, errorCode: 400, description, reason: "invalid_request" },
    { status: 400 },
  );
}
export function positiveInteger(
  value: unknown,
  max = 2_147_483_647,
): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value > 0 &&
    value <= max
  );
}
export function validText(value: unknown, max = 200): value is string {
  return (
    typeof value === "string" && value.trim().length > 0 && value.length <= max
  );
}
export function validChatId(value: unknown): value is string {
  return typeof value === "string" && CHAT_ID.test(value);
}
export function requireChatId(value: unknown): asserts value is string {
  if (!validChatId(value))
    throw new TelegramApiError({
      ok: false,
      error_code: 400,
      description: "Enter a channel username or a numeric chat ID.",
    });
}
export function validateTaskInput(
  body: Record<string, unknown>,
  partial = false,
): string | null {
  if (!partial) {
    if (!validChatId(body.sourceChatId) || !validChatId(body.destChatId))
      return "Enter valid source and destination chat IDs or @usernames.";
    if (
      String(body.sourceChatId).toLowerCase() ===
      String(body.destChatId).toLowerCase()
    )
      return "Choose different source and destination chats.";
  }
  if (
    (!partial || body.scope !== undefined) &&
    !SCOPES.includes(body.scope as string)
  )
    return "Choose what to copy.";
  for (const key of ["label", "botLabel", "sourceChatTitle", "destChatTitle"]) {
    if (body[key] !== undefined && !validText(body[key]))
      return "Names must contain between 1 and 200 characters.";
  }
  for (const key of ["startId", "endId", "cursor", "n"]) {
    if (
      body[key] !== undefined &&
      body[key] !== null &&
      !positiveInteger(body[key])
    )
      return "Message IDs and counts must be positive whole numbers.";
  }
  if (
    body.pacingBatchSize !== undefined &&
    !positiveInteger(body.pacingBatchSize, 100)
  )
    return "Batch size must be from 1 to 100.";
  for (const key of [
    "liveEnabled",
    "resetProgress",
    "allowDuplicate",
    "saveTemplate",
  ]) {
    if (body[key] !== undefined && typeof body[key] !== "boolean")
      return "Choose a valid on or off setting.";
  }
  if (
    body.backfillMode !== undefined &&
    !["range", "lastN"].includes(body.backfillMode as string)
  )
    return "Choose a message range or a recent message count.";
  if (!partial && body.scope !== "live") {
    if (body.backfillMode === "lastN") {
      if (!positiveInteger(body.n, 1_000_000))
        return "Enter a recent message count from 1 to 1,000,000.";
    } else if (
      !positiveInteger(body.startId) ||
      !positiveInteger(body.endId) ||
      body.startId > body.endId
    ) {
      return "Enter a valid first and last message ID.";
    }
  }
  if (body.filterMediaTypes !== undefined && body.filterMediaTypes !== null) {
    if (
      typeof body.filterMediaTypes !== "string" ||
      body.filterMediaTypes.length > 150 ||
      body.filterMediaTypes
        .split(",")
        .some((type) => !MEDIA_TYPES.has(type.trim()))
    )
      return "Choose supported message types.";
  }
  for (const key of ["filterMinSizeBytes", "filterMaxSizeBytes"]) {
    const size = body[key];
    if (
      size !== undefined &&
      size !== null &&
      (typeof size !== "number" || !Number.isSafeInteger(size) || size < 0)
    )
      return "File sizes must be non-negative whole numbers.";
  }
  if (
    body.filterMinSizeBytes != null &&
    body.filterMaxSizeBytes != null &&
    Number(body.filterMinSizeBytes) > Number(body.filterMaxSizeBytes)
  )
    return "Minimum file size cannot exceed maximum file size.";
  return null;
}
