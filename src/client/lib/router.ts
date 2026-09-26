import { useEffect, useState } from "react";
export type Route =
  | { type: "wizard"; fromSavedId?: string }
  | { type: "task"; taskId: string }
  | {
      type:
        | "active"
        | "paused"
        | "completed"
        | "bots"
        | "saved-tasks"
        | "settings"
        | "help"
        | "empty";
    };
function parseHash(): Route {
  const [kind, value, saved] = window.location.hash
    .replace(/^#\/?/, "")
    .split("/");
  if (kind === "wizard")
    return {
      type: "wizard",
      fromSavedId: value === "from" ? saved : undefined,
    };
  if (kind === "task" && value) return { type: "task", taskId: value };
  if (
    kind === "active" ||
    kind === "paused" ||
    kind === "completed" ||
    kind === "bots" ||
    kind === "saved-tasks" ||
    kind === "settings" ||
    kind === "help"
  )
    return { type: kind };
  return { type: "empty" };
}
export function navigate(path: string) {
  window.location.hash = path;
}
export function useHashRoute(): Route {
  const [route, setRoute] = useState<Route>(parseHash);
  useEffect(() => {
    const change = () => {
      setRoute(parseHash());
      window.scrollTo({ top: 0 });
    };
    window.addEventListener("hashchange", change);
    return () => window.removeEventListener("hashchange", change);
  }, []);
  return route;
}
