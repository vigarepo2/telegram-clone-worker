import { useEffect, useRef } from "react";
import { useHashRoute } from "../lib/router";
import { useTasks } from "../lib/useTasksContext";
import { useAuth } from "../lib/useAuth";
import { useLayout } from "./LayoutContext";
import { Icon, type IconName } from "./Icon";
export function AppNav() {
  const route = useHashRoute();
  const tasks = useTasks();
  const auth = useAuth();
  const { drawerOpen, setDrawerOpen } = useLayout();
  const sidebar = useRef<HTMLElement>(null);
  useEffect(() => {
    setDrawerOpen(false);
  }, [route.type]);
  useEffect(() => {
    if (!drawerOpen) return;
    const last = document.activeElement as HTMLElement | null;
    const element = sidebar.current;
    element?.querySelector<HTMLElement>("a,button")?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDrawerOpen(false);
      if (e.key !== "Tab" || !element) return;
      const items = Array.from(
        element.querySelectorAll<HTMLElement>("a,button"),
      );
      const first = items[0],
        end = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        end?.focus();
      } else if (!e.shiftKey && document.activeElement === end) {
        e.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", key);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", key);
      document.body.style.overflow = previous;
      last?.focus();
    };
  }, [drawerOpen]);
  const items: {
    path: string;
    label: string;
    icon: IconName;
    active: boolean;
    count?: number;
  }[] = [
    {
      path: "",
      label: "Active tasks",
      icon: "tasks",
      active: route.type === "empty" || route.type === "task",
      count: tasks.activeCount,
    },
    {
      path: "paused",
      label: "Paused & attention",
      icon: "pause",
      active: route.type === "paused",
      count: tasks.pausedCount,
    },
    {
      path: "completed",
      label: "History",
      icon: "history",
      active: route.type === "completed",
    },
    {
      path: "saved-tasks",
      label: "Saved setups",
      icon: "save",
      active: route.type === "saved-tasks",
    },
    { path: "bots", label: "Bots", icon: "bot", active: route.type === "bots" },
  ];
  return (
    <>
      {drawerOpen && (
        <button
          className="sidebar-backdrop"
          aria-label="Close navigation"
          onClick={() => setDrawerOpen(false)}
        />
      )}
      <aside
        ref={sidebar}
        className={`app-sidebar${drawerOpen ? " is-open" : ""}`}
        aria-label="Workspace navigation"
      >
        <a
          className="sidebar-brand"
          href="#"
          onClick={() => setDrawerOpen(false)}
        >
          <span className="brand-mark">
            <Icon name="copy" size={23} />
          </span>
          <span className="brand-copy">
            <strong>Telegram Copy</strong>
            <small>Personal workspace</small>
          </span>
        </a>
        <a
          href="#wizard"
          className="button button-primary sidebar-create"
          onClick={() => setDrawerOpen(false)}
        >
          <Icon name="plus" />
          New task
        </a>
        <nav className="app-nav" aria-label="Main navigation">
          <span className="nav-section-label">WORKSPACE</span>
          {items.map((item) => (
            <a
              key={item.path}
              href={`#${item.path}`}
              onClick={() => setDrawerOpen(false)}
              className={`nav-link${item.active ? " is-active" : ""}`}
              aria-current={item.active ? "page" : undefined}
            >
              <Icon className="nav-icon" name={item.icon} />
              <span className="nav-label">{item.label}</span>
              {!!item.count && <span className="nav-count">{item.count}</span>}
            </a>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <a
            href="#settings"
            className={`nav-link${route.type === "settings" ? " is-active" : ""}`}
            onClick={() => setDrawerOpen(false)}
            aria-current={route.type === "settings" ? "page" : undefined}
          >
            <Icon name="settings" />
            <span className="nav-label">Settings</span>
          </a>
          <a
            href="#help"
            className={`nav-link${route.type === "help" ? " is-active" : ""}`}
            onClick={() => setDrawerOpen(false)}
          >
            <Icon name="help" />
            <span className="nav-label">How it works</span>
          </a>
          <button className="nav-link" onClick={() => void auth.logout()}>
            <Icon name="logout" />
            <span className="nav-label">Sign out</span>
          </button>
          <div className="workspace-status">
            <Icon name="shield" size={15} />
            <span>Password protected</span>
          </div>
        </div>
      </aside>
    </>
  );
}
