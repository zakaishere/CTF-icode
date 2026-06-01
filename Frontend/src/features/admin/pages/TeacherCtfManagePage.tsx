"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { toast } from "@/components/ui/PSPToast";
import CtfWorkspaceHeader from "@/features/admin/components/CtfWorkspaceHeader";
import {
  Settings, Puzzle, Gamepad2, BarChart3, Users, FileText,
  AlertTriangle, Download, PlayCircle, Pause, Play, StopCircle,
  X, Calendar,
} from "lucide-react";
import {
  getTeacherCtfCompetition, getTeacherCtfOverview,
  startManualCtfCompetition, pauseTeacherCtfCompetition,
  resumeTeacherCtfCompetition, endTeacherCtfCompetition,
  type CTFCompetitionDTO, type CTFTeacherOverviewDTO,
} from "@/lib/api";
import { useCompetitionStatus } from "@/features/ctf/hooks/useCompetitionStatus";
import TeacherCtfControlTab    from "@/features/admin/components/TeacherCtfControlTab";
import TeacherCtfChallengesTab from "@/features/admin/components/TeacherCtfChallengesTab";
import TeacherCtfScoreboardTab from "@/features/admin/components/TeacherCtfScoreboardTab";
import TeacherCtfSubmissionsTab from "@/features/admin/components/TeacherCtfSubmissionsTab";
import TeacherCtfCheatsTab     from "@/features/admin/components/TeacherCtfCheatsTab";
import TeacherCtfTeamsTab      from "@/features/admin/components/TeacherCtfTeamsTab";
import TeacherCtfExportTab     from "@/features/admin/components/TeacherCtfExportTab";
import TeacherCtfCompetitionFormPage from "@/features/admin/pages/TeacherCtfCompetitionForm";

// ── Tab definition ──────────────────────────────────────────────────────────

type TabKey = "settings" | "challenges" | "control" | "scoreboard" | "teams"
            | "submissions" | "cheats" | "export";

const VALID_TABS: TabKey[] = [
  "settings", "challenges", "control", "scoreboard",
  "teams", "submissions", "cheats", "export",
];

const NAV_GROUPS: { label: string; items: { key: TabKey; label: string; icon: React.ReactNode }[] }[] = [
  {
    label: "SETUP",
    items: [
      { key: "settings",   label: "Settings",    icon: <Settings size={14} /> },
      { key: "challenges", label: "Challenges",   icon: <Puzzle size={14} /> },
    ],
  },
  {
    label: "LIVE",
    items: [
      { key: "control",    label: "Control",     icon: <Gamepad2 size={14} /> },
      { key: "scoreboard", label: "Scoreboard",  icon: <BarChart3 size={14} /> },
      { key: "teams",      label: "Teams",       icon: <Users size={14} /> },
    ],
  },
  {
    label: "LOGS",
    items: [
      { key: "submissions", label: "Submissions", icon: <FileText size={14} /> },
      { key: "cheats",      label: "Cheats",      icon: <AlertTriangle size={14} /> },
    ],
  },
  {
    label: "EXPORT",
    items: [
      { key: "export", label: "Export Data", icon: <Download size={14} /> },
    ],
  },
];

// ── Status badge ────────────────────────────────────────────────────────────

function statusStyle(comp: CTFCompetitionDTO) {
  const { status, timingMode } = comp;
  if (status === "UPCOMING" && timingMode === "REGISTRATION") {
    return { label: "REG OPEN", fg: "#a78bfa", bg: "rgba(167,139,250,0.15)", border: "rgba(167,139,250,0.35)" };
  }
  const map: Record<string, { label: string; fg: string; bg: string; border: string }> = {
    UPCOMING: { label: "UPCOMING", fg: "#60a5fa", bg: "rgba(96,165,250,0.12)",  border: "rgba(96,165,250,0.35)" },
    ACTIVE:   { label: "ACTIVE",   fg: "#34d399", bg: "rgba(16,185,129,0.12)",  border: "rgba(16,185,129,0.35)" },
    PAUSED:   { label: "PAUSED",   fg: "#fbbf24", bg: "rgba(245,158,11,0.12)",  border: "rgba(245,158,11,0.35)" },
    FROZEN:   { label: "FROZEN",   fg: "#22d3ee", bg: "rgba(34,211,238,0.12)",  border: "rgba(34,211,238,0.35)" },
    ENDED:    { label: "ENDED",    fg: "#94a3b8", bg: "rgba(148,163,184,0.12)", border: "rgba(148,163,184,0.3)"  },
  };
  return map[status] ?? map.UPCOMING;
}

function fmtSchedule(comp: CTFCompetitionDTO) {
  const fmt = (iso: string | null) => iso
    ? new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })
    : null;
  if (comp.timingMode === "MANUAL" || comp.timingMode === "REGISTRATION") {
    return comp.timingMode === "REGISTRATION" ? "Registration → manual start" : "Manual timing";
  }
  const s = fmt(comp.startTime);
  const e = fmt(comp.computedEndTime ?? comp.endTime);
  if (s && e) return `${s} → ${e}`;
  if (s) return `From ${s}`;
  return "No schedule";
}

// ── Main page ───────────────────────────────────────────────────────────────

export default function TeacherCtfManagePage() {
  const { id } = useParams<{ id: string }>();

  const [comp, setComp]       = useState<CTFCompetitionDTO | null>(null);
  const [overview, setOverview] = useState<CTFTeacherOverviewDTO | null>(null);
  const [tab, setTab]         = useState<TabKey>("control");

  // Sidebar quick-action state
  const [sidebarAction, setSidebarAction] = useState<"start" | "end" | "pause" | "resume" | null>(null);
  const [endText, setEndText] = useState("");
  const [sidebarBusy, setSidebarBusy] = useState(false);

  // Live WS/poll status
  const statusHook = useCompetitionStatus(id);

  // ── Data loading ──────────────────────────────────────────────────────────

  const loadComp = useCallback(async () => {
    try {
      const c = await getTeacherCtfCompetition(id);
      setComp(c);
    } catch {
      toast.error("Failed to load competition", "Please try again.");
    }
  }, [id]);

  const loadOverview = useCallback(async () => {
    try {
      const o = await getTeacherCtfOverview(id);
      setOverview(o);
    } catch { /* apiClient surfaces toast */ }
  }, [id]);

  useEffect(() => { loadComp(); loadOverview(); }, [loadComp, loadOverview]);

  // Set default tab from URL or status when comp first loads
  useEffect(() => {
    if (!comp) return;
    // Read tab from URL
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const t = params.get("tab") as TabKey | null;
      if (t && VALID_TABS.includes(t)) {
        setTab(t);
        return;
      }
    }
    // Default by status
    if (comp.status === "UPCOMING") setTab("settings");
    else if (comp.status === "ENDED") setTab("scoreboard");
    else setTab("control");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!comp]);

  // Refresh overview every 10s on control tab
  useEffect(() => {
    if (tab !== "control") return;
    const t = setInterval(loadOverview, 10_000);
    return () => clearInterval(t);
  }, [tab, loadOverview]);

  // Sync comp DTO when live status changes
  useEffect(() => {
    if (!statusHook.status || !comp) return;
    if (statusHook.status !== comp.status) loadComp();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusHook.status]);

  function navigate(t: TabKey) {
    setTab(t);
    setSidebarAction(null);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("tab", t);
      window.history.replaceState({}, "", url.toString());
    }
  }

  // ── Sidebar quick actions ─────────────────────────────────────────────────

  async function runSidebarAction(overrideAction?: "start" | "end" | "pause" | "resume") {
    const action = overrideAction ?? sidebarAction;
    if (!action || !comp) return;
    if (action === "end" && endText !== comp.title) return;
    setSidebarBusy(true);
    try {
      if (action === "start")  await startManualCtfCompetition(id);
      else if (action === "end")    await endTeacherCtfCompetition(id);
      else if (action === "pause")  await pauseTeacherCtfCompetition(id);
      else if (action === "resume") await resumeTeacherCtfCompetition(id);
      toast.success("Done", `Competition ${action}ed.`);
      setSidebarAction(null);
      setEndText("");
      // Re-fetch from the teacher endpoint — authoritative, not affected by the
      // public /status NPE — to ensure sidebar buttons reflect the new state.
      await loadComp();
      loadOverview();
    } catch (err) {
      console.error("Sidebar action failed:", action, err);
      // apiClient surfaces a toast; reload to show current server state.
      await loadComp();
    }
    finally { setSidebarBusy(false); }
  }

  // ── Skeleton ──────────────────────────────────────────────────────────────

  if (!comp) {
    return (
      <>
        <CtfWorkspaceHeader comp={null} />
        <div style={{ display: "flex", marginTop: 52, height: "calc(100vh - 52px)", overflow: "hidden" }}>
          <div style={{ width: 260, borderRight: "1px solid var(--border)", padding: 20 }}>
            <div className="skel" style={{ height: 24, borderRadius: 4, marginBottom: 10 }} />
            <div className="skel" style={{ height: 20, borderRadius: 4, width: "60%" }} />
          </div>
          <div style={{ flex: 1, padding: 32 }}>
            <div className="skel" style={{ height: 280, borderRadius: 8 }} />
          </div>
        </div>
      </>
    );
  }

  const ss          = statusStyle(comp);
  const isManual    = comp.timingMode === "MANUAL";
  const isReg       = comp.timingMode === "REGISTRATION";
  const isUpcoming  = comp.status === "UPCOMING";
  const isActive    = comp.status === "ACTIVE";
  const isPaused    = comp.status === "PAUSED";
  const isFrozenSt  = comp.status === "FROZEN";
  const isEnded     = comp.status === "ENDED";
  // Can pause when ACTIVE or FROZEN (freeze doesn't stop the competition, just hides rankings)
  const showStart   = (isManual || isReg) && isUpcoming;
  const showPause   = isActive || isFrozenSt;
  const showResume  = isPaused;
  const showEnd     = !isEnded && !isUpcoming;

  // Badge counts for nav items
  function badge(key: TabKey): number | null {
    if (key === "cheats" && overview && overview.cheatCount > 0) return overview.cheatCount;
    if (key === "challenges" && overview && overview.hiddenChallengeCount > 0) return overview.hiddenChallengeCount;
    return null;
  }

  return (
    <>
      <CtfWorkspaceHeader comp={comp} />
      <div style={{ display: "flex", marginTop: 52, height: "calc(100vh - 52px)", overflow: "hidden" }}>

        {/* ── LEFT SIDEBAR ─────────────────────────────────────────────────── */}
        <aside style={{
          width: 260, flexShrink: 0,
          borderRight: "1px solid var(--border)",
          background: "var(--surface)",
          display: "flex", flexDirection: "column",
          overflowY: "auto",
        }}>

          {/* Competition header */}
          <div style={{ padding: "16px 16px 12px" }}>
            <div style={{
              fontSize: 14, fontWeight: 800, color: "var(--text-primary)",
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              marginBottom: 6,
            }}>
              {comp.title}
            </div>
            <span style={{
              display: "inline-flex", alignItems: "center", gap: 5,
              background: ss.bg, color: ss.fg, border: `1px solid ${ss.border}`,
              borderRadius: 4, padding: "2px 8px", fontSize: 10, fontWeight: 700, letterSpacing: "0.05em",
            }}>
              {ss.label === "ACTIVE" && (
                <span style={{
                  width: 6, height: 6, borderRadius: "50%", background: ss.fg,
                  animation: "ctf-pulse 2s infinite", display: "inline-block",
                }} />
              )}
              {ss.label}
            </span>
          </div>

          {/* Quick actions */}
          {(showStart || showPause || showResume || showEnd) && (
            <div style={{ padding: "0 12px 12px" }}>

              {/* START */}
              {showStart && sidebarAction !== "start" && (
                <button
                  className="psp-btn psp-btn-primary"
                  style={{
                    width: "100%", justifyContent: "center", gap: 6, marginBottom: 6,
                    background: "linear-gradient(135deg,#10b981,#059669)",
                    borderColor: "#10b981",
                  }}
                  onClick={() => setSidebarAction("start")}
                >
                  <PlayCircle size={14} /> Start Competition
                </button>
              )}
              {sidebarAction === "start" && (
                <SidebarConfirm
                  message={`Start "${comp.title}" now? Players will be notified.`}
                  cta="Start"
                  busy={sidebarBusy}
                  onConfirm={() => runSidebarAction("start")}
                  onCancel={() => setSidebarAction(null)}
                />
              )}

              {/* PAUSE / RESUME */}
              {showResume && (
                <button
                  className="psp-btn psp-btn-primary"
                  style={{ width: "100%", justifyContent: "center", gap: 6, marginBottom: 6 }}
                  onClick={() => runSidebarAction("resume")}
                  disabled={sidebarBusy}
                >
                  <Play size={13} /> Resume
                </button>
              )}
              {showPause && !showResume && (
                <button
                  className="psp-btn psp-btn-secondary"
                  style={{ width: "100%", justifyContent: "center", gap: 6, marginBottom: 6 }}
                  onClick={() => runSidebarAction("pause")}
                  disabled={sidebarBusy}
                >
                  <Pause size={13} /> Pause
                </button>
              )}

              {/* END */}
              {showEnd && sidebarAction !== "end" && (
                <button
                  className="psp-btn psp-btn-secondary"
                  style={{
                    width: "100%", justifyContent: "center", gap: 6,
                    color: "#f87171", borderColor: "rgba(239,68,68,0.4)",
                  }}
                  onClick={() => setSidebarAction("end")}
                >
                  <StopCircle size={13} /> End Early
                </button>
              )}
              {sidebarAction === "end" && (
                <SidebarEndConfirm
                  name={comp.title}
                  text={endText}
                  onTextChange={setEndText}
                  busy={sidebarBusy}
                  onConfirm={() => runSidebarAction("end")}
                  onCancel={() => { setSidebarAction(null); setEndText(""); }}
                />
              )}
            </div>
          )}

          {/* Divider */}
          <div style={{ height: 1, background: "var(--border)", margin: "0 0 8px" }} />

          {/* Navigation */}
          <nav style={{ flex: 1, padding: "0 8px" }}>
            {NAV_GROUPS.map(group => (
              <div key={group.label} style={{ marginBottom: 16 }}>
                <div style={{
                  padding: "4px 8px 6px",
                  fontSize: 10, fontWeight: 700, color: "var(--text-muted)",
                  textTransform: "uppercase", letterSpacing: "0.08em",
                }}>
                  {group.label}
                </div>
                {group.items.map(item => {
                  const active = tab === item.key;
                  const b = badge(item.key);
                  return (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => navigate(item.key)}
                      style={{
                        width: "100%", display: "flex", alignItems: "center", gap: 9,
                        padding: "8px 10px", borderRadius: 6, marginBottom: 2,
                        background: active ? "rgba(99,102,241,0.12)" : "transparent",
                        color: active ? "#818cf8" : "var(--text-secondary)",
                        border: "none", cursor: "pointer", textAlign: "left",
                        fontSize: 13, fontWeight: active ? 700 : 500,
                        borderLeft: `3px solid ${active ? "#6366f1" : "transparent"}`,
                        transition: "all 100ms",
                      }}
                    >
                      <span style={{ flexShrink: 0 }}>{item.icon}</span>
                      <span style={{ flex: 1 }}>{item.label}</span>
                      {b !== null && (
                        <span style={{
                          background: item.key === "cheats" ? "rgba(239,68,68,0.15)" : "rgba(96,165,250,0.15)",
                          color: item.key === "cheats" ? "#f87171" : "#60a5fa",
                          fontSize: 10, fontWeight: 700, borderRadius: 10, padding: "1px 6px",
                        }}>
                          {b}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            ))}
          </nav>

          {/* Bottom info */}
          <div style={{
            padding: "12px 16px", borderTop: "1px solid var(--border)",
            fontSize: 11, color: "var(--text-muted)", lineHeight: 1.6,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <Calendar size={11} />
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {fmtSchedule(comp)}
              </span>
            </div>
          </div>
        </aside>

        {/* ── CONTENT AREA ──────────────────────────────────────────────────── */}
        <main style={{ flex: 1, overflowY: "auto", padding: "24px 28px" }}>

          {/* Tab heading */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: "var(--text-primary)" }}>
              {{
                settings:    "Settings",
                challenges:  "Challenges",
                control:     "Control Panel",
                scoreboard:  "Scoreboard",
                teams:       "Teams",
                submissions: "Submissions",
                cheats:      "Cheat Log",
                export:      "Export Data",
              }[tab]}
            </div>
          </div>

          {/* Tab content */}
          {tab === "settings" && (
            <TeacherCtfCompetitionFormPage editId={id} embedded />
          )}

          {tab === "challenges" && (
            <TeacherCtfChallengesTab competitionId={id} onChanged={loadOverview} />
          )}

          {tab === "control" && (
            <TeacherCtfControlTab
              competition={comp}
              overview={overview}
              onCompetitionChanged={(updated) => { if (updated) setComp(updated); else loadComp(); }}
              onOverviewRefresh={loadOverview}
              hideStartBanner
            />
          )}

          {tab === "scoreboard" && (
            <TeacherCtfScoreboardTab
              competitionId={id}
              isFrozen={statusHook.isFrozen || comp.isFrozen}
              frozenAt={statusHook.payload?.frozenAt ?? comp.frozenAt}
            />
          )}

          {tab === "teams" && (
            <TeacherCtfTeamsTab competitionId={id} />
          )}

          {tab === "submissions" && (
            <TeacherCtfSubmissionsTab competitionId={id} />
          )}

          {tab === "cheats" && (
            <TeacherCtfCheatsTab competitionId={id} onChanged={loadOverview} />
          )}

          {tab === "export" && (
            <TeacherCtfExportTab competitionId={id} />
          )}
        </main>
      </div>
    </>
  );
}

// ── Sidebar inline confirm helpers ──────────────────────────────────────────

function SidebarConfirm({
  message, cta, busy, onConfirm, onCancel,
}: {
  message: string; cta: string; busy: boolean;
  onConfirm: () => void; onCancel: () => void;
}) {
  return (
    <div style={{
      background: "var(--bg-secondary)", border: "1px solid var(--border)",
      borderRadius: 6, padding: 10, marginBottom: 6,
    }}>
      <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: "0 0 8px", lineHeight: 1.4 }}>{message}</p>
      <div style={{ display: "flex", gap: 6 }}>
        <button className="psp-btn psp-btn-secondary psp-btn-sm" onClick={onCancel} disabled={busy} style={{ flex: 1 }}>
          <X size={11} /> Cancel
        </button>
        <button
          className="psp-btn psp-btn-primary psp-btn-sm"
          onClick={onConfirm}
          disabled={busy}
          style={{ flex: 1, justifyContent: "center" }}
        >
          {busy ? "…" : cta}
        </button>
      </div>
    </div>
  );
}

function SidebarEndConfirm({
  name, text, onTextChange, busy, onConfirm, onCancel,
}: {
  name: string; text: string;
  onTextChange: (v: string) => void;
  busy: boolean;
  onConfirm: () => void; onCancel: () => void;
}) {
  return (
    <div style={{
      background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.25)",
      borderRadius: 6, padding: 10, marginBottom: 6,
    }}>
      <p style={{ fontSize: 12, color: "#fca5a5", margin: "0 0 6px", lineHeight: 1.4 }}>
        ⚠ This ends the competition immediately. Type the competition name to confirm.
      </p>
      <input
        className="input"
        value={text}
        onChange={e => onTextChange(e.target.value)}
        placeholder={name}
        style={{ marginBottom: 8, fontSize: 12 }}
      />
      <div style={{ display: "flex", gap: 6 }}>
        <button className="psp-btn psp-btn-secondary psp-btn-sm" onClick={onCancel} disabled={busy} style={{ flex: 1 }}>
          Cancel
        </button>
        <button
          className="psp-btn psp-btn-primary psp-btn-sm"
          onClick={onConfirm}
          disabled={busy || text !== name}
          style={{ flex: 1, justifyContent: "center", background: "#dc2626", borderColor: "#dc2626" }}
        >
          {busy ? "…" : "End"}
        </button>
      </div>
    </div>
  );
}
