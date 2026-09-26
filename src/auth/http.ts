const MAX_BODY_BYTES = 64 * 1024;

export function apiError(
  status: number,
  description: string,
  reason = "invalid_request",
): Response {
  return Response.json(
    { ok: false, errorCode: status, description, reason },
    { status },
  );
}

export function isLocalRequest(request: Request): boolean {
  return ["localhost", "127.0.0.1", "[::1]"].includes(
    new URL(request.url).hostname,
  );
}

export async function validateApiRequest(
  request: Request,
): Promise<Request | Response> {
  const url = new URL(request.url);
  const origin = request.headers.get("Origin");
  const fetchSite = request.headers.get("Sec-Fetch-Site");
  if (fetchSite === "cross-site" || (origin && origin !== url.origin)) {
    return apiError(
      403,
      "This request must come from your workspace.",
      "unauthorized",
    );
  }
  if (!["GET", "POST", "PATCH", "DELETE"].includes(request.method))
    return apiError(405, "This request method is not supported.");
  if (["GET", "HEAD"].includes(request.method)) return request;
  if (origin !== url.origin && fetchSite !== "same-origin") {
    return apiError(
      403,
      "This request must come from your workspace.",
      "unauthorized",
    );
  }
  if (!request.body) return request;
  const lengthHeader = request.headers.get("Content-Length");
  if (lengthHeader && Number(lengthHeader) > MAX_BODY_BYTES)
    return apiError(413, "This request is too large.");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > MAX_BODY_BYTES) {
      await reader.cancel();
      return apiError(413, "This request is too large.");
    }
    chunks.push(value);
  }
  // Workers can expose a body stream even when DELETE has no payload.
  // Count the actual bytes; a present stream is not proof of a JSON body.
  if (length === 0 && request.method === "DELETE")
    return new Request(request, { body: new Uint8Array(0) });
  if (
    request.headers.get("Content-Type")?.split(";")[0].trim().toLowerCase() !==
    "application/json"
  ) {
    return apiError(415, "Send this request as JSON.");
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    const value: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (!value || typeof value !== "object" || Array.isArray(value))
      return apiError(400, "Send a JSON object with this request.");
  } catch {
    return apiError(400, "The request contains invalid JSON.");
  }
  return new Request(request, { body: bytes });
}

export function secureResponse(response: Response, request: Request): Response {
  const headers = new Headers(response.headers);
  const url = new URL(request.url);
  const local = isLocalRequest(request);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", "DENY");
  headers.set("Referrer-Policy", "no-referrer");
  headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=()",
  );
  headers.set("Cross-Origin-Opener-Policy", "same-origin");
  headers.set(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      `script-src 'self'${local ? " 'unsafe-inline' 'unsafe-eval'" : ""}`,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https:",
      "font-src 'self' data:",
      `connect-src 'self'${local ? " ws: wss:" : ""}`,
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ].join("; "),
  );
  if (url.protocol === "https:")
    headers.set("Strict-Transport-Security", "max-age=31536000");
  if (url.pathname.startsWith("/api/") || url.pathname === "/api") {
    headers.set("Cache-Control", "no-store");
    headers.set("Pragma", "no-cache");
    headers.set("Vary", "Cookie");
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
