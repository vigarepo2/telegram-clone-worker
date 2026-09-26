import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { TaskSummary } from "../../shared/rpcTypes";
import { listAllTasks } from "./api";
import { usePolling } from "./usePolling";
export function isTaskCompleted(t: TaskSummary) {
  return (
    !t.stop_reason &&
    !t.live_enabled &&
    (t.backfill_status === "cancelled" || t.backfill_status === "complete")
  );
}
export function isTaskActive(t: TaskSummary) {
  return (
    !isTaskCompleted(t) &&
    !t.stop_reason &&
    t.backfill_status !== "failed" &&
    !!(
      t.live_enabled ||
      t.backfill_status === "running" ||
      t.backfill_status === "pending"
    )
  );
}
export function isTaskPaused(t: TaskSummary) {
  return !isTaskCompleted(t) && !isTaskActive(t);
}
export function getTaskDisplayInfo(t: {
  label?: string | null;
  source_chat_id: string;
  source_chat_title?: string | null;
  dest_chat_id: string;
  dest_chat_title?: string | null;
}) {
  const source = t.source_chat_title?.trim() || t.source_chat_id,
    dest = t.dest_chat_title?.trim() || t.dest_chat_id;
  const routeText = `${source} → ${dest}`;
  const label = t.label?.trim() || "";
  const defaults = [
    routeText,
    `${t.source_chat_id} → ${t.dest_chat_id}`,
    `${source} -> ${dest}`,
    `${t.source_chat_id} -> ${t.dest_chat_id}`,
  ];
  const isCustomLabel = !!label && !defaults.includes(label);
  return { title: isCustomLabel ? label : routeText, routeText, isCustomLabel };
}
interface TasksContextValue {
  tasks: TaskSummary[];
  activeTasks: TaskSummary[];
  pausedTasks: TaskSummary[];
  completedTasks: TaskSummary[];
  activeCount: number;
  liveCount: number;
  pausedCount: number;
  completedCount: number;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}
const Context = createContext<TasksContextValue | null>(null);
export function TasksProvider({ children }: { children: ReactNode }) {
  const { data, loading, error, refetch } = usePolling(listAllTasks, 8000);
  const tasks = data ?? [];
  const groups = useMemo(
    () => ({
      activeTasks: tasks.filter(isTaskActive),
      pausedTasks: tasks.filter(isTaskPaused),
      completedTasks: tasks.filter(isTaskCompleted),
    }),
    [data],
  );
  return (
    <Context.Provider
      value={{
        tasks,
        ...groups,
        activeCount: groups.activeTasks.length,
        pausedCount: groups.pausedTasks.length,
        completedCount: groups.completedTasks.length,
        liveCount: tasks.filter((t) => t.live_enabled && !t.stop_reason).length,
        loading,
        error,
        refetch,
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useTasks() {
  const value = useContext(Context);
  if (!value) throw new Error("Tasks are unavailable.");
  return value;
}
