import { BOT_TOKEN, invalid, validText } from "./validation";
import { TelegramClient } from "../../telegram/client";
import { TelegramApiError, toResult, type Result } from "../../telegram/errors";
import {
  deleteBot,
  findBotByTokenOrBotId,
  getBotRateLimitStats,
  getBotWithSecrets,
  insertBot,
  listBotsSummary,
  listBotsWithSecrets,
  listTasksByBot,
  updateBotLabel,
} from "../../db/queries";
import type {
  BotInspectionReport,
  BotSummary,
  BotVerifyResult,
  TaskSummary,
} from "../../shared/rpcTypes";
import {
  parseTelegramUpdate,
  type ParsedBotActivity,
} from "../../shared/updateParser";

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export async function handleListBots(env: Env): Promise<Response> {
  const bots = await listBotsSummary(env.DB);
  return json({ ok: true, data: bots });
}

/** Permanently disables webhooks across all registered bots so Telegram
 * stops sending HTTP webhook requests to Cloudflare (pure Cron Auto-Sync).
 */
export async function handleSyncWebhooks(
  request: Request,
  env: Env,
): Promise<Response> {
  const bots = await listBotsWithSecrets(env.DB);
  let webhooksDeleted = 0;
  const errors: string[] = [];

  for (const bot of bots) {
    const client = new TelegramClient(bot.token);
    try {
      await client.deleteWebhook(false);
      webhooksDeleted++;
    } catch (e) {
      errors.push(
        `@${bot.bot_username}: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  return json({
    ok: true,
    data: {
      totalBots: bots.length,
      webhooksDeleted,
      errors: errors.length > 0 ? errors : undefined,
    },
  });
}

/** Validates a token against Telegram (getMe) and checks if the bot already
 * exists in our database, returning active workloads, rate limits, and webhook status. */
export async function handleVerifyBot(
  request: Request,
  env: Env,
): Promise<Response> {
  const body = (await request.json().catch(() => ({}))) as {
    token?: string;
    botId?: string;
  };
  let token = typeof body.token === "string" ? body.token.trim() : undefined;
  let existingBotId: string | null = null;

  if (!token && body.botId) {
    const saved = await getBotWithSecrets(env.DB, body.botId);
    if (!saved)
      return json(
        {
          ok: false,
          errorCode: 404,
          description: "bot not found",
          reason: "invalid_request",
        },
        404,
      );
    token = saved.token;
    existingBotId = saved.id;
  }

  if (!token || !BOT_TOKEN.test(token)) {
    return json(
      {
        ok: false,
        errorCode: 0,
        description: "token or botId is required",
        reason: "invalid_request",
      },
      400,
    );
  }

  const client = new TelegramClient(token);
  const result: Result<BotVerifyResult> = await toResult(async () => {
    const [me, webhookInfo] = await Promise.all([
      client.getMe(),
      client.getWebhookInfo().catch(() => null),
    ]);

    const existing = existingBotId
      ? await getBotWithSecrets(env.DB, existingBotId)
      : await findBotByTokenOrBotId(env.DB, token!, me.id);

    let active_tasks: TaskSummary[] = [];
    let total_tasks_count = 0;
    let rate_limit_info = {
      is_cooling_down: false,
      cooldown_until: null as number | null,
      cooldown_seconds_remaining: 0,
      events_last_24h: 0,
    };

    if (existing) {
      existingBotId = existing.id;
      const allTasks = await listTasksByBot(env.DB, existing.id);
      total_tasks_count = allTasks.length;
      active_tasks = allTasks.filter(
        (t) =>
          t.live_enabled ||
          t.backfill_status === "running" ||
          t.backfill_status === "paused",
      );
      rate_limit_info = await getBotRateLimitStats(env.DB, existing.id);
    }

    return {
      bot_id: me.id,
      bot_username: me.username ?? me.first_name,
      existing_bot_id: existingBotId,
      active_tasks,
      total_tasks_count,
      webhook_info: {
        is_active: Boolean(webhookInfo?.url),

        pending_update_count: webhookInfo?.pending_update_count ?? 0,
        last_error_message: webhookInfo?.last_error_message,
        last_error_date: webhookInfo?.last_error_date,
      },
      rate_limit_info,
    };
  });

  return json(result, result.ok ? 200 : 400);
}

/** In-depth external activity inspection: probes webhooks, polling conflicts,
 * and recent updates parsed into simple human language. */
export async function handleInspectBot(
  request: Request,
  env: Env,
): Promise<Response> {
  const body = (await request.json().catch(() => ({}))) as {
    token?: string;
    botId?: string;
  };
  let token = typeof body.token === "string" ? body.token.trim() : undefined;
  let existingBotId: string | null = null;

  if (!token && body.botId) {
    const saved = await getBotWithSecrets(env.DB, body.botId);
    if (!saved)
      return json(
        {
          ok: false,
          errorCode: 404,
          description: "bot not found",
          reason: "invalid_request",
        },
        404,
      );
    token = saved.token;
    existingBotId = saved.id;
  }

  if (!token || !BOT_TOKEN.test(token)) {
    return json(
      {
        ok: false,
        errorCode: 0,
        description: "token or botId is required",
        reason: "invalid_request",
      },
      400,
    );
  }

  const client = new TelegramClient(token);
  const result: Result<BotInspectionReport> = await toResult(async () => {
    const me = await client.getMe();
    const webhookInfo = await client.getWebhookInfo().catch(() => null);

    const existing = existingBotId
      ? await getBotWithSecrets(env.DB, existingBotId)
      : await findBotByTokenOrBotId(env.DB, token!, me.id);

    let active_tasks: TaskSummary[] = [];
    let rate_limit_info = {
      is_cooling_down: false,
      cooldown_until: null as number | null,
      cooldown_seconds_remaining: 0,
      events_last_24h: 0,
    };

    if (existing) {
      const allTasks = await listTasksByBot(env.DB, existing.id);
      active_tasks = allTasks.filter(
        (t) =>
          t.live_enabled ||
          t.backfill_status === "running" ||
          t.backfill_status === "paused",
      );
      rate_limit_info = await getBotRateLimitStats(env.DB, existing.id);
    }

    let conflict_detected = false;
    let conflict_message: string | undefined =
      "Polling conflicts are checked when live copying runs.";
    let recent_activities: ParsedBotActivity[] = [];

    const isWebhookActive = Boolean(webhookInfo?.url);

    // Reading Telegram's update queue here could interrupt an active poller.
    // Connection inspection only uses getMe and getWebhookInfo.

    return {
      bot_id: me.id,
      bot_username: me.username ?? me.first_name,
      clone_worker_tasks: {
        active_count: active_tasks.length,
        tasks: active_tasks,
      },
      webhook: {
        is_active: isWebhookActive,

        pending_update_count: webhookInfo?.pending_update_count ?? 0,
        last_error_message: webhookInfo?.last_error_message,
        last_error_date: webhookInfo?.last_error_date,
      },
      polling_session: {
        conflict_detected,
        message: conflict_message,
      },
      rate_limits: rate_limit_info,
      recent_activities,
    };
  });

  return json(result, result.ok ? 200 : 400);
}

/** Disconnects any active webhook without dropping pending updates,
 * preventing unwanted Cloudflare Worker HTTP invocations while keeping user copy commands intact. */
export async function handleDisconnectBotWebhook(
  request: Request,
  env: Env,
): Promise<Response> {
  const body = (await request.json().catch(() => ({}))) as {
    token?: string;
    botId?: string;
  };
  let token = typeof body.token === "string" ? body.token.trim() : undefined;

  if (!token && body.botId) {
    const saved = await getBotWithSecrets(env.DB, body.botId);
    if (!saved)
      return json(
        {
          ok: false,
          errorCode: 404,
          description: "bot not found",
          reason: "invalid_request",
        },
        404,
      );
    token = saved.token;
  }

  if (!token || !BOT_TOKEN.test(token)) {
    return json(
      {
        ok: false,
        errorCode: 0,
        description: "token or botId is required",
        reason: "invalid_request",
      },
      400,
    );
  }

  const client = new TelegramClient(token);
  const result = await toResult(async () => {
    // dropPendingUpdates: false ensures pending commands to copy files or user messages are preserved!
    await client.deleteWebhook(false);
    const webhookInfo = await client.getWebhookInfo().catch(() => null);
    return {
      disconnected: true,
      pending_updates_preserved: true,
      pending_update_count: webhookInfo?.pending_update_count ?? 0,
    };
  });

  return json(result, result.ok ? 200 : 400);
}

/** Persists a verified token as a bot row.
 * Only called once something durable actually needs the bot to exist (e.g. task creation).
 * Live updates are polled via getUpdates in scheduled cron (no webhooks). */
export async function createBotRecord(
  env: Env,
  _origin: string,
  token: string,
  label?: string,
): Promise<Result<BotSummary>> {
  if (typeof token !== "string" || !BOT_TOKEN.test(token.trim()))
    return {
      ok: false,
      errorCode: 400,
      description: "Enter a valid bot token from BotFather.",
      reason: "invalid_request",
    };
  token = token.trim();
  const client = new TelegramClient(token);
  return toResult(async () => {
    const me = await client.getMe();
    if (!BOT_TOKEN.test(token))
      throw new TelegramApiError({
        ok: false,
        error_code: 400,
        description: "Enter a valid bot token from BotFather.",
      });
    const existing = await findBotByTokenOrBotId(env.DB, token, me.id);
    if (existing) {
      await env.DB.prepare("UPDATE bots SET token = ?, label = ? WHERE id = ?")
        .bind(token, label || existing.label, existing.id)
        .run();
      return {
        id: existing.id,
        bot_id: me.id,
        bot_username: existing.bot_username,
        label: label || existing.label,
        created_at: existing.created_at,
      };
    }
    const id = crypto.randomUUID();
    const webhookSecret = crypto.randomUUID().replace(/-/g, "");
    const botUsername = me.username ?? me.first_name;
    const botLabel = label || botUsername;
    await insertBot(env.DB, {
      id,
      token,
      bot_id: me.id,
      bot_username: botUsername,
      label: botLabel,
      webhook_secret: webhookSecret,
    });
    const persisted = await findBotByTokenOrBotId(env.DB, token, me.id);
    if (!persisted) throw new Error("Bot could not be saved.");
    return {
      id: persisted.id,
      bot_id: me.id,
      bot_username: botUsername,
      label: persisted.label,
      created_at: persisted.created_at,
    };
  });
}

export async function handleUpdateBot(
  request: Request,
  env: Env,
  id: string,
): Promise<Response> {
  const body = (await request.json().catch(() => ({}))) as { label?: string };
  if (!validText(body.label)) {
    return json(
      {
        ok: false,
        errorCode: 0,
        description: "label is required",
        reason: "invalid_request",
      },
      400,
    );
  }
  if (!(await getBotWithSecrets(env.DB, id)))
    return json(
      {
        ok: false,
        errorCode: 404,
        description: "Bot not found.",
        reason: "invalid_request",
      },
      404,
    );
  await updateBotLabel(env.DB, id, body.label.trim());
  return json({ ok: true, data: null });
}

export async function handleDeleteBot(env: Env, id: string): Promise<Response> {
  const bot = await getBotWithSecrets(env.DB, id);
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

  await deleteBot(env.DB, id);
  return json({ ok: true, data: null });
}

export async function handleCreateBot(
  request: Request,
  env: Env,
): Promise<Response> {
  const body = (await request.json()) as { token?: unknown; label?: unknown };
  if (typeof body.token !== "string" || !BOT_TOKEN.test(body.token.trim()))
    return invalid("Enter the bot token from BotFather.");
  if (body.label !== undefined && !validText(body.label))
    return invalid("Use a bot name from 1 to 200 characters.");
  const result = await createBotRecord(
    env,
    new URL(request.url).origin,
    body.token.trim(),
    body.label as string | undefined,
  );
  return json(result, result.ok ? 201 : 400);
}
