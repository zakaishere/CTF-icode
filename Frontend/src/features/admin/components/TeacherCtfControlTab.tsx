"use client";

import { useEffect, useState } from "react";
import {
  Pause, Play, Snowflake, Flame, StopCircle, AlertTriangle, X,
  Users, CheckCircle2, Activity, ShieldAlert, Megaphone, Send, PlayCircle,
} from "lucide-react";
import { toast } from "@/components/ui/PSPToast";
import {
  pauseTeacherCtfCompetition, resumeTeacherCtfCompetition,
  freezeTeacherCtfCompetition, unfreezeTeacherCtfCompetition,
  endTeacherCtfCompetition, startManualCtfCompetition,
  broadcastTeacherCtfMessage, getCtfNotifications,
  type CTFCompetitionDTO, type CTFTeacherOverviewDTO,
  type CTFNotificationDTO,
} from "@/lib/api";

interface Props {
  competition: CTFCompetitionDTO;
  overview: CTFTeacherOverviewDTO | null;
  onCompetitionChanged: (updated?: CTFCompetitionDTO) => void;
  onOverviewRefresh: () => void;
  hideStartBanner?: boolean;
}

type Action = "pause" | "resume" | "freeze" | "unfreeze" | "end" | "start";

const ACTION_COPY: Record<Action, { title: string; body: string; cta: string; danger: boolean; requiresName: boolean }> = {
  start:    { title: "Start competition?", body: "The competition will go live immediately. Teams will be notified.", cta: "Start", danger: false, requiresName: false },
  pause:    { title: "Pause competition?",  body: "Submissions will be disabled for all teams. The countdown keeps running.", cta: "Pause", danger: false, requiresName: false },
  resume:   { title: "Resume competition?", body: "Teams will be able to submit flags again.", cta: "Resume", danger: false, requiresName: false },
  freeze:   { title: "Freeze scoreboard?",  body: "The scoreboard freezes at this moment. Teams keep solving, but rankings stay hidden.", cta: "Freeze", danger: false, requiresName: false },
  unfreeze: { title: "Unfreeze scoreboard?", body: "Live rankings will be revealed again.", cta: "Unfreeze", danger: false, requiresName: false },
  end:      { title: "End competition early?", body: "⚠ This cannot be undone. All submissions will close immediately. Type the competition name to confirm.", cta: "End competition", danger: true, requiresName: true },
};

function fmtRange(start: string | null, end: string | null) {
  if (!start && !end) return "Manual timing — no fixed schedule";
  if (!end) return `Starts ${new Date(start!).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })} — ends manually`;
  if (!start) return `Ends ${new Date(end).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}`;
  return `${new Date(start).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })} → ${new Date(end).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}`;
}

function useCountdown(endIso: string | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const ms = endIso ? Math.max(0, new Date(endIso).getTime() - now) : 0;
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return { ms, h, m, s, available: endIso !== null };
}

const pad2 = (n: number) => String(n).padStart(2, "0");

export default function TeacherCtfControlTab({
  competition, overview, onCompetitionChanged, onOverviewRefresh, hideStartBanner = false,
}: Props) {
  const [confirm, setConfirm] = useState<Action | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);

  const effectiveEnd = competition.computedEndTime ?? competition.endTime;
  const { h, m, s, ms, available: countdownAvailable } = useCountdown(effectiveEnd);
  const ended        = competition.status === "ENDED";
  const isManual     = competition.timingMode === "MANUAL";
  const isRegistration = competition.timingMode === "REGISTRATION";
  const isPaused     = competition.isPaused || competition.status === "PAUSED";
  const isFrozen     = competition.isFrozen || competition.status === "FROZEN";

  const runAction = async (action: Action) => {
    setBusy(true);
    try {
      let updated: CTFCompetitionDTO | undefined;
      switch (action) {
        case "start":    updated = await startManualCtfCompetition(competition.id); break;
        case "pause":    updated = await pauseTeacherCtfCompetition(competition.id); break;
        case "resume":   updated = await resumeTeacherCtfCompetition(competition.id); break;
        case "freeze":   updated = await freezeTeacherCtfCompetition(competition.id); break;
        case "unfreeze": updated = await unfreezeTeacherCtfCompetition(competition.id); break;
        case "end":      updated = await endTeacherCtfCompetition(competition.id); break;
      }
      toast.success("Done", `Competition ${action}.`);
      onCompetitionChanged(updated);
      onOverviewRefresh();
      setConfirm(null);
      setConfirmText("");
    } catch {
      // apiClient surfaces a toast already
    } finally {
      setBusy(false);
    }
  };

  const statusAccent: Record<string, string> = {
    UPCOMING: "#60a5fa", ACTIVE: "#34d399", PAUSED: "#fbbf24",
    FROZEN: "#22d3ee", ENDED: "#475569",
  };
  const accentColor = statusAccent[competition.status] ?? "#475569";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Status card */}
      <div className="psp-card" style={{
        padding: 0, overflow: "hidden",
        borderLeft: `3px solid ${accentColor}`,
      }}>
        {/* Header row */}
        <div style={{
          padding: "16px 20px 14px",
          borderBottom: "1px solid var(--border)",
          display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12,
        }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 17, fontWeight: 800, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {competition.title}
            </div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 3 }}>
              {fmtRange(competition.startTime, effectiveEnd)}
            </div>
          </div>
          <StatusChip status={competition.status} timingMode={competition.timingMode} />
        </div>

        {/* Countdown / start prompt / ended state */}
        <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--border)" }}>
          {ended ? (
            <div style={{ fontSize: 12, color: "var(--text-muted)", fontStyle: "italic" }}>
              Competition ended — results are final.
            </div>
          ) : (isManual || isRegistration) && competition.status === "UPCOMING" && !hideStartBanner ? (
            <div style={{
              padding: "12px 14px", borderRadius: 8,
              background: isRegistration ? "rgba(167,139,250,0.08)" : "rgba(96,165,250,0.08)",
              border: `1px solid ${isRegistration ? "rgba(167,139,250,0.25)" : "rgba(96,165,250,0.25)"}`,
              display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
            }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
                  {isRegistration ? "Registration open — teams are signing up" : "Manual mode — waiting for you to start"}
                </div>
                <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>
                  {isRegistration
                    ? `${overview?.teamCount ?? 0} team${(overview?.teamCount ?? 0) !== 1 ? "s" : ""} registered. Press Start when ready.`
                    : "Players are in the lobby. Press Start when everyone is ready."}
                </div>
              </div>
              <button
                className="psp-btn psp-btn-primary"
                style={{ gap: 6, flexShrink: 0 }}
                onClick={() => setConfirm("start")}
              >
                <PlayCircle size={14} /> Start
              </button>
            </div>
          ) : countdownAvailable ? (
            <div style={{ display: "flex", alignItems: "center", gap: 14, fontFamily: "ui-monospace, monospace" }}>
              <div>
                <div style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 2 }}>
                  {competition.status === "UPCOMING" ? "Starts in" : "Ends in"}
                </div>
                <div style={{
                  fontSize: 30, fontWeight: 800, lineHeight: 1,
                  color: ms < 3600_000 ? "#f87171" : "var(--text-primary)",
                }}>
                  {pad2(h)}:{pad2(m)}:{pad2(s)}
                </div>
              </div>
              {ms < 3600_000 && ms > 0 && (
                <span style={{
                  fontSize: 11, color: "#f87171", border: "1px solid rgba(239,68,68,0.3)",
                  borderRadius: 4, padding: "2px 8px", background: "rgba(239,68,68,0.08)",
                }}>
                  &lt; 1 hour left
                </span>
              )}
            </div>
          ) : (
            <div style={{ fontSize: 12, color: "var(--text-muted)", fontStyle: "italic" }}>
              Running — no fixed end time
            </div>
          )}
        </div>

        {/* Action buttons */}
        {!ended && !((isManual || isRegistration) && competition.status === "UPCOMING") && (
          <div style={{
            padding: "12px 20px",
            display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center",
          }}>
            {/* Pause / Resume */}
            {isPaused ? (
              <button className="psp-btn psp-btn-primary" style={{ gap: 6 }} onClick={() => setConfirm("resume")}>
                <Play size={13} /> Resume
              </button>
            ) : (
              <button
                className="psp-btn psp-btn-secondary" style={{ gap: 6 }}
                onClick={() => setConfirm("pause")}
                disabled={competition.status === "UPCOMING"}
              >
                <Pause size={13} /> Pause
              </button>
            )}

            {/* Freeze / Unfreeze */}
            {isFrozen ? (
              <button className="psp-btn psp-btn-secondary" style={{ gap: 6 }} onClick={() => setConfirm("unfreeze")}>
                <Flame size={13} /> Unfreeze
              </button>
            ) : (
              <button
                className="psp-btn psp-btn-secondary" style={{ gap: 6 }}
                onClick={() => setConfirm("freeze")}
                disabled={competition.status === "UPCOMING"}
              >
                <Snowflake size={13} /> Freeze Scoreboard
              </button>
            )}

            {/* Spacer before destructive */}
            <div style={{ flex: 1 }} />

            <button
              className="psp-btn psp-btn-secondary"
              style={{ gap: 6, color: "#f87171", borderColor: "rgba(239,68,68,0.35)" }}
              onClick={() => setConfirm("end")}
              disabled={competition.status === "UPCOMING"}
            >
              <StopCircle size={13} /> End Early
            </button>
          </div>
        )}
      </div>

      {/* Stat cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
        <StatCard icon={<Users size={15} />}        label="Teams"    value={overview?.teamCount ?? "—"} color="#60a5fa" />
        <StatCard icon={<CheckCircle2 size={15} />} label="Solves"   value={overview?.solveCount ?? "—"} color="#34d399" />
        <StatCard icon={<Activity size={15} />}     label="Attempts" value={overview?.attemptCount ?? "—"} color="#a78bfa" />
        <StatCard icon={<ShieldAlert size={15} />}  label="Cheats"   value={overview?.cheatCount ?? "—"} color={(overview?.cheatCount ?? 0) > 0 ? "#f87171" : "var(--text-muted)"} alert={(overview?.cheatCount ?? 0) > 0} />
      </div>

      {/* Recent activity */}
      <div className="psp-card" style={{ padding: 18 }}>
        <div style={{
          fontSize: 12, fontWeight: 700, color: "var(--text-muted)",
          textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10,
        }}>
          Recent activity
        </div>
        {overview?.recentEvents?.length ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {overview.recentEvents.map((e, i) => (
              <div key={i} style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "6px 0", borderBottom: i < overview.recentEvents.length - 1 ? "1px solid var(--border)" : "none",
              }}>
                <span style={{
                  width: 22, height: 22, borderRadius: "50%", background: e.avatarColor,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  color: "#fff", fontSize: 10, fontWeight: 700, flexShrink: 0,
                }}>{e.teamName.charAt(0).toUpperCase()}</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)", minWidth: 0 }}>
                  {e.teamName}
                </span>
                <span style={{ fontSize: 12, color: "var(--text-muted)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {e.detail}
                </span>
                {e.points !== null && (
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#22c55e", whiteSpace: "nowrap" }}>
                    +{e.points}
                  </span>
                )}
                <span style={{ fontSize: 11, color: "var(--text-muted)", whiteSpace: "nowrap" }}>
                  {new Date(e.at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ fontSize: 12, color: "var(--text-muted)" }}>No activity yet — waiting for the first solve.</div>
        )}
      </div>

      {/* Teacher broadcast */}
      <BroadcastSection competitionId={competition.id} />

      {/* Confirm modal */}
      {confirm && (
        <ConfirmModal
          action={confirm}
          competitionName={competition.title}
          busy={busy}
          confirmText={confirmText}
          setConfirmText={setConfirmText}
          onCancel={() => { setConfirm(null); setConfirmText(""); }}
          onConfirm={() => runAction(confirm)}
        />
      )}
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function StatusChip({ status, timingMode }: { status: CTFCompetitionDTO["status"]; timingMode?: CTFCompetitionDTO["timingMode"] }) {
  const isRegOpen = status === "UPCOMING" && timingMode === "REGISTRATION";
  const map: Record<string, { fg: string; bg: string; border: string; label: string }> = {
    UPCOMING: { fg: "#60a5fa", bg: "rgba(96,165,250,0.12)",  border: "rgba(96,165,250,0.35)",  label: "UPCOMING" },
    ACTIVE:   { fg: "#34d399", bg: "rgba(16,185,129,0.12)",  border: "rgba(16,185,129,0.35)",  label: "ACTIVE" },
    PAUSED:   { fg: "#fbbf24", bg: "rgba(245,158,11,0.12)",  border: "rgba(245,158,11,0.35)",  label: "PAUSED" },
    FROZEN:   { fg: "#22d3ee", bg: "rgba(34,211,238,0.12)",  border: "rgba(34,211,238,0.35)",  label: "FROZEN" },
    ENDED:    { fg: "#94a3b8", bg: "rgba(148,163,184,0.12)", border: "rgba(148,163,184,0.3)",   label: "ENDED" },
  };
  const c = isRegOpen
    ? { fg: "#a78bfa", bg: "rgba(167,139,250,0.12)", border: "rgba(167,139,250,0.35)", label: "REG OPEN" }
    : map[status];
  return (
    <span style={{
      background: c.bg, color: c.fg, border: `1px solid ${c.border}`,
      borderRadius: 4, padding: "4px 10px", fontSize: 11, fontWeight: 700, letterSpacing: "0.05em",
      display: "inline-flex", alignItems: "center", gap: 5,
    }}>
      {status === "ACTIVE" && (
        <span style={{
          width: 6, height: 6, borderRadius: "50%", background: c.fg,
          animation: "ctf-pulse 2s infinite", display: "inline-block",
        }} />
      )}
      {c.label}
    </span>
  );
}

function StatCard({ icon, label, value, color, alert = false }:
  { icon: React.ReactNode; label: string; value: number | string; color: string; alert?: boolean }) {
  return (
    <div className="psp-card" style={{
      padding: "14px 16px",
      borderTop: `2px solid ${color}`,
      ...(alert ? { background: "rgba(239,68,68,0.04)" } : {}),
    }}>
      <div style={{ fontSize: 10, color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 5, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>
        <span style={{ color }}>{icon}</span> {label}
      </div>
      <div style={{ fontSize: 28, fontWeight: 800, color, lineHeight: 1 }}>
        {value}
      </div>
    </div>
  );
}

function ConfirmModal({
  action, competitionName, busy, confirmText, setConfirmText, onCancel, onConfirm,
}: {
  action: Action;
  competitionName: string;
  busy: boolean;
  confirmText: string;
  setConfirmText: (s: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const copy = ACTION_COPY[action];
  const canConfirm = !copy.requiresName || confirmText.trim() === competitionName;
  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100,
    }} onClick={onCancel}>
      <div className="psp-card" style={{ width: 440, maxWidth: "92vw", padding: 20 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {copy.danger && <AlertTriangle size={18} color="#f87171" />}
            <span style={{ fontSize: 16, fontWeight: 700 }}>{copy.title}</span>
          </div>
          <button onClick={onCancel} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)" }}>
            <X size={16} />
          </button>
        </div>
        <div style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 14, lineHeight: 1.5 }}>
          {copy.body}
        </div>
        {copy.requiresName && (
          <input
            className="input"
            placeholder={`Type "${competitionName}" to confirm`}
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            style={{ marginBottom: 14 }}
          />
        )}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button className="psp-btn psp-btn-secondary" onClick={onCancel} disabled={busy}>Cancel</button>
          <button
            className="psp-btn psp-btn-primary"
            onClick={onConfirm}
            disabled={busy || !canConfirm}
            style={copy.danger ? { background: "#dc2626", borderColor: "#dc2626" } : undefined}
          >
            {busy ? "Working…" : copy.cta}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Teacher broadcast ─────────────────────────────────────────────────────────

const TITLE_MAX = 100;
const BODY_MAX  = 500;

function BroadcastSection({ competitionId }: { competitionId: string }) {
  const [title, setTitle] = useState("");
  const [body, setBody]   = useState("");
  const [sending, setSending] = useState(false);
  const [history, setHistory] = useState<CTFNotificationDTO[]>([]);

  // Load the last 5 CUSTOM broadcasts from the notification history.
  const loadHistory = async () => {
    try {
      const all = await getCtfNotifications(competitionId);
      setHistory(all.filter(n => n.type === "CUSTOM").slice(0, 5));
    } catch { /* silent — history is non-critical */ }
  };

  useEffect(() => { loadHistory(); }, [competitionId]);

  const canSend = title.trim().length > 0 && body.trim().length > 0
    && title.length <= TITLE_MAX && body.length <= BODY_MAX
    && !sending;

  const send = async () => {
    if (!canSend) return;
    setSending(true);
    try {
      await broadcastTeacherCtfMessage(competitionId, title.trim(), body.trim());
      toast.success("Broadcast sent", "All connected players received your message.");
      setTitle(""); setBody("");
      loadHistory();
    } catch {
      // apiClient surfaces a toast already
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="psp-card" style={{ padding: 18 }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 8, marginBottom: 12,
      }}>
        <Megaphone size={14} color="#a78bfa" />
        <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>
          Broadcast message to players
        </span>
      </div>

      <div style={{ marginBottom: 10 }}>
        <label style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>
          <span>Title</span>
          <span style={{ color: title.length > TITLE_MAX ? "#f87171" : "var(--text-muted)" }}>
            {title.length}/{TITLE_MAX}
          </span>
        </label>
        <input
          className="input"
          value={title}
          maxLength={TITLE_MAX + 20}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Check this!"
        />
      </div>

      <div style={{ marginBottom: 12 }}>
        <label style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>
          <span>Message</span>
          <span style={{ color: body.length > BODY_MAX ? "#f87171" : "var(--text-muted)" }}>
            {body.length}/{BODY_MAX}
          </span>
        </label>
        <textarea
          className="input"
          rows={3}
          value={body}
          maxLength={BODY_MAX + 50}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Heads-up: the Web challenge description was just updated."
        />
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button
          type="button"
          className="psp-btn psp-btn-primary"
          style={{ gap: 6 }}
          onClick={send}
          disabled={!canSend}
        >
          <Send size={13} /> {sending ? "Sending…" : "Send to All Players"}
        </button>
      </div>

      {history.length > 0 && (
        <div style={{ marginTop: 16, borderTop: "1px solid var(--border)", paddingTop: 12 }}>
          <div style={{
            fontSize: 11, color: "var(--text-muted)",
            textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8, fontWeight: 700,
          }}>
            Last {history.length} broadcast{history.length !== 1 ? "s" : ""}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {history.map(n => (
              <div key={n.id} style={{
                padding: "8px 10px", border: "1px solid var(--border)", borderRadius: 6,
                background: "var(--bg-secondary)",
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                  <span style={{ fontSize: 12, fontWeight: 700 }}>{n.title}</span>
                  <span style={{ fontSize: 10, color: "var(--text-muted)" }}>
                    {new Date(n.sentAt).toLocaleString("en-GB", {
                      day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
                    })}
                  </span>
                </div>
                {n.body && (
                  <div style={{
                    fontSize: 11, color: "var(--text-secondary)", marginTop: 4, lineHeight: 1.5,
                    fontStyle: "italic", whiteSpace: "pre-wrap", wordBreak: "break-word",
                  }}>
                    {n.body}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
