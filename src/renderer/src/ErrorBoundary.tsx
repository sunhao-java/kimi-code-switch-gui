import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";
import type { Locale } from "@shared/types";
import { t } from "./i18n";

interface ErrorBoundaryProps {
  fallback?: ReactNode;
  locale?: Locale;
  onError?: (error: Error, info: ErrorInfo) => void;
  onReset?: () => void;
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  showDetails: boolean;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null, showDetails: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error, showDetails: false };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("ErrorBoundary caught an error:", error, info);
    this.props.onError?.(error, info);
  }

  handleReset = (): void => {
    this.props.onReset?.();
    this.setState({ hasError: false, error: null, showDetails: false });
  };

  toggleDetails = (): void => {
    this.setState((prev) => ({ showDetails: !prev.showDetails }));
  };

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      const locale = this.props.locale ?? "en-US";
      return (
        <section className="glass-panel form-panel empty-state" style={{ padding: "28px", borderRadius: "20px" }}>
          <div className="section-title">{t(locale, "errorBoundaryTitle")}</div>
          <p style={{ color: "var(--muted)", lineHeight: 1.7, marginBottom: "16px" }}>
            {this.state.error?.message ?? t(locale, "errorBoundaryDescription")}
          </p>
          {this.state.showDetails && this.state.error?.stack && (
            <pre style={{
              background: "var(--surface, #1a1a2e)",
              color: "var(--muted, #888)",
              padding: "12px",
              borderRadius: "8px",
              fontSize: "12px",
              lineHeight: 1.5,
              overflowX: "auto",
              maxHeight: "240px",
              marginBottom: "16px",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}>
              {this.state.error.stack}
            </pre>
          )}
          <div className="button-row">
            <button className="action-button" type="button" onClick={this.handleReset}>
              {t(locale, "tryAgain")}
            </button>
            <button
              className="action-button"
              type="button"
              onClick={this.toggleDetails}
              style={{ marginLeft: "8px" }}
            >
              {this.state.showDetails ? t(locale, "hideErrorDetails") : t(locale, "showErrorDetails")}
            </button>
          </div>
        </section>
      );
    }
    return this.props.children;
  }
}
