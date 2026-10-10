import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-[#3b5bff]/25 text-white border border-[#4F9BFF]/60 hover:bg-[#3b5bff]/40",
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
      className={`rounded-2xl border border-white/[0.08] bg-white/[0.04] p-5 backdrop-blur transition hover:border-white/[0.14] hover:shadow-[0_0_40px_-12px_rgba(131,110,249,0.45)] ${className}`}
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
      <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-slate-400">
        {label}
      </p>
      <p className="mt-1 font-mono text-2xl font-bold tabular-nums text-white">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-slate-500">{sub}</p>}
    </GlassCard>
  );
}

const BADGE: Record<string, string> = {
  default: "bg-white/10 text-slate-300",
  accent: "bg-monad/20 text-[#b7a8ff]",
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
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 font-mono text-[11px] font-semibold uppercase tracking-[0.12em] ${BADGE[tone]} ${className}`}
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
          className={`rounded-full px-3 py-1.5 font-mono text-xs uppercase tracking-[0.12em] ${
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
      className="rounded-lg bg-white/5 px-2 py-1 font-mono text-xs text-slate-400 hover:bg-white/10 hover:text-slate-200"
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
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="w-full max-w-md rounded-2xl border border-white/10 bg-[#0b0f1a] p-5"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
        }}
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
    </div>
  );
}
