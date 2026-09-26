import { DEFAULT_THEME, isTheme, type ThemeId } from "./themeCatalog";

export interface WorkspacePreferences {
  themeId: ThemeId;
  density: "comfortable" | "compact";
  textSize: "standard" | "large";
  reduceMotion: boolean;
  showTaskStats: boolean;
  defaultTaskScope: "live" | "backfill_only" | "live_and_backfill";
  defaultSaveSetup: boolean;
}

export const PREFERENCE_KEYS = [
  "themeId",
  "density",
  "textSize",
  "reduceMotion",
  "showTaskStats",
  "defaultTaskScope",
  "defaultSaveSetup",
] as const satisfies readonly (keyof WorkspacePreferences)[];

export type PreferenceKey = (typeof PREFERENCE_KEYS)[number];
export type PreferencePatch = Partial<WorkspacePreferences>;

export const DEFAULT_PREFERENCES: Readonly<WorkspacePreferences> =
  Object.freeze({
    themeId: DEFAULT_THEME,
    density: "comfortable",
    textSize: "standard",
    reduceMotion: false,
    showTaskStats: true,
    defaultTaskScope: "live",
    defaultSaveSetup: false,
  });

export function isPreferenceValue<K extends PreferenceKey>(
  key: K,
  value: unknown,
): value is WorkspacePreferences[K] {
  switch (key) {
    case "themeId":
      return typeof value === "string" && isTheme(value);
    case "density":
      return value === "comfortable" || value === "compact";
    case "textSize":
      return value === "standard" || value === "large";
    case "reduceMotion":
    case "showTaskStats":
    case "defaultSaveSetup":
      return typeof value === "boolean";
    case "defaultTaskScope":
      return (
        value === "live" ||
        value === "backfill_only" ||
        value === "live_and_backfill"
      );
    default:
      return false;
  }
}

const INVALID_PREFERENCE: Record<PreferenceKey, string> = {
  themeId: "Choose an available theme.",
  density: "Choose comfortable or compact spacing.",
  textSize: "Choose standard or large text.",
  reduceMotion: "Choose whether to reduce motion.",
  showTaskStats: "Choose whether to show task totals.",
  defaultTaskScope: "Choose a valid default for what to copy.",
  defaultSaveSetup: "Choose whether to save new task setups by default.",
};

export function validatePreferencePatch(
  value: unknown,
): { ok: true; patch: PreferencePatch } | { ok: false; description: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, description: "Send your settings as a JSON object." };
  }
  const input = value as Record<string, unknown>;
  for (const key of Object.keys(input)) {
    if (!Object.prototype.hasOwnProperty.call(DEFAULT_PREFERENCES, key)) {
      return {
        ok: false,
        description: "This request includes an unsupported setting.",
      };
    }
    const preferenceKey = key as PreferenceKey;
    if (!isPreferenceValue(preferenceKey, input[key])) {
      return { ok: false, description: INVALID_PREFERENCE[preferenceKey] };
    }
  }
  return { ok: true, patch: input as PreferencePatch };
}
