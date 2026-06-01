"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Check, Ban, Download, Copy, Search, ChevronDown } from "lucide-react";
import { toast } from "@/components/ui/PSPToast";
import {
  getTeacherCtfCheats,
  dismissTeacherCtfCheat,
  disqualifyTeacherCtfTeam,
  downloadTeacherCtfCheatsExport,
  type CTFTeacherCheatDTO,
} from "@/lib/api";

interface Props {
  competitionId: string;
  onChanged: () => void;
}

type StatusFilter = "ALL" | "ACTIVE" | "DISMISSED";

export default function TeacherCtfCheatsTab({ competitionId, onChanged }: Props) {
  const [rows, setRows]       = useState<CTFTeacherCheatDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy]       = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  // Filters
  const [teamFilter, setTeamFilter]         = useState<string>("ALL");
  const [chalFilter, setChalFilter]         = useState<string>("ALL");
  const [statusFilter, setStatusFilter]     = useState<StatusFilter>("ALL");
  const [search, setSearch]                 = useState("");

  // Disqualify modal
  const [dqTarget, setDqTarget] = useState<{ id: string; name: string } | null>(null);

  const reload = () => {
    setLoading(true);
    getTeacherCtfCheats(competitionId)
      .then(setRows)
      .catch(() => toast.error("Failed to load cheats", "Please try again."))
      .finally(() => setLoading(false));
  };

  useEffect(() => { reload(); }, [competitionId]);

  const dismiss = async (id: string) => {
    setBusy(`dismiss-${id}`);
    try {
      await dismissTeacherCtfCheat(competitionId, id);
      toast.success("Dismissed", "Event marked as reviewed.");
      reload(); onChanged();
    } catch { /* toasted */ } finally { setBusy(null); }
  };

  const disqualify = async (teamId: string, teamName: string) => {
    setBusy(`dq-${teamId}`);
    try {
      await disqualifyTeacherCtfTeam(competitionId, teamId);
      toast.success("Team disqualified", `"${teamName}" was disqualified.`);
      setDqTarget(null);
      reload(); onChanged();
    } catch { /* toasted */ } finally { setBusy(null); }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      await downloadTeacherCtfCheatsExport(competitionId);
    } catch {
      toast.error("Export failed", "Could not download the CSV.");
    } finally {
      setExporting(false);
    }
  };

  // Derived filter options
  const teams = useMemo(() => {
    const seen = new Map<string, string>();
    rows.forEach(r => {
      seen.set(r.submittingTeamId, r.submittingTeamName);
      seen.set(r.sourceTeamId, r.sourceTeamName);
    });
    return [{ id: "ALL", name: "All teams" }, ...[...seen.entries()].map(([id, name]) => ({ id, name }))];
  }, [rows]);

  const challenges = useMemo(() => {
    const seen = new Map<string, string>();
    rows.forEach(r => seen.set(r.challengeId, r.challengeTitle));
    return [{ id: "ALL", name: "All challenges" }, ...[...seen.entries()].map(([id, name]) => ({ id, name }))];
  }, [rows]);

  const filtered = useMemo(() => rows.filter(r => {
    if (teamFilter !== "ALL" && r.submittingTeamId !== teamFilter && r.sourceTeamId !== teamFilter) return false;
    if (chalFilter !== "ALL" && r.challengeId !== chalFilter) return false;
    if (statusFilter === "ACTIVE" && r.dismissed) return false;
    if (statusFilter === "DISMISSED" && !r.dismissed) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      if (!r.submittingTeamName.toLowerCase().includes(q) &&
          !(r.submittingUserName ?? "").toLowerCase().includes(q) &&
          !(r.submittingUserEmail ?? "").toLowerCase().includes(q)) return false;
    }
    return true;
  }), [rows, teamFilter, chalFilter, statusFilter, search]);

  const pendingCount = rows.filter(r => !r.dismissed).length;

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <AlertTriangle size={16} color="#f87171" />
        <span style={{ fontSize: 15, fontWeight: 700 }}>
          Cheat Events ({rows.length})
        </span>
        {pendingCount > 0 && (
          <span style={{
            fontSize: 11, fontWeight: 700, color: "#f87171",
            background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.3)",
            borderRadius: 10, padding: "1px 7px",
          }}>
            {pendingCount} pending
          </span>
        )}
        <button
          type="button"
          onClick={handleExport}
          disabled={exporting || rows.length === 0}
          style={{
            marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 6,
            fontSize: 12, fontWeight: 600, cursor: "pointer",
            color: "#94a3b8", background: "transparent",
            border: "1px solid var(--border, #1e293b)", borderRadius: 6,
            padding: "5px 12px",
            opacity: (exporting || rows.length === 0) ? 0.5 : 1,
          }}
        >
          <Download size={13} />
          {exporting ? "Exporting…" : "Export CSV"}
        </button>
      </div>

      {/* Filters */}
      <div style={{
        display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center",
        marginBottom: 14, padding: "10px 12px",
        background: "var(--bg-secondary, #f8fafc)", border: "1px solid var(--border, #e2e8f0)", borderRadius: 8,
      }}>
        <FilterSelect
          label="Team"
          value={teamFilter}
          onChange={setTeamFilter}
          options={teams.map(t => ({ value: t.id, label: t.name }))}
        />
        <FilterSelect
          label="Challenge"
          value={chalFilter}
          onChange={setChalFilter}
          options={challenges.map(c => ({ value: c.id, label: c.name }))}
        />
        <StatusPills value={statusFilter} onChange={setStatusFilter} />
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: "auto" }}>
          <Search size={13} style={{ color: "var(--text-muted, #64748b)", flexShrink: 0 }} />
          <input
            placeholder="Search user or team…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              background: "transparent", border: "none", outline: "none",
              color: "var(--text, #0f172a)", fontSize: 12, width: 170,
            }}
          />
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="skel" style={{ height: 280, borderRadius: 8 }} />
      ) : filtered.length === 0 ? (
        <div className="psp-empty">
          <div className="psp-empty-title">
            {rows.length === 0 ? "No cheat events" : "No events match the current filters"}
          </div>
          {rows.length === 0 && (
            <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
              Cheat events fire when a team submits another team&apos;s flag.
            </div>
          )}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {filtered.map(r => (
            <CheatCard
              key={r.id}
              r={r}
              busy={busy}
              onDismiss={dismiss}
              onDisqualify={(id, name) => setDqTarget({ id, name })}
            />
          ))}
        </div>
      )}

      {/* Disqualify confirmation modal */}
      {dqTarget && (
        <DisqualifyModal
          teamName={dqTarget.name}
          loading={busy === `dq-${dqTarget.id}`}
          onConfirm={() => disqualify(dqTarget.id, dqTarget.name)}
          onCancel={() => setDqTarget(null)}
        />
      )}
    </div>
  );
}

// ── Cheat card ────────────────────────────────────────────────────────────────

function CheatCard({ r, busy, onDismiss, onDisqualify }: {
  r: CTFTeacherCheatDTO;
  busy: string | null;
  onDismiss: (id: string) => void;
  onDisqualify: (teamId: string, teamName: string) => void;
}) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(r.submittedValue);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch { /* ignore */ }
  };

  return (
    <div style={{
      border: r.dismissed ? "1px solid var(--border, #e2e8f0)" : "1px solid rgba(239,68,68,0.3)",
      borderLeft: r.dismissed ? undefined : "3px solid #ef4444",
      borderRadius: 8,
      background: "var(--bg-card, #fff)",
      padding: "14px 16px",
      opacity: r.dismissed ? 0.65 : 1,
    }}>
      {/* Row 1: label + time */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
        <span style={{
          fontSize: 10, fontWeight: 700, color: "#f87171",
          background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.3)",
          borderRadius: 3, padding: "1px 6px",
        }}>
          🚨 Cross-Team Flag
        </span>
        {r.challengeCategory && (
          <span style={{
            fontSize: 10, fontWeight: 600, color: "var(--text-muted)",
            background: "var(--bg-secondary)", border: "1px solid var(--border)",
            borderRadius: 3, padding: "1px 6px", textTransform: "uppercase",
          }}>{r.challengeCategory}</span>
        )}
        {r.submittingTeamDisqualified && (
          <span style={{
            fontSize: 10, fontWeight: 700, color: "#fbbf24",
            background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.3)",
            borderRadius: 3, padding: "1px 6px",
          }}>DQ&apos;d</span>
        )}
        <span style={{ fontSize: 11, color: "var(--text-muted)", marginLeft: "auto" }}>
          {relTime(r.detectedAt)}
        </span>
      </div>

      {/* Row 2: challenge */}
      <div style={{ marginBottom: 12, fontSize: 13 }}>
        Challenge: <strong style={{ color: "var(--text)" }}>{r.challengeTitle}</strong>
      </div>

      {/* Row 3: two boxes */}
      <div style={{ display: "flex", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
        {/* Submitted by */}
        <div style={{
          flex: 1, minWidth: 160,
          border: "1px solid var(--border)", borderRadius: 6, padding: "10px 12px",
          background: "var(--bg-secondary)",
        }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>
            Submitted by
          </div>
          {r.submittingUserName && (
            <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, marginBottom: 3 }}>
              <span>👤</span>
              <span style={{ color: "var(--text)", fontWeight: 600 }}>{r.submittingUserName}</span>
            </div>
          )}
          {r.submittingUserEmail && (
            <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>
              <span>📧</span>
              <span>{r.submittingUserEmail}</span>
            </div>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
            <span style={{
              width: 10, height: 10, borderRadius: "50%", flexShrink: 0,
              background: r.submittingTeamAccentColor ?? "#6366f1",
            }} />
            <span style={{ fontWeight: 600, color: "var(--text)" }}>{r.submittingTeamName}</span>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", fontSize: 18, color: "var(--text-muted)", flexShrink: 0 }}>→</div>

        {/* Flag belonged to */}
        <div style={{
          flex: 1, minWidth: 160,
          border: "1px solid var(--border)", borderRadius: 6, padding: "10px 12px",
          background: "var(--bg-secondary)",
        }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>
            Flag belonged to
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
            <span style={{
              width: 10, height: 10, borderRadius: "50%", flexShrink: 0,
              background: r.sourceTeamAccentColor ?? "#94a3b8",
            }} />
            <span style={{ fontWeight: 600, color: "var(--text)" }}>{r.sourceTeamName}</span>
          </div>
        </div>
      </div>

      {/* Row 4: submitted value */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>Submitted value:</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <code style={{
            fontSize: 12, fontFamily: "ui-monospace, monospace",
            background: "var(--bg-secondary)", border: "1px solid var(--border)",
            borderRadius: 4, padding: "4px 10px", flex: 1,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            color: "var(--text)",
          }}>
            {r.submittedValue}
          </code>
          <button
            type="button"
            onClick={copy}
            title="Copy flag"
            style={{
              background: "transparent", border: "1px solid var(--border)",
              borderRadius: 4, padding: "4px 8px", cursor: "pointer",
              display: "inline-flex", alignItems: "center", gap: 4,
              fontSize: 11, color: copied ? "#22c55e" : "var(--text-muted)",
              flexShrink: 0,
            }}
          >
            <Copy size={11} />
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      </div>

      {/* Row 5: dismissed info or action buttons */}
      {r.dismissed ? (
        <div style={{ fontSize: 11, color: "var(--text-muted)", fontStyle: "italic" }}>
          ✓ Dismissed{r.dismissedByUsername ? ` by ${r.dismissedByUsername}` : ""}
        </div>
      ) : (
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button
            className="psp-btn psp-btn-secondary psp-btn-sm"
            style={{ gap: 4 }}
            disabled={busy === `dismiss-${r.id}`}
            onClick={() => onDismiss(r.id)}
          >
            <Check size={11} /> Dismiss
          </button>
          {!r.submittingTeamDisqualified && (
            <button
              className="psp-btn psp-btn-secondary psp-btn-sm"
              style={{ gap: 4, color: "#f87171", borderColor: "rgba(239,68,68,0.4)" }}
              disabled={busy === `dq-${r.submittingTeamId}`}
              onClick={() => onDisqualify(r.submittingTeamId, r.submittingTeamName)}
            >
              <Ban size={11} /> Disqualify {r.submittingTeamName}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Disqualify modal ──────────────────────────────────────────────────────────

function DisqualifyModal({ teamName, loading, onConfirm, onCancel }: {
  teamName: string;
  loading: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9999,
      background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center",
    }}
      onClick={e => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div style={{
        background: "var(--bg-card, #fff)", border: "1px solid var(--border)",
        borderRadius: 12, padding: "24px 28px", maxWidth: 400, width: "90%",
        boxShadow: "0 20px 60px rgba(0,0,0,0.4)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <Ban size={18} color="#f87171" />
          <span style={{ fontSize: 16, fontWeight: 800, color: "var(--text)" }}>
            Disqualify {teamName}?
          </span>
        </div>
        <p style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.6, marginBottom: 20 }}>
          This will set their score to 0 and mark them as disqualified.
          This action can be undone by the platform administrator.
        </p>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button
            className="psp-btn psp-btn-secondary psp-btn-sm"
            onClick={onCancel}
            disabled={loading}
          >
            Cancel
          </button>
          <button
            className="psp-btn psp-btn-sm"
            style={{ background: "#ef4444", color: "#fff", border: "none", gap: 6 }}
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? "Disqualifying…" : <><Ban size={12} /> Disqualify</>}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Filter helpers ────────────────────────────────────────────────────────────

function FilterSelect({ label, value, onChange, options }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, position: "relative" }}>
      <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600 }}>{label}:</span>
      <div style={{ position: "relative" }}>
        <select
          value={value}
          onChange={e => onChange(e.target.value)}
          style={{
            appearance: "none", background: "var(--bg-card, #fff)",
            border: "1px solid var(--border)", borderRadius: 5,
            padding: "4px 24px 4px 8px", fontSize: 12, color: "var(--text)",
            cursor: "pointer",
          }}
        >
          {options.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <ChevronDown size={11} style={{
          position: "absolute", right: 7, top: "50%", transform: "translateY(-50%)",
          color: "var(--text-muted)", pointerEvents: "none",
        }} />
      </div>
    </div>
  );
}

function StatusPills({ value, onChange }: { value: StatusFilter; onChange: (v: StatusFilter) => void }) {
  const opts: StatusFilter[] = ["ALL", "ACTIVE", "DISMISSED"];
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
      {opts.map(o => (
        <button
          key={o}
          type="button"
          onClick={() => onChange(o)}
          style={{
            fontSize: 11, fontWeight: 600, borderRadius: 4, padding: "3px 9px",
            border: `1px solid ${value === o ? "#6366f1" : "var(--border)"}`,
            background: value === o ? "rgba(99,102,241,0.1)" : "transparent",
            color: value === o ? "#6366f1" : "var(--text-muted)",
            cursor: "pointer",
          }}
        >
          {o === "ALL" ? "All" : o === "ACTIVE" ? "Active" : "Dismissed"}
        </button>
      ))}
    </div>
  );
}

// ── Util ──────────────────────────────────────────────────────────────────────

function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
