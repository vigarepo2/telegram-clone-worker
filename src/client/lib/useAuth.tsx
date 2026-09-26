import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { api } from "./api";

type Status = {
  mode: "enforced" | "setup_required";
  source: "env" | "d1" | "none";
  authenticated: boolean;
  setupCodeRequired?: boolean;
};
type Outcome = { ok: boolean; error?: string };
interface AuthContextValue extends Status {
  loading: boolean;
  error: string | null;
  login: (password: string) => Promise<Outcome>;
  setup: (password: string, setupCode: string) => Promise<Outcome>;
  logout: () => Promise<void>;
  refreshStatus: () => Promise<void>;
}
const AuthContext = createContext<AuthContextValue | null>(null);
export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>({
    mode: "enforced",
    source: "none",
    authenticated: false,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const refreshStatus = useCallback(async () => {
    const result = await api.get<Status>("/api/auth/status");
    if (result.ok) {
      setStatus(result.data);
      setError(null);
    } else setError(result.description);
    setLoading(false);
  }, []);
  useEffect(() => {
    // Retire old browser-stored credentials after upgrading.
    try {
      localStorage.removeItem("tg_auth_token");
      localStorage.removeItem("tg_auth_skip_setup");
    } catch {
      /* Storage may be disabled. */
    }
    void refreshStatus();
    const expired = () =>
      setStatus((value) => ({ ...value, authenticated: false }));
    window.addEventListener("tg_auth_unauthorized", expired);
    return () => window.removeEventListener("tg_auth_unauthorized", expired);
  }, [refreshStatus]);
  async function authenticate(path: string, body: unknown): Promise<Outcome> {
    const result = await api.post(path, body);
    if (!result.ok) return { ok: false, error: result.description };
    await refreshStatus();
    return { ok: true };
  }
  return (
    <AuthContext.Provider
      value={{
        ...status,
        loading,
        error,
        refreshStatus,
        login: (password) => authenticate("/api/auth/login", { password }),
        setup: (password, setupCode) =>
          authenticate("/api/auth/setup", { password, setupCode }),
        logout: async () => {
          const result = await api.post("/api/auth/logout");
          if (result.ok) {
            setStatus((value) => ({ ...value, authenticated: false }));
            await refreshStatus();
          } else setError(result.description);
        },
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("Authentication is unavailable.");
  return value;
}
