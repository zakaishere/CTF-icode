"use client";
import { Component, ErrorInfo, ReactNode } from "react";
import { logger } from "@/lib/logger";

interface Props { children: ReactNode; fallback?: ReactNode; context?: string; }
interface State { hasError: boolean; error: Error | null; }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("ErrorBoundary caught:", error.message);
    console.error("Stack:", error.stack);
    console.error("Component stack:", info.componentStack);
    logger.error(
      this.props.context ?? "ErrorBoundary",
      error.message ?? String(error),
      error
    );
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 24, color: "red" }}>
          <h2>Something went wrong</h2>
          {process.env.NODE_ENV === "development" && (
            <pre style={{ fontSize: 12, whiteSpace: "pre-wrap" }}>
              {this.state.error?.message}
              {"\n\n"}
              {this.state.error?.stack}
            </pre>
          )}
        </div>
      );
    }
    return this.props.children;
  }
}
