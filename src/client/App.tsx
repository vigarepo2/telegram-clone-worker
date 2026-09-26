import { useState } from "react";
import { ToastProvider } from "./components/Toast";
import { LayoutContext } from "./components/LayoutContext";
import { TasksProvider } from "./lib/useTasksContext";
import { AuthProvider, useAuth } from "./lib/useAuth";
import { ThemeProvider, usePreferences, useTheme } from "./lib/themes";
import { THEMES } from "../shared/themeCatalog";
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
  const { theme } = useTheme();
  const {
    loading: preferencesLoading,
    error: preferencesError,
    retry: retryPreferences,
  } = usePreferences();
  const recipe = THEMES.find((item) => item.id === theme) ?? THEMES[0];
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
  if (preferencesLoading)
    return (
      <main className="loading-screen" role="status">
        <span className="brand-mark">
          <Icon name="copy" size={26} />
        </span>
        <p>Loading your saved settings…</p>
      </main>
    );
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
        <div className={`app-shell shell-${recipe.navigation}`}>
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
          <div className="app-main" inert={drawerOpen ? true : undefined}>
            <header className="app-header">
              <div className="header-workspace">
                <button
                  className="icon-button mobile-menu"
                  aria-label="Open navigation"
                  aria-expanded={drawerOpen}
                  onClick={() => setDrawerOpen(true)}
                >
                  <Icon name="menu" />
                </button>
                {recipe.navigation === "bottom" && (
                  <a href="#" className="header-brand">
                    <span className="brand-mark">
                      <Icon name="copy" size={21} />
                    </span>
                    <strong>Telegram Copy</strong>
                  </a>
                )}
                <span className="breadcrumb">
                  <span>Workspace</span> <Icon name="chevron-right" size={14} />
                  <strong>{titles[route.type]}</strong>
                </span>
              </div>
              <div className="header-actions">
                <a className="header-help" href="#help">
                  <Icon name="help" size={18} />
                  <span>Help</span>
                </a>
              </div>
            </header>
            <main id="main-content" className="app-content" tabIndex={-1}>
              {auth.error && (
                <div className="alert alert-error" role="alert">
                  {auth.error}
                </div>
              )}
              {preferencesError && route.type !== "settings" && (
                <div className="alert alert-error" role="alert">
                  <Icon name="alert" />
                  <span>{preferencesError}</span>
                  <button
                    className="button button-secondary button-sm"
                    onClick={() => void retryPreferences()}
                  >
                    Retry settings
                  </button>
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
    <ToastProvider>
      <AuthProvider>
        <ThemeProvider>
          <MainShell />
        </ThemeProvider>
      </AuthProvider>
    </ToastProvider>
  );
}
