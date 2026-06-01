"use client";

import { useEffect, useState } from "react";
import { Snowflake, Trophy } from "lucide-react";
import { toast } from "@/components/ui/PSPToast";
import {
  getCtfScoreboard, getCtfScoreboardLive,
  type CTFScoreboardEntryDTO,
} from "@/lib/api";

interface Props {
  competitionId: string;
  isFrozen: boolean;
  frozenAt: string | null;
}

export default function TeacherCtfScoreboardTab({ competitionId, isFrozen, frozenAt }: Props) {
  // frozenBoard = what players see (frozen snapshot); liveBoard = real-time admin view
  const [frozenBoard, setFrozenBoard] = useState<CTFScoreboardEntryDTO[]>([]);
  const [liveBoard,   setLiveBoard]   = useState<CTFScoreboardEntryDTO[]>([]);
  const [showDiff, setShowDiff] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      getCtfScoreboard(competitionId),      // player-visible (respects freeze)
      getCtfScoreboardLive(competitionId),   // admin live (always real-time)
    ]).then(([frozen, live]) => {
      setFrozenBoard(frozen);
      setLiveBoard(live);
    }).catch(() => toast.error("Failed to load scoreboard", "Please try again."))
      .finally(() => setLoading(false));
  }, [competitionId]);

  // Admin always sees the live board; frozenBoard is used only to show the diff column.
  const scoreboard = isFrozen ? liveBoard : liveBoard;
  const liveById = new Map(liveBoard.map(e => [e.teamId, e]));
  const frozenById = new Map(frozenBoard.map(e => [e.teamId, e]));

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Trophy size={16} color="#f59e0b" />
          <span style={{ fontSize: 14, fontWeight: 700 }}>Scoreboard</span>
          {isFrozen && (
            <span style={{
              display: "inline-flex", alignItems: "center", gap: 4,
              background: "rgba(34,211,238,0.12)", color: "#22d3ee",
              border: "1px solid rgba(34,211,238,0.3)", borderRadius: 4,
              padding: "2px 8px", fontSize: 11, fontWeight: 600,
            }}>
              <Snowflake size={11} /> Frozen{frozenAt ? ` at ${new Date(frozenAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}` : ""}
            </span>
          )}
        </div>
        {isFrozen && (
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text-secondary)" }}>
            <input type="checkbox" checked={showDiff} onChange={(e) => setShowDiff(e.target.checked)} />
            Highlight teams that solved after freeze
          </label>
        )}
      </div>

      {loading ? (
        <div className="skel" style={{ height: 320, borderRadius: 8 }} />
      ) : scoreboard.length === 0 ? (
        <div className="psp-empty">
          <div className="psp-empty-title">No solves yet</div>
        </div>
      ) : (
        <div style={{ overflowX: "auto", border: "1px solid var(--border)", borderRadius: 8, background: "var(--surface)" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "var(--surface-2, #0f172a)" }}>
                {["#", "Team", "Points (live)", "Solves", "Points (frozen)", "Δ post-freeze"].map(h => (
                  <th key={h} style={{
                    padding: "10px 14px", textAlign: "left",
                    fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em",
                    fontWeight: 700, borderBottom: "1px solid var(--border)",
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {scoreboard.map(row => {
                const frozenEntry = frozenById.get(row.teamId);
                const frozenPts   = frozenEntry?.totalPoints ?? row.totalPoints;
                const diff        = row.totalPoints - frozenPts;
                const changed     = isFrozen && diff > 0;
                return (
                  <tr key={row.teamId} style={{
                    borderBottom: "1px solid var(--border)",
                    background: showDiff && changed ? "rgba(34,211,238,0.08)" : "transparent",
                  }}>
                    <td style={{ padding: "10px 14px", fontWeight: 700,
                      color: row.rank === 1 ? "#fbbf24" : row.rank === 2 ? "#94a3b8" : row.rank === 3 ? "#fb923c" : "var(--text-muted)",
                    }}>{row.rank}</td>
                    <td style={{ padding: "10px 14px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{
                          width: 20, height: 20, borderRadius: "50%", background: row.avatarColor,
                          display: "inline-flex", alignItems: "center", justifyContent: "center",
                          color: "#fff", fontSize: 10, fontWeight: 700,
                        }}>{row.teamName.charAt(0).toUpperCase()}</span>
                        <span style={{ fontWeight: 600 }}>{row.teamName}</span>
                      </div>
                    </td>
                    <td style={{ padding: "10px 14px", fontFamily: "monospace", fontWeight: 700, color: "#f8fafc" }}>
                      {row.totalPoints}
                    </td>
                    <td style={{ padding: "10px 14px", color: "var(--text-muted)" }}>{row.solveCount}</td>
                    <td style={{ padding: "10px 14px", fontFamily: "monospace", color: "var(--text-muted)" }}>
                      {frozenPts}
                    </td>
                    <td style={{ padding: "10px 14px", fontFamily: "monospace",
                      color: diff > 0 ? "#22d3ee" : "var(--text-muted)",
                    }}>
                      {diff > 0 ? `+${diff}` : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
