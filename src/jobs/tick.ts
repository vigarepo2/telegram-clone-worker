import { TelegramClient } from "../telegram/client";
import { TelegramApiError } from "../telegram/errors";
import {
  advanceTaskProgress,
  appendActivityLog,
  claimTask,
  deletePendingMessages,
  getBotWithSecrets,
  incrementLiveCounters,
  listActiveSyncTasks,
  listPendingMessages,
  pauseBotForRateLimit,
  pruneActivityLog,
  releaseTaskLease,
  stopTask,
  stopTasksForBot,
  claimBotPoll,
  releaseBotPoll,
  recordLiveUpdate,
  listTasksByBot,
  type LiveUpdateEntry,
  type BotRow,
} from "../db/queries";
import type { TaskSummary } from "../shared/rpcTypes";
import { runWithConcurrency } from "../shared/concurrencyPool";
import {
  evaluateMessageFilter,
  extractMessageMetadata,
  formatBytes,
  getMediaIcon,
} from "../shared/messageFilter";

// Cloudflare: "Each Worker invocation can have up to six connections
// simultaneously waiting for response headers." Past six, extra fetches are
// silently queued, not rejected — and processOneBatch brackets its
// copyMessages call with Date.now() and writes `took ${ms}ms` into
// task_activity_log (the same series DEFAULT_PACING_BATCH_SIZE was derived
// from, src/routes/api/tasks.ts). A queued fetch would log connection-slot
// wait time as if it were Telegram latency, corrupting that measurement.
// Each bot group holds at most one connection at a time (its own tasks stay
// sequential — see the bot-scoped lease in claimTask), so 6 groups in
// flight = 6 connection slots, exactly at the ceiling. D1 goes over the
// binding RPC channel, not this fetch pool, and CPU isn't a concern —
// wall-clock spent awaiting fetch doesn't count toward the 30s cron CPU
// limit — so 6 is purely about not corrupting the timing log.
const MAX_CONCURRENT_BOTS = 6;

// Telegram's copyMessages accepts at most 100 message_ids per call.
const MAX_BATCH_IDS = 100;

// Fixed crash-recovery backstop (not a per-batch timing budget — doesn't
// scale with pacing_batch_size). ~5x the worst measured batch time
// (src/routes/api/tasks.ts defaultPacingBatchSize comment: up to ~47s),
// long enough to comfortably outlast a legitimate batch, short enough that
// a killed/evicted invocation that never reaches its `finally` self-heals
// within a handful of 1-minute ticks.
const LEASE_SECONDS = 240;

// When a task's copyMessages call comes back rate_limited, pause every
// active task on that bot for this long before the tick job or the live
// queue drain will try that bot again — honors Telegram's own
// `retry_after`. Longer Telegram cooldowns must never be shortened.
export const RATE_LIMIT_COOLDOWN_MIN_SECONDS = 60;

export async function runTick(env: Env): Promise<void> {
  const tickStartedAtMs = Date.now();
  const tasks = await listActiveSyncTasks(env.DB);

  // Group by bot_id — tasks arrive pre-sorted by bot_id (listActiveSyncTasks'
  // ORDER BY), so a simple adjacent-run grouping is enough.
  const groups: TaskSummary[][] = [];
  for (const task of tasks) {
    const lastGroup = groups[groups.length - 1];
    if (lastGroup && lastGroup[0].bot_id === task.bot_id) {
      lastGroup.push(task);
    } else {
      groups.push([task]);
    }
  }

  // Rotate the starting bot each minute so slow batches cannot starve later bots.
  const MAX_TICK_WALL_TIME_MS = 50_000;

  if (groups.length > 0) {
    const offset = Math.floor(tickStartedAtMs / 60_000) % groups.length;
    groups.push(...groups.splice(0, offset));
  }

  let batchesRun = 0;
  await runWithConcurrency(groups, MAX_CONCURRENT_BOTS, async (groupTasks) => {
    // Stop starting work near the next scheduled tick; leases protect overlaps.
    if (Date.now() - tickStartedAtMs > MAX_TICK_WALL_TIME_MS) {
      return;
    }

    const botId = groupTasks[0].bot_id;
    const pollToken = crypto.randomUUID();
    if (!(await claimBotPoll(env.DB, botId, pollToken, LEASE_SECONDS))) return;
    try {
      groupTasks = (await listTasksByBot(env.DB, botId)).filter(
        (task) =>
          (task.live_enabled || task.backfill_status === "running") &&
          !task.stop_reason &&
          (!task.rate_limited_until ||
            task.rate_limited_until <= Date.now() / 1000),
      );
      if (!groupTasks.length) return;
      const taskOffset =
        Math.floor(tickStartedAtMs / 60_000) % groupTasks.length;
      groupTasks.push(...groupTasks.splice(0, taskOffset));
      const bot = await getBotWithSecrets(env.DB, botId);
      if (!bot) return;
      const client = new TelegramClient(bot.token);

      // 1. Pull-based Auto-Sync: Check for new Telegram updates if any task has live_enabled = 1
      const hasLive = groupTasks.some((t) => t.live_enabled);
      if (hasLive) {
        try {
          const MAX_PULL_PAGES = 5;
          let page = 0;
          let currentOffset =
            bot.last_update_id > 0 ? bot.last_update_id + 1 : undefined;
          let maxUpdateId = bot.last_update_id;

          while (
            page < MAX_PULL_PAGES &&
            Date.now() - tickStartedAtMs < MAX_TICK_WALL_TIME_MS
          ) {
            page++;
            const updates = await client.getUpdates({
              offset: currentOffset,
              limit: 100,
              allowed_updates: ["channel_post", "message"],
            });
            if (!updates || updates.length === 0) break;

            for (const update of updates) {
              if (Date.now() - tickStartedAtMs > MAX_TICK_WALL_TIME_MS) break;
              if (update.update_id <= bot.last_update_id) continue;
              const post = update.channel_post ?? update.message;
              const entries: LiveUpdateEntry[] = [];
              if (post) {
                const matchingTasks = groupTasks.filter(
                  (task) =>
                    task.live_enabled &&
                    (task.source_chat_id === String(post.chat.id) ||
                      (post.chat.username &&
                        task.source_chat_id.toLowerCase() ===
                          `@${post.chat.username.toLowerCase()}`)),
                );
                const meta = extractMessageMetadata(post);
                for (const task of matchingTasks) {
                  // A pending Telegram update may already belong to the historical range.
                  if (
                    task.scope !== "live" &&
                    task.end_id !== null &&
                    post.message_id <= task.end_id
                  )
                    continue;
                  const evaluation = evaluateMessageFilter(post, {
                    mediaTypes: task.filter_media_types
                      ?.split(",")
                      .filter(Boolean),
                    extensions: task.filter_extensions
                      ?.split(",")
                      .filter(Boolean),
                    minSizeBytes: task.filter_min_size_bytes,
                    maxSizeBytes: task.filter_max_size_bytes,
                  });
                  entries.push({
                    taskId: task.id,
                    messageId: post.message_id,
                    mediaType: meta.type,
                    fileSize: meta.size ?? null,
                    fileName: meta.name ?? null,
                    skippedReason: evaluation.matched
                      ? undefined
                      : evaluation.reason || "Filtered",
                  });
                }
              }
              await recordLiveUpdate(env.DB, bot.id, update.update_id, entries);
              maxUpdateId = update.update_id;
              bot.last_update_id = update.update_id;
            }

            currentOffset = maxUpdateId + 1;
            if (updates.length < 100) break;
          }
        } catch (e) {
          if (e instanceof TelegramApiError) {
            if (e.errorCode === 401 || e.reason === "unauthorized") {
              console.warn(
                `tick: bot ${bot.bot_username} unauthorized (401), stopping live tasks.`,
              );
              const stoppedTasks = await stopTasksForBot(
                env.DB,
                bot.id,
                "unauthorized",
              );
              for (const st of stoppedTasks) {
                await appendActivityLog(env.DB, {
                  task_id: st.id,
                  kind: "live_forward",
                  detail:
                    "Stopped: Bot token unauthorized (401). Bot token may have been revoked or changed in @BotFather.",
                  ok: false,
                  error: "401 Unauthorized",
                });
              }
              return;
            }
            if (
              e.errorCode === 409 ||
              (typeof e.message === "string" &&
                e.message.toLowerCase().includes("webhook"))
            ) {
              for (const task of groupTasks.filter(
                (item) => item.live_enabled,
              )) {
                await stopTask(env.DB, task.id, "invalid_request");
                await appendActivityLog(env.DB, {
                  task_id: task.id,
                  kind: "live_forward",
                  ok: false,
                  detail:
                    "Live copying stopped because this bot is connected to another service. Disconnect its webhook explicitly or use a dedicated bot, then resume.",
                  error: "Telegram update conflict",
                });
              }
              return;
            }
          }
          if (e instanceof TelegramApiError && e.reason === "rate_limited") {
            await pauseBotForRateLimit(
              env.DB,
              bot.id,
              Math.floor(Date.now() / 1000) + Math.max(60, e.retryAfter ?? 60),
            );
            return;
          }
          console.error(
            `tick: getUpdates failed for bot ${bot.bot_username}`,
            e,
          );
        }
      }

      // 2. Process tasks that have messages to copy (cursor <= end_id)
      for (const task of groupTasks) {
        if (Date.now() - tickStartedAtMs > MAX_TICK_WALL_TIME_MS) break;
        if (task.backfill_status !== "running") continue;
        // If backfill was running but cursor has already caught up to or passed end_id, mark complete
        if (
          task.backfill_status === "running" &&
          task.cursor !== null &&
          task.end_id !== null &&
          task.cursor > task.end_id
        ) {
          const res = await advanceTaskProgress(env.DB, task.id, {
            cursor: task.cursor,
            processed: task.processed,
            failed: task.failed,
            backfill_status: "complete",
          });
          task.backfill_status = res.backfill_status;
        }

        if (
          task.cursor === null ||
          task.end_id === null ||
          task.cursor > task.end_id
        ) {
          continue;
        }

        const claimed = await claimTask(env.DB, task.id, LEASE_SECONDS);
        if (!claimed) continue;
        try {
          batchesRun++;
          const skipBotForRest = await processOneBatch(
            env,
            claimed,
            bot,
            client,
          );
          if (skipBotForRest) break;
        } catch (e) {
          console.error(`tick: task ${claimed.id} failed`, e);
        } finally {
          await releaseTaskLease(env.DB, claimed.id);
        }
      }
      const freshTasks = await listTasksByBot(env.DB, botId);
      for (const task of freshTasks) {
        if (Date.now() - tickStartedAtMs > MAX_TICK_WALL_TIME_MS) break;
        if (
          !task.live_enabled ||
          task.stop_reason ||
          (task.rate_limited_until &&
            task.rate_limited_until > Date.now() / 1000)
        )
          continue;
        const stopBot = await drainPendingMessagesForTask(
          env,
          task,
          tickStartedAtMs + MAX_TICK_WALL_TIME_MS,
        );
        await pruneActivityLog(env.DB, task.id);
        if (stopBot) break;
      }
    } catch (e) {
      console.error(`tick: bot ${botId} group failed`, e);
    } finally {
      await releaseBotPoll(env.DB, botId, pollToken);
    }
  });

  const wallTimeMs = Date.now() - tickStartedAtMs;
  console.log(
    `tick: ${groups.length} group(s), ${tasks.length} task(s), ${batchesRun} batch(es), ${wallTimeMs}ms`,
  );
}

/** Drains buffered live messages in chronological order once backfill completes. */
async function drainPendingMessagesForTask(
  env: Env,
  task: TaskSummary,
  deadline: number,
): Promise<boolean> {
  // If backfill is still running, hold the live queue so chronological chat order is preserved
  if (["running", "paused", "pending"].includes(task.backfill_status))
    return false;

  const pending = await listPendingMessages(env.DB, task.id, 60);
  if (pending.length === 0) return false;

  const bot = await getBotWithSecrets(env.DB, task.bot_id);
  if (!bot) return false;
  const client = new TelegramClient(bot.token);

  for (const item of pending) {
    if (Date.now() >= deadline) return false;
    const icon = getMediaIcon(item.media_type ?? "text");
    const sizeStr = item.file_size ? formatBytes(item.file_size) : "";
    const fileDesc = [
      icon,
      sizeStr,
      item.file_name ? `(${item.file_name})` : "",
    ]
      .filter(Boolean)
      .join(" ");

    try {
      await client.copyMessage(
        task.dest_chat_id,
        task.source_chat_id,
        item.message_id,
      );
      await deletePendingMessages(env.DB, [item.id]);
      await incrementLiveCounters(env.DB, task.id, 1, 0, 0);
      await appendActivityLog(env.DB, {
        task_id: task.id,
        kind: "live_forward",
        detail: `Copied ${fileDesc} · msg #${item.message_id} (delivered from live queue)`,
        ok: true,
      });
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      if (e instanceof TelegramApiError && e.reason === "rate_limited") {
        const waitSeconds = Math.max(
          e.retryAfter ?? 0,
          RATE_LIMIT_COOLDOWN_MIN_SECONDS,
        );
        await pauseBotForRateLimit(
          env.DB,
          task.bot_id,
          Math.floor(Date.now() / 1000) + waitSeconds,
        );
        return true;
      }
      if (e instanceof TelegramApiError && e.reason === "unauthorized") {
        await stopTasksForBot(env.DB, task.bot_id, "unauthorized");
        return true;
      }
      if (
        e instanceof TelegramApiError &&
        ["bot_not_in_chat", "insufficient_permissions"].includes(e.reason)
      ) {
        await stopTask(env.DB, task.id, e.reason);
        await appendActivityLog(env.DB, {
          task_id: task.id,
          kind: "live_forward",
          ok: false,
          detail:
            "Copying stopped. Check the bot's access to both chats, then resume.",
          error: e.message,
        });
        return false;
      }
      // If the message no longer exists in source, remove from queue to avoid blocking
      if (
        e instanceof TelegramApiError &&
        (e.message.toLowerCase().includes("message to forward not found") ||
          e.message.toLowerCase().includes("message to copy not found"))
      ) {
        await deletePendingMessages(env.DB, [item.id]);
        await incrementLiveCounters(env.DB, task.id, 0, 1, 0);
        await appendActivityLog(env.DB, {
          task_id: task.id,
          kind: "live_forward",
          detail: `msg #${item.message_id}: not found in source, removed from queue`,
          ok: false,
          error,
        });
      }
      break;
    }
  }
  return false;
}

/** Returns true when this call discovered the bot's token is dead (stopped
 * every task on it) or the bot just got rate-limited (paused every active
 * task on it) — either way runTick should skip the bot's other tasks for
 * the rest of this run instead of making more doomed Telegram calls. */
async function processOneBatch(
  env: Env,
  task: TaskSummary,
  botParam?: BotRow,
  clientParam?: TelegramClient,
): Promise<boolean> {
  if (task.cursor === null || task.end_id === null) return false;
  const bot = botParam ?? (await getBotWithSecrets(env.DB, task.bot_id));
  if (!bot) return false;
  const client = clientParam ?? new TelegramClient(bot.token);

  const batchStartedAtMs = Date.now();
  const batchSize = Math.max(
    1,
    Math.min(MAX_BATCH_IDS, Math.floor(task.pacing_batch_size) || 60),
  );
  const batchEnd = Math.min(task.cursor + batchSize - 1, task.end_id);
  const messageIds: number[] = [];
  for (let id = task.cursor; id <= batchEnd; id++) messageIds.push(id);

  // Bulk copyMessages: one API call per batch, matching the throughput the
  // pacing defaults were diagnosed against. Telegram silently skips ids it
  // can't copy (gaps, service messages) rather than reporting which ones —
  // so we only get an aggregate skipped count here, not per-id attribution.
  let succeeded: number;
  try {
    const results = await client.copyMessages(
      task.dest_chat_id,
      task.source_chat_id,
      messageIds,
    );
    succeeded = results.length;
  } catch (e) {
    if (e instanceof TelegramApiError && e.reason === "rate_limited") {
      // Whole batch rejected — don't advance the cursor, same range retries
      // once the cooldown lifts. Honor Telegram's own retry_after when
      // given. A minimum minute avoids repeated requests at the next cron boundary.
      const waitSeconds = Math.max(
        e.retryAfter ?? 0,
        RATE_LIMIT_COOLDOWN_MIN_SECONDS,
      );
      await pauseBotForRateLimit(
        env.DB,
        task.bot_id,
        Math.floor(Date.now() / 1000) + waitSeconds,
      );
      await appendActivityLog(env.DB, {
        task_id: task.id,
        kind: "backfill_batch",
        detail: `ids ${task.cursor}-${batchEnd}: rate limited, pausing bot for ${waitSeconds}s`,
        ok: true,
      });
      return true;
    }
    if (e instanceof TelegramApiError && e.reason === "unauthorized") {
      // Token revoked/invalid — fatal for every task on this bot, not just
      // this one. Stop them all now instead of retrying forever.
      const stopped = await stopTasksForBot(
        env.DB,
        task.bot_id,
        "unauthorized",
      );
      for (const t of stopped) {
        await appendActivityLog(env.DB, {
          task_id: t.id,
          kind: "backfill_batch",
          detail: `bot token unauthorized (401) — task auto-stopped (${t.processed} copied, ${t.failed} failed before stopping)`,
          ok: false,
          error: e.message,
        });
      }
      return true;
    }
    if (
      e instanceof TelegramApiError &&
      /failed to send message #\d+\b/i.test(e.message)
    ) {
      await stopTask(env.DB, task.id, "invalid_request");
      await appendActivityLog(env.DB, {
        task_id: task.id,
        kind: "backfill_batch",
        ok: false,
        detail: `Telegram stopped partway through messages ${task.cursor}–${batchEnd}. Check the destination before resuming; the range has not advanced.`,
        error: e.message,
      });
      return false;
    }
    if (
      e instanceof TelegramApiError &&
      e.message.toLowerCase().includes("no messages to forward")
    ) {
      // Telegram explicitly reported that no requested message was copyable.
      succeeded = 0;
    } else if (
      e instanceof TelegramApiError &&
      (e.reason === "bot_not_in_chat" ||
        e.reason === "insufficient_permissions")
    ) {
      // Bot lost access to one of this task's chats (kicked, or no longer
      // admin) — won't self-heal by retrying. Auto-stop just this task, not
      // the whole bot, since sibling tasks on the same bot may point at
      // unaffected chats. This used to fall into the catch-all rethrow
      // below and retry silently forever with nothing written to the
      // activity log — see the generic branch's comment for why that was a
      // problem. Fixing access in Telegram and resuming from the UI clears
      // stop_reason (updateTaskStatus) and picks up from the same cursor.
      await stopTask(env.DB, task.id, e.reason);
      await appendActivityLog(env.DB, {
        task_id: task.id,
        kind: "backfill_batch",
        detail: `ids ${task.cursor}-${batchEnd}: ${e.reason} — task auto-stopped`,
        ok: false,
        error: e.message,
      });
      return false;
    } else {
      // Any other Telegram-classified reason (invalid_request/unknown) or a
      // non-Telegram error (network, D1, etc.). Previously this rethrew and
      // was only ever visible via console.error — never written to
      // task_activity_log — so a persistently failing task looked identical
      // to a healthy one from the DB/UI's perspective, retrying forever with
      // zero trace. Log every occurrence instead; these can be transient, so
      // don't advance the cursor or stop the task, just retry next tick.
      const reason =
        e instanceof TelegramApiError ? e.reason : "unexpected error";
      const message = e instanceof Error ? e.message : String(e);
      await appendActivityLog(env.DB, {
        task_id: task.id,
        kind: "backfill_batch",
        detail: `ids ${task.cursor}-${batchEnd}: ${reason}, resuming next tick`,
        ok: false,
        error: message,
      });
      return false;
    }
  }

  const batchDurationMs = Date.now() - batchStartedAtMs;
  const skipped = messageIds.length - succeeded;
  const newCursor = batchEnd + 1;
  const wasBackfilling = task.backfill_status !== "complete";

  let newProcessed = task.processed;
  let newFailed = task.failed;
  let newLiveProcessed = task.live_processed ?? 0;
  let newLiveFailed = task.live_failed ?? 0;

  if (wasBackfilling) {
    newProcessed += succeeded;
    newFailed += skipped;
  } else {
    newLiveProcessed += succeeded;
    newLiveFailed += skipped;
  }

  const progressResult = await advanceTaskProgress(env.DB, task.id, {
    cursor: newCursor,
    processed: newProcessed,
    failed: newFailed,
    live_processed: newLiveProcessed,
    live_failed: newLiveFailed,
  });

  const justCompletedBackfill = wasBackfilling && progressResult.complete;
  const isLiveScope =
    task.scope === "live" ||
    (task.scope === "live_and_backfill" && !wasBackfilling);
  await appendActivityLog(env.DB, {
    task_id: task.id,
    kind: isLiveScope ? "live_forward" : "backfill_batch",
    detail: `ids ${task.cursor}-${batchEnd}: ${succeeded} ok, ${skipped} skipped, took ${batchDurationMs}ms${justCompletedBackfill ? " (backfill complete)" : ""}`,
    ok: true,
    error:
      skipped > 0
        ? `${skipped} message(s) in this range skipped by Telegram (not found / can't be copied)`
        : undefined,
  });

  // Throttled pruning: running subquery DELETEs on every single 60-msg batch
  // produces heavy D1 scan/write amplification. Prune on completion or 5% sample.
  if (progressResult.complete || Math.random() < 0.05) {
    await pruneActivityLog(env.DB, task.id);
  }
  return false;
}
