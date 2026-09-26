import { useHashRoute } from "../lib/router";
import { useAuth } from "../lib/useAuth";
import { Icon, type IconName } from "./Icon";

export function AppNav() {
  const route = useHashRoute();
  const auth = useAuth();
  const items: {
    path: string;
    label: string;
    mobileLabel: string;
    icon: IconName;
    active: boolean;
  }[] = [
    {
      path: "",
      label: "Tasks",
      mobileLabel: "Tasks",
      icon: "tasks",
      active: [
        "empty",
        "active",
        "paused",
        "completed",
        "task",
        "wizard",
      ].includes(route.type),
    },
    {
      path: "bots",
      label: "Bots",
      mobileLabel: "Bots",
      icon: "bot",
      active: route.type === "bots",
    },
    {
      path: "saved-tasks",
      label: "Saved setups",
      mobileLabel: "Saved",
      icon: "save",
      active: route.type === "saved-tasks",
    },
    {
      path: "settings",
      label: "Settings",
      mobileLabel: "Settings",
      icon: "settings",
      active: route.type === "settings",
    },
  ];
  return (
    <>
      <aside className="app-sidebar" aria-label="Workspace">
        <a className="sidebar-brand" href="#" aria-label="Telegram Copy home">
          <span className="brand-mark">
            <Icon name="logo" size={26} />
          </span>
          <span className="brand-copy">
            <strong>Telegram Copy</strong>
            <small>Your private workspace</small>
          </span>
        </a>
        <nav className="app-nav" aria-label="Main navigation">
          {items.map((item) => (
            <a
              key={item.path}
              href={`#${item.path}`}
              className={`nav-link${item.active ? " is-active" : ""}`}
              aria-current={item.active ? "page" : undefined}
            >
              <Icon name={item.icon} />
              <span>{item.label}</span>
            </a>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <a
            href="#help"
            className={`nav-link${route.type === "help" ? " is-active" : ""}`}
            aria-current={route.type === "help" ? "page" : undefined}
          >
            <Icon name="help" />
            <span>Help & getting started</span>
          </a>
          <button className="nav-link" onClick={() => void auth.logout()}>
            <Icon name="logout" />
            <span>Sign out</span>
          </button>
        </div>
      </aside>
      <nav className="mobile-bottom-nav" aria-label="Mobile navigation">
        {items.map((item) => (
          <a
            key={item.path}
            href={`#${item.path}`}
            className={`mobile-nav-link${item.active ? " is-active" : ""}`}
            aria-current={item.active ? "page" : undefined}
          >
            <Icon name={item.icon} size={21} />
            <span>{item.mobileLabel}</span>
          </a>
        ))}
      </nav>
    </>
  );
}
