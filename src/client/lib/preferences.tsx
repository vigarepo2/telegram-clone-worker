import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { api } from "./api";
import { useAuth } from "./useAuth";
import {
  DEFAULT_PREFERENCES,
  type WorkspacePreferences,
  type ColorMode,
  type ResolvedColorMode,
} from "../../shared/preferences";

type PreferencePatch = Partial<WorkspacePreferences>;
interface PreferencesContextValue {
  preferences: WorkspacePreferences;
  colorMode: ColorMode;
  resolvedMode: ResolvedColorMode;
  loading: boolean;
  saving: boolean;
  isSaving: boolean;
  error: string | null;
  updatePreferences: (patch: PreferencePatch) => Promise<boolean>;
  setColorMode: (mode: ColorMode) => Promise<boolean>;
  retry: () => Promise<void>;
}
const PreferencesContext = createContext<PreferencesContextValue | null>(null);

function readSystemMode(): ResolvedColorMode {
  return typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const { authenticated } = useAuth();
  const [systemMode, setSystemMode] =
    useState<ResolvedColorMode>(readSystemMode);
  useEffect(() => {
    if (!window.matchMedia) return;
    const preference = window.matchMedia("(prefers-color-scheme: dark)");
    const changed = () => setSystemMode(preference.matches ? "dark" : "light");
    changed();
    preference.addEventListener("change", changed);
    return () => preference.removeEventListener("change", changed);
  }, []);
  const [preferences, setPreferences] =
    useState<WorkspacePreferences>(DEFAULT_PREFERENCES);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [pending, setPending] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);
  const revision = useRef(0);
  const savedPreferences = useRef(DEFAULT_PREFERENCES);
  const writeQueue = useRef<Promise<void>>(Promise.resolve());
  const activeSession = useRef(false);
  const hasSavedSnapshot = useRef(false);
  const readSequence = useRef(0);
  const pendingWrites = useRef(0);

  const readPreferences = useCallback(async (session: number) => {
    const sequence = ++readSequence.current;
    const readingRevision = revision.current;
    setLoading(true);
    const result = await api.get<WorkspacePreferences>("/api/preferences");
    if (session !== generation.current || !activeSession.current) return;
    if (sequence !== readSequence.current) return;
    if (readingRevision !== revision.current) {
      setLoading(false);
      return;
    }
    if (result.ok) {
      savedPreferences.current = result.data;
      hasSavedSnapshot.current = true;
      setPreferences(result.data);
      setError(null);
    } else {
      setError(result.description);
    }
    // A failed first read exposes the retry control, but cannot enable writes
    // until there is an actual saved snapshot to preserve.
    setLoaded(true);
    setLoading(false);
  }, []);

  useLayoutEffect(() => {
    const session = ++generation.current;
    activeSession.current = authenticated;
    hasSavedSnapshot.current = false;
    revision.current = 0;
    readSequence.current++;
    pendingWrites.current = 0;
    writeQueue.current = Promise.resolve();
    savedPreferences.current = DEFAULT_PREFERENCES;
    setPreferences(DEFAULT_PREFERENCES);
    setLoaded(false);
    setPending(0);
    setError(null);
    if (authenticated) void readPreferences(session);
    else setLoading(false);
    // Appearance belongs to the signed-in workspace, never to a browser token.
    try {
      localStorage.removeItem("telegram-clone-worker:theme");
    } catch {
      /* Browser storage is optional. */
    }
    return () => {
      activeSession.current = false;
      generation.current++;
    };
  }, [authenticated, readPreferences]);

  const updatePreferences = useCallback(
    (patch: PreferencePatch): Promise<boolean> => {
      if (!authenticated || !activeSession.current)
        return Promise.resolve(false);
      if (!hasSavedSnapshot.current) {
        setError(
          (current) =>
            current ?? "Load your saved settings before making changes.",
        );
        return Promise.resolve(false);
      }
      const session = generation.current;
      const request = ++revision.current;
      readSequence.current++;
      pendingWrites.current++;
      setLoading(false);
      setPreferences((current) => ({ ...current, ...patch }));
      setPending(pendingWrites.current);
      setError(null);
      const operation = writeQueue.current.then(async () => {
        if (session !== generation.current || !activeSession.current)
          return false;
        try {
          const result = await api.patch<WorkspacePreferences>(
            "/api/preferences",
            patch,
          );
          if (session !== generation.current || !activeSession.current)
            return false;
          let saved = result.ok;
          if (result.ok) {
            savedPreferences.current = result.data;
          } else {
            // A timeout can hide a successful server write. Read its actual state
            // before rolling back or processing the next queued change.
            const current =
              await api.get<WorkspacePreferences>("/api/preferences");
            if (session !== generation.current || !activeSession.current)
              return false;
            if (current.ok) {
              savedPreferences.current = current.data;
              saved = Object.entries(patch).every(
                ([key, value]) =>
                  current.data[key as keyof WorkspacePreferences] === value,
              );
            }
            if (!saved)
              setError(`Your change was not saved. ${result.description}`);
          }
          if (request === revision.current) {
            setPreferences(savedPreferences.current);
            if (saved) setError(null);
          }
          return saved;
        } finally {
          if (session === generation.current && activeSession.current) {
            pendingWrites.current = Math.max(0, pendingWrites.current - 1);
            setPending(pendingWrites.current);
          }
        }
      });
      // Keep writes ordered so rapid changes cannot restore an older setting.
      writeQueue.current = operation.then(
        () => undefined,
        () => undefined,
      );
      return operation;
    },
    [authenticated],
  );

  const applied = authenticated && loaded ? preferences : DEFAULT_PREFERENCES;
  const colorMode = applied.colorMode;
  const resolvedMode = colorMode === "system" ? systemMode : colorMode;
  useLayoutEffect(() => {
    const root = document.documentElement;
    for (const attribute of [
      "theme",
      "navigation",
      "taskLayout",
      "settingsLayout",
      "controlStyle",
    ]) {
      delete root.dataset[attribute];
    }
    root.dataset.mode = resolvedMode;
    root.dataset.density = applied.density;
    root.dataset.textSize = applied.textSize;
    root.dataset.reduceMotion = String(applied.reduceMotion);
    root.style.colorScheme = resolvedMode;
    document
      .querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')
      .forEach((meta) => {
        meta.content = resolvedMode === "dark" ? "#10131a" : "#f7f8fa";
      });
  }, [resolvedMode, applied.density, applied.textSize, applied.reduceMotion]);

  const retry = useCallback(async () => {
    if (authenticated && activeSession.current && pendingWrites.current === 0) {
      await readPreferences(generation.current);
    }
  }, [authenticated, readPreferences]);
  const setColorMode = useCallback(
    (mode: ColorMode) => updatePreferences({ colorMode: mode }),
    [updatePreferences],
  );
  const value = useMemo(
    () => ({
      preferences: applied,
      colorMode,
      resolvedMode,
      loading: authenticated && (!loaded || loading),
      saving: pending > 0,
      isSaving: pending > 0,
      error,
      updatePreferences,
      setColorMode,
      retry,
    }),
    [
      applied,
      colorMode,
      resolvedMode,
      authenticated,
      loaded,
      loading,
      pending,
      error,
      updatePreferences,
      setColorMode,
      retry,
    ],
  );

  return (
    <PreferencesContext.Provider value={value}>
      {children}
    </PreferencesContext.Provider>
  );
}

export function usePreferences() {
  const value = useContext(PreferencesContext);
  if (!value) throw new Error("Workspace preferences are unavailable.");
  return value;
}
