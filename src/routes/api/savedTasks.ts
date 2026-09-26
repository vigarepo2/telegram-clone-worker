import { invalid } from "./validation";
import {
  deleteSavedTask,
  findBotByTokenOrBotId,
  getTask,
  getBotWithSecrets,
  getSavedTask,
  insertSavedTask,
  listSavedTasks,
} from "../../db/queries";

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export async function handleListSavedTasks(env: Env): Promise<Response> {
  const saved = await listSavedTasks(env.DB);
  return json({ ok: true, data: saved });
}

export async function handleGetSavedTask(
  env: Env,
  id: string,
): Promise<Response> {
  const saved = await getSavedTask(env.DB, id);
  if (!saved)
    return json(
      {
        ok: false,
        errorCode: 404,
        description: "saved task not found",
        reason: "invalid_request",
      },
      404,
    );
  const { bot_token, ...summary } = saved;
  const bot = await findBotByTokenOrBotId(env.DB, bot_token);
  return json({
    ok: true,
    data: { ...summary, existing_bot_id: bot?.id ?? null },
  });
}

export async function handleCreateSavedTask(
  request: Request,
  env: Env,
): Promise<Response> {
  const body = (await request.json()) as { task_id?: unknown };
  if (typeof body.task_id !== "string")
    return invalid("Choose a task to save as a preset.");
  const task = await getTask(env.DB, body.task_id);
  if (!task)
    return json(
      {
        ok: false,
        errorCode: 404,
        description: "Task not found.",
        reason: "invalid_request",
      },
      404,
    );
  const bot = await getBotWithSecrets(env.DB, task.bot_id);
  if (!bot) return invalid("The task's bot is no longer connected.");
  const id = crypto.randomUUID();
  await insertSavedTask(env.DB, {
    id,
    task_id: task.id,
    bot_token: bot.token,
    bot_label: bot.label,
    bot_username: bot.bot_username,
    source_chat_id: task.source_chat_id,
    source_chat_title: task.source_chat_title,
    dest_chat_id: task.dest_chat_id,
    dest_chat_title: task.dest_chat_title,
    scope: task.scope,
    backfill_mode: task.backfill_mode,
    start_id: task.start_id,
    end_id: task.end_id,
    n: task.total,
    pacing_batch_size: task.pacing_batch_size,
    filter_media_types: task.filter_media_types,
    filter_min_size_bytes: task.filter_min_size_bytes,
    filter_max_size_bytes: task.filter_max_size_bytes,
  });
  return json({ ok: true, data: { id } }, 201);
}

/** Deletes only the template row — never touches the underlying bot or
 * live task, if either still exists. */
export async function handleDeleteSavedTask(
  env: Env,
  id: string,
): Promise<Response> {
  await deleteSavedTask(env.DB, id);
  return json({ ok: true, data: null });
}
