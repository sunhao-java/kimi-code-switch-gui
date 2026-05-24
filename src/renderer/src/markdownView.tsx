import type { ReactNode } from "react";
import { Check, Copy } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import type { Locale } from "@shared/types";
import { t } from "./i18n";

export function MarkdownView(props: {
  title: string;
  content: string;
  locale: Locale;
  onCopy?: () => void;
  copied?: boolean;
  headerExtra?: ReactNode;
}): JSX.Element {
  const copyLabel = t(props.locale, "copyContent");
  const copiedLabel = t(props.locale, "copied");
  const body = stripFrontmatter(props.content);

  return (
    <div className="code-panel">
      <div className="code-head">
        <div className="code-head-main">
          <span className="code-head-dots" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
          <span>{props.title}</span>
        </div>
        <div className="code-head-actions">
          {props.headerExtra}
          {props.onCopy ? (
            <button
              className="code-head-copy"
              type="button"
              aria-label={copyLabel}
              title={props.copied ? copiedLabel : copyLabel}
              onClick={props.onCopy}
            >
              {props.copied ? <Check size={15} /> : <Copy size={15} />}
            </button>
          ) : null}
        </div>
      </div>
      <div className="markdown-view" role="region" aria-label={props.title}>
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{body}</ReactMarkdown>
      </div>
    </div>
  );
}

function stripFrontmatter(content: string): string {
  const normalized = content.replace(/\r\n/g, "\n");
  if (!normalized.startsWith("---\n")) {
    return normalized;
  }
  const endIndex = normalized.indexOf("\n---\n", 4);
  if (endIndex < 0) {
    return normalized;
  }
  return normalized.slice(endIndex + 5).replace(/^\n+/, "");
}
