"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import {
  Sword, Link2, Copy, Check, Crown, UserX, LogOut, Loader2,
} from "lucide-react";
import { toast } from "@/components/ui/PSPToast";
import {
  createCtfTeam, joinCtfTeam, leaveCtfTeam, kickCtfTeamMember, transferCtfCaptaincy,
  getCtfScoreboard, getCtfCompetitionChallenges,
  type CTFScoreboardEntryDTO, type CTFCompetitionChallengeDTO,
} from "@/lib/api";
import { useCTFCompetition } from "@/features/ctf/context/CTFCompetitionContext";
import { CAT_CONFIG } from "@/features/ctf/shared/categoryConfig";

export default function TeamPage() {
  const { id } = useParams<{ id: string }>();
  const ctx = useCTFCompetition();

  const [userId, setUserId] = useState<string | null>(null);
  useEffect(() => {
    setUserId(typeof window !== "undefined" ? localStorage.getItem("icode_ctf_userId") : null);
  }, []);

  if (ctx.loading) {
    return <PageSpinner />;
  }

  if (!ctx.competition) return null;

  if (!ctx.myTeam) {
    const regOpen = Boolean(ctx.competition?.registrationOpen);
    const notEnded = ctx.status !== "ENDED";
    return <NoTeamPanels competitionId={id} onTeamCreated={ctx.refetchTeam} canRegister={notEnded && (ctx.status === "UPCOMING" || regOpen)} />;
  }

  return <InTeamView competitionId={id} userId={userId} />;
}

// ── No-team state ────────────────────────────────────────────────────────────

function NoTeamPanels({ competitionId, onTeamCreated, canRegister }: {
  competitionId: string;
  onTeamCreated: () => Promise<void>;
  canRegister: boolean;
}) {
  const ctx = useCTFCompetition();
  const [createName, setCreateName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [busy, setBusy] = useState<"create" | "join" | null>(null);

  const handleCreate = async () => {
    if (!createName.trim() || createName.trim().length < 3) {
      toast.warning("Team name too short", "Please enter at least 3 characters.");
      return;
    }
    setBusy("create");
    try {
      await createCtfTeam(competitionId, { name: createName.trim() });
      await onTeamCreated();
      toast.success("Team created", `Welcome to "${createName.trim()}".`);
    } catch { /* toasted */ } finally { setBusy(null); }
  };

  const handleJoin = async () => {
    const code = joinCode.replace(/\s/g, "").toUpperCase();
    if (!code) {
      toast.warning("Invite code required", "Ask your captain for the code.");
      return;
    }
    setBusy("join");
    try {
      await joinCtfTeam(competitionId, code);
      await onTeamCreated();
      toast.success("Joined team", "You're in.");
    } catch { /* toasted */ } finally { setBusy(null); }
  };

  // Auto-format join code: dash after 4 chars.
  const formatCode = (raw: string) => {
    const clean = raw.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 10);
    return clean.length > 4 ? `${clean.slice(0, 4)}-${clean.slice(4)}` : clean;
  };

  return (
    <div style={{ maxWidth: 880, margin: "20px auto" }}>
      <div style={{ marginBottom: 20 }}>
        <div style={{
          fontFamily: "'Chakra Petch', system-ui, sans-serif",
          fontSize: 20, fontWeight: 700, color: "#eaf0ff", letterSpacing: "0.02em",
        }}>Join the competition</div>
        <div style={{ fontSize: 13, color: "#4a5874", marginTop: 5 }}>
          Create a new team or join an existing one with an invite code.
        </div>
      </div>

      {!canRegister && (
        <div style={{
          background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.25)",
          borderRadius: 8, padding: "12px 14px", marginBottom: 18,
          fontSize: 13, color: "#fca5a5",
          fontFamily: "Inter, system-ui",
        }}>
          {ctx.status === "ENDED"
            ? "This competition has ended — team registration is closed."
            : "Team registration is closed — the admin has not enabled late registration."}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <div className="ict-card" style={{ padding: 20, opacity: canRegister ? 1 : 0.5 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
            <Sword size={15} color="#a78bfa" />
            <span style={{
              fontFamily: "'Chakra Petch', system-ui, sans-serif",
              fontSize: 13, fontWeight: 700, color: "#eaf0ff", letterSpacing: "0.04em",
            }}>Create a Team</span>
          </div>
          <Label>Team Name</Label>
          <input
            className="ict-input"
            value={createName}
            onChange={(e) => setCreateName(e.target.value)}
            placeholder="The Hackers"
            maxLength={30}
            disabled={!canRegister}
          />
          <div style={{ fontSize: 11, color: "#4a5874", marginTop: 4, fontFamily: "Inter, system-ui" }}>3–30 characters</div>
          <button
            type="button"
            className="ict-btn ict-btn-primary"
            style={{ marginTop: 12, width: "100%" }}
            disabled={!canRegister || busy !== null}
            onClick={handleCreate}
          >
            {busy === "create" ? "Creating…" : "Create Team"}
          </button>
        </div>

        <div className="ict-card" style={{ padding: 20, opacity: canRegister ? 1 : 0.5 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
            <Link2 size={15} color="#60a5ff" />
            <span style={{
              fontFamily: "'Chakra Petch', system-ui, sans-serif",
              fontSize: 13, fontWeight: 700, color: "#eaf0ff", letterSpacing: "0.04em",
            }}>Join a Team</span>
          </div>
          <Label>Invite Code</Label>
          <input
            className="ict-input"
            value={joinCode}
            onChange={(e) => setJoinCode(formatCode(e.target.value))}
            placeholder="WOLF-XKCD"
            disabled={!canRegister}
            style={{ fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.06em" }}
            onKeyDown={(e) => { if (e.key === "Enter" && canRegister) handleJoin(); }}
          />
          <div style={{ fontSize: 11, color: "#4a5874", marginTop: 4, fontFamily: "Inter, system-ui" }}>auto-formats: dash after 4 chars</div>
          <button
            type="button"
            className="ict-btn ict-btn-primary"
            style={{ marginTop: 12, width: "100%" }}
            disabled={!canRegister || busy !== null}
            onClick={handleJoin}
          >
            {busy === "join" ? "Joining…" : "Join Team"}
          </button>
        </div>
      </div>

      <div style={{
        marginTop: 16, padding: "10px 14px",
        background: "rgba(96,165,255,0.04)", border: "1px solid rgba(96,165,255,0.1)", borderRadius: 8,
        fontFamily: "'Chakra Petch', system-ui, sans-serif",
        fontSize: 10, color: "#4a5874", letterSpacing: "0.08em", textTransform: "uppercase",
      }}>
        Max team size: {ctx.competition?.maxTeamSize} · You can only be in one team.
      </div>
    </div>
  );
}

// ── In-team view ─────────────────────────────────────────────────────────────

function InTeamView({ competitionId, userId }: { competitionId: string; userId: string | null }) {
  const ctx = useCTFCompetition();
  const team = ctx.myTeam!;
  const [scoreboard, setScoreboard] = useState<CTFScoreboardEntryDTO[]>([]);
  const [challenges, setChallenges] = useState<CTFCompetitionChallengeDTO[]>([]);
  const [copied, setCopied] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const isCaptain = team.captainId === userId;
  const status = ctx.status ?? ctx.competition?.status ?? "UPCOMING";
  const competitionEnded = status === "ENDED";
  const regOpen = Boolean(ctx.competition?.registrationOpen);
  const canManage = status === "UPCOMING" || (regOpen && status !== "ENDED");

  useEffect(() => {
    getCtfScoreboard(competitionId).then(setScoreboard).catch(() => {});
    getCtfCompetitionChallenges(competitionId).then(w => setChallenges(w.challenges ?? [])).catch(() => {});
  }, [competitionId]);

  const myEntry = scoreboard.find(e => e.teamId === team.id);

  const copyInvite = () => {
    navigator.clipboard.writeText(team.inviteCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const onLeave = async () => {
    if (!confirm("Leave this team?")) return;
    try {
      await leaveCtfTeam(competitionId);
      await ctx.refetchTeam();
      toast.success("Left team", "");
    } catch { /* toasted */ }
  };

  const onKick = async (uid: string) => {
    if (!confirm("Remove this member?")) return;
    setBusyId(uid);
    try {
      await kickCtfTeamMember(competitionId, uid);
      await ctx.refetchTeam();
      toast.success("Member removed", "");
    } catch { /* toasted */ } finally { setBusyId(null); }
  };

  const onTransfer = async (uid: string) => {
    if (!confirm("Transfer captaincy?")) return;
    setBusyId(uid);
    try {
      await transferCtfCaptaincy(competitionId, uid);
      await ctx.refetchTeam();
      toast.success("Captaincy transferred", "");
    } catch { /* toasted */ } finally { setBusyId(null); }
  };

  const solvesByCategory = useMemo(() => {
    const stats: Record<string, { solved: number; total: number }> = {};
    for (const c of challenges) {
      stats[c.category] ??= { solved: 0, total: 0 };
      stats[c.category].total += 1;
      if (c.solvedByMe) stats[c.category].solved += 1;
    }
    return stats;
  }, [challenges]);

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto" }}>
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{
            width: 14, height: 14, borderRadius: "50%", background: team.avatarColor,
            boxShadow: `0 0 8px ${team.avatarColor}80`,
            flexShrink: 0,
          }} />
          <span style={{
            fontFamily: "'Chakra Petch', system-ui, sans-serif",
            fontSize: 20, fontWeight: 700, color: "#eaf0ff", letterSpacing: "0.02em",
          }}>{team.name}</span>
          {competitionEnded && myEntry && (
            <span style={{
              marginLeft: 4,
              fontFamily: "'Chakra Petch', system-ui, sans-serif",
              fontSize: 9, fontWeight: 800,
              background: "rgba(251,191,36,0.1)", color: "#fbbf24",
              border: "1px solid rgba(251,191,36,0.3)", borderRadius: 4,
              padding: "2px 8px", letterSpacing: "0.1em", textTransform: "uppercase",
            }}>
              FINAL RANK #{myEntry.rank}
            </span>
          )}
        </div>
        <div style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 12, color: "#4a5874", marginTop: 5,
        }}>
          {myEntry
            ? `Rank #${myEntry.rank} · ${myEntry.totalPoints} pts · ${myEntry.solveCount} solves`
            : "0 pts · 0 solves"}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        {/* LEFT — identity */}
        <div className="ict-card" style={{ padding: 18 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{
                width: 10, height: 10, borderRadius: "50%", background: team.avatarColor,
                boxShadow: `0 0 6px ${team.avatarColor}80`,
              }} />
              <span style={{
                fontFamily: "'Chakra Petch', system-ui, sans-serif",
                fontSize: 14, fontWeight: 700, color: "#eaf0ff", letterSpacing: "0.02em",
              }}>{team.name}</span>
            </div>
            {isCaptain && (
              <span style={{
                fontFamily: "'Chakra Petch', system-ui, sans-serif",
                fontSize: 8, fontWeight: 800, color: "#f59e0b",
                background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.3)",
                borderRadius: 4, padding: "2px 8px", letterSpacing: "0.12em", textTransform: "uppercase",
              }}>
                CAPTAIN
              </span>
            )}
          </div>

          {isCaptain && canManage && (
            <>
              <Label>Invite Code</Label>
              <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 14 }}>
                <div style={{
                  flex: 1, background: "rgba(5,11,29,0.9)", border: "1px solid rgba(130,165,255,0.15)", borderRadius: 6,
                  padding: "8px 12px",
                  fontFamily: "'JetBrains Mono', monospace", fontSize: 15, fontWeight: 700,
                  color: "#60a5ff", letterSpacing: "0.1em",
                  textShadow: "0 0 12px rgba(96,165,255,0.4)",
                }}>
                  {team.inviteCode}
                </div>
                <button type="button" className="ict-btn"
                  style={{ gap: 4, color: copied ? "#22c55e" : undefined, flexShrink: 0 }}
                  onClick={copyInvite}
                >
                  {copied ? <Check size={11} /> : <Copy size={11} />}
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
              <div style={{ fontSize: 11, color: "#4a5874", marginTop: -4, marginBottom: 14, fontFamily: "Inter, system-ui" }}>
                Share with teammates
              </div>
            </>
          )}

          <Label>Members ({team.members.length}/{ctx.competition?.maxTeamSize ?? 4})</Label>
          <div style={{ border: "1px solid rgba(130,165,255,0.1)", borderRadius: 8, overflow: "hidden" }}>
            {team.members.map((m, i) => (
              <div key={m.userId} style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "9px 12px",
                borderBottom: i < team.members.length - 1 ? "1px solid rgba(130,165,255,0.06)" : "none",
                background: m.userId === userId ? "rgba(96,165,255,0.04)" : "transparent",
              }}>
                <span style={{
                  width: 24, height: 24, borderRadius: "50%", background: team.avatarColor,
                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                  color: "#fff",
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 10, fontWeight: 700, flexShrink: 0,
                }}>{m.displayName.charAt(0).toUpperCase()}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontFamily: "Inter, system-ui",
                    fontSize: 13, fontWeight: 500, color: "#d4e0f0",
                  }}>
                    {m.displayName}
                    {m.userId === userId && (
                      <span style={{
                        fontFamily: "'Chakra Petch', system-ui",
                        fontSize: 8, color: "#60a5ff", marginLeft: 7,
                        background: "rgba(96,165,255,0.08)", border: "1px solid rgba(96,165,255,0.2)",
                        borderRadius: 3, padding: "1px 5px", letterSpacing: "0.1em",
                      }}>YOU</span>
                    )}
                  </div>
                  <div style={{
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: 10, color: "#4a5874",
                  }}>
                    {m.solveCount ?? 0} solve{(m.solveCount ?? 0) !== 1 ? "s" : ""} · {m.pointsContributed ?? 0} pts
                  </div>
                </div>
                {m.role === "CAPTAIN" ? (
                  <Crown size={13} color="#f59e0b" />
                ) : isCaptain && m.userId !== userId && canManage && (
                  <div style={{ display: "flex", gap: 4 }}>
                    <button type="button" title="Transfer captaincy"
                      style={iconBtnStyle("#f59e0b")} disabled={busyId === m.userId}
                      onClick={() => onTransfer(m.userId)}>
                      <Crown size={12} />
                    </button>
                    <button type="button" title="Kick member"
                      style={iconBtnStyle("#f87171")} disabled={busyId === m.userId}
                      onClick={() => onKick(m.userId)}>
                      <UserX size={12} />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>

          {canManage && (
            <button
              type="button"
              className="ict-btn"
              style={{ marginTop: 14, width: "100%", gap: 6, color: "#f87171", borderColor: "rgba(239,68,68,0.3)" }}
              onClick={onLeave}
            >
              <LogOut size={12} /> Leave Team
            </button>
          )}
        </div>

        {/* RIGHT — stats */}
        <div className="ict-card" style={{ padding: 20 }}>
          <div style={{
            fontFamily: "'Chakra Petch', system-ui, sans-serif",
            fontSize: 12, fontWeight: 700, marginBottom: 14,
            color: "#eaf0ff", letterSpacing: "0.06em", textTransform: "uppercase",
          }}>Team Performance</div>

          <Stat label="Score"  value={`${myEntry?.totalPoints ?? 0} pts`} />
          <Stat label="Rank"   value={myEntry ? `#${myEntry.rank} of ${scoreboard.length} teams` : "Unranked"} />
          <Stat label="Solves" value={`${myEntry?.solveCount ?? 0} / ${challenges.length} challenges`} last />

          <div style={{ marginTop: 18 }}>
            <Label>By Category</Label>
            {Object.keys(CAT_CONFIG).filter(k => solvesByCategory[k] !== undefined).map(cat => {
              const conf = CAT_CONFIG[cat];
              const s = solvesByCategory[cat];
              const pct = s.total ? Math.round((s.solved / s.total) * 100) : 0;
              const done = s.total > 0 && s.solved === s.total;
              return (
                <div key={cat} style={{
                  display: "grid", gridTemplateColumns: "auto 1fr auto auto",
                  alignItems: "center", gap: 8, marginBottom: 8, fontSize: 12,
                }}>
                  <span style={{ color: conf.accent, display: "inline-flex" }}>{conf.icon}</span>
                  <span style={{ fontFamily: "Inter, system-ui", color: "#8b9ab5", fontSize: 11 }}>{conf.label}</span>
                  <div style={{ width: 80, height: 3, background: "rgba(130,165,255,0.1)", borderRadius: 2 }}>
                    <div style={{ width: `${pct}%`, height: "100%", background: conf.accent, borderRadius: 2, transition: "width 500ms ease" }} />
                  </div>
                  <span style={{
                    fontFamily: "'JetBrains Mono', monospace",
                    color: done ? "#22c55e" : "#4a5874", fontSize: 11,
                  }}>
                    {s.solved}/{s.total} {done && <Check size={10} style={{ display: "inline" }} />}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Small helpers ────────────────────────────────────────────────────────────

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontFamily: "'Chakra Petch', system-ui, sans-serif",
      fontSize: 9, color: "#4a5874", marginBottom: 6,
      textTransform: "uppercase", letterSpacing: "0.14em", fontWeight: 800,
    }}>
      {children}
    </div>
  );
}

function Stat({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <div style={{
      display: "flex", justifyContent: "space-between",
      padding: "7px 0", borderBottom: last ? "none" : "1px solid rgba(130,165,255,0.07)",
      fontSize: 13,
    }}>
      <span style={{ fontFamily: "Inter, system-ui", color: "#4a5874", fontSize: 12 }}>{label}</span>
      <span style={{
        fontFamily: "'JetBrains Mono', monospace",
        color: "#eaf0ff", fontWeight: 700, fontSize: 12,
      }}>{value}</span>
    </div>
  );
}

function iconBtnStyle(color: string): React.CSSProperties {
  return {
    background: "transparent", border: `1px solid ${color}40`,
    borderRadius: 4, padding: "4px 6px",
    color, cursor: "pointer",
    display: "inline-flex", alignItems: "center",
    transition: "background 150ms",
  };
}

function PageSpinner() {
  return (
    <div style={{ display: "flex", justifyContent: "center", padding: 60 }}>
      <Loader2 size={28} style={{ animation: "spin 1s linear infinite", color: "#60a5ff" }} />
    </div>
  );
}
