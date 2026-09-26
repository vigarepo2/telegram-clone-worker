import { normalizeExtensionFilter } from "../../shared/mediaExtensions";
import { invalid, positiveInteger, validateTaskInput } from "./validation";
import { TelegramClient } from "../../telegram/client";
import { deriveCapabilities } from "../../telegram/capabilities";
import { TelegramApiError, toResult } from "../../telegram/errors";
import { resolveLastN } from "../../jobs/resolveRange";
import { createBotRecord } from "./bots";
import {
  findDuplicateTask,
  getSavedTask,
  getBotWithSecrets,
  getTask,
  getTaskWithBot,
  insertSavedTask,
  insertTask,
  listActivityLog,
  listAllTasksSummary,
  listTasksByBot,
  updateTaskStatus,
  updateTaskConfig,
  deleteTask,
} from "../../db/queries";
import type { BackfillStatus, TaskScope } from "../../shared/rpcTypes";

/** Sentinel path segment for POST /api/bots/:botId/tasks meaning "the bot
 * behind this task hasn't been saved yet — create it from botToken first."
 * Keeps the wizard from ever persisting a token before a task exists. */
const NEW_BOT_SENTINEL = "new";

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export async function handleListAllTasks(env: Env): Promise<Response> {
  const tasks = await listAllTasksSummary(env.DB);
  return json({ ok: true, data: tasks });
}

export async function handleListTasks(
  env: Env,
  botId: string,
): Promise<Response> {
  const tasks = await listTasksByBot(env.DB, botId);
  return json({ ok: true, data: tasks });
}

export async function handleGetTaskById(
  env: Env,
  taskId: string,
): Promise<Response> {
  const task = await getTaskWithBot(env.DB, taskId);
  if (!task)
    return json(
      {
        ok: false,
        errorCode: 404,
        description: "task not found",
        reason: "invalid_request",
      },
      404,
    );
  return json({ ok: true, data: task });
}

export async function handleGetTaskActivity(
  env: Env,
  taskId: string,
): Promise<Response> {
  const log = await listActivityLog(env.DB, taskId);
  return json({ ok: true, data: log });
}

interface CreateTaskBody {
  botToken?: string;
  savedTaskId?: string;
  botLabel?: string;
  sourceChatId: string;
  sourceChatTitle?: string;
  destChatId: string;
  destChatTitle?: string;
  destChatType?: string;
  scope: TaskScope;
  backfillMode?: "range" | "lastN";
  startId?: number;
  endId?: number;
  n?: number;
  pacingBatchSize?: number;
  label?: string;
  allowDuplicate?: boolean;
  saveTemplate?: boolean;
  filterMediaTypes?: string | null;
  filterExtensions?: string | null;
  filterMinSizeBytes?: number | null;
  filterMaxSizeBytes?: number | null;
}

/** Evidence-based default from diagnostics testing (channel destination,
 * copyMessages): 40 and 60 messages/call completed cleanly (~590ms/message
 * sustained), 80 and 100 both hit a 429 after ~47s, landing at roughly the
 * same ~79-80-message ceiling regardless of how many were requested beyond
 * it. 60 is the largest confirmed-clean value. Previously groups defaulted
 * to a more conservative 20 (Telegram's documented group guidance, never
 * separately measured) since a rate-limit hit or a single unforwardable
 * message used to stall a task indefinitely — now that tick.ts pauses and
 * retries on 429 (see RATE_LIMIT_COOLDOWN_*) and drops a batch instead of
 * stalling on an unforwardable message, it's safe to use the same number
 * for every destination and let Telegram's actual responses govern the
 * real per-bot throughput instead of pre-guessing conservatively by type. */
const DEFAULT_PACING_BATCH_SIZE = 60;

export async function handleCreateTask(
  request: Request,
  env: Env,
  botId: string,
  origin: string,
): Promise<Response> {
  const body = (await request.json()) as CreateTaskBody;
  if (body.savedTaskId !== undefined) {
    if (typeof body.savedTaskId !== "string")
      return invalid("Choose a valid saved preset.");
    const saved = await getSavedTask(env.DB, body.savedTaskId);
    if (!saved) return invalid("This preset no longer exists.");
    body.botToken = saved.bot_token;
    body.botLabel = saved.bot_label;
    botId = NEW_BOT_SENTINEL;
  }
  const validation = validateTaskInput(
    body as unknown as Record<string, unknown>,
  );
  if (validation) return invalid(validation);

  let resolvedBotId = botId;
  if (botId === NEW_BOT_SENTINEL) {
    if (!body.botToken) {
      return json(
        {
          ok: false,
          errorCode: 0,
          description: "botToken is required",
          reason: "invalid_request",
        },
        400,
      );
    }
    const created = await createBotRecord(
      env,
      origin,
      body.botToken,
      body.botLabel,
    );
    if (!created.ok) return json(created, 400);
    resolvedBotId = created.data.id;
  }

  const bot = await getBotWithSecrets(env.DB, resolvedBotId);
  if (!bot)
    return json(
      {
        ok: false,
        errorCode: 404,
        description: "bot not found",
        reason: "invalid_request",
      },
      404,
    );

  let duplicate = await findDuplicateTask(
    env.DB,
    resolvedBotId,
    body.sourceChatId,
    body.destChatId,
  );
  if (duplicate && !body.allowDuplicate) {
    return json(
      {
        ok: false,
        errorCode: 0,
        description: "a task with this source and destination already exists",
        reason: "invalid_request",
        duplicateTaskId: duplicate.id,
      },
      409,
    );
  }

  const wantsBackfill =
    body.scope === "live_and_backfill" || body.scope === "backfill_only";
  const wantsLive = body.scope === "live" || body.scope === "live_and_backfill";

  const client = new TelegramClient(bot.token);

  const result = await toResult(async () => {
    const notices: string[] = [];
    const [source, destination] = await Promise.all([
      client.getChat(body.sourceChatId),
      client.getChat(body.destChatId),
    ]);
    if (source.id === destination.id)
      throw new TelegramApiError({
        ok: false,
        error_code: 400,
        description: "Choose different source and destination chats.",
      });
    const [sourceMember, destinationMember] = await Promise.all([
      client.getChatMember(source.id, bot.bot_id),
      client.getChatMember(destination.id, bot.bot_id),
    ]);
    if (["left", "kicked"].includes(sourceMember.status))
      throw new TelegramApiError({
        ok: false,
        error_code: 403,
        description:
          "Add the bot to the source chat before starting this task.",
      });
    if (
      !deriveCapabilities(destinationMember, destination.type).some(
        (capability) =>
          capability.key === "send_message" && capability.available,
      )
    ) {
      throw new TelegramApiError({
        ok: false,
        error_code: 400,
        description:
          "The bot has not enough rights to post in the destination. Enable its posting permission in Telegram.",
      });
    }
    body.sourceChatId = String(source.id);
    body.destChatId = String(destination.id);
    body.sourceChatTitle = source.title || source.username || body.sourceChatId;
    body.destChatTitle =
      destination.title || destination.username || body.destChatId;
    duplicate = await findDuplicateTask(
      env.DB,
      resolvedBotId,
      body.sourceChatId,
      body.destChatId,
    );
    if (duplicate && !body.allowDuplicate)
      throw new TelegramApiError({
        ok: false,
        error_code: 409,
        description: "A task already copies between these chats.",
      });
    if (wantsLive) {
      const webhook = await client.getWebhookInfo();
      if (webhook.url)
        throw new TelegramApiError({
          ok: false,
          error_code: 409,
          description:
            "This bot is connected to another service. Use a dedicated bot or disconnect its webhook before starting live copying.",
        });
    }
    let startId = body.startId ?? null;
    let endId = body.endId ?? null;

    if (wantsBackfill && body.backfillMode === "lastN") {
      const resolved = await resolveLastN(
        client,
        body.sourceChatId,
        body.n ?? 1,
      );
      startId = resolved.startId;
      endId = resolved.endId;
      if (!resolved.cleanupOk)
        notices.push(
          "The temporary check message could not be removed from the source. Delete it in Telegram and give the bot permission to delete messages.",
        );
    }

    const id = crypto.randomUUID();
    const label =
      body.label ??
      `${body.sourceChatTitle ?? body.sourceChatId} → ${body.destChatTitle ?? body.destChatId}`;
    const pacingBatchSize = body.pacingBatchSize ?? DEFAULT_PACING_BATCH_SIZE;

    await insertTask(env.DB, {
      id,
      bot_id: resolvedBotId,
      label,
      source_chat_id: body.sourceChatId,
      source_chat_title: body.sourceChatTitle ?? null,
      dest_chat_id: body.destChatId,
      dest_chat_title: body.destChatTitle ?? null,
      scope: body.scope,
      live_enabled: wantsLive,
      backfill_mode: wantsBackfill ? (body.backfillMode ?? "range") : null,
      start_id: startId,
      end_id: endId,
      cursor: wantsBackfill ? startId : null,
      total:
        wantsBackfill && startId !== null && endId !== null
          ? endId - startId + 1
          : null,
      backfill_status: wantsBackfill ? "running" : "not_applicable",
      pacing_batch_size: pacingBatchSize,
      filter_media_types: body.filterMediaTypes ?? null,
      filter_extensions: body.filterExtensions
        ? normalizeExtensionFilter(body.filterExtensions)
        : null,
      filter_min_size_bytes: body.filterMinSizeBytes ?? null,
      filter_max_size_bytes: body.filterMaxSizeBytes ?? null,
    });

    if (body.saveTemplate) {
      // Best-effort: a saved-template write failure must not fail an
      // otherwise-successful task creation (no shared transaction here).
      try {
        await insertSavedTask(env.DB, {
          id: crypto.randomUUID(),
          task_id: id,
          bot_token: bot.token,
          bot_label: bot.label,
          bot_username: bot.bot_username,
          source_chat_id: body.sourceChatId,
          source_chat_title: body.sourceChatTitle ?? null,
          dest_chat_id: body.destChatId,
          dest_chat_title: body.destChatTitle ?? null,
          scope: body.scope,
          backfill_mode: wantsBackfill ? (body.backfillMode ?? "range") : null,
          start_id: startId,
          end_id: endId,
          n:
            wantsBackfill && body.backfillMode === "lastN"
              ? (body.n ?? null)
              : null,
          pacing_batch_size: pacingBatchSize,
          filter_media_types: body.filterMediaTypes ?? null,
          filter_extensions: body.filterExtensions
            ? normalizeExtensionFilter(body.filterExtensions)
            : null,
          filter_min_size_bytes: body.filterMinSizeBytes ?? null,
          filter_max_size_bytes: body.filterMaxSizeBytes ?? null,
        });
      } catch (e) {
        console.error("Saved preset could not be written.");
        notices.push(
          "Copying started, but the preset could not be saved. Save it again from the task page.",
        );
      }
    }

    const task = await getTask(env.DB, id);
    return task
      ? { ...task, ...(notices.length ? { notice: notices.join(" ") } : {}) }
      : null;
  });

  return json(
    !result.ok && duplicate
      ? { ...result, duplicateTaskId: duplicate.id }
      : result,
    result.ok ? 201 : result.errorCode === 409 ? 409 : 400,
  );
}

interface PatchTaskBody {
  label?: string;
  scope?: TaskScope;
  liveEnabled?: boolean;
  backfillStatus?: BackfillStatus;
  startId?: number | null;
  endId?: number | null;
  cursor?: number | null;
  resetProgress?: boolean;
  filterMediaTypes?: string | null;
  filterExtensions?: string | null;
  filterMinSizeBytes?: number | null;
  filterMaxSizeBytes?: number | null;
}

export async function handlePatchTask(
  request: Request,
  env: Env,
  taskId: string,
): Promise<Response> {
  const currentTask = await getTask(env.DB, taskId);
  if (!currentTask) {
    return json(
      {
        ok: false,
        errorCode: 404,
        description: "task not found",
        reason: "invalid_request",
      },
      404,
    );
  }

  const body = (await request.json()) as PatchTaskBody;
  const validation = validateTaskInput(
    body as unknown as Record<string, unknown>,
    true,
  );
  if (validation) return invalid(validation);
  if (
    body.backfillStatus !== undefined &&
    !["running", "paused", "cancelled"].includes(body.backfillStatus)
  )
    return invalid("Choose resume, pause, or cancel.");
  if (
    body.liveEnabled === true &&
    (body.scope ?? currentTask.scope) === "backfill_only"
  )
    return invalid("This task only copies earlier messages.");

  // Resolve target scope and enablement
  const targetScope = body.scope ?? currentTask.scope;
  let liveEnabled = body.liveEnabled;
  let backfillStatus = body.backfillStatus;

  if (body.scope !== undefined) {
    if (body.scope === "live") {
      liveEnabled = liveEnabled !== undefined ? liveEnabled : true;
      backfillStatus = "not_applicable";
    } else if (body.scope === "backfill_only") {
      liveEnabled = false;
      if (!backfillStatus) {
        backfillStatus =
          currentTask.backfill_status === "not_applicable"
            ? "running"
            : currentTask.backfill_status;
      }
    } else if (body.scope === "live_and_backfill") {
      liveEnabled = liveEnabled !== undefined ? liveEnabled : true;
      if (!backfillStatus) {
        backfillStatus =
          currentTask.backfill_status === "not_applicable"
            ? "running"
            : currentTask.backfill_status;
      }
    }
  }

  // Backfill bounds calculation
  let startId =
    body.startId !== undefined ? body.startId : currentTask.start_id;
  let endId = body.endId !== undefined ? body.endId : currentTask.end_id;
  let cursor = body.cursor !== undefined ? body.cursor : currentTask.cursor;
  let total = currentTask.total;

  if (targetScope !== "live") {
    if (!positiveInteger(startId) || !positiveInteger(endId))
      return invalid(
        "Enter both first and last message IDs before copying earlier messages.",
      );
    if (startId !== null && endId !== null) {
      if (startId > endId) {
        return json(
          {
            ok: false,
            errorCode: 400,
            description: "startId cannot be greater than endId",
            reason: "invalid_request",
          },
          400,
        );
      }
      total = endId - startId + 1;

      if (body.resetProgress) {
        cursor = startId;
        backfillStatus = "running";
      } else {
        // If startId increased past current cursor, bump cursor to startId
        if (cursor === null || cursor < startId) {
          cursor = startId;
        }
        // If endId increased past current cursor and task was complete, resume it
        if (
          cursor <= endId &&
          (currentTask.backfill_status === "complete" ||
            backfillStatus === "complete")
        ) {
          backfillStatus = "running";
        }
      }
    }
  }

  // Filter configuration
  let filterMediaTypes =
    body.filterMediaTypes !== undefined
      ? body.filterMediaTypes
      : currentTask.filter_media_types;
  let filterMinSizeBytes =
    body.filterMinSizeBytes !== undefined
      ? body.filterMinSizeBytes
      : currentTask.filter_min_size_bytes;
  let filterMaxSizeBytes =
    body.filterMaxSizeBytes !== undefined
      ? body.filterMaxSizeBytes
      : currentTask.filter_max_size_bytes;

  let filterExtensions =
    body.filterExtensions === undefined
      ? currentTask.filter_extensions
      : body.filterExtensions === null
        ? null
        : normalizeExtensionFilter(body.filterExtensions);
  if (
    targetScope === "backfill_only" &&
    body.filterExtensions &&
    filterExtensions
  ) {
    return invalid(
      "File filters apply only to new messages. Enable new-message copying to use them.",
    );
  }

  // Backfill only scope does not use filters
  if (targetScope === "backfill_only") {
    filterMediaTypes = null;
    filterExtensions = null;
    filterMinSizeBytes = null;
    filterMaxSizeBytes = null;
  }

  if (
    filterMinSizeBytes !== null &&
    filterMaxSizeBytes !== null &&
    filterMinSizeBytes > filterMaxSizeBytes
  )
    return invalid("Minimum file size cannot exceed maximum file size.");
  if (
    targetScope !== "live" &&
    cursor !== null &&
    (cursor < (startId ?? 1) || cursor > (endId ?? 0) + 1)
  )
    return invalid("The current message must be within the selected range.");
  await updateTaskConfig(env.DB, taskId, {
    label: body.label,
    scope: targetScope,
    live_enabled: liveEnabled,
    backfill_status: backfillStatus,
    start_id: startId,
    end_id: endId,
    cursor,
    total,
    reset_progress: body.resetProgress,
    filter_media_types: filterMediaTypes,
    filter_extensions: filterExtensions,
    filter_min_size_bytes: filterMinSizeBytes,
    filter_max_size_bytes: filterMaxSizeBytes,
  });

  const task = await getTask(env.DB, taskId);
  return json({ ok: true, data: task });
}

export async function handleDeleteTask(
  env: Env,
  taskId: string,
): Promise<Response> {
  await deleteTask(env.DB, taskId);
  return json({ ok: true, data: null });
}

export async function handleTestCopy(
  env: Env,
  botId: string,
  taskId: string,
  messageId?: number,
): Promise<Response> {
  const bot = await getBotWithSecrets(env.DB, botId);
  const task = await getTask(env.DB, taskId);
  if (!bot || !task || task.bot_id !== botId)
    return json(
      {
        ok: false,
        errorCode: 404,
        description: "not found",
        reason: "invalid_request",
      },
      404,
    );

  if (messageId !== undefined && !positiveInteger(messageId))
    return invalid("Enter a valid message ID.");
  const client = new TelegramClient(bot.token);
  const result = await toResult(async () => {
    let copyId = messageId;
    if (!copyId) {
      const latest = await resolveLastN(client, task.source_chat_id, 1);
      copyId = latest.endId;
    }
    return client.copyMessage(task.dest_chat_id, task.source_chat_id, copyId);
  });
  return json(result, result.ok ? 200 : 400);
}
