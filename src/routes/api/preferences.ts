import {
  DEFAULT_PREFERENCES,
  PREFERENCE_KEYS,
  isPreferenceValue,
  validatePreferencePatch,
  type PreferenceKey,
  type WorkspacePreferences,
} from "../../shared/preferences";
import { invalid } from "./validation";

const PREFIX = "workspace_preference:";
const keys = PREFERENCE_KEYS.map((key) => `${PREFIX}${key}`);
const SELECT_PREFERENCES = `SELECT key, value FROM app_settings WHERE key IN (${keys.map(() => "?").join(", ")})`;

function applyStoredValue<K extends PreferenceKey>(
  preferences: WorkspacePreferences,
  key: K,
  value: unknown,
): void {
  if (isPreferenceValue(key, value)) preferences[key] = value;
}

export async function readWorkspacePreferences(
  db: D1Database,
): Promise<WorkspacePreferences> {
  const preferences: WorkspacePreferences = { ...DEFAULT_PREFERENCES };
  const rows = await db
    .prepare(SELECT_PREFERENCES)
    .bind(...keys)
    .all<{ key: string; value: string }>();
  for (const row of rows.results) {
    const key = row.key.slice(PREFIX.length) as PreferenceKey;
    try {
      applyStoredValue(preferences, key, JSON.parse(row.value));
    } catch {
      // An obsolete or malformed appearance setting falls back to its default.
    }
  }
  return preferences;
}

export async function handleGetPreferences(env: Env): Promise<Response> {
  return Response.json({
    ok: true,
    data: await readWorkspacePreferences(env.DB),
  });
}

export async function handlePatchPreferences(
  request: Request,
  env: Env,
): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return invalid("The request contains invalid JSON.");
  }
  const result = validatePreferencePatch(body);
  if (!result.ok) return invalid(result.description);
  const statements = PREFERENCE_KEYS.filter((key) =>
    Object.prototype.hasOwnProperty.call(result.patch, key),
  ).map((key) =>
    env.DB.prepare(
      "INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    ).bind(`${PREFIX}${key}`, JSON.stringify(result.patch[key])),
  );
  // Persist only changed fields; concurrent updates to different settings do not overwrite each other.
  if (statements.length) await env.DB.batch(statements);
  return handleGetPreferences(env);
}
