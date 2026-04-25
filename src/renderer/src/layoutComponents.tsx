import { Copy, Star } from "lucide-react";

import type { Locale } from "@shared/types";

import { t } from "./i18n";

export function SplitLayout(props: {
  listTitle: string;
  listItems: string[];
  itemLabel?: (item: string) => string;
  renderItemLabel?: (item: string) => JSX.Element | string;
  itemTitle?: (item: string) => string;
  dirtyItems?: Set<string>;
  dirtyLabel?: string;
  selectedItem: string;
  highlightedItem?: string;
  onSelect: (item: string) => void;
  copyLabel?: string;
  onCopy?: (item: string) => void;
  addLabel: string;
  onAdd: () => void;
  addButtonContent?: JSX.Element;
  addButtonTitle?: string;
  addButtonClassName?: string;
  itemClassName?: (item: string) => string | null;
  renderItemAction?: (item: string) => JSX.Element | null;
  headerActions?: JSX.Element | null;
  reverse?: boolean;
  children: JSX.Element;
}): JSX.Element {
  return (
    <section className={props.reverse ? "split-layout split-layout-reverse" : "split-layout"}>
      <div className="glass-panel list-panel">
        <div className="list-header">
          <div className="section-title">{props.listTitle}</div>
          <div className="list-header-actions">
            {props.headerActions}
            <button
              className={props.addButtonClassName ?? "action-button compact"}
              type="button"
              aria-label={props.addButtonTitle ?? props.addLabel}
              title={props.addButtonTitle ?? props.addLabel}
              onClick={props.onAdd}
            >
              {props.addButtonContent ?? props.addLabel}
            </button>
          </div>
        </div>
        <div className="list-scroll">
          {props.listItems.map((item) => (
            <div
              key={item}
              className={[
                "list-row",
                item === props.selectedItem ? "active" : "",
                item === props.highlightedItem ? "current" : "",
                props.itemClassName?.(item) ?? "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              <button
                className="list-item"
                title={props.itemTitle ? props.itemTitle(item) : props.itemLabel ? props.itemLabel(item) : item}
                onClick={() => {
                  if (item === props.selectedItem) return;
                  props.onSelect(item);
                }}
              >
                {props.renderItemLabel ? props.renderItemLabel(item) : props.itemLabel ? props.itemLabel(item) : item}
              </button>
              {props.dirtyItems?.has(item) ? (
                <span className="list-dirty-badge" title={props.dirtyLabel} aria-label={props.dirtyLabel}>
                  <Star size={14} fill="currentColor" />
                </span>
              ) : null}
              <div className="list-row-actions">
                {props.copyLabel && props.onCopy ? (
                  <button
                    className="list-copy-button"
                    type="button"
                    aria-label={`${props.copyLabel} ${item}`}
                    title={props.copyLabel}
                    onClick={() => props.onCopy?.(item)}
                  >
                    <Copy size={15} />
                  </button>
                ) : null}
                {props.renderItemAction?.(item)}
              </div>
            </div>
          ))}
        </div>
      </div>
      {props.children}
    </section>
  );
}

export function EmptyState(props: { locale: Locale }): JSX.Element {
  return (
    <section className="glass-panel form-panel empty-state">
      <div className="section-title">{t(props.locale, "emptyState")}</div>
      <p>{t(props.locale, "addHint")}</p>
    </section>
  );
}
