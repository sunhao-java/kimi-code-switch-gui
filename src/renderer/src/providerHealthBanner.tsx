import { useEffect, useRef } from "react";
import { X } from "lucide-react";

import type { ProviderHealthResult } from "./tauri/cli";

export function ProviderHealthBanner(props: {
  results: ProviderHealthResult[];
  emptyLabel: string;
  failLabel: string;
  reasonLabel: (result: ProviderHealthResult) => string;
  closeLabel: string;
  onClose: () => void;
  autoCloseMs?: number;
}): JSX.Element {
  // onClose 每次渲染都是新引用；用 ref 持有最新值，避免把它放进依赖导致定时器被重置。
  const onCloseRef = useRef(props.onClose);
  onCloseRef.current = props.onClose;

  // 组件以 key 强制重挂载来重置计时（父组件每次巡检 key++），这里仅依赖 autoCloseMs。
  useEffect(() => {
    const timer = window.setTimeout(() => onCloseRef.current(), props.autoCloseMs ?? 8000);
    return () => window.clearTimeout(timer);
  }, [props.autoCloseMs]);

  return (
    <div className="providers-health-banner" role="status" aria-live="polite">
      <button
        className="providers-health-banner-close"
        type="button"
        aria-label={props.closeLabel}
        title={props.closeLabel}
        onClick={props.onClose}
      >
        <X size={14} />
      </button>
      {props.results.length === 0 ? (
        <span className="providers-health-empty">{props.emptyLabel}</span>
      ) : (
        <ul className="providers-health-list">
          {props.results.map((result) => (
            <li
              key={result.providerName}
              className={result.ok ? "providers-health-item ok" : "providers-health-item fail"}
            >
              <span className="providers-health-dot" aria-hidden="true" />
              <span className="providers-health-name">{result.providerName}</span>
              <span className="providers-health-reason">
                {result.ok ? props.reasonLabel(result) : `${props.failLabel} · ${props.reasonLabel(result)}`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
