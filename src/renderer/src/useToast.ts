import { useState, useCallback } from "react";
import type { ToastType } from "./Toast";

interface ToastItem {
  id: string;
  message: string;
  type: ToastType;
}

interface UseToastReturn {
  toasts: ToastItem[];
  showToast: (message: string, type: ToastType) => void;
  removeToast: (id: string) => void;
}

export function useToast(): UseToastReturn {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const showToast = useCallback((message: string, type: ToastType) => {
    const id = `toast-${Date.now()}-${Math.random()}`;
    setToasts((prev) => [...prev, { id, message, type }]);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  return { toasts, showToast, removeToast };
}
