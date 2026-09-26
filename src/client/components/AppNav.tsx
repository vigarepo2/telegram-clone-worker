import { useEffect, useRef, useState, type ReactNode } from "react";
import { useHashRoute } from "../lib/router";
import { useTasks } from "../lib/useTasksContext";
import { useAuth } from "../lib/useAuth";
import { useTheme } from "../lib/themes";
import { THEMES } from "../../shared/themeCatalog";
import { useLayout } from "./LayoutContext";
import { Icon, type IconName } from "./Icon";

export function AppNav() {
  const route = useHashRoute();
  const tasks = useTasks();
  const auth = useAuth();
  const { theme } = useTheme();
  const recipe = THEMES.find((item) => item.id === theme) ?? THEMES[0];
  const { drawerOpen, setDrawerOpen } = useLayout();
  const sidebar = useRef<HTMLElement>(null);
  const [mobile, setMobile] = useState(
    () => window.matchMedia("(max-width: 960px)").matches,
  );
  const variant = mobile ? "sidebar" : recipe.navigation;

  useEffect(() => {
    const query = window.matchMedia("(max-width: 960px)");
    const update = () => {
      setMobile(query.matches);
      if (!query.matches) setDrawerOpen(false);
    };
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, [setDrawerOpen]);
  useEffect(() => {
    setDrawerOpen(false);
  }, [route.type]);
  useEffect(() => {
    if (!drawerOpen) return;
    const last = document.activeElement as HTMLElement | null;
    const element = sidebar.current;
    element?.querySelector<HTMLElement>("a,button")?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDrawerOpen(false);
      if (event.key !== "Tab" || !element) return;
      const items = Array.from(
        element.querySelectorAll<HTMLElement>("a,button"),
      ).filter((item) => item.getClientRects().length > 0);
      const first = items[0];
      const end = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        end?.focus();
      } else if (!event.shiftKey && document.activeElement === end) {
        event.preventDefault();
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
    short: string;
    icon: IconName;
    active: boolean;
    count?: number;
  }[] = [
    {
      path: "",
      label: "Active tasks",
      short: "Tasks",
      icon: "tasks",
      active: route.type === "empty" || route.type === "task",
      count: tasks.activeCount,
    },
    {
      path: "paused",
      label: "Paused & attention",
      short: "Paused",
      icon: "pause",
      active: route.type === "paused",
      count: tasks.pausedCount,
    },
    {
      path: "completed",
      label: "History",
      short: "History",
      icon: "history",
      active: route.type === "completed",
    },
    {
      path: "saved-tasks",
      label: "Saved setups",
      short: "Saved",
      icon: "save",
      active: route.type === "saved-tasks",
    },
    {
      path: "bots",
      label: "Bots",
      short: "Bots",
      icon: "bot",
      active: route.type === "bots",
    },
  ];
  const compact = variant === "rail" || variant === "bottom";
  const close = () => setDrawerOpen(false);
  const brand = (
    <a
      className="sidebar-brand"
      href="#"
      onClick={close}
      aria-label="Telegram Copy workspace"
    >
      <span className="brand-mark">
        <Icon name="copy" size={23} />
      </span>
      <span className="brand-copy">
        <strong>Telegram Copy</strong>
        <small>Personal workspace</small>
      </span>
    </a>
  );
  const create = (
    <a
      href="#wizard"
      className="button button-primary sidebar-create"
      onClick={close}
      title={compact ? "Create a new copy task" : undefined}
      aria-label="Create a new copy task"
    >
      <Icon name="plus" />
      <span>{compact ? "New" : "New task"}</span>
    </a>
  );
  const navigation = (
    <nav className="app-nav" aria-label="Main navigation">
      {!compact && variant !== "top" && (
        <span className="nav-section-label">WORKSPACE</span>
      )}
      {items.map((item) => (
        <a
          key={item.path}
          href={`#${item.path}`}
          onClick={close}
          className={`nav-link${item.active ? " is-active" : ""}`}
          aria-current={item.active ? "page" : undefined}
          aria-label={item.label}
          title={compact ? item.label : undefined}
        >
          <Icon className="nav-icon" name={item.icon} />
          <span className="nav-label">{compact ? item.short : item.label}</span>
          {!!item.count && (
            <span className="nav-count" aria-label={`${item.count} tasks`}>
              {item.count}
            </span>
          )}
        </a>
      ))}
    </nav>
  );
  const utilities = (
    <>
      <a
        href="#settings"
        className={`nav-link${route.type === "settings" ? " is-active" : ""}`}
        onClick={close}
        aria-current={route.type === "settings" ? "page" : undefined}
        aria-label="Settings"
        title={compact ? "Settings" : undefined}
      >
        <Icon name="settings" />
        <span className="nav-label">Settings</span>
      </a>
      <a
        href="#help"
        className={`nav-link${route.type === "help" ? " is-active" : ""}`}
        onClick={close}
        aria-current={route.type === "help" ? "page" : undefined}
        aria-label="How it works"
        title={compact ? "Help" : undefined}
      >
        <Icon name="help" />
        <span className="nav-label">{compact ? "Help" : "How it works"}</span>
      </a>
      <button
        className="nav-link"
        onClick={() => void auth.logout()}
        aria-label="Sign out"
        title={compact ? "Sign out" : undefined}
      >
        <Icon name="logout" />
        <span className="nav-label">Sign out</span>
      </button>
    </>
  );
  const status = (
    <div className="workspace-status">
      <Icon name="shield" size={15} />
      <span>Password protected</span>
    </div>
  );
  let contents: ReactNode;
  if (variant === "top")
    contents = (
      <>
        <div className="nav-masthead">
          {brand}
          {create}
          <div className="nav-utility-top">{utilities}</div>
        </div>
        {navigation}
      </>
    );
  else if (variant === "bottom")
    contents = (
      <>
        <div className="bottom-drawer-brand">{brand}</div>
        {create}
        {navigation}
        <div className="sidebar-bottom">{utilities}</div>
      </>
    );
  else if (variant === "floating")
    contents = (
      <>
        {brand}
        <div className="nav-workspace-card">
          {create}
          {navigation}
        </div>
        <div className="sidebar-bottom">
          {utilities}
          {status}
        </div>
      </>
    );
  else if (variant === "right")
    contents = (
      <>
        {brand}
        {navigation}
        {create}
        <div className="sidebar-bottom">
          {utilities}
          {status}
        </div>
      </>
    );
  else
    contents = (
      <>
        {brand}
        {create}
        {navigation}
        <div className="sidebar-bottom">
          {utilities}
          {variant !== "rail" && status}
        </div>
      </>
    );

  const mobileNavigation =
    mobile && ["top", "bottom"].includes(recipe.navigation) ? (
      <nav
        className={`mobile-theme-nav mobile-theme-nav-${recipe.navigation}`}
        aria-label="Quick navigation"
        inert={drawerOpen ? true : undefined}
      >
        <a
          href="#"
          className={`mobile-theme-link${route.type === "empty" || route.type === "task" ? " is-active" : ""}`}
        >
          <Icon name="tasks" />
          <span>Tasks</span>
        </a>
        <a
          href="#bots"
          className={`mobile-theme-link${route.type === "bots" ? " is-active" : ""}`}
        >
          <Icon name="bot" />
          <span>Bots</span>
        </a>
        <a
          href="#wizard"
          className="mobile-theme-link mobile-theme-create"
          aria-label="Create new task"
        >
          <Icon name="plus" />
          <span>New task</span>
        </a>
        <a
          href="#saved-tasks"
          className={`mobile-theme-link${route.type === "saved-tasks" ? " is-active" : ""}`}
        >
          <Icon name="save" />
          <span>Saved</span>
        </a>
        <a
          href="#settings"
          className={`mobile-theme-link${route.type === "settings" ? " is-active" : ""}`}
        >
          <Icon name="settings" />
          <span>Settings</span>
        </a>
      </nav>
    ) : null;
  return (
    <>
      {mobileNavigation}
      {drawerOpen && (
        <button
          className="sidebar-backdrop"
          aria-label="Close navigation"
          onClick={close}
        />
      )}
      <aside
        ref={sidebar}
        className={`app-sidebar navigation-${variant}${drawerOpen ? " is-open" : ""}`}
        aria-label="Workspace navigation"
        role={drawerOpen ? "dialog" : undefined}
        aria-modal={drawerOpen ? true : undefined}
        data-nav-variant={variant}
      >
        <button
          type="button"
          className="icon-button sidebar-close"
          onClick={close}
          aria-label="Close navigation"
        >
          <Icon name="close" />
        </button>
        {contents}
      </aside>
    </>
  );
}
