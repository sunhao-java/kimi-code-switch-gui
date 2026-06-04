import { useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import type { Locale } from "@shared/types";
import type { CascadeImpact } from "@shared/configRelations";
import { t } from "../i18n";
import { formatMessage } from "../tabComponents";

type CascadeStrategy = "cascade" | "orphan";

interface CascadeDeleteDialogProps {
  locale: Locale;
  targetType: "provider" | "model";
  targetName: string;
  impact: CascadeImpact;
  onConfirm: (strategy: CascadeStrategy) => void;
  onCancel: () => void;
}

export function CascadeDeleteDialog(props: CascadeDeleteDialogProps): JSX.Element {
  const { locale, targetType, targetName, impact, onConfirm, onCancel } = props;
  const [strategy, setStrategy] = useState<CascadeStrategy>("cascade");

  const totalAffected = impact.affectedModels.length + impact.affectedProfiles.length;

  return (
    <div className="dialog-overlay" onClick={onCancel}>
      <div className="dialog cascade-delete-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-header">
          <h3>
            <AlertTriangle size={18} />
            {formatMessage(t(locale, "cascadeWarningTitle"), { type: targetType, name: targetName })}
          </h3>
          <button className="icon-button" type="button" onClick={onCancel} aria-label={t(locale, "close")}>
            <X size={16} />
          </button>
        </div>

        <div className="dialog-body">
          {impact.affectedModels.length > 0 ? (
            <div className="cascade-section">
              <h4>{t(locale, "cascadeAffectedModels")} ({impact.affectedModels.length})</h4>
              <ul className="cascade-list">
                {impact.affectedModels.map((m) => (
                  <li key={m.name}>{m.name}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {impact.affectedProfiles.length > 0 ? (
            <div className="cascade-section">
              <h4>{t(locale, "cascadeAffectedProfiles")} ({impact.affectedProfiles.length})</h4>
              <ul className="cascade-list">
                {impact.affectedProfiles.map((p) => (
                  <li key={p.name}>
                    {p.profile.label || p.name}
                    {impact.isCurrentActive && p.name === impact.suggestedFallbackProfile ? null
                      : impact.isCurrentActive && impact.affectedProfiles.some((ap) => ap.name === p.name) ? " ⚡" : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {impact.isCurrentActive ? (
            <div className="cascade-warning">
              <AlertTriangle size={14} />
              <span>
                {impact.suggestedFallbackProfile
                  ? formatMessage(t(locale, "cascadeActiveFallback"), { name: impact.suggestedFallbackProfile })
                  : t(locale, "cascadeActiveNoFallback")}
              </span>
            </div>
          ) : null}

          <div className="cascade-strategy">
            <label className="cascade-radio">
              <input type="radio" name="strategy" value="cascade" checked={strategy === "cascade"} onChange={() => setStrategy("cascade")} />
              <div>
                <strong>{t(locale, "cascadeDeleteAll")}</strong>
                <span>{formatMessage(t(locale, "cascadeDeleteAllHint"), { count: totalAffected })}</span>
              </div>
            </label>
            <label className="cascade-radio">
              <input type="radio" name="strategy" value="orphan" checked={strategy === "orphan"} onChange={() => setStrategy("orphan")} />
              <div>
                <strong>{t(locale, "cascadeDeleteOnly")}</strong>
                <span>{t(locale, "cascadeDeleteOnlyHint")}</span>
              </div>
            </label>
          </div>
        </div>

        <div className="dialog-footer">
          <button className="action-button secondary" type="button" onClick={onCancel}>
            {t(locale, "cancel")}
          </button>
          <button className="action-button danger" type="button" onClick={() => onConfirm(strategy)}>
            {t(locale, "cascadeConfirmDelete")}
          </button>
        </div>
      </div>
    </div>
  );
}
