"use client";

import * as React from "react";
import { Terminal } from "lucide-react";

interface LoadingScreenProps {
  /** Page-level headline. Defaults to "Establishing secure channel". */
  label?: string;
  /** Compact mode — drops the boot log lines, only spinner + label. */
  compact?: boolean;
  /** Optional CSS overrides. */
  style?: React.CSSProperties;
  className?: string;
}

const BOOT_LINES: { ok: string; tag: string }[] = [
  { ok: "OK", tag: "icode-shell      : booting" },
  { ok: "OK", tag: "auth handshake   : established" },
  { ok: "OK", tag: "competition rt   : loaded" },
  { ok: "OK", tag: "scoring engine   : online" },
  { ok: "..", tag: "decrypting frame :" },
];

/**
 * iCODE custom loading screen — terminal boot vibes, blue palette.
 * Drop-in replacement for ad-hoc `<Loader2 spinning />` blocks.
 */
export function LoadingScreen({
  label = "Establishing secure channel",
  compact = false,
  style,
  className,
}: LoadingScreenProps) {
  const [step, setStep] = React.useState(compact ? BOOT_LINES.length : 0);
  const [reducedMotion, setReducedMotion] = React.useState(false);

  React.useEffect(() => {
    const m = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    setReducedMotion(!!m?.matches);
  }, []);

  React.useEffect(() => {
    if (compact || reducedMotion) {
      setStep(BOOT_LINES.length);
      return;
    }
    let i = 0;
    setStep(0);
    const t = setInterval(() => {
      i += 1;
      setStep(s => Math.min(BOOT_LINES.length, s + 1));
      if (i >= BOOT_LINES.length) clearInterval(t);
    }, 240);
    return () => clearInterval(t);
  }, [compact, reducedMotion]);

  return (
    <div
      className={className}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 18,
        padding: compact ? "40px 16px" : "60px 16px",
        ...style,
      }}
    >
      {/* Spinning blue ring + terminal icon */}
      <div
        style={{
          position: "relative",
          width: 64,
          height: 64,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <span
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: "50%",
            border: "2px solid rgba(96,165,255,0.18)",
            borderTopColor: "#60a5ff",
            borderRightColor: "rgba(96,165,255,0.6)",
            animation: reducedMotion ? "none" : "spin 1.1s linear infinite",
            boxShadow: "0 0 24px rgba(96,165,255,0.35)",
          }}
        />
        <Terminal size={22} color="#60a5ff" />
      </div>

      <div
        style={{
          fontFamily: "'Chakra Petch', system-ui, sans-serif",
          fontSize: 13,
          fontWeight: 700,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color: "#eaf0ff",
        }}
      >
        <span>{label}</span>
        <span className="icode-cursor" />
      </div>

      {!compact && (
        <pre
          aria-hidden="true"
          style={{
            margin: 0,
            padding: "14px 18px",
            background: "rgba(6,12,30,0.6)",
            border: "1px solid rgba(96,165,255,0.15)",
            borderRadius: 8,
            fontFamily: "'JetBrains Mono', ui-monospace, monospace",
            fontSize: 11,
            lineHeight: 1.7,
            color: "#a9b8d8",
            minWidth: 320,
            maxWidth: 440,
            textAlign: "left",
            boxShadow: "0 0 32px rgba(96,165,255,0.06) inset",
          }}
        >
          {BOOT_LINES.slice(0, step).map((line, i) => (
            <div key={i} style={{ opacity: i === step - 1 ? 0.95 : 0.7 }}>
              <span
                style={{
                  color: line.ok === "OK" ? "#60a5ff" : "#fbbf24",
                  marginRight: 8,
                }}
              >
                [ {line.ok} ]
              </span>
              <span>{line.tag}</span>
              {i === step - 1 && line.ok !== "OK" && (
                <span className="icode-cursor" />
              )}
            </div>
          ))}
          {step === 0 && <div style={{ opacity: 0.4 }}>&nbsp;</div>}
        </pre>
      )}
    </div>
  );
}

export default LoadingScreen;
