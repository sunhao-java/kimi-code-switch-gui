import { useCallback, useEffect, useRef, useState } from "react";

import type { Locale } from "@shared/types";
import type { ConfirmDialogState } from "./dialogs";
import { t } from "./i18n";
import { formatMessage } from "./tabComponents";

export function useConfirmDialog(locale: Locale): {
  confirmDialog: ConfirmDialogState | null;
  requestConfirm: (options: ConfirmDialogState) => Promise<boolean>;
  closeConfirmDialog: (confirmed: boolean) => void;
  confirmDeleteResource: (resourceLabel: string, name: string) => Promise<boolean>;
} {
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null);
  const confirmResolverRef = useRef<((value: boolean) => void) | null>(null);

  useEffect(() => {
    return () => {
      confirmResolverRef.current?.(false);
      confirmResolverRef.current = null;
    };
  }, []);

  const requestConfirm = useCallback((options: ConfirmDialogState): Promise<boolean> =>
    new Promise((resolve) => {
      confirmResolverRef.current?.(false);
      confirmResolverRef.current = resolve;
      setConfirmDialog(options);
    }), []);

  const closeConfirmDialog = useCallback((confirmed: boolean): void => {
    const resolver = confirmResolverRef.current;
    confirmResolverRef.current = null;
    setConfirmDialog(null);
    resolver?.(confirmed);
  }, []);

  const confirmDeleteResource = useCallback((resourceLabel: string, name: string): Promise<boolean> =>
    requestConfirm({
      title: formatMessage(t(locale, "deleteResourceConfirm"), {
        resource: resourceLabel,
        name,
      }),
      confirmLabel: t(locale, "delete"),
      cancelLabel: t(locale, "cancel"),
      tone: "danger",
      kind: "delete",
    }), [locale, requestConfirm]);

  return {
    confirmDialog,
    requestConfirm,
    closeConfirmDialog,
    confirmDeleteResource,
  };
}
