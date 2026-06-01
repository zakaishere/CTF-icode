"use client";

import * as React from "react";
import {
  AlertTriangle,
  Lock,
  RefreshCw,
  Inbox,
  ShieldAlert,
  type LucideIcon,
} from "lucide-react";

export type ErrorStateVariant = "error" | "warning" | "empty";

export interface ErrorStateProps {
  /** Short headline, e.g. "Connection lost". */
  title: string;
  /** Body message — what went wrong / what to do next. */
  message?: React.ReactNode;
  /** Override the icon. Defaults to AlertTriangle (error) / ShieldAlert (warning) / Inbox (empty). */
  icon?: LucideIcon;
  /** Visual tone — picks the accent + default icon. */
  variant?: ErrorStateVariant;
  /** Show a retry button. */
  onRetry?: () => void;
  /** Custom retry button label (default "Retry"). */
  retryLabel?: string;
  /** Optional CSS-only override for layout (e.g. `marginTop: 20`). */
  style?: React.CSSProperties;
  className?: string;
  /**
   * Optional extra content (e.g. a back link) rendered after the retry button.
   */
  children?: React.ReactNode;
}

const VARIANT = {
  error:   { accent: "#ef4444", subtle: "rgba(239,68,68,0.08)",  border: "rgba(239,68,68,0.28)",  icon: AlertTriangle },
  warning: { accent: "#f59e0b", subtle: "rgba(245,158,11,0.08)", border: "rgba(245,158,11,0.28)", icon: ShieldAlert  },
  empty:   { accent: "#60a5ff", subtle: "rgba(96,165,255,0.08)", border: "rgba(96,165,255,0.22)", icon: Inbox        },
} as const;

/**
 * Shared framed message component for error / failure / empty states.
 * Renders an icon, title, body, and optional retry button inside a
 * bracketed iCODE frame (see `.icode-frame` in globals.css).
 *
 * Uses the iCODE blue/red palette — never green.
 */
export function ErrorState({
  title,
  message,
  icon,
  variant = "error",
  onRetry,
  retryLabel = "Retry",
  style,
  className,
  children,
}: ErrorStateProps) {
  const v = VARIANT[variant];
  const Icon = icon ?? v.icon;

  return (
    <div
      className={`icode-frame ${className ?? ""}`.trim()}
      style={{
        // expose the accent to the frame's ::before / ::after pseudo-elements
        ["--icode-accent" as never]: v.accent,
        maxWidth: 520,
        margin: "32px auto",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        textAlign: "center",
        gap: 14,
        ...style,
      }}
    >
      <div
        style={{
          width: 56,
          height: 56,
          borderRadius: "50%",
          background: v.subtle,
          border: `1px solid ${v.border}`,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          color: v.accent,
          boxShadow: `0 0 28px ${v.subtle}`,
        }}
      >
        <Icon size={24} />
      </div>

      <h3
        style={{
          fontFamily: "'Chakra Petch', system-ui, sans-serif",
          fontSize: 16,
          fontWeight: 700,
          color: "var(--text-primary, #eaf0ff)",
          letterSpacing: "0.04em",
          textTransform: "uppercase",
          margin: 0,
        }}
      >
        {title}
      </h3>

      {message && (
        <p
          style={{
            fontSize: 13,
            lineHeight: 1.55,
            color: "var(--text-muted, #97a0af)",
            maxWidth: 360,
            margin: 0,
          }}
        >
          {message}
        </p>
      )}

      {(onRetry || children) && (
        <div
          style={{
            display: "flex",
            gap: 10,
            alignItems: "center",
            marginTop: 6,
            flexWrap: "wrap",
            justifyContent: "center",
          }}
        >
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="btn btn-md"
              style={{
                background: v.subtle,
                color: v.accent,
                border: `1px solid ${v.border}`,
                fontFamily: "'JetBrains Mono', ui-monospace, monospace",
                letterSpacing: "0.04em",
              }}
            >
              <RefreshCw size={14} />
              <span>{retryLabel}</span>
            </button>
          )}
          {children}
        </div>
      )}
    </div>
  );
}

// Convenience re-exports for common icon overrides at call sites.
export const ErrorStateIcons = { AlertTriangle, Lock, Inbox, ShieldAlert };

export default ErrorState;
