import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Icon } from "./Icon";
type ToastEntry = {
  id: number;
  kind: "success" | "error" | "info";
  message: string;
};
const Context = createContext<{
  show: (kind: ToastEntry["kind"], message: string) => void;
} | null>(null);
export function useToast() {
  const value = useContext(Context);
  if (!value) throw new Error("Notifications are unavailable.");
  return value;
}
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastEntry[]>([]);
  const next = useRef(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const show = useCallback((kind: ToastEntry["kind"], message: string) => {
    const id = next.current++;
    setToasts((list) => [...list.slice(-3), { id, kind, message }]);
    timers.current.push(
      setTimeout(
        () => setToasts((list) => list.filter((item) => item.id !== id)),
        kind === "error" ? 8000 : 4500,
      ),
    );
  }, []);
  return (
    <Context.Provider value={{ show }}>
      {children}
      <div className="toast-stack" aria-live="polite">
        {toasts.map((item) => (
          <div
            className={`toast ${item.kind}`}
            key={item.id}
            role={item.kind === "error" ? "alert" : "status"}
          >
            <Icon
              name={
                item.kind === "success"
                  ? "check-circle"
                  : item.kind === "info"
                    ? "info"
                    : "alert"
              }
            />
            <span>{item.message}</span>
            <button
              className="icon-button"
              aria-label="Dismiss notification"
              onClick={() =>
                setToasts((list) => list.filter((t) => t.id !== item.id))
              }
            >
              <Icon name="close" size={16} />
            </button>
          </div>
        ))}
      </div>
    </Context.Provider>
  );
}
