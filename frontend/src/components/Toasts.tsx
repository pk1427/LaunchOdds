"use client";

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";

export type ToastKind = "pending" | "confirming" | "success" | "error";

export interface Toast {
  id: number;
  kind: ToastKind;
  title: string;
  body?: string;
  link?: { href: string; label: string };
}

interface ToastCtx {
  push: (t: Omit<Toast, "id">) => number;
  update: (id: number, patch: Partial<Omit<Toast, "id">>) => void;
  dismiss: (id: number) => void;
}

const Ctx = createContext<ToastCtx | null>(null);

export function useToasts(): ToastCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useToasts must be used inside ToastProvider");
  return ctx;
}

const KIND_STYLE: Record<ToastKind, string> = {
  pending: "border-yellow-500/40",
  confirming: "border-yellow-500/40",
  success: "border-yes/50",
  error: "border-no/50",
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((ts) => ts.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (t: Omit<Toast, "id">) => {
      const id = nextId.current++;
      setToasts((ts) => [...ts, { ...t, id }]);
      if (t.kind === "success" || t.kind === "error") {
        setTimeout(() => dismiss(id), 9000);
      }
      return id;
    },
    [dismiss],
  );

  const update = useCallback(
    (id: number, patch: Partial<Omit<Toast, "id">>) => {
      setToasts((ts) => ts.map((t) => (t.id === id ? { ...t, ...patch } : t)));
      if (patch.kind === "success" || patch.kind === "error") {
        setTimeout(() => dismiss(id), 9000);
      }
    },
    [dismiss],
  );

  return (
    <Ctx.Provider value={{ push, update, dismiss }}>
      {children}
      <div className="fixed bottom-4 right-4 z-[100] flex w-80 flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`rounded-xl border bg-[#14141f] p-3 shadow-xl ${KIND_STYLE[t.kind]}`}
          >
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-semibold">{t.title}</p>
              <button
                onClick={() => dismiss(t.id)}
                className="text-gray-500 hover:text-gray-300"
                aria-label="Dismiss"
              >
                ×
              </button>
            </div>
            {t.body && <p className="mt-0.5 break-words text-xs text-gray-400">{t.body}</p>}
            {t.link && (
              <a
                href={t.link.href}
                target="_blank"
                rel="noreferrer"
                className="mt-1 inline-block text-xs text-monad underline"
              >
                {t.link.label}
              </a>
            )}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
