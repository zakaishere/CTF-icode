"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Users, ChevronDown, ChevronRight, Shield, ShieldOff,
  AlertTriangle, RefreshCw, CheckCircle,
  XCircle, Zap, Activity, Eye, Copy, Check,
} from "lucide-react";
import { toast } from "@/components/ui/PSPToast";
import {
  getTeacherCtfTeams, disqualifyTeacherCtfTeam, getTeacherCtfSubmissions,
  type CTFTeacherTeamDTO, type CTFTeacherSubmissionDTO,
} from "@/lib/api";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Props { competitionId: string; }

type LogFilter = "ALL" | "INCORRECT" | "SPAM";

// ── Helpers ───────────────────────────────────────────────────────────────────

function relTime(iso: string | null) {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

/** Returns set of player keys (userId or displayName) exhibiting brute-force patterns. */
function detectSpam(subs: CTFTeacherSubmissionDTO[], windowMs = 10_000, threshold = 3): Set<string> {
  const flagged = new Set<string>();
  const byPlayer = new Map<string, { time: number }[]>();
  for (const s of subs) {
    if (s.correct) continue;
    const key = s.solvedByUserId ?? s.solvedByName;
    if (!byPlayer.has(key)) byPlayer.set(key, []);
    byPlayer.get(key)!.push({ time: new Date(s.at).getTime() });
  }
  for (const [key, events] of byPlayer) {
    events.sort((a, b) => a.time - b.time);
    for (let i = 0; i <= events.length - threshold; i++) {
      if (events[i + threshold - 1]!.time - events[i]!.time < windowMs) {
        flagged.add(key);
        break;
      }
    }
  }
  return flagged;
}

// ── Category color map ────────────────────────────────────────────────────────

const CAT_FG: Record<string, string> = {
  CRYPTO: "#60a5fa", FORENSICS: "#a78bfa", REVERSE: "#fb923c",
  WEB: "#4ade80", PWN: "#f87171", OSINT: "#facc15", MISC: "#94a3b8",
};
const CAT_BG: Record<string, string> = {
  CRYPTO: "rgba(96,165,250,0.12)", FORENSICS: "rgba(167,139,250,0.12)",
  REVERSE: "rgba(251,146,60,0.12)", WEB: "rgba(34,197,94,0.12)",
  PWN: "rgba(239,68,68,0.12)", OSINT: "rgba(234,179,8,0.12)",
  MISC: "rgba(148,163,184,0.12)",
};

// ── Sub-components ────────────────────────────────────────────────────────────

/** Truncated flag value with copy-on-click. */
function FlagCell({ value }: { value: string | null }) {
  const [copied, setCopied] = useState(false);
  if (!value) return <td style={{ padding: "7px 10px" }}>—</td>;
  const display = value.length > 28 ? value.slice(0, 28) + "…" : value;
  const copy = async () => {
    try { await navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1400); } catch {}
  };
  return (
    <td style={{ padding: "7px 10px" }}>
      <button
        onClick={copy}
        title={value}
        style={{
          display: "inline-flex", alignItems: "center", gap: 4,
          fontFamily: "ui-monospace,monospace", fontSize: 10,
          color: "var(--text-muted)", background: "var(--bg-secondary)",
          border: "1px solid var(--border)", borderRadius: 4, padding: "2px 6px",
          cursor: "pointer", maxWidth: 200, overflow: "hidden",
        }}
      >
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{display}</span>
        {copied ? <Check size={9} style={{ color: "#4ade80", flexShrink: 0 }} /> : <Copy size={9} style={{ flexShrink: 0, opacity: 0.5 }} />}
      </button>
    </td>
  );
}

/** A single submission row in the activity stream. */
function SubRow({
  s, showPlayer, isSpam,
}: {
  s: CTFTeacherSubmissionDTO;
  showPlayer: boolean;
  isSpam: boolean;
}) {
  const catFg = s.challengeCategory ? (CAT_FG[s.challengeCategory] ?? "#94a3b8") : "#94a3b8";
  const catBg = s.challengeCategory ? (CAT_BG[s.challengeCategory] ?? "rgba(148,163,184,0.12)") : "rgba(148,163,184,0.12)";

  const rowBg = s.cheatFlagged
    ? "rgba(167,139,250,0.05)"
    : isSpam
    ? "rgba(245,158,11,0.04)"
    : undefined;

  return (
    <tr style={{ borderBottom: "1px solid var(--border)", background: rowBg }}>
      {/* Time */}
      <td style={{ padding: "7px 10px", whiteSpace: "nowrap", fontFamily: "ui-monospace,monospace", fontSize: 11, color: "var(--text-muted)" }}>
        {fmtTime(s.at)}
      </td>

      {/* Player */}
      {showPlayer && (
        <td style={{ padding: "7px 10px", whiteSpace: "nowrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            {isSpam && <AlertTriangle size={10} style={{ color: "#f59e0b", flexShrink: 0 }} />}
            <span style={{ fontSize: 12, color: "var(--text-secondary)", fontWeight: isSpam ? 700 : 400 }}>
              {s.solvedByName}
            </span>
          </div>
        </td>
      )}

      {/* Challenge */}
      <td style={{ padding: "7px 10px" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 600 }}>
          {s.challengeCategory && (
            <span style={{
              padding: "1px 5px", borderRadius: 3, fontSize: 9, fontWeight: 700,
              background: catBg, color: catFg, flexShrink: 0,
            }}>{s.challengeCategory}</span>
          )}
          <span style={{ color: "var(--text-primary)" }}>{s.challengeTitle}</span>
        </span>
      </td>

      {/* Submitted flag (truncated, click-to-copy) */}
      <FlagCell value={s.submittedValue} />

      {/* Points */}
      <td style={{ padding: "7px 10px", textAlign: "right", fontFamily: "ui-monospace,monospace", fontSize: 11 }}>
        {s.correct && s.pointsAwarded > 0 && (
          <span style={{ color: "#4ade80", fontWeight: 700 }}>+{s.pointsAwarded}</span>
        )}
      </td>

      {/* Result */}
      <td style={{ padding: "7px 10px", whiteSpace: "nowrap" }}>
        {s.cheatFlagged ? (
          <span style={{
            display: "inline-flex", alignItems: "center", gap: 4,
            padding: "2px 7px", borderRadius: 4, fontSize: 10, fontWeight: 700,
            background: "rgba(167,139,250,0.14)", color: "#a78bfa",
            border: "1px solid rgba(167,139,250,0.3)",
          }}>
            ⚠ CHEAT
          </span>
        ) : isSpam ? (
          <span style={{
            display: "inline-flex", alignItems: "center", gap: 4,
            padding: "2px 7px", borderRadius: 4, fontSize: 10, fontWeight: 700,
            background: "rgba(245,158,11,0.14)", color: "#f59e0b",
            border: "1px solid rgba(245,158,11,0.3)",
          }}>
            <Zap size={9} /> SPAM
          </span>
        ) : s.correct ? (
          <span style={{
            display: "inline-flex", alignItems: "center", gap: 4,
            padding: "2px 7px", borderRadius: 4, fontSize: 10, fontWeight: 700,
            background: "rgba(34,197,94,0.12)", color: "#4ade80",
            border: "1px solid rgba(34,197,94,0.25)",
          }}>
            <CheckCircle size={9} /> CORRECT
          </span>
        ) : (
          <span style={{
            display: "inline-flex", alignItems: "center", gap: 4,
            padding: "2px 7px", borderRadius: 4, fontSize: 10, fontWeight: 700,
            background: "rgba(239,68,68,0.10)", color: "#f87171",
            border: "1px solid rgba(239,68,68,0.22)",
          }}>
            <XCircle size={9} /> WRONG
          </span>
        )}
      </td>
    </tr>
  );
}

/** The submission activity stream panel. */
function ActivityStream({
  subs, spamKeys, focusedPlayer, onClearFocus,
}: {
  subs: CTFTeacherSubmissionDTO[];
  spamKeys: Set<string>;
  focusedPlayer: string | null;
  onClearFocus: () => void;
}) {
  const [logFilter, setLogFilter] = useState<LogFilter>("ALL");

  const displayed = useMemo(() => {
    let rows = focusedPlayer
      ? subs.filter(s => (s.solvedByUserId ?? s.solvedByName) === focusedPlayer)
      : subs;

    if (logFilter === "INCORRECT") rows = rows.filter(s => !s.correct);
    if (logFilter === "SPAM") rows = rows.filter(s =>
      s.cheatFlagged || spamKeys.has(s.solvedByUserId ?? s.solvedByName));
    return rows;
  }, [subs, focusedPlayer, logFilter, spamKeys]);

  const spamCount = useMemo(() =>
    subs.filter(s => spamKeys.has(s.solvedByUserId ?? s.solvedByName)).length,
  [subs, spamKeys]);

  const showPlayer = !focusedPlayer;

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
      {/* Stream header */}
      <div style={{
        display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
        padding: "8px 12px", borderBottom: "1px solid var(--border)",
        background: "var(--bg-secondary)",
      }}>
        <Activity size={12} style={{ color: "var(--text-muted)" }} />
        <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
          {focusedPlayer ? "Player Log" : "Team Activity"}
        </span>
        {focusedPlayer && (
          <button onClick={onClearFocus} style={{
            display: "inline-flex", alignItems: "center", gap: 4,
            padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 600,
            background: "rgba(99,102,241,0.1)", border: "1px solid rgba(99,102,241,0.3)",
            color: "#818cf8", cursor: "pointer",
          }}>
            <Eye size={10} /> All players
          </button>
        )}

        {/* Filter chips */}
        <div style={{ display: "flex", gap: 4, marginLeft: "auto" }}>
          {(["ALL", "INCORRECT", "SPAM"] as LogFilter[]).map(f => (
            <button
              key={f}
              onClick={() => setLogFilter(f)}
              style={{
                padding: "2px 9px", borderRadius: 4, fontSize: 10, fontWeight: 700,
                border: "1px solid",
                borderColor: logFilter === f
                  ? f === "SPAM" ? "rgba(245,158,11,0.5)" : f === "INCORRECT" ? "rgba(239,68,68,0.45)" : "rgba(99,102,241,0.5)"
                  : "var(--border)",
                background: logFilter === f
                  ? f === "SPAM" ? "rgba(245,158,11,0.12)" : f === "INCORRECT" ? "rgba(239,68,68,0.1)" : "rgba(99,102,241,0.1)"
                  : "transparent",
                color: logFilter === f
                  ? f === "SPAM" ? "#f59e0b" : f === "INCORRECT" ? "#f87171" : "#818cf8"
                  : "var(--text-muted)",
                cursor: "pointer",
              }}
            >
              {f}{f === "SPAM" && spamCount > 0 && ` (${spamCount})`}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div style={{ flex: 1, overflowY: "auto", maxHeight: 320 }}>
        {displayed.length === 0 ? (
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            height: 80, fontSize: 12, color: "var(--text-muted)", fontStyle: "italic",
          }}>
            No submissions match this filter.
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ background: "var(--bg-secondary)", position: "sticky", top: 0, zIndex: 1 }}>
                <th style={thStyle}>Time</th>
                {showPlayer && <th style={thStyle}>Player</th>}
                <th style={thStyle}>Challenge</th>
                <th style={thStyle}>Submitted Flag</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Pts</th>
                <th style={thStyle}>Result</th>
              </tr>
            </thead>
            <tbody>
              {displayed.map(s => (
                <SubRow
                  key={s.id}
                  s={s}
                  showPlayer={showPlayer}
                  isSpam={!s.correct && spamKeys.has(s.solvedByUserId ?? s.solvedByName)}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Footer meta */}
      <div style={{
        padding: "6px 12px", borderTop: "1px solid var(--border)",
        background: "var(--bg-secondary)", fontSize: 10, color: "var(--text-muted)",
        display: "flex", gap: 12,
      }}>
        <span>{displayed.length} entries shown</span>
        {spamCount > 0 && (
          <span style={{ color: "#f59e0b", display: "flex", alignItems: "center", gap: 3 }}>
            <AlertTriangle size={9} /> {spamCount} flagged submissions
          </span>
        )}
      </div>
    </div>
  );
}

const thStyle: React.CSSProperties = {
  padding: "6px 10px", textAlign: "left", fontSize: 10, fontWeight: 700,
  color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.07em",
  borderBottom: "1px solid var(--border)",
};

/** Expanded accordion split view for one team. */
function TeamExpandedPanel({
  team, subs, spamKeys,
}: {
  team: CTFTeacherTeamDTO;
  subs: CTFTeacherSubmissionDTO[];
  spamKeys: Set<string>;
}) {
  const [focusedPlayer, setFocusedPlayer] = useState<string | null>(null);

  const focusedName = useMemo(() => {
    if (!focusedPlayer) return null;
    const m = team.members.find(m => (m.userId ?? m.displayName) === focusedPlayer);
    return m?.displayName ?? null;
  }, [focusedPlayer, team.members]);

  return (
    <div style={{
      display: "flex", gap: 0,
      background: "var(--bg-secondary)",
      borderTop: "1px solid var(--border)",
    }}>
      {/* ── Left: roster ──────────────────────────────────────────────────── */}
      <div style={{
        width: 220, flexShrink: 0,
        borderRight: "1px solid var(--border)",
        display: "flex", flexDirection: "column",
      }}>
        <div style={{
          padding: "8px 12px", borderBottom: "1px solid var(--border)",
          background: "var(--bg-secondary)",
          fontSize: 10, fontWeight: 700, color: "var(--text-muted)",
          textTransform: "uppercase", letterSpacing: "0.07em",
          display: "flex", alignItems: "center", gap: 5,
        }}>
          <Users size={10} /> Roster ({team.members.length})
        </div>

        <div style={{ padding: "8px 10px", display: "flex", flexDirection: "column", gap: 6, overflowY: "auto" }}>
          {team.members.length === 0 ? (
            <div style={{ fontSize: 12, color: "var(--text-muted)", padding: "4px 0" }}>No members.</div>
          ) : team.members.map(m => {
            const key = m.userId ?? m.displayName;
            const isSpammed = spamKeys.has(key);
            const isFocused = focusedPlayer === key;

            // Count this player's submissions for summary
            const playerSubs = subs.filter(s => (s.solvedByUserId ?? s.solvedByName) === key);
            const wrongCount = playerSubs.filter(s => !s.correct).length;

            return (
              <div
                key={m.userId}
                style={{
                  padding: "8px 10px", borderRadius: 6,
                  background: isFocused ? "rgba(99,102,241,0.1)" : "var(--bg-elevated, var(--surface))",
                  border: `1px solid ${isFocused ? "rgba(99,102,241,0.4)" : isSpammed ? "rgba(245,158,11,0.35)" : "var(--border)"}`,
                  transition: "all 120ms",
                }}
              >
                {/* Spam banner */}
                {isSpammed && (
                  <div style={{
                    display: "flex", alignItems: "center", gap: 4,
                    marginBottom: 5, padding: "3px 6px", borderRadius: 4,
                    background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.25)",
                    fontSize: 9, fontWeight: 700, color: "#f59e0b",
                  }}>
                    <AlertTriangle size={9} /> Potential Brute-Force
                  </div>
                )}

                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5 }}>
                  <div style={{
                    width: 22, height: 22, borderRadius: "50%",
                    background: isSpammed ? "#f59e0b" : team.avatarColor,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    color: "#fff", fontSize: 9, fontWeight: 800, flexShrink: 0,
                  }}>
                    {m.displayName.charAt(0).toUpperCase()}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{
                      fontSize: 12, fontWeight: 700, color: "var(--text-primary)",
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>
                      {m.displayName}
                      {m.role === "CAPTAIN" && (
                        <span style={{ marginLeft: 4, fontSize: 9, color: "#f59e0b", fontWeight: 700 }}>CAP</span>
                      )}
                    </div>
                    <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 1 }}>
                      {m.solveCount ?? 0} solve{(m.solveCount ?? 0) !== 1 ? "s" : ""}
                      {m.pointsContributed != null && ` · ${m.pointsContributed}pts`}
                      {wrongCount > 0 && (
                        <span style={{ color: isSpammed ? "#f59e0b" : "#f87171", marginLeft: 4 }}>
                          · {wrongCount}✗
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => setFocusedPlayer(isFocused ? null : key)}
                  style={{
                    width: "100%", padding: "4px 0", borderRadius: 4, fontSize: 10, fontWeight: 600,
                    background: isFocused ? "rgba(99,102,241,0.15)" : "var(--bg-hover)",
                    border: `1px solid ${isFocused ? "rgba(99,102,241,0.35)" : "var(--border)"}`,
                    color: isFocused ? "#818cf8" : "var(--text-secondary)",
                    cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
                  }}
                >
                  <Eye size={9} />
                  {isFocused ? "Viewing log" : "View Activity Log"}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Right: activity stream ─────────────────────────────────────────── */}
      <ActivityStream
        subs={subs}
        spamKeys={spamKeys}
        focusedPlayer={focusedPlayer}
        onClearFocus={() => setFocusedPlayer(null)}
      />
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function TeacherCtfTeamsTab({ competitionId }: Props) {
  const [teams, setTeams]             = useState<CTFTeacherTeamDTO[]>([]);
  const [allSubs, setAllSubs]         = useState<CTFTeacherSubmissionDTO[]>([]);
  const [loading, setLoading]         = useState(true);
  const [expanded, setExpanded]       = useState<Set<string>>(new Set());
  const [dqTarget, setDqTarget]       = useState<{ id: string; name: string } | null>(null);
  const [dqReason, setDqReason]       = useState("");
  const [dqBusy, setDqBusy]          = useState(false);
  const [rateLimitTarget, setRateLimitTarget] = useState<{ id: string; name: string } | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      getTeacherCtfTeams(competitionId),
      getTeacherCtfSubmissions(competitionId, 1000),
    ])
      .then(([t, s]) => {
        setTeams(t);
        // Reverse-chronological order for the stream
        setAllSubs([...s].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()));
      })
      .catch(() => toast.error("Failed to load teams", "Please try again."))
      .finally(() => setLoading(false));
  }, [competitionId]);

  useEffect(() => { load(); }, [load]);

  // Pre-compute spam map once for all submissions
  const globalSpamKeys = useMemo(() => detectSpam(allSubs), [allSubs]);

  // Index submissions by teamId
  const subsByTeam = useMemo(() => {
    const m = new Map<string, CTFTeacherSubmissionDTO[]>();
    for (const s of allSubs) {
      if (!m.has(s.teamId)) m.set(s.teamId, []);
      m.get(s.teamId)!.push(s);
    }
    return m;
  }, [allSubs]);

  // Which teams have at least one spammer?
  const spamTeams = useMemo(() => {
    const flagged = new Set<string>();
    for (const s of allSubs) {
      if (globalSpamKeys.has(s.solvedByUserId ?? s.solvedByName)) flagged.add(s.teamId);
    }
    return flagged;
  }, [allSubs, globalSpamKeys]);

  function toggle(id: string) {
    setExpanded(prev => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }

  async function confirmDisqualify() {
    if (!dqTarget) return;
    setDqBusy(true);
    try {
      await disqualifyTeacherCtfTeam(competitionId, dqTarget.id, dqReason || undefined);
      toast.success("Team disqualified", `${dqTarget.name} has been disqualified.`);
      setDqTarget(null);
      setDqReason("");
      load();
    } catch {
      // toast already shown
    } finally {
      setDqBusy(false);
    }
  }

  if (loading) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {[0, 1, 2].map(i => <div key={i} className="skel" style={{ height: 52, borderRadius: 6 }} />)}
      </div>
    );
  }

  if (teams.length === 0) {
    return (
      <div className="psp-empty">
        <Users size={36} style={{ margin: "0 auto 10px", color: "var(--text-subtle)" }} />
        <div className="psp-empty-title">No teams yet</div>
        <div>Teams will appear here once students register.</div>
      </div>
    );
  }

  const sorted = [...teams].sort((a, b) => b.totalPoints - a.totalPoints);

  return (
    <div>
      {/* Top bar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 13, color: "var(--text-muted)" }}>
            {teams.length} team{teams.length !== 1 ? "s" : ""} registered
          </span>
          {spamTeams.size > 0 && (
            <span style={{
              display: "inline-flex", alignItems: "center", gap: 4,
              padding: "2px 8px", borderRadius: 4, fontSize: 10, fontWeight: 700,
              background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.3)",
              color: "#f59e0b",
            }}>
              <AlertTriangle size={10} /> {spamTeams.size} team{spamTeams.size !== 1 ? "s" : ""} with brute-force activity
            </span>
          )}
        </div>
        <button className="psp-btn psp-btn-secondary psp-btn-sm" onClick={load} style={{ fontSize: 12, gap: 5 }}>
          <RefreshCw size={12} /> Refresh
        </button>
      </div>

      {/* Table */}
      <div style={{ border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "var(--bg-secondary)", borderBottom: "2px solid var(--border)" }}>
              {["", "Team", "Members", "Score", "Solves", "Last Solve", "Status", "Actions"].map(h => (
                <th key={h} style={{
                  padding: "9px 12px", textAlign: "left", fontSize: 10,
                  color: "var(--text-muted)", textTransform: "uppercase",
                  letterSpacing: "0.07em", fontWeight: 700,
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((team) => {
              const open = expanded.has(team.id);
              const hasSpam = spamTeams.has(team.id);
              const teamSubs = subsByTeam.get(team.id) ?? [];
              // Per-team spam set (subset of globalSpamKeys seen in this team)
              const teamSpamKeys = new Set<string>(
                teamSubs
                  .filter(s => globalSpamKeys.has(s.solvedByUserId ?? s.solvedByName))
                  .map(s => s.solvedByUserId ?? s.solvedByName)
              );

              return (
                <>
                  <tr
                    key={team.id}
                    style={{
                      borderBottom: open ? "none" : "1px solid var(--border)",
                      background: team.isDisqualified
                        ? "rgba(239,68,68,0.04)"
                        : hasSpam
                        ? "rgba(245,158,11,0.03)"
                        : undefined,
                    }}
                  >
                    {/* Expand toggle */}
                    <td style={{ padding: "10px 8px 10px 12px", width: 32 }}>
                      <button
                        type="button"
                        onClick={() => toggle(team.id)}
                        style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: 2 }}
                      >
                        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </button>
                    </td>

                    {/* Team name */}
                    <td style={{ padding: "10px 12px", fontWeight: 700, color: "var(--text-primary)" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{
                          width: 26, height: 26, borderRadius: "50%",
                          background: team.avatarColor, flexShrink: 0,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          color: "#fff", fontSize: 10, fontWeight: 800,
                        }}>
                          {team.name.charAt(0).toUpperCase()}
                        </span>
                        <div>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <span>{team.name}</span>
                            {hasSpam && (
                              <span style={{
                                display: "inline-flex", alignItems: "center", gap: 3,
                                fontSize: 9, padding: "1px 5px", borderRadius: 3, fontWeight: 700,
                                background: "rgba(245,158,11,0.14)", color: "#f59e0b",
                                border: "1px solid rgba(245,158,11,0.3)",
                              }}>
                                <AlertTriangle size={8} /> SPAM
                              </span>
                            )}
                          </div>
                          {team.captainName && (
                            <div style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 400 }}>
                              Cap: {team.captainName}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>

                    <td style={{ padding: "10px 12px", color: "var(--text-muted)" }}>{team.members.length}</td>

                    <td style={{ padding: "10px 12px", fontWeight: 700, color: "#a78bfa" }}>
                      {team.totalPoints}
                    </td>

                    <td style={{ padding: "10px 12px", color: "var(--text-muted)" }}>{team.solveCount}</td>

                    <td style={{ padding: "10px 12px", color: "var(--text-muted)", fontSize: 12 }}>
                      {relTime(team.lastSolveAt)}
                    </td>

                    {/* Status */}
                    <td style={{ padding: "10px 12px" }}>
                      {team.isDisqualified ? (
                        <span style={{
                          display: "inline-flex", alignItems: "center", gap: 4,
                          background: "rgba(239,68,68,0.12)", color: "#f87171",
                          border: "1px solid rgba(239,68,68,0.3)",
                          borderRadius: 4, padding: "2px 8px", fontSize: 10, fontWeight: 700,
                        }}>
                          <ShieldOff size={10} /> DQ
                        </span>
                      ) : (
                        <span style={{
                          display: "inline-flex", alignItems: "center", gap: 4,
                          background: "rgba(16,185,129,0.1)", color: "#34d399",
                          border: "1px solid rgba(16,185,129,0.3)",
                          borderRadius: 4, padding: "2px 8px", fontSize: 10, fontWeight: 700,
                        }}>
                          <Shield size={10} /> Active
                        </span>
                      )}
                    </td>

                    {/* Actions */}
                    <td style={{ padding: "8px 12px" }}>
                      <div style={{ display: "flex", gap: 5, flexWrap: "nowrap" }}>
                        {!team.isDisqualified && (
                          <>
                            {/* Rate Limit — no backend endpoint yet, show intent */}
                            <button
                              className="psp-btn psp-btn-secondary psp-btn-sm"
                              style={{ gap: 4, fontSize: 10, color: "#f59e0b", borderColor: "rgba(245,158,11,0.35)" }}
                              title="Temporarily freeze submission attempts for this team"
                              onClick={() => setRateLimitTarget({ id: team.id, name: team.name })}
                            >
                              <Zap size={10} /> Rate Limit
                            </button>

                            <button
                              className="psp-btn psp-btn-secondary psp-btn-sm"
                              style={{ gap: 4, color: "#f87171", borderColor: "rgba(239,68,68,0.35)", fontSize: 10 }}
                              onClick={() => setDqTarget({ id: team.id, name: team.name })}
                            >
                              <ShieldOff size={10} /> Disqualify
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>

                  {/* ── Expanded split panel ─────────────────────────────────── */}
                  {open && (
                    <tr key={`${team.id}-exp`} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td colSpan={8} style={{ padding: 0 }}>
                        <TeamExpandedPanel
                          team={team}
                          subs={teamSubs}
                          spamKeys={teamSpamKeys}
                        />
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ── Disqualify modal ──────────────────────────────────────────────── */}
      {dqTarget && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)",
          display: "flex", alignItems: "center", justifyContent: "center", zIndex: 300,
        }} onClick={() => { setDqTarget(null); setDqReason(""); }}>
          <div
            className="psp-card"
            style={{ width: 420, maxWidth: "92vw", padding: 22 }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <ShieldOff size={18} style={{ color: "#f87171" }} />
              <span style={{ fontSize: 16, fontWeight: 800, color: "#f87171" }}>
                Disqualify &ldquo;{dqTarget.name}&rdquo;?
              </span>
            </div>
            <div style={{
              fontSize: 12, color: "var(--text-muted)", marginBottom: 14, lineHeight: 1.6,
              padding: "10px 12px", borderRadius: 6,
              background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.2)",
            }}>
              ⚠ This will remove the team from the scoreboard and mark them as disqualified.
              This action cannot be undone.
            </div>
            <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "var(--text-muted)", marginBottom: 5 }}>
              Reason (optional)
            </label>
            <input
              className="input"
              value={dqReason}
              onChange={e => setDqReason(e.target.value)}
              placeholder="e.g. Sharing flags with another team"
              style={{ marginBottom: 16 }}
            />
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button
                className="psp-btn psp-btn-secondary"
                onClick={() => { setDqTarget(null); setDqReason(""); }}
                disabled={dqBusy}
              >
                Cancel
              </button>
              <button
                className="psp-btn psp-btn-primary"
                style={{ background: "#dc2626", borderColor: "#dc2626" }}
                onClick={confirmDisqualify}
                disabled={dqBusy}
              >
                {dqBusy ? "Working…" : "Disqualify Team"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Rate Limit modal (intent UI — no backend endpoint yet) ─────────── */}
      {rateLimitTarget && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)",
          display: "flex", alignItems: "center", justifyContent: "center", zIndex: 300,
        }} onClick={() => setRateLimitTarget(null)}>
          <div
            className="psp-card"
            style={{ width: 400, maxWidth: "92vw", padding: 22 }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <Zap size={18} style={{ color: "#f59e0b" }} />
              <span style={{ fontSize: 16, fontWeight: 800, color: "#f59e0b" }}>
                Rate Limit &ldquo;{rateLimitTarget.name}&rdquo;
              </span>
            </div>
            <div style={{
              fontSize: 12, color: "var(--text-muted)", marginBottom: 16, lineHeight: 1.6,
              padding: "10px 12px", borderRadius: 6,
              background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.25)",
            }}>
              Rate limiting temporarily freezes submission attempts and container spawning for this team.
              This is a softer action than disqualification — the team remains on the scoreboard.
              <br /><br />
              <strong style={{ color: "#f59e0b" }}>Backend endpoint pending.</strong> This feature is
              provisioned in the UI and will be enabled once the server-side throttle mechanism is deployed.
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button className="psp-btn psp-btn-secondary" onClick={() => setRateLimitTarget(null)}>
                Close
              </button>
              <button
                className="psp-btn psp-btn-secondary"
                style={{ color: "#f59e0b", borderColor: "rgba(245,158,11,0.4)", gap: 5, opacity: 0.6 }}
                disabled
                title="Backend endpoint not yet available"
              >
                <Zap size={12} /> Apply Rate Limit
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
