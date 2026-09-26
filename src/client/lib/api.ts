import type { Result, TaskSummary } from "../../shared/rpcTypes";

async function request<T>(
  path: string,
  init?: RequestInit,
): Promise<Result<T>> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 45000);
  try {
    const res = await fetch(path, {
      ...init,
      credentials: "same-origin",
      cache: "no-store",
      signal: controller.signal,
      headers: { "content-type": "application/json", ...init?.headers },
    });
    if (res.status === 401 && !path.startsWith("/api/auth/")) {
      window.dispatchEvent(new Event("tg_auth_unauthorized"));
    }
    if (!res.headers.get("content-type")?.includes("application/json")) {
      return {
        ok: false,
        errorCode: res.status,
        description: "The server could not respond. Please try again.",
        reason: "unknown",
      };
    }
    const body = (await res.json()) as Result<T>;
    if (typeof body?.ok !== "boolean")
      return {
        ok: false,
        errorCode: res.status,
        description: "The server returned an unexpected response.",
        reason: "unknown",
      };
    return body;
  } catch (error) {
    return {
      ok: false,
      errorCode: 0,
      description:
        error instanceof Error && error.name === "AbortError"
          ? "This request took too long. Check its status before trying again."
          : "Could not connect. Check your connection and try again.",
      reason: "unknown",
    };
  } finally {
    window.clearTimeout(timeout);
  }
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: JSON.stringify(body ?? {}) }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PATCH", body: JSON.stringify(body ?? {}) }),
  del: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};
export const listAllTasks = () => api.get<TaskSummary[]>("/api/tasks");
