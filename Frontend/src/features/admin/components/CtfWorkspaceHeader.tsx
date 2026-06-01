"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, ArrowLeft, LogOut, User } from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/features/auth/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import type { CTFCompetitionDTO } from "@/lib/api";

// ── Status badge ────────────────────────────────────────────────────────────

function statusStyle(comp: CTFCompetitionDTO) {
  const { status, timingMode } = comp;
  if (status === "UPCOMING" && timingMode === "REGISTRATION") {
    return { label: "REG OPEN", fg: "#a78bfa", bg: "rgba(167,139,250,0.18)", border: "rgba(167,139,250,0.4)" };
  }
  const map: Record<string, { label: string; fg: string; bg: string; border: string }> = {
    UPCOMING: { label: "UPCOMING", fg: "#60a5fa", bg: "rgba(96,165,250,0.15)",  border: "rgba(96,165,250,0.4)" },
    ACTIVE:   { label: "ACTIVE",   fg: "#34d399", bg: "rgba(16,185,129,0.15)",  border: "rgba(16,185,129,0.4)" },
    PAUSED:   { label: "PAUSED",   fg: "#fbbf24", bg: "rgba(245,158,11,0.15)",  border: "rgba(245,158,11,0.4)" },
    FROZEN:   { label: "FROZEN",   fg: "#22d3ee", bg: "rgba(34,211,238,0.15)",  border: "rgba(34,211,238,0.4)" },
    ENDED:    { label: "ENDED",    fg: "#94a3b8", bg: "rgba(148,163,184,0.15)", border: "rgba(148,163,184,0.35)" },
  };
  return map[status] ?? map.UPCOMING;
}

// ── Theme toggle ────────────────────────────────────────────────────────────

function ThemeToggle() {
  const { isDark, toggleTheme } = useTheme();
  return (
    <button
      onClick={toggleTheme}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        width: 32, height: 32, borderRadius: 6,
        background: "var(--bg-hover)",
        border: "1px solid var(--border)",
        color: "var(--text-secondary)",
        cursor: "pointer",
        transition: "all 150ms",
        flexShrink: 0,
      }}
    >
      {isDark ? (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="4"/>
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>
        </svg>
      ) : (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
        </svg>
      )}
    </button>
  );
}

// ── Workspace Header ─────────────────────────────────────────────────────────

interface Props {
  comp: CTFCompetitionDTO | null;
}

export default function CtfWorkspaceHeader({ comp }: Props) {
  const { username, email, role, logout } = useAuth();
  const router = useRouter();

  const initials = username
    ? username.charAt(0).toUpperCase()
    : email
    ? email.charAt(0).toUpperCase()
    : "U";

  const avatarColor =
    role === "ADMIN"   ? "#6554c0" :
    role === "ADMIN" ? "#00875a" :
    "#ff5630";

  const ss = comp ? statusStyle(comp) : null;

  return (
    <header style={{
      position: "fixed",
      top: 0, left: 0, right: 0,
      height: 52,
      zIndex: 200,
      background: "var(--bg-elevated)",
      borderBottom: "1px solid var(--border)",
      display: "flex",
      alignItems: "center",
      padding: "0 16px",
      gap: 12,
    }}>

      {/* ── Left: Back + breadcrumb ─────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, flex: 1 }}>
        <Link
          href="/admin/ctf"
          style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            padding: "5px 10px", borderRadius: 6,
            background: "var(--bg-hover)",
            border: "1px solid var(--border)",
            color: "var(--text-secondary)",
            fontSize: 12, fontWeight: 600,
            textDecoration: "none",
            flexShrink: 0,
            transition: "all 150ms",
          }}
        >
          <ArrowLeft size={13} />
          Back to CTFs
        </Link>

        {/* Breadcrumb trail */}
        <div style={{
          display: "flex", alignItems: "center", gap: 4,
          color: "var(--text-muted)", fontSize: 12, minWidth: 0,
        }}>
          <ChevronRight size={13} style={{ flexShrink: 0 }} />
          <span style={{ flexShrink: 0 }}>CTF</span>
          <ChevronRight size={13} style={{ flexShrink: 0 }} />
          {comp ? (
            <span style={{
              color: "var(--text-primary)", fontWeight: 600,
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              maxWidth: 260,
            }}>
              {comp.title}
            </span>
          ) : (
            <span className="skel" style={{ width: 120, height: 14, borderRadius: 3, display: "inline-block" }} />
          )}
        </div>
      </div>

      {/* ── Center: CTF name + status (desktop) ─────────────────────────── */}
      <div style={{
        display: "flex", alignItems: "center", gap: 10,
        position: "absolute", left: "50%", transform: "translateX(-50%)",
        pointerEvents: "none",
      }}>
        {comp ? (
          <>
            <span style={{
              fontSize: 13, fontWeight: 700, color: "var(--text-primary)",
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
              maxWidth: 240,
            }}>
              {comp.title}
            </span>
            {ss && (
              <span style={{
                display: "inline-flex", alignItems: "center", gap: 5,
                background: ss.bg, color: ss.fg, border: `1px solid ${ss.border}`,
                borderRadius: 4, padding: "2px 8px", fontSize: 10, fontWeight: 700,
                letterSpacing: "0.05em", whiteSpace: "nowrap",
              }}>
                {ss.label === "ACTIVE" && (
                  <span style={{
                    width: 6, height: 6, borderRadius: "50%",
                    background: ss.fg, display: "inline-block",
                    animation: "ctf-pulse 2s infinite",
                  }} />
                )}
                {ss.label}
              </span>
            )}
          </>
        ) : (
          <span className="skel" style={{ width: 160, height: 16, borderRadius: 4, display: "inline-block" }} />
        )}
      </div>

      {/* ── Right: utilities ────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: "auto", flexShrink: 0 }}>
        <ThemeToggle />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <div
              title={username || email || "Account"}
              style={{
                width: 30, height: 30, borderRadius: "50%",
                background: avatarColor,
                color: "#fff",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 12, fontWeight: 700,
                cursor: "pointer", flexShrink: 0,
                border: "2px solid var(--border)",
              }}
            >
              {initials}
            </div>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <div className="px-3 py-2">
              <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                {username || "User"}
              </p>
              <p className="text-xs truncate" style={{ color: "var(--text-muted)" }}>{email}</p>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="cursor-pointer text-sm">
              <User className="mr-2 h-3.5 w-3.5" /> Profile
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="cursor-pointer text-sm text-red-600 focus:text-red-600"
              onClick={() => { logout(); router.push("/"); }}
            >
              <LogOut className="mr-2 h-3.5 w-3.5" /> Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
