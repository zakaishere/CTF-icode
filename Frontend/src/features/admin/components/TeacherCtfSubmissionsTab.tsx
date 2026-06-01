"use client";

import { useEffect, useMemo, useState } from "react";
import { Download } from "lucide-react";
import { toast } from "@/components/ui/PSPToast";
import {
  getTeacherCtfSubmissions, downloadTeacherCtfExport,
  type CTFTeacherSubmissionDTO,
} from "@/lib/api";

interface Props { competitionId: string; }

export default function TeacherCtfSubmissionsTab({ competitionId }: Props) {
  const [rows, setRows] = useState<CTFTeacherSubmissionDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<{ team: string; challenge: string }>({ team: "", challenge: "" });

  useEffect(() => {
    getTeacherCtfSubmissions(competitionId, 500)
      .then(setRows)
      .catch(() => toast.error("Failed to load submissions", "Please try again."))
      .finally(() => setLoading(false));
  }, [competitionId]);

  const filtered = useMemo(() => rows.filter(r => {
    if (filter.team && !r.teamName.toLowerCase().includes(filter.team.toLowerCase())) return false;
    if (filter.challenge && !r.challengeTitle.toLowerCase().includes(filter.challenge.toLowerCase())) return false;
    return true;
  }), [rows, filter]);

  const exportCsv = async () => {
    try {
      await downloadTeacherCtfExport(competitionId);
      toast.success("Export ready", "CSV download started.");
    } catch { /* toasted */ }
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 6 }}>
          <input className="input" placeholder="Filter team…" value={filter.team}
            onChange={(e) => setFilter({ ...filter, team: e.target.value })} style={{ width: 180 }} />
          <input className="input" placeholder="Filter challenge…" value={filter.challenge}
            onChange={(e) => setFilter({ ...filter, challenge: e.target.value })} style={{ width: 200 }} />
        </div>
        <button className="psp-btn psp-btn-secondary" style={{ gap: 6 }} onClick={exportCsv}>
          <Download size={13} /> Export CSV
        </button>
      </div>

      {loading ? (
        <div className="skel" style={{ height: 320, borderRadius: 8 }} />
      ) : filtered.length === 0 ? (
        <div className="psp-empty">
          <div className="psp-empty-title">No submissions{rows.length ? " match the filter" : " yet"}</div>
        </div>
      ) : (
        <div style={{ overflowX: "auto", border: "1px solid var(--border)", borderRadius: 8, background: "var(--surface)" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "var(--bg-secondary)" }}>
                {["When", "Team", "Member", "Challenge", "Category", "Submitted Flag", "Points", "Result"].map(h => (
                  <th key={h} style={{
                    padding: "10px 14px", textAlign: "left",
                    fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase",
                    letterSpacing: "0.07em", fontWeight: 700, borderBottom: "2px solid var(--border)",
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => (
                <tr key={r.id} style={{
                  borderBottom: "1px solid var(--border)",
                  background: r.cheatFlagged ? "rgba(167,139,250,0.04)" : !r.correct ? "rgba(239,68,68,0.02)" : undefined,
                }}>
                  <td style={{ padding: "8px 14px", color: "var(--text-muted)", whiteSpace: "nowrap", fontFamily: "ui-monospace,monospace", fontSize: 12 }}>
                    {new Date(r.at).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "medium" })}
                  </td>
                  <td style={{ padding: "8px 14px" }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                      <span style={{ width: 16, height: 16, borderRadius: "50%", background: r.avatarColor, display: "inline-block", flexShrink: 0 }} />
                      {r.teamName}
                    </span>
                  </td>
                  <td style={{ padding: "8px 14px", color: "var(--text-muted)" }}>{r.solvedByName}</td>
                  <td style={{ padding: "8px 14px", fontWeight: 600 }}>{r.challengeTitle}</td>
                  <td style={{ padding: "8px 14px", color: "var(--text-muted)" }}>{r.challengeCategory ?? ""}</td>
                  <td style={{ padding: "8px 14px" }}>
                    {r.submittedValue ? (
                      <span style={{
                        fontFamily: "ui-monospace,monospace", fontSize: 11,
                        color: "var(--text-muted)", background: "var(--bg-secondary)",
                        border: "1px solid var(--border)", borderRadius: 3, padding: "2px 6px",
                        maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis",
                        display: "inline-block", whiteSpace: "nowrap",
                      }}
                        title={r.submittedValue}
                      >
                        {r.submittedValue.length > 30 ? r.submittedValue.slice(0, 30) + "…" : r.submittedValue}
                      </span>
                    ) : "—"}
                  </td>
                  <td style={{ padding: "8px 14px", fontFamily: "monospace", fontWeight: 700, color: r.correct ? "#22c55e" : "var(--text-muted)" }}>
                    {r.correct && r.pointsAwarded > 0 ? `+${r.pointsAwarded}` : "—"}
                  </td>
                  <td style={{ padding: "8px 14px" }}>
                    {r.cheatFlagged ? (
                      <span style={{
                        fontSize: 11, fontWeight: 700, color: "#a78bfa",
                        background: "rgba(167,139,250,0.12)", border: "1px solid rgba(167,139,250,0.3)",
                        borderRadius: 3, padding: "2px 7px",
                      }}>⚠ CHEAT</span>
                    ) : (
                      <span style={{
                        fontSize: 11, fontWeight: 700,
                        color: r.correct ? "#22c55e" : "#f87171",
                        background: r.correct ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.10)",
                        border: `1px solid ${r.correct ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.25)"}`,
                        borderRadius: 3, padding: "2px 7px",
                      }}>
                        {r.correct ? "CORRECT" : "WRONG"}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
