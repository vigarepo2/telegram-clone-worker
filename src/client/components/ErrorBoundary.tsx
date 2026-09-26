import { Component, type ReactNode } from "react";
import { Icon } from "./Icon";
export class ErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  render() {
    return this.state.hasError ? (
      <div className="card empty-state">
        <Icon name="alert" size={32} />
        <h2>This page could not load</h2>
        <p className="text-muted">
          Refresh the page to try again. Your saved tasks are unchanged.
        </p>
        <button
          className="button button-primary"
          onClick={() => window.location.reload()}
        >
          <Icon name="refresh" />
          Refresh page
        </button>
      </div>
    ) : (
      this.props.children
    );
  }
}
