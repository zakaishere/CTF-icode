"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import { toast } from "@/components/ui/PSPToast";
import {
  Plus, Trophy, Edit2, Download, Settings, Calendar, Snowflake, Pause, Flame, BookOpen,
} from "lucide-react";
import {
  listTeacherCtfCompetitions, downloadTeacherCtfExport,
  type CTFCompetitionDTO, type CTFCompetitionStatus,
} from "@/lib/api";

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

function statusStyle(s: CTFCompetitionStatus) {
  switch (s) {
    case "UPCOMING": return { label: "UPCOMING", bg: "rgba(96,165,250,0.12)", fg: "#60a5fa", border: "rgba(96,165,250,0.35)", icon: <Calendar size={11} /> };
    case "ACTIVE":   return { label: "ACTIVE",   bg: "rgba(16,185,129,0.12)", fg: "#34d399", border: "rgba(16,185,129,0.35)", icon: <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#22c55e", animation: "ctf-pulse 2s infinite", display: "inline-block" }} /> };
    case "PAUSED":   return { label: "PAUSED",   bg: "rgba(245,158,11,0.12)", fg: "#fbbf24", border: "rgba(245,158,11,0.35)", icon: <Pause size={11} /> };
    case "FROZEN":   return { label: "FROZEN",   bg: "rgba(34,211,238,0.12)", fg: "#22d3ee", border: "rgba(34,211,238,0.35)", icon: <Snowflake size={11} /> };
    case "ENDED":    return { label: "ENDED",    bg: "rgba(148,163,184,0.12)", fg: "#94a3b8", border: "rgba(148,163,184,0.3)",  icon: <Flame size={11} /> };
  }
}

export default function TeacherCtfCompetitionsList() {
  const [list, setList] = useState<CTFCompetitionDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState<string | null>(null);

  useEffect(() => {
    listTeacherCtfCompetitions()
      .then(setList)
      .catch(() => toast.error("Failed to load competitions", "Please try again."))
      .finally(() => setLoading(false));
  }, []);

  const handleExport = async (id: string) => {
    setExporting(id);
    try {
      await downloadTeacherCtfExport(id);
      toast.success("Export ready", "CSV download started.");
    } catch {
      toast.error("Export failed", "Please try again.");
    } finally {
      setExporting(null);
    }
  };

  return (
    <>
      <Navbar />
      <div className="psp-breadcrumb">
        <Link href="/admin">icode-ctf</Link> ›{" "}
        <span style={{ color: "var(--text-primary)" }}>CTF</span>
      </div>

      <div className="psp-main">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <Trophy size={22} color="#a78bfa" />
              <span style={{ fontSize: 22, fontWeight: 700 }}>My CTF Competitions</span>
            </div>
            <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 4 }}>
              Create, run, and analyze CTF competitions. Each one holds its own challenges, teams, and scoreboard.
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <Link href="/admin/ctf/library">
              <button className="psp-btn psp-btn-secondary" style={{ gap: 6 }}>
                <BookOpen size={14} /> Challenge Library
              </button>
            </Link>
            <Link href="/admin/ctf/new">
              <button className="psp-btn psp-btn-primary" style={{ gap: 6 }}>
                <Plus size={14} /> New Competition
              </button>
            </Link>
          </div>
        </div>

        {loading ? (
          <div className="skel" style={{ height: 280, borderRadius: 8 }} />
        ) : list.length === 0 ? (
          <div className="psp-empty">
            <Trophy size={36} style={{ margin: "0 auto 10px", color: "var(--text-subtle)" }} />
            <div className="psp-empty-title">No competitions yet</div>
            <div>Create your first CTF competition to get started.</div>
            <div style={{ marginTop: 14 }}>
              <Link href="/admin/ctf/new">
                <button className="psp-btn psp-btn-primary" style={{ gap: 6 }}>
                  <Plus size={14} /> Create Competition
                </button>
              </Link>
            </div>
          </div>
        ) : (
          <div style={{ overflowX: "auto", border: "1px solid var(--border)", borderRadius: 8, background: "var(--surface)" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "var(--surface-2, #0f172a)" }}>
                  {["Title", "Status", "Start", "End", "Visibility", "Actions"].map(h => (
                    <th key={h} style={{
                      padding: "10px 14px", textAlign: "left",
                      fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em",
                      fontWeight: 700, borderBottom: "1px solid var(--border)",
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody style={{ background: "transparent" }}>
                {list.map(c => {
                  const s = statusStyle(c.status);
                  return (
                    <tr key={c.id} style={{ borderBottom: "1px solid var(--border)", background: "transparent" }}>
                      <td style={{ padding: "12px 14px", fontWeight: 600, color: "var(--text-primary)" }}>
                        <div>{c.title}</div>
                        {c.description && (
                          <div style={{
                            fontSize: 11, color: "var(--text-muted)", marginTop: 3,
                            maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                          }}>
                            {c.description}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: "12px 14px" }}>
                        <span style={{
                          display: "inline-flex", alignItems: "center", gap: 5,
                          background: s.bg, color: s.fg, border: `1px solid ${s.border}`,
                          borderRadius: 4, padding: "2px 8px", fontSize: 10, fontWeight: 700, letterSpacing: "0.05em",
                        }}>
                          {s.icon} {s.label}
                        </span>
                      </td>
                      <td style={{ padding: "12px 14px", color: "var(--text-muted)" }}>{fmtDate(c.startTime)}</td>
                      <td style={{ padding: "12px 14px", color: "var(--text-muted)" }}>{fmtDate(c.endTime)}</td>
                      <td style={{ padding: "12px 14px", color: "var(--text-muted)" }}>
                        {c.visibility.replace("_", " ")}
                      </td>
                      <td style={{ padding: "10px 14px" }}>
                        <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                          <Link href={`/admin/ctf/${c.id}/manage`} className="psp-btn psp-btn-primary psp-btn-sm" style={{ gap: 4 }}>
                            <Settings size={11} /> Manage
                          </Link>
                          <Link href={`/admin/ctf/${c.id}/manage?tab=settings`} className="psp-btn psp-btn-secondary psp-btn-sm" style={{ gap: 4 }}>
                            <Edit2 size={11} /> Edit
                          </Link>
                          <button
                            className="psp-btn psp-btn-secondary psp-btn-sm"
                            style={{ gap: 4, opacity: exporting === c.id ? 0.6 : 1 }}
                            onClick={() => handleExport(c.id)}
                            disabled={exporting === c.id}
                          >
                            <Download size={11} /> {exporting === c.id ? "…" : "Export"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <style jsx global>{`
        @keyframes ctf-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.6; }
        }
      `}</style>
    </>
  );
}
