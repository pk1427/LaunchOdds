"use client";

import {
  useEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const VARIANTS: Record<Variant, string> = {
  primary:
    "border border-monad bg-monad text-white hover:bg-blue-700",
  secondary: "bg-white/5 text-slate-100 border border-white/10 hover:bg-white/10",
  ghost: "text-slate-300 hover:bg-white/5 border border-transparent",
  danger: "bg-no/15 text-no border border-no/40 hover:bg-no/25",
};

const SIZES: Record<Size, string> = {
  sm: "px-3 py-1.5 text-xs",
  md: "px-4 py-2 text-sm",
  lg: "px-5 py-2.5 text-base",
};

export function Button({
  variant = "secondary",
  size = "md",
  className = "",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
}) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-1.5 rounded-xl border font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      {...rest}
    />
  );
}

export function GlassCard({
  className = "",
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={`rounded-2xl border border-white/[0.08] bg-white/[0.04] p-5 transition hover:border-white/[0.14] ${className}`}
    >
      {children}
    </div>
  );
}

export function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <GlassCard className="p-4">
      <p className="type-eyebrow">
        {label}
      </p>
      <p className="mt-1 font-mono text-2xl font-bold tabular-nums text-white">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-slate-500">{sub}</p>}
    </GlassCard>
  );
}

const BADGE: Record<string, string> = {
  default: "bg-white/10 text-slate-300",
  accent: "bg-monad/15 text-blue-300",
  yes: "bg-yes/15 text-yes",
  no: "bg-no/15 text-no",
  warn: "bg-yellow-500/15 text-yellow-300",
};

export function Pill({
  tone = "default",
  dot = false,
  className = "",
  children,
}: {
  tone?: keyof typeof BADGE;
  dot?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.12em] ${BADGE[tone]} ${className}`}
    >
      {dot && (
        <span
          className={`h-1.5 w-1.5 rounded-full ${tone === "yes" ? "bg-yes live-dot" : "bg-current"}`}
        />
      )}
      {children}
    </span>
  );
}

export function Tabs<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  ariaLabel?: string;
}) {
  return (
    <div role="tablist" aria-label={ariaLabel} className="flex gap-1 text-sm">
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          onKeyDown={(e) => {
            if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
            const i = options.findIndex((x) => x.value === value);
            const n =
              e.key === "ArrowRight"
                ? (i + 1) % options.length
                : (i - 1 + options.length) % options.length;
            onChange(options[n].value);
          }}
          className={`rounded-full px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.12em] ${
            value === o.value
              ? "bg-monad text-white"
              : "text-slate-400 hover:bg-white/10 hover:text-slate-200"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`skeleton-shimmer rounded-xl bg-white/5 ${className}`} />;
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-8 text-center">
      <p className="font-semibold text-slate-200">{title}</p>
      {body && <p className="mx-auto mt-1 max-w-md text-sm text-slate-400">{body}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      /* clipboard unavailable */
    }
  };
  return (
    <button
      onClick={copy}
      aria-label={`${label}: ${text}`}
      className="rounded-lg bg-white/5 px-2 py-1 text-xs text-slate-400 hover:bg-white/10 hover:text-slate-200"
    >
      {label}
    </button>
  );
}

export function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const [mounted, setMounted] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    setMounted(true);
    const prevFocus = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", onKey);
      if (prevFocus && document.contains(prevFocus)) {
        prevFocus.focus({ preventScroll: true });
      }
    };
  }, []);

  useEffect(() => {
    if (mounted) panelRef.current?.focus({ preventScroll: true });
  }, [mounted]);

  // Portal to document.body: callers render inside the navbar pill, which has
  // backdrop-filter — that makes it the containing block for `fixed`
  // descendants, so without the portal `inset-0` resolves against the small
  // navbar box instead of the viewport and the dialog renders clipped.
  if (!mounted) return null;
  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex overflow-y-auto bg-black/70 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="m-auto w-full max-w-lg rounded-2xl border border-white/10 bg-[#0b0f1a] p-5 outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-lg font-bold">{title}</h3>
          <button
            onClick={onClose}
            aria-label="Close dialog"
            className="rounded-lg px-2 py-1 text-slate-400 hover:bg-white/10 hover:text-white"
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}
