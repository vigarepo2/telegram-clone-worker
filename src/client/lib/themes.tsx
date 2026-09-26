import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export const THEMES = [
  {
    id: "cloud",
    name: "Cloud",
    description: "Clear blue, spacious sidebar",
    layout: "sidebar",
    colors: ["#f6f8fc", "#ffffff", "#2767dd", "#dce4f1"],
  },
  {
    id: "graphite",
    name: "Graphite",
    description: "Dark workspace, compact navigation",
    layout: "rail",
    colors: ["#15171c", "#20232b", "#a7bfff", "#3c414e"],
  },
  {
    id: "paper",
    name: "Paper",
    description: "Editorial type, navigation above",
    layout: "top",
    colors: ["#f6f4ef", "#fffefa", "#3c5141", "#d7d3c8"],
  },
  {
    id: "sage",
    name: "Sage",
    description: "Floating sidebar, soft green panels",
    layout: "floating",
    colors: ["#edf3ef", "#ffffff", "#27654c", "#cdded3"],
  },
  {
    id: "studio",
    name: "Studio",
    description: "Top bar, bold type, square controls",
    layout: "top",
    colors: ["#f3f2f9", "#ffffff", "#6a42c2", "#ddd7ed"],
  },
  {
    id: "midnight",
    name: "Midnight",
    description: "Deep blue, navigation on the right",
    layout: "right",
    colors: ["#0e1728", "#172439", "#79cdf0", "#33465f"],
  },
  {
    id: "terracotta",
    name: "Terracotta",
    description: "Warm tones, generous card spacing",
    layout: "sidebar",
    colors: ["#f8f2ed", "#fffcf9", "#a4442d", "#e6d7cd"],
  },
  {
    id: "contrast",
    name: "Contrast",
    description: "Black and white, clear outlines",
    layout: "top",
    colors: ["#ffffff", "#ffffff", "#171717", "#171717"],
  },
  {
    id: "terminal",
    name: "Terminal",
    description: "Monospaced text, dense workspace",
    layout: "rail",
    colors: ["#111a18", "#192622", "#8cd8b4", "#365449"],
  },
  {
    id: "canvas",
    name: "Canvas",
    description: "Rounded controls, quiet neutral cards",
    layout: "floating",
    colors: ["#f1f0ed", "#ffffff", "#474847", "#deded9"],
  },
] as const;

export type ThemeId = (typeof THEMES)[number]["id"];
const STORAGE_KEY = "telegram-clone-worker:theme";
const DEFAULT_THEME: ThemeId = "cloud";

function isTheme(value: unknown): value is ThemeId {
  return (
    typeof value === "string" && THEMES.some((theme) => theme.id === value)
  );
}

function readTheme(): ThemeId {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return isTheme(value) ? value : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

const ThemeContext = createContext<{
  theme: ThemeId;
  setTheme: (theme: ThemeId) => void;
} | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<ThemeId>(readTheme);

  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = [
      "graphite",
      "midnight",
      "terminal",
    ].includes(theme)
      ? "dark"
      : "light";
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // The current theme still works when browser storage is unavailable.
    }
  }, [theme]);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY)
        setTheme(isTheme(event.newValue) ? event.newValue : DEFAULT_THEME);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const value = useMemo(() => ({ theme, setTheme }), [theme]);
  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used within ThemeProvider");
  return context;
}
