import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";

interface ErrorBoundaryProps {
  fallback?: ReactNode;
  onError?: (error: Error, info: ErrorInfo) => void;
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("ErrorBoundary caught an error:", error, info);
    this.props.onError?.(error, info);
  }

  handleReset = (): void => {
    this.setState({ hasError: false, error: null });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      return (
        <section className="glass-panel form-panel empty-state" style={{ padding: "28px", borderRadius: "20px" }}>
          <div className="section-title">Something went wrong</div>
          <p style={{ color: "var(--muted)", lineHeight: 1.7, marginBottom: "16px" }}>
            {this.state.error?.message ?? "An unexpected error occurred in this section."}
          </p>
          <div className="button-row">
            <button className="action-button" type="button" onClick={this.handleReset}>
              Try Again
            </button>
          </div>
        </section>
      );
    }
    return this.props.children;
  }
}
