import { useCallback, useEffect } from "react";
import type { ReactNode, RefObject } from "react";
import { createPortal } from "react-dom";

export function useDialogEscape(onClose: () => void): void {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== "Escape") {
        return;
      }
      event.preventDefault();
      onClose();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);
}

export function DialogShell(props: {
  onClose?: () => void;
  backdropClassName: string;
  dialogClassName: string;
  dialogRef?: RefObject<HTMLElement | null>;
  children: ReactNode;
}): JSX.Element {
  return createPortal(
    <div
      className={props.backdropClassName}
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget && props.onClose) {
          props.onClose();
        }
      }}
    >
      <section ref={props.dialogRef} className={props.dialogClassName} role="dialog" aria-modal="true">
        {props.children}
      </section>
    </div>,
    document.body,
  );
}

const FOCUSABLE_SELECTOR =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

export function useFocusTrap(dialogRef: RefObject<HTMLElement | null>): void {
  const handleKeyDown = useCallback(
    (event: KeyboardEvent): void => {
      if (event.key !== "Tab" || !dialogRef.current) {
        return;
      }

      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      );
      if (focusable.length === 0) {
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey) {
        if (document.activeElement === first) {
          event.preventDefault();
          last.focus();
        }
      } else if (document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    },
    [dialogRef],
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);
}
