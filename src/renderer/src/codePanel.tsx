import type { ReactNode } from "react";
import { Check, Copy } from "lucide-react";
import type { Locale } from "@shared/types";
import { t } from "./i18n";

export function CodePanel(props: { title: string; content: string; locale: Locale; onCopy?: () => void; copied?: boolean; headerExtra?: ReactNode }): JSX.Element {
  return (
    <div className="code-panel">
      <CodePanelHeader title={props.title} locale={props.locale} onCopy={props.onCopy} copied={props.copied} headerExtra={props.headerExtra} />
      <div className="code-window" role="region" aria-label={props.title}>
        <ol className="code-lines">
          {toDisplayLines(props.content).map((line, index) => (
            <li key={`${index}-${line}`} className="code-line">
              <span className="code-line-number">{index + 1}</span>
              <code>{line || " "}</code>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

function CodePanelHeader(props: { title: string; locale: Locale; onCopy?: () => void; copied?: boolean; headerExtra?: ReactNode }): JSX.Element {
  const copyLabel = t(props.locale, "copyContent");
  const copiedLabel = t(props.locale, "copied");
  return (
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
  );
}

function toDisplayLines(content: string): string[] {
  const normalized = content.trimEnd();
  return normalized ? normalized.split("\n") : [""];
}
