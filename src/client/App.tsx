import { useState } from "react";
import { ToastProvider } from "./components/Toast";
import { LayoutContext } from "./components/LayoutContext";
import { TasksProvider } from "./lib/useTasksContext";
import { AuthProvider, useAuth } from "./lib/useAuth";
import { ThemeProvider } from "./lib/themes";
import { AuthPage } from "./pages/AuthPage";
import { AppNav } from "./components/AppNav";
import { AppFooter } from "./components/AppFooter";
import { useHashRoute } from "./lib/router";
import { TaskWizardPage } from "./pages/TaskWizardPage";
import { TaskDetailPage } from "./pages/TaskDetailPage";
import { BotsManagePage } from "./pages/BotsManagePage";
import { SavedTasksPage } from "./pages/SavedTasksPage";
import { CompletedTasksPage } from "./pages/CompletedTasksPage";
import { PausedTasksPage } from "./pages/PausedTasksPage";
import { EmptyStatePage } from "./pages/EmptyStatePage";
import { SettingsPage } from "./pages/SettingsPage";
import { HelpPage } from "./pages/HelpPage";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { Icon } from "./components/Icon";
function Page() {
  const route = useHashRoute();
  if (route.type === "wizard")
    return (
      <TaskWizardPage
        key={route.fromSavedId ?? "new"}
        fromSavedId={route.fromSavedId}
      />
    );
  if (route.type === "task")
    return <TaskDetailPage key={route.taskId} taskId={route.taskId} />;
  if (route.type === "paused") return <PausedTasksPage />;
  if (route.type === "completed") return <CompletedTasksPage />;
  if (route.type === "bots") return <BotsManagePage />;
  if (route.type === "saved-tasks") return <SavedTasksPage />;
  if (route.type === "settings") return <SettingsPage />;
  if (route.type === "help") return <HelpPage />;
  return <EmptyStatePage />;
}
function MainShell() {
  const auth = useAuth();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const route = useHashRoute();
  const titles: Record<string, string> = {
    empty: "Tasks",
    wizard: "New task",
    task: "Task details",
    paused: "Paused & attention",
    completed: "History",
    bots: "Bots",
    "saved-tasks": "Saved setups",
    settings: "Settings",
    help: "Help",
  };
  if (auth.loading)
    return (
      <main className="loading-screen" role="status">
        <span className="brand-mark">
          <Icon name="copy" size={26} />
        </span>
        <p>Opening your workspace…</p>
      </main>
    );
  if (auth.error && !auth.authenticated)
    return (
      <main className="loading-screen">
        <Icon name="alert" size={32} />
        <h1>Could not open your workspace</h1>
        <p className="text-muted">{auth.error}</p>
        <button
          className="button button-primary"
          onClick={() => void auth.refreshStatus()}
        >
          Try again
        </button>
      </main>
    );
  if (!auth.authenticated) return <AuthPage />;
  return (
    <TasksProvider>
      <LayoutContext.Provider
        value={{
          sidebarCollapsed: false,
          drawerOpen,
          setDrawerOpen,
          toggleSidebar: () => setDrawerOpen(!drawerOpen),
        }}
      >
        <div className="app-shell">
          <a
            href="#main-content"
            className="skip-link"
            onClick={(event) => {
              event.preventDefault();
              document.getElementById("main-content")?.focus();
            }}
          >
            Skip to content
          </a>
          <AppNav />
          <div className="app-main">
            <header className="app-header">
              <div className="row">
                <button
                  className="icon-button mobile-menu"
                  aria-label="Open navigation"
                  aria-expanded={drawerOpen}
                  onClick={() => setDrawerOpen(true)}
                >
                  <Icon name="menu" />
                </button>
                <span className="breadcrumb">
                  Workspace <Icon name="chevron-right" size={14} />
                  <strong>{titles[route.type]}</strong>
                </span>
              </div>
              <a className="header-help" href="#help">
                <Icon name="help" size={18} />
                <span>Help</span>
              </a>
            </header>
            <main id="main-content" className="app-content" tabIndex={-1}>
              {auth.error && (
                <div className="alert alert-error" role="alert">
                  {auth.error}
                </div>
              )}
              <ErrorBoundary key={route.type}>
                <Page />
              </ErrorBoundary>
            </main>
            <AppFooter />
          </div>
        </div>
      </LayoutContext.Provider>
    </TasksProvider>
  );
}
export default function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <AuthProvider>
          <MainShell />
        </AuthProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}
