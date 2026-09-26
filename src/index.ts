import {
  handleCreateBot,
  handleDeleteBot,
  handleDisconnectBotWebhook,
  handleInspectBot,
  handleListBots,
  handleSyncWebhooks,
  handleUpdateBot,
  handleVerifyBot,
} from "./routes/api/bots";
import {
  handleAdHocTestCopy,
  handleBan,
  handleGetChat,
  handleInviteLink,
  handleLatestMessageId,
  handlePromote,
  handleRevokeInviteLink,
  handleSendTestMessage,
  handleUnban,
} from "./routes/api/chats";
import {
  handleCreateTask,
  handleDeleteTask,
  handleGetTaskActivity,
  handleGetTaskById,
  handleListAllTasks,
  handleListTasks,
  handlePatchTask,
  handleTestCopy,
} from "./routes/api/tasks";
import {
  handleCreateSavedTask,
  handleDeleteSavedTask,
  handleGetSavedTask,
  handleListSavedTasks,
} from "./routes/api/savedTasks";
import { runTick } from "./jobs/tick";
import { ensureDatabaseBootstrap } from "./db/bootstrap";
import {
  authenticateApiRequest,
  handleAuthLogin,
  handleAuthLogout,
  handleAuthPassword,
  handleAuthSetup,
  handleAuthStatus,
} from "./auth/handler";
import {
  apiError,
  isLocalRequest,
  secureResponse,
  validateApiRequest,
} from "./auth/http";

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function handleRequest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const parts = url.pathname.split("/").filter(Boolean);

  if (parts[0] === "api") {
    const checked = await validateApiRequest(request);
    if (checked instanceof Response) return checked;
    request = checked;
    if (!env.DB)
      return apiError(
        503,
        "Connect a D1 database with the binding DB in your Worker settings, then reload.",
        "unknown",
      );
    await ensureDatabaseBootstrap(env.DB);

    // Public health check
    if (
      parts[1] === "health" &&
      parts.length === 2 &&
      request.method === "GET"
    ) {
      return json({ ok: true, data: { status: "up" } });
    }

    // Public authentication routes
    if (parts[1] === "auth" && parts.length === 3) {
      if (parts[2] === "status" && request.method === "GET") {
        return handleAuthStatus(request, env);
      }
      if (parts[2] === "login" && request.method === "POST") {
        return handleAuthLogin(request, env);
      }
      if (parts[2] === "setup" && request.method === "POST") {
        return handleAuthSetup(request, env);
      }
      if (parts[2] === "logout" && request.method === "POST") {
        return handleAuthLogout(request, env);
      }
      if (parts[2] === "password" && request.method === "POST") {
        return handleAuthPassword(request, env);
      }
      return json(
        {
          ok: false,
          errorCode: 404,
          description: "not found",
          reason: "invalid_request",
        },
        404,
      );
    }

    // Protect all remaining /api/* endpoints
    const authError = await authenticateApiRequest(request, env);
    if (authError) return authError;

    const botId = url.searchParams.get("botId") ?? "";
    if (url.searchParams.has("token"))
      return apiError(
        400,
        "Connect your bot before checking a chat. Bot tokens must not be sent in URLs.",
      );
    const botToken = "";
    const botTelegramId = "";

    // /api/bots
    if (parts[1] === "bots" && parts.length === 2) {
      if (request.method === "GET") return handleListBots(env);
      if (request.method === "POST") return handleCreateBot(request, env);
    }

    // /api/bots/sync-webhooks — cleans inactive bot webhooks & tightens allowed_updates
    if (
      parts[1] === "bots" &&
      parts[2] === "sync-webhooks" &&
      parts.length === 3 &&
      request.method === "POST"
    ) {
      return handleSyncWebhooks(request, env);
    }

    // /api/bots/verify — token check & workload status
    if (
      parts[1] === "bots" &&
      parts[2] === "verify" &&
      parts.length === 3 &&
      request.method === "POST"
    ) {
      return handleVerifyBot(request, env);
    }

    // /api/bots/inspect — in-depth workload, external sessions & live activity check
    if (
      parts[1] === "bots" &&
      parts[2] === "inspect" &&
      parts.length === 3 &&
      request.method === "POST"
    ) {
      return handleInspectBot(request, env);
    }

    // /api/bots/disconnect-webhook — safely disconnects webhook without dropping pending updates
    if (
      parts[1] === "bots" &&
      parts[2] === "disconnect-webhook" &&
      parts.length === 3 &&
      request.method === "POST"
    ) {
      return handleDisconnectBotWebhook(request, env);
    }

    // /api/bots/:id
    if (
      parts[1] === "bots" &&
      parts.length === 3 &&
      request.method === "DELETE"
    ) {
      return handleDeleteBot(env, parts[2]);
    }
    if (
      parts[1] === "bots" &&
      parts.length === 3 &&
      request.method === "PATCH"
    ) {
      return handleUpdateBot(request, env, parts[2]);
    }

    // /api/bots/:botId/tasks — botId "new" (with a botToken in the body)
    // means the bot isn't saved yet; handleCreateTask saves it as part of
    // creating the task.
    if (parts[1] === "bots" && parts[3] === "tasks" && parts.length === 4) {
      if (request.method === "GET") return handleListTasks(env, parts[2]);
      if (request.method === "POST")
        return handleCreateTask(request, env, parts[2], url.origin);
    }

    // /api/bots/:botId/tasks/:taskId
    if (parts[1] === "bots" && parts[3] === "tasks" && parts.length === 5) {
      if (request.method === "PATCH")
        return handlePatchTask(request, env, parts[4]);
      if (request.method === "DELETE") return handleDeleteTask(env, parts[4]);
    }

    // /api/bots/:botId/tasks/:taskId/test-copy
    if (
      parts[1] === "bots" &&
      parts[3] === "tasks" &&
      parts[5] === "test-copy" &&
      parts.length === 6 &&
      request.method === "POST"
    ) {
      const body = (await request.json().catch(() => ({}))) as {
        messageId?: number;
      };
      return handleTestCopy(env, parts[2], parts[4], body.messageId);
    }

    // /api/tasks (all tasks across bots)
    if (
      parts[1] === "tasks" &&
      parts.length === 2 &&
      request.method === "GET"
    ) {
      return handleListAllTasks(env);
    }

    // /api/tasks/:taskId (bot-agnostic lookup, used by the task detail page)
    if (
      parts[1] === "tasks" &&
      parts.length === 3 &&
      request.method === "GET"
    ) {
      return handleGetTaskById(env, parts[2]);
    }
    if (
      parts[1] === "tasks" &&
      parts[3] === "activity" &&
      parts.length === 4 &&
      request.method === "GET"
    ) {
      return handleGetTaskActivity(env, parts[2]);
    }
    if (parts[1] === "tasks" && parts.length === 3) {
      if (request.method === "PATCH")
        return handlePatchTask(request, env, parts[2]);
      if (request.method === "DELETE") return handleDeleteTask(env, parts[2]);
    }

    // /api/chats/:chatId — botId for a saved bot, or token+botTelegramId
    // for a not-yet-saved one being checked in the task wizard.
    if (
      parts[1] === "chats" &&
      parts.length === 3 &&
      request.method === "GET"
    ) {
      return handleGetChat(
        env,
        decodeURIComponent(parts[2]),
        botId,
        botToken,
        botTelegramId,
      );
    }

    // /api/chats/:chatId/latest-message-id
    if (
      parts[1] === "chats" &&
      parts[3] === "latest-message-id" &&
      parts.length === 4 &&
      request.method === "POST"
    ) {
      return handleLatestMessageId(
        env,
        decodeURIComponent(parts[2]),
        botId,
        botToken,
      );
    }

    // /api/chats/:chatId/(invite-link|ban|unban|promote|send-test-message)
    if (
      parts[1] === "chats" &&
      parts.length === 4 &&
      request.method === "POST"
    ) {
      const chatId = decodeURIComponent(parts[2]);
      const action = parts[3];
      if (action === "invite-link")
        return handleInviteLink(env, chatId, botId, botToken);
      if (action === "ban" || action === "unban") {
        const body = (await request.json()) as { userId: number };
        return action === "ban"
          ? handleBan(env, chatId, botId, body.userId, botToken)
          : handleUnban(env, chatId, botId, body.userId, botToken);
      }
      if (action === "promote") {
        const body = (await request.json()) as {
          userId: number;
          rights: Record<string, boolean>;
        };
        return handlePromote(
          env,
          chatId,
          botId,
          body.userId,
          body.rights,
          botToken,
        );
      }
      if (action === "send-test-message") {
        const body = (await request.json()) as { text?: string };
        return handleSendTestMessage(
          env,
          chatId,
          botId,
          body.text ?? ".",
          botToken,
        );
      }
      if (action === "test-copy") {
        const body = (await request.json()) as {
          destChatId: string;
          messageId?: number;
        };
        return handleAdHocTestCopy(
          env,
          chatId,
          botId,
          body.destChatId,
          botToken,
          body.messageId,
        );
      }
      if (action === "revoke-invite-link") {
        const body = (await request.json()) as { inviteLink: string };
        return handleRevokeInviteLink(
          env,
          chatId,
          botId,
          body.inviteLink,
          botToken,
        );
      }
    }

    // /api/saved-tasks
    if (parts[1] === "saved-tasks" && parts.length === 2) {
      if (request.method === "GET") return handleListSavedTasks(env);
      if (request.method === "POST") return handleCreateSavedTask(request, env);
    }

    // /api/saved-tasks/:id
    if (parts[1] === "saved-tasks" && parts.length === 3) {
      if (request.method === "GET") return handleGetSavedTask(env, parts[2]);
      if (request.method === "DELETE")
        return handleDeleteSavedTask(env, parts[2]);
    }

    return json(
      {
        ok: false,
        errorCode: 404,
        description: "not found",
        reason: "invalid_request",
      },
      404,
    );
  }

  return env.ASSETS.fetch(request);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (new URL(request.url).protocol === "http:" && !isLocalRequest(request)) {
      const secureUrl = new URL(request.url);
      secureUrl.protocol = "https:";
      return secureResponse(
        Response.redirect(secureUrl.toString(), 308),
        request,
      );
    }
    try {
      return secureResponse(await handleRequest(request, env), request);
    } catch (cause) {
      // Avoid recording request bodies, bot tokens, passwords, or raw database errors.
      console.error(
        "Workspace request failed",
        cause instanceof Error ? cause.name : "UnknownError",
      );
      const response =
        cause instanceof URIError
          ? apiError(
              400,
              "The request could not be read. Check the details and try again.",
            )
          : apiError(
              503,
              "The workspace is temporarily unavailable. Please try again.",
              "unknown",
            );
      return secureResponse(response, request);
    }
  },

  async scheduled(
    _controller: ScheduledController,
    env: Env,
    _ctx: ExecutionContext,
  ): Promise<void> {
    await ensureDatabaseBootstrap(env.DB);
    await runTick(env);
  },
};
