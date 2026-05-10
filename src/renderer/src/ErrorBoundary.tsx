import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";
import type { Locale } from "@shared/types";
import { t } from "./i18n";

interface ErrorBoundaryProps {
  fallback?: ReactNode;
  locale?: Locale;
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
      const locale = this.props.locale ?? "en-US";
      return (
        <section className="glass-panel form-panel empty-state" style={{ padding: "28px", borderRadius: "20px" }}>
          <div className="section-title">{t(locale, "errorBoundaryTitle")}</div>
          <p style={{ color: "var(--muted)", lineHeight: 1.7, marginBottom: "16px" }}>
            {this.state.error?.message ?? t(locale, "errorBoundaryDescription")}
          </p>
          <div className="button-row">
            <button className="action-button" type="button" onClick={this.handleReset}>
              {t(locale, "tryAgain")}
            </button>
          </div>
        </section>
      );
    }
    return this.props.children;
  }
}
