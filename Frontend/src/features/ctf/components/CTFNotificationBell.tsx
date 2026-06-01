"use client";

import { useEffect, useState } from "react";
import {
  Bell, X, Lightbulb, AlertTriangle, Pause, Play, Snowflake, Flame,
  Megaphone, Trophy, Ban, Sparkles,
} from "lucide-react";
import type { CTFNotificationDTO, CTFNotificationType } from "@/lib/api";

interface Props {
  notifications: CTFNotificationDTO[];
  unreadCount:   number;
  onMarkAllRead: () => void;
}

export default function CTFNotificationBell({ notifications, unreadCount, onMarkAllRead }: Props) {
  const [open, setOpen] = useState(false);

  // Mark all read when the panel opens.
  useEffect(() => {
    if (open) onMarkAllRead();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Notifications"
        title="Notifications"
        style={{
          position: "relative",
          background: "transparent",
          border: "1px solid rgba(130,165,255,0.18)",
          borderRadius: 6, padding: "6px 8px", cursor: "pointer",
          color: "#6b7ea3", display: "inline-flex", alignItems: "center", gap: 4,
          transition: "border-color 150ms, color 150ms",
        }}
        onMouseEnter={e => {
          (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(96,165,255,0.45)";
          (e.currentTarget as HTMLButtonElement).style.color = "#a9b8d8";
        }}
        onMouseLeave={e => {
          (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(130,165,255,0.18)";
          (e.currentTarget as HTMLButtonElement).style.color = "#6b7ea3";
        }}
      >
        <Bell size={14} />
        {unreadCount > 0 && (
          <span style={{
            position: "absolute", top: -4, right: -4,
            background: "#ef4444", color: "#fff",
            fontSize: 9, fontWeight: 700, borderRadius: 10,
            padding: "1px 5px", minWidth: 16, textAlign: "center",
            border: "1px solid rgba(5,11,29,0.8)",
          }}>
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: "fixed", inset: 0,
            background: "rgba(1,4,14,0.6)",
            backdropFilter: "blur(4px)",
            WebkitBackdropFilter: "blur(4px)",
            zIndex: 80,
            display: "flex", justifyContent: "flex-end",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 360, maxWidth: "92vw", height: "100vh",
              background: "rgba(8,15,36,0.98)",
              borderLeft: "1px solid rgba(130,165,255,0.12)",
              backdropFilter: "blur(16px)",
              WebkitBackdropFilter: "blur(16px)",
              display: "flex", flexDirection: "column",
              animation: "ctf-panel-in 200ms ease",
            }}
          >
            {/* Header */}
            <div style={{
              padding: "14px 16px",
              borderBottom: "1px solid rgba(130,165,255,0.1)",
              display: "flex", justifyContent: "space-between", alignItems: "center",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Bell size={14} color="#c084fc" />
                <span style={{
                  fontSize: 14, fontWeight: 700, color: "#eaf0ff",
                  fontFamily: "'Chakra Petch', system-ui, sans-serif",
                  letterSpacing: "0.04em",
                }}>Notifications</span>
                <span style={{ fontSize: 11, color: "#4a5874", fontFamily: "'JetBrains Mono', monospace" }}>
                  {notifications.length}
                </span>
              </div>
              <button
                onClick={() => setOpen(false)}
                style={{
                  background: "none", border: "none",
                  color: "#4a5874", cursor: "pointer", padding: 4,
                  transition: "color 150ms",
                }}
                onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.color = "#a9b8d8"}
                onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.color = "#4a5874"}
                aria-label="Close"
              >
                <X size={14} />
              </button>
            </div>

            {/* List */}
            <div style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
              {notifications.length === 0 ? (
                <div style={{
                  textAlign: "center", padding: "40px 16px",
                  color: "#4a5874", fontSize: 13,
                }}>
                  No notifications yet.
                </div>
              ) : notifications.map((n, i) => {
                const s = stylesFor(n.type);
                return (
                  <div key={n.id} style={{
                    padding: "10px 16px",
                    borderBottom: i < notifications.length - 1
                      ? "1px solid rgba(14,28,67,0.7)"
                      : "none",
                    display: "flex", gap: 10, alignItems: "flex-start",
                    transition: "background 120ms",
                  }}
                    onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.background = "rgba(14,28,67,0.35)"}
                    onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.background = "transparent"}
                  >
                    <div style={{ color: s.accent, marginTop: 2, flexShrink: 0 }}>{s.icon}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: "#eaf0ff" }}>{n.title}</div>
                      {n.body && (
                        <div style={{
                          fontSize: 11, color: "#6b7ea3", marginTop: 2, lineHeight: 1.5,
                          fontStyle: n.type === "CUSTOM" ? "italic" : "normal",
                          whiteSpace: "pre-wrap", wordBreak: "break-word",
                        }}>
                          {n.body}
                        </div>
                      )}
                      <div style={{
                        fontSize: 10, color: "#4a5874", marginTop: 4,
                        fontFamily: "'JetBrains Mono', monospace",
                      }}>
                        {timeAgo(n.sentAt)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <style jsx global>{`
              @keyframes ctf-panel-in {
                from { transform: translateX(40px); opacity: 0; }
                to   { transform: translateX(0); opacity: 1; }
              }
            `}</style>
          </div>
        </div>
      )}
    </>
  );
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000)       return "just now";
  if (ms < 3_600_000)    return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000)   return `${Math.floor(ms / 3_600_000)}h ago`;
  return new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

function stylesFor(t: CTFNotificationType): { icon: React.ReactNode; accent: string } {
  switch (t) {
    case "NEW_CHALLENGE":           return { icon: <Sparkles size={14} />,      accent: "#c084fc" };
    case "HINT_ADDED":              return { icon: <Lightbulb size={14} />,     accent: "#fbbf24" };
    case "CHALLENGE_UPDATED":       return { icon: <Bell size={14} />,          accent: "#60a5ff" };
    case "COMPETITION_PAUSED":      return { icon: <Pause size={14} />,         accent: "#f59e0b" };
    case "COMPETITION_RESUMED":     return { icon: <Play size={14} />,          accent: "#34d399" };
    case "COMPETITION_ENDING_SOON": return { icon: <AlertTriangle size={14} />, accent: "#f87171" };
    case "COMPETITION_ENDED":       return { icon: <Trophy size={14} />,        accent: "#4a5874" };
    case "COMPETITION_STARTED":     return { icon: <Trophy size={14} />,        accent: "#34d399" };
    case "SCOREBOARD_FROZEN":       return { icon: <Snowflake size={14} />,     accent: "#22d3ee" };
    case "SCOREBOARD_UNFROZEN":     return { icon: <Flame size={14} />,         accent: "#fb923c" };
    case "TEAM_DISQUALIFIED":       return { icon: <Ban size={14} />,           accent: "#f87171" };
    case "CUSTOM":                  return { icon: <Megaphone size={14} />,     accent: "#6b7ea3" };
    default:                        return { icon: <Bell size={14} />,          accent: "#6b7ea3" };
  }
}
