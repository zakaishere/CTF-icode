"use client";

import { useEffect, useState } from "react";
import {
  Bell, Lightbulb, AlertTriangle, Pause, Play, Snowflake, Flame,
  Megaphone, Trophy, Ban, Sparkles, X,
} from "lucide-react";
import type { CTFNotificationDTO, CTFNotificationType } from "@/lib/api";

const MAX_VISIBLE = 3;
const STICKY_TYPES: CTFNotificationType[] = ["TEAM_DISQUALIFIED", "COMPETITION_ENDED"];
const IMPORTANT_TYPES: CTFNotificationType[] = ["COMPETITION_ENDING_SOON", "COMPETITION_PAUSED"];

const CATEGORY_COLOR: Record<string, string> = {
  CRYPTO:    "#a78bfa",
  FORENSICS: "#60a5ff",
  REVERSE:   "#fb923c",
  WEB:       "#f87171",
  PWN:       "#facc15",
  OSINT:     "#34d399",
  MISC:      "#6b7ea3",
};

interface Props {
  toasts:      CTFNotificationDTO[];
  onDismiss:   (id: string) => void;
  onAction?:   (notif: CTFNotificationDTO) => void;
}

export default function CTFNotificationToast({ toasts, onDismiss, onAction }: Props) {
  const visible = toasts.slice(0, MAX_VISIBLE);
  return (
    <div style={{
      position: "fixed", top: 16, right: 16, zIndex: 90,
      display: "flex", flexDirection: "column", gap: 8,
      pointerEvents: "none",
    }}>
      {visible.map(n => (
        <ToastCard key={n.id} notif={n} onDismiss={onDismiss} onAction={onAction} />
      ))}
    </div>
  );
}

function ToastCard({ notif, onDismiss, onAction }:
  { notif: CTFNotificationDTO; onDismiss: (id: string) => void; onAction?: (n: CTFNotificationDTO) => void }) {
  const [leaving, setLeaving] = useState(false);
  const sticky    = STICKY_TYPES.includes(notif.type);
  const important = IMPORTANT_TYPES.includes(notif.type);
  const duration  = sticky ? 0 : (important ? 8000 : 6000);

  useEffect(() => {
    if (duration === 0) return;
    const t = setTimeout(() => setLeaving(true), duration);
    const t2 = setTimeout(() => onDismiss(notif.id), duration + 220);
    return () => { clearTimeout(t); clearTimeout(t2); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [duration]);

  const style = stylesFor(notif);
  const action = actionFor(notif);

  return (
    <div
      role="status"
      style={{
        width: 340, pointerEvents: "auto",
        background: style.bg,
        border: `1px solid ${style.border}`,
        borderLeft: `3px solid ${style.accent}`,
        borderRadius: 8, padding: "12px 14px",
        boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
        display: "flex", gap: 10, alignItems: "flex-start",
        animation: leaving ? "ctf-toast-out 200ms ease forwards" : "ctf-toast-in 220ms ease",
        color: style.fg,
      }}
    >
      <div style={{ marginTop: 1, flexShrink: 0, color: style.accent }}>{style.icon}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: style.fg }}>{notif.title}</div>
          <button
            type="button"
            onClick={() => { setLeaving(true); setTimeout(() => onDismiss(notif.id), 200); }}
            style={{
              background: "transparent", border: "none", cursor: "pointer",
              color: style.fg, opacity: 0.6, padding: 0, lineHeight: 0,
            }}
            aria-label="Dismiss notification"
          >
            <X size={14} />
          </button>
        </div>
        {notif.body && (
          <div style={{
            fontSize: 12, color: style.body, marginTop: 4, lineHeight: 1.45,
            fontStyle: notif.type === "CUSTOM" ? "italic" : "normal",
            whiteSpace: "pre-wrap", wordBreak: "break-word",
          }}>
            {notif.body}
          </div>
        )}
        {action && onAction && (
          <button
            type="button"
            onClick={() => onAction(notif)}
            style={{
              marginTop: 8, background: "transparent",
              color: style.accent, border: `1px solid ${style.accent}55`,
              borderRadius: 4, padding: "3px 10px",
              fontSize: 11, fontWeight: 700, cursor: "pointer",
            }}
          >
            {action} →
          </button>
        )}
      </div>

      <style jsx global>{`
        @keyframes ctf-toast-in {
          from { transform: translateX(40px); opacity: 0; }
          to   { transform: translateX(0); opacity: 1; }
        }
        @keyframes ctf-toast-out {
          from { transform: translateX(0); opacity: 1; }
          to   { transform: translateX(40px); opacity: 0; }
        }
      `}</style>
    </div>
  );
}

// ── Style + action lookup ─────────────────────────────────────────────────────

interface ToastStyle {
  icon:   React.ReactNode;
  accent: string;
  bg:     string;
  border: string;
  fg:     string;
  body:   string;
}

function stylesFor(n: CTFNotificationDTO): ToastStyle {
  const slate = { bg: "rgba(8,15,36,0.96)", border: "rgba(130,165,255,0.15)", fg: "#eaf0ff", body: "#a9b8d8" };

  switch (n.type) {
    case "NEW_CHALLENGE": {
      // Border accent picks up the category color so the toast feels tied to
      // the challenge that just dropped.
      const cat = typeof n.metadata?.category === "string" ? n.metadata.category : undefined;
      const accent = (cat && CATEGORY_COLOR[cat]) || "#a78bfa";
      return { ...slate, icon: <Sparkles size={16} />, accent };
    }
    case "HINT_ADDED":
      return { ...slate, icon: <Lightbulb size={16} />, accent: "#fbbf24" };
    case "CHALLENGE_UPDATED":
      return { ...slate, icon: <Bell size={16} />, accent: "#60a5ff" };
    case "COMPETITION_PAUSED":
      return { ...slate, icon: <Pause size={16} />, accent: "#f59e0b" };
    case "COMPETITION_RESUMED":
      return { ...slate, icon: <Play size={16} />, accent: "#34d399" };
    case "COMPETITION_ENDING_SOON":
      return { ...slate, icon: <AlertTriangle size={16} />, accent: "#f87171" };
    case "COMPETITION_ENDED":
      return { ...slate, icon: <Trophy size={16} />, accent: "#4a5874" };
    case "COMPETITION_STARTED":
      return { ...slate, icon: <Trophy size={16} />, accent: "#34d399" };
    case "SCOREBOARD_FROZEN":
      return { ...slate, icon: <Snowflake size={16} />, accent: "#22d3ee" };
    case "SCOREBOARD_UNFROZEN":
      return { ...slate, icon: <Flame size={16} />, accent: "#fb923c" };
    case "TEAM_DISQUALIFIED":
      return {
        icon: <Ban size={16} />, accent: "#f87171",
        bg: "rgba(127,29,29,0.4)", border: "rgba(239,68,68,0.5)",
        fg: "#fecaca", body: "#fca5a5",
      };
    case "CUSTOM":
      return { ...slate, icon: <Megaphone size={16} />, accent: "#6b7ea3" };
    default:
      return { ...slate, icon: <Bell size={16} />, accent: "#6b7ea3" };
  }
}

function actionFor(n: CTFNotificationDTO): string | null {
  switch (n.type) {
    case "NEW_CHALLENGE":      return "View Challenge";
    case "HINT_ADDED":         return "View Hint";
    case "CHALLENGE_UPDATED":  return "View Changes";
    default:                   return null;
  }
}
