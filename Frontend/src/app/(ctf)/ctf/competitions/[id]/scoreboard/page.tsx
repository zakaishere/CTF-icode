"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Trophy, Snowflake, Loader2, ChevronDown } from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ReferenceLine, ResponsiveContainer,
} from "recharts";
import {
  getCtfScoreboard,
  getCtfScoreboardGraph,
  type CTFScoreboardEntryDTO,
  type CTFScoreTimelineDTO,
} from "@/lib/api";
import { useCTFCompetition } from "@/features/ctf/context/CTFCompetitionContext";
import { ErrorState } from "@/components/ui/ErrorState";
import { LoadingScreen } from "@/components/ui/LoadingScreen";

export default function ScoreboardPage() {
  const { id } = useParams<{ id: string }>();
  const ctx = useCTFCompetition();

  const [board, setBoard] = useState<CTFScoreboardEntryDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const reload = () => {
    setLoading(true);
    setLoadError(false);
    getCtfScoreboard(id)
      .then(setBoard)
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  };

  useEffect(() => { reload(); }, [id]);
  useEffect(() => {
    const latest = ctx.notifications[0];
    if (!latest) return;
    if (latest.type === "SCOREBOARD_FROZEN" || latest.type === "SCOREBOARD_UNFROZEN"
        || latest.type === "COMPETITION_ENDED") reload();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx.notifications]);

  if (loading || !ctx.competition) {
    return <LoadingScreen label="Loading scoreboard" />;
  }

  if (loadError) {
    return (
      <ErrorState
        variant="error"
        title="Scoreboard unreachable"
        message="We couldn't load the scoreboard. Check your connection and try again — your team's solves are safe."
        onRetry={reload}
      />
    );
  }

  const status = ctx.status ?? ctx.competition.status;

  if (status === "UPCOMING") {
    return <PreStartScoreboard startTime={ctx.competition.startTime} teams={board} />;
  }

  const visible = board.filter(e => e.totalPoints > 0 || e.solveCount > 0);

  const shared = (
    <ScoreTimeline
      competitionId={id}
      status={status}
      frozenAt={ctx.competition.frozenAt ?? null}
    />
  );

  if (status === "ENDED" && visible.length > 0) {
    return (
      <>
        <FinalResults visible={visible} myTeamId={ctx.myTeam?.id ?? null} />
        {shared}
      </>
    );
  }

  return (
    <>
      <LiveScoreboard
        visible={visible}
        myTeamId={ctx.myTeam?.id ?? null}
        isFrozen={status === "FROZEN"}
        frozenAt={ctx.competition.frozenAt ?? null}
      />
      {shared}
    </>
  );
}

// ── Pre-start ─────────────────────────────────────────────────────────────────

function PreStartScoreboard({ startTime, teams }: {
  startTime: string | null;
  teams: CTFScoreboardEntryDTO[];
}) {
  return (
    <div style={{
      maxWidth: 720, margin: "40px auto", textAlign: "center",
      display: "flex", flexDirection: "column", alignItems: "center", gap: 18,
      padding: "0 20px",
    }}>
      <div style={{
        width: 80, height: 80, borderRadius: "50%",
        background: "rgba(251,191,36,0.08)",
        border: "1px solid rgba(251,191,36,0.2)",
        display: "flex", alignItems: "center", justifyContent: "center",
        boxShadow: "0 0 30px rgba(251,191,36,0.1)",
      }}>
        <Trophy size={32} color="#f59e0b" />
      </div>
      <div style={{
        fontFamily: "'Chakra Petch', system-ui, sans-serif",
        fontSize: 22, fontWeight: 700, color: "#eaf0ff", letterSpacing: "0.02em",
      }}>
        Scoreboard
      </div>
      <div style={{ fontSize: 13, color: "#4a5874" }}>
        Rankings will appear once teams start solving challenges.
      </div>
      {startTime && (
        <div style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 12, color: "#60a5ff",
        }}>
          Competition starts {new Date(startTime).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}
        </div>
      )}

      <div style={{ marginTop: 12, width: "100%" }}>
        <div style={{
          fontFamily: "'Chakra Petch', system-ui, sans-serif",
          fontSize: 9, color: "#4a5874", marginBottom: 10, fontWeight: 800,
          letterSpacing: "0.14em", textTransform: "uppercase",
        }}>
          {teams.length} team{teams.length !== 1 ? "s" : ""} registered
        </div>
        {teams.length === 0 ? (
          <div style={{ fontSize: 12, color: "#4a5874" }}>No teams yet — be the first to register.</div>
        ) : (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
            {teams.map(t => (
              <span key={t.teamId} style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                padding: "5px 12px",
                background: "rgba(96,165,255,0.04)", border: "1px solid rgba(96,165,255,0.12)", borderRadius: 999,
                fontSize: 12, color: "#a9b8d8",
              }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: t.avatarColor, flexShrink: 0 }} />
                {t.teamName}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Live scoreboard ──────────────────────────────────────────────────────────

function LiveScoreboard({ visible, myTeamId, isFrozen, frozenAt }: {
  visible: CTFScoreboardEntryDTO[];
  myTeamId: string | null;
  isFrozen: boolean;
  frozenAt: string | null;
}) {
  const ctx = useCTFCompetition();
  const solveTotal = visible.reduce((s, e) => s + e.solveCount, 0);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Trophy size={16} color="#f59e0b" />
            <span style={{
              fontFamily: "'Chakra Petch', system-ui, sans-serif",
              fontSize: 16, fontWeight: 700, color: "#eaf0ff", letterSpacing: "0.04em",
            }}>Live Scoreboard</span>
            {isFrozen && (
              <span style={{
                display: "inline-flex", alignItems: "center", gap: 5,
                background: "rgba(34,211,238,0.08)", color: "#22d3ee",
                border: "1px solid rgba(34,211,238,0.3)", borderRadius: 4,
                padding: "2px 8px",
                fontFamily: "'Chakra Petch', system-ui, sans-serif",
                fontSize: 9, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase",
              }}>
                <Snowflake size={11} /> FROZEN
              </span>
            )}
          </div>
          <div style={{
            fontFamily: "Inter, system-ui", fontSize: 11, color: "#4a5874", marginTop: 4,
          }}>
            {isFrozen && frozenAt
              ? `Showing scoreboard as of ${new Date(frozenAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}`
              : `Updates in real-time · ${visible.length} team${visible.length !== 1 ? "s" : ""} · ${solveTotal} solve${solveTotal !== 1 ? "s" : ""}`}
          </div>
        </div>
      </div>

      {visible.length === 0 ? (
        <EmptyScoreboard />
      ) : (
        <ScoreboardTable
          rows={visible}
          myTeamId={myTeamId}
          competitionId={ctx.competition!.id}
        />
      )}
    </div>
  );
}

// ── Final podium ─────────────────────────────────────────────────────────────

function FinalResults({ visible, myTeamId }: {
  visible: CTFScoreboardEntryDTO[];
  myTeamId: string | null;
}) {
  const ctx = useCTFCompetition();
  const top3 = visible.slice(0, 3);

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <span style={{
          fontFamily: "'Chakra Petch', system-ui, sans-serif",
          fontSize: 16, fontWeight: 700, color: "#eaf0ff", letterSpacing: "0.04em",
        }}>Final Results</span>
      </div>

      {top3.length > 0 && (
        <div style={{
          display: "grid", gridTemplateColumns: "1fr 1.2fr 1fr", gap: 16, alignItems: "end",
          padding: "20px 20px 30px",
          background: "rgba(96,165,255,0.03)", border: "1px solid rgba(96,165,255,0.1)", borderRadius: 12,
          marginBottom: 18,
        }}>
          {top3[1] && <PodiumStep entry={top3[1]} rank={2} height={120} medal="🥈" competitionId={ctx.competition!.id} />}
          {top3[0] && <PodiumStep entry={top3[0]} rank={1} height={160} medal="🥇" competitionId={ctx.competition!.id} />}
          {top3[2] && <PodiumStep entry={top3[2]} rank={3} height={90}  medal="🥉" competitionId={ctx.competition!.id} />}
        </div>
      )}

      <ScoreboardTable
        rows={visible}
        myTeamId={myTeamId}
        competitionId={ctx.competition!.id}
      />
    </div>
  );
}

function PodiumStep({ entry, rank, height, medal, competitionId }: {
  entry: CTFScoreboardEntryDTO; rank: number; height: number; medal: string; competitionId: string;
}) {
  const accent = rank === 1 ? "#fbbf24" : rank === 2 ? "#94a3b8" : "#fb923c";
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
      <div style={{ fontSize: 36, filter: "drop-shadow(0 0 12px rgba(0,0,0,0.5))" }}>{medal}</div>
      <Link
        href={`/ctf/competitions/${competitionId}/teams/${entry.teamId}`}
        style={{
          fontFamily: "'Chakra Petch', system-ui, sans-serif",
          fontSize: 13, fontWeight: 700, color: "#eaf0ff", textAlign: "center",
          textDecoration: "none", letterSpacing: "0.02em",
          transition: "color 150ms",
        }}
        onMouseEnter={e => { (e.target as HTMLElement).style.color = accent; }}
        onMouseLeave={e => { (e.target as HTMLElement).style.color = "#eaf0ff"; }}
      >
        {entry.teamName}
      </Link>
      <div style={{
        fontSize: 18, fontWeight: 800, color: accent,
        fontFamily: "'JetBrains Mono', ui-monospace, monospace",
        textShadow: `0 0 14px ${accent}70`,
      }}>
        {entry.totalPoints} pts
      </div>
      <div style={{
        fontFamily: "'Chakra Petch', system-ui, sans-serif",
        fontSize: 9, color: "#4a5874", letterSpacing: "0.12em", textTransform: "uppercase",
      }}>{entry.solveCount} solves</div>
      <div style={{
        width: "100%", height,
        background: `linear-gradient(180deg, ${accent}28, ${accent}08)`,
        borderTop: `2px solid ${accent}`,
        borderRadius: 4,
      }} />
    </div>
  );
}

// ── Empty state ──────────────────────────────────────────────────────────────

function EmptyScoreboard() {
  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center",
      justifyContent: "center", padding: "80px 24px", gap: 16,
    }}>
      <div style={{
        width: 72, height: 72, borderRadius: "50%",
        background: "rgba(251,191,36,0.06)",
        border: "1px solid rgba(251,191,36,0.15)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <Trophy size={28} color="#f59e0b" />
      </div>
      <h3 style={{
        fontFamily: "'Chakra Petch', system-ui, sans-serif",
        fontSize: 18, fontWeight: 700, color: "#eaf0ff", margin: 0, letterSpacing: "0.02em",
      }}>
        No scores yet
      </h3>
      <p style={{ fontSize: 13, color: "#4a5874", textAlign: "center", maxWidth: 360, margin: 0 }}>
        Be the first team to solve a challenge and claim the top spot.
      </p>
    </div>
  );
}

// ── Shared table ─────────────────────────────────────────────────────────────

function ScoreboardTable({ rows, myTeamId, competitionId }: {
  rows: CTFScoreboardEntryDTO[];
  myTeamId: string | null;
  competitionId: string;
}) {
  const myEntry = useMemo(() => rows.find(r => r.teamId === myTeamId), [rows, myTeamId]);
  const maxScore = useMemo(() => Math.max(1, ...rows.map(r => r.totalPoints)), [rows]);

  return (
    <div style={{
      position: "relative",
      overflow: "hidden",
      border: "1px solid rgba(96,165,255,0.18)",
      borderRadius: 10,
      background:
        "linear-gradient(180deg, rgba(10,17,36,0.85), rgba(6,12,30,0.92))",
      boxShadow: "0 0 32px rgba(96,165,255,0.06) inset",
    }}>
      {/* Terminal-style header bar */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "10px 14px",
        background: "rgba(6,12,30,0.95)",
        borderBottom: "1px solid rgba(96,165,255,0.15)",
        fontFamily: "'JetBrains Mono', ui-monospace, monospace",
        fontSize: 11, color: "#4a5874",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ display: "inline-flex", gap: 5 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#ef4444", opacity: 0.7 }} />
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#f59e0b", opacity: 0.7 }} />
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#22c55e", opacity: 0.7 }} />
          </span>
          <span style={{ color: "#60a5ff" }}>~/icode/scoreboard</span>
          <span>$ cat ranks.log</span>
        </div>
        <span style={{ letterSpacing: "0.14em" }}>RANK · TEAM · SCORE</span>
      </div>

      <div>
        {rows.map((r, i) => {
          const mine    = r.teamId === myTeamId;
          const podium  = r.rank <= 3;
          const accent  = r.rank === 1 ? "#fbbf24"
                        : r.rank === 2 ? "#94a3b8"
                        : r.rank === 3 ? "#fb923c"
                        : (mine ? "#60a5ff" : null);
          const pct = (r.totalPoints / maxScore) * 100;

          return (
            <div
              key={r.teamId}
              style={{
                position: "relative",
                display: "grid",
                gridTemplateColumns: "60px 1fr auto",
                alignItems: "center",
                gap: 14,
                padding: "11px 16px",
                borderBottom: i === rows.length - 1 ? "none" : "1px dashed rgba(96,165,255,0.08)",
                background: mine ? "rgba(96,165,255,0.07)" : "transparent",
                transition: "background 120ms",
              }}
              onMouseEnter={e => {
                if (!mine) (e.currentTarget as HTMLElement).style.background = "rgba(96,165,255,0.03)";
              }}
              onMouseLeave={e => {
                if (!mine) (e.currentTarget as HTMLElement).style.background = "transparent";
              }}
            >
              {/* Faint score-share progress bar in the row background */}
              <div aria-hidden="true" style={{
                position: "absolute", inset: 0,
                background: `linear-gradient(90deg, ${accent ?? "#60a5ff"}10 0%, ${accent ?? "#60a5ff"}10 ${pct}%, transparent ${pct}%)`,
                pointerEvents: "none",
              }} />

              {/* RANK column — terminal-style [01] */}
              <div style={{
                position: "relative",
                fontFamily: "'JetBrains Mono', ui-monospace, monospace",
                fontWeight: 800,
                color: accent ?? "#4a5874",
                fontSize: podium ? 15 : 12,
                letterSpacing: "0.04em",
                textShadow: accent ? `0 0 12px ${accent}80` : undefined,
              }}>
                <span style={{ color: accent ?? "#4a5874", opacity: 0.45, marginRight: 4 }}>[</span>
                {String(r.rank).padStart(2, "0")}
                <span style={{ color: accent ?? "#4a5874", opacity: 0.45, marginLeft: 4 }}>]</span>
              </div>

              {/* TEAM NAME — clickable */}
              <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                <span style={{
                  color: accent ?? "#60a5ff",
                  fontFamily: "'JetBrains Mono', ui-monospace, monospace",
                  opacity: 0.55,
                  flexShrink: 0,
                }}>$</span>
                <Link
                  href={`/ctf/competitions/${competitionId}/teams/${r.teamId}`}
                  style={{
                    fontFamily: "'Chakra Petch', system-ui, sans-serif",
                    fontWeight: 700,
                    fontSize: podium ? 14 : 13,
                    color: mine ? "#60a5ff" : (accent ?? "#d4e0f0"),
                    letterSpacing: "0.03em",
                    textDecoration: "none",
                    transition: "color 150ms, text-shadow 150ms",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                  onMouseEnter={e => {
                    const el = e.currentTarget as HTMLElement;
                    el.style.color = accent ?? "#60a5ff";
                    el.style.textShadow = `0 0 14px ${(accent ?? "#60a5ff")}80`;
                  }}
                  onMouseLeave={e => {
                    const el = e.currentTarget as HTMLElement;
                    el.style.color = mine ? "#60a5ff" : (accent ?? "#d4e0f0");
                    el.style.textShadow = "none";
                  }}
                >
                  {r.teamName}
                </Link>
                {mine && (
                  <span style={{
                    fontFamily: "'JetBrains Mono', ui-monospace, monospace",
                    fontSize: 9, color: "#60a5ff", fontWeight: 800,
                    background: "rgba(96,165,255,0.12)",
                    border: "1px solid rgba(96,165,255,0.35)",
                    borderRadius: 3, padding: "1px 6px",
                    letterSpacing: "0.14em",
                    flexShrink: 0,
                  }}>YOU</span>
                )}
              </div>

              {/* SCORE column */}
              <div style={{
                position: "relative",
                fontFamily: "'JetBrains Mono', ui-monospace, monospace",
                fontWeight: 800,
                color: accent ?? "#eaf0ff",
                fontSize: podium ? 16 : 14,
                textShadow: accent ? `0 0 12px ${accent}70` : undefined,
                letterSpacing: "0.02em",
                whiteSpace: "nowrap",
              }}>
                {r.totalPoints}
                <span style={{
                  marginLeft: 4, opacity: 0.5,
                  fontSize: 10, fontWeight: 600, letterSpacing: "0.14em",
                }}>PTS</span>
              </div>
            </div>
          );
        })}
      </div>

      {myEntry && rows.length > 8 && (
        <div style={{
          position: "sticky", bottom: 0,
          background: "rgba(96,165,255,0.1)",
          borderTop: "1px solid rgba(96,165,255,0.3)",
          padding: "10px 16px",
          display: "grid",
          gridTemplateColumns: "60px 1fr auto",
          gap: 14, alignItems: "center",
          backdropFilter: "blur(8px)",
        }}>
          <span style={{
            fontFamily: "'JetBrains Mono', ui-monospace, monospace",
            color: "#60a5ff", fontWeight: 800, fontSize: 13,
          }}>
            <span style={{ opacity: 0.45 }}>[</span>
            {String(myEntry.rank).padStart(2, "0")}
            <span style={{ opacity: 0.45 }}>]</span>
          </span>
          <span style={{
            fontFamily: "'Chakra Petch', system-ui, sans-serif",
            fontWeight: 700, letterSpacing: "0.03em", color: "#eaf0ff",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            <span style={{ color: "#60a5ff", opacity: 0.6, marginRight: 8 }}>$</span>
            {myEntry.teamName}
          </span>
          <span style={{
            fontFamily: "'JetBrains Mono', ui-monospace, monospace",
            color: "#60a5ff", fontWeight: 800, fontSize: 13,
            textShadow: "0 0 10px rgba(96,165,255,0.6)",
          }}>
            {myEntry.totalPoints}
            <span style={{ marginLeft: 4, opacity: 0.5, fontSize: 10, letterSpacing: "0.14em" }}>PTS</span>
          </span>
        </div>
      )}
    </div>
  );
}

// ── Score Timeline chart ──────────────────────────────────────────────────────

function ScoreTimeline({ competitionId, status, frozenAt }: {
  competitionId: string;
  status: string;
  frozenAt: string | null;
}) {
  const [graphData, setGraphData] = useState<CTFScoreTimelineDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(status !== "ENDED");

  useEffect(() => {
    if (status !== "ACTIVE" && status !== "ENDED" && status !== "FROZEN") {
      setLoading(false);
      return;
    }
    getCtfScoreboardGraph(competitionId)
      .then(setGraphData)
      .catch(() => {})
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [competitionId, status]);

  // All hooks must come before any conditional return (Rules of Hooks).
  // Merge all team events into a flat timeline sorted by time.
  const { chartData, startMs } = useMemo(() => {
    if (!graphData?.teams.length) return { chartData: [], startMs: 0 };

    const s = graphData.competitionStart
      ? new Date(graphData.competitionStart).getTime()
      : Math.min(...graphData.teams.flatMap(t =>
          t.points.map(p => new Date(p.time).getTime())
        ));

    const allEvents = graphData.teams
      .flatMap(t => t.points.map(p => ({
        ms: new Date(p.time).getTime(),
        teamId: t.teamId,
        score: p.score,
      })))
      .sort((a, b) => a.ms - b.ms);

    const currentScores: Record<string, number> = {};
    graphData.teams.forEach(t => { currentScores[t.teamId] = 0; });

    const rows: Array<Record<string, number>> = [];
    for (const evt of allEvents) {
      currentScores[evt.teamId] = evt.score;
      const minutes = Math.round((evt.ms - s) / 6000) / 10;
      const row: Record<string, number> = { minutes };
      graphData.teams.forEach(t => { row[t.teamId] = currentScores[t.teamId]; });
      rows.push({ ...row });
    }

    return { chartData: rows, startMs: s };
  }, [graphData]);

  const maxScore = useMemo(() => {
    if (!chartData.length || !graphData) return 100;
    let m = 0;
    chartData.forEach(row => {
      graphData.teams.forEach(t => {
        const v = row[t.teamId] as number ?? 0;
        if (v > m) m = v;
      });
    });
    return Math.ceil(m * 1.1) || 100;
  }, [chartData, graphData]);

  // Safe to return early now that all hooks have been called.
  const qualifyingTeams = graphData?.teams.filter(t => t.points.length > 0) ?? [];
  if (!loading && qualifyingTeams.length < 2) return null;

  const freezeMinutes = frozenAt && startMs > 0
    ? (new Date(frozenAt).getTime() - startMs) / 60000
    : null;

  const fmtMinutes = (m: number) => {
    const h = Math.floor(m / 60);
    const min = Math.floor(m % 60);
    return h > 0 ? `${h}h${min.toString().padStart(2, "0")}m` : `${min}m`;
  };

  return (
    <div style={{ marginTop: 20, border: "1px solid rgba(130,165,255,0.12)", borderRadius: 10, overflow: "hidden" }}>
      <button
        type="button"
        onClick={() => setExpanded(e => !e)}
        style={{
          width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "12px 16px",
          background: "rgba(10,17,36,0.9)",
          border: "none", cursor: "pointer",
          color: "#eaf0ff",
        }}
      >
        <span style={{
          display: "flex", alignItems: "center", gap: 8,
          fontFamily: "'Chakra Petch', system-ui, sans-serif",
          fontWeight: 700, fontSize: 12, letterSpacing: "0.06em", textTransform: "uppercase",
        }}>
          📈 Score Timeline — Top {graphData?.teams.length ?? 10} Teams
        </span>
        <ChevronDown size={16} style={{
          color: "#4a5874",
          transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
          transition: "transform 150ms",
        }} />
      </button>

      {expanded && (
        <div style={{ padding: "16px 4px 12px", background: "rgba(5,11,29,0.95)" }}>
          {loading ? (
            <div style={{ height: 220, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Loader2 size={24} style={{ animation: "spin 1s linear infinite", color: "#60a5ff" }} />
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                <CartesianGrid stroke="rgba(130,165,255,0.07)" strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="minutes"
                  type="number"
                  domain={["dataMin", "dataMax"]}
                  tickFormatter={fmtMinutes}
                  tick={{ fill: "#4a5874", fontSize: 10, fontFamily: "'JetBrains Mono', monospace" }}
                  axisLine={{ stroke: "rgba(130,165,255,0.1)" }}
                  tickLine={false}
                />
                <YAxis
                  domain={[0, maxScore]}
                  tick={{ fill: "#4a5874", fontSize: 10, fontFamily: "'JetBrains Mono', monospace" }}
                  axisLine={false}
                  tickLine={false}
                  width={44}
                />
                <Tooltip
                  content={
                    <ChartTooltip
                      teams={graphData?.teams ?? []}
                      fmtMinutes={fmtMinutes}
                    />
                  }
                />
                <Legend
                  wrapperStyle={{ fontSize: 10, paddingTop: 8, fontFamily: "'Chakra Petch', system-ui, sans-serif" }}
                  formatter={(value) => {
                    const team = graphData?.teams.find(t => t.teamId === value);
                    return <span style={{ color: "#6b7ea3", letterSpacing: "0.04em" }}>{team?.teamName ?? value}</span>;
                  }}
                />
                {freezeMinutes !== null && (
                  <ReferenceLine
                    x={freezeMinutes}
                    stroke="#22d3ee"
                    strokeDasharray="4 4"
                    label={{ value: "Scoreboard frozen", fill: "#22d3ee", fontSize: 9, position: "insideTopRight" }}
                  />
                )}
                {(graphData?.teams ?? []).map(team => (
                  <Line
                    key={team.teamId}
                    dataKey={team.teamId}
                    name={team.teamName}
                    stroke={team.accentColor}
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4 }}
                    type="stepAfter"
                    connectNulls
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      )}
    </div>
  );
}

type TooltipPayloadEntry = {
  dataKey: string;
  value: number;
  stroke: string;
  name: string;
};

function ChartTooltip({ active, payload, label, teams, fmtMinutes }: {
  active?: boolean;
  payload?: TooltipPayloadEntry[];
  label?: number;
  teams: CTFScoreTimelineDTO["teams"];
  fmtMinutes: (m: number) => string;
}) {
  if (!active || !payload?.length) return null;

  const sorted = [...payload]
    .filter(p => p.value > 0)
    .sort((a, b) => b.value - a.value);

  return (
    <div style={{
      background: "rgba(8,15,36,0.96)", border: "1px solid rgba(130,165,255,0.15)", borderRadius: 8,
      padding: "8px 12px", fontSize: 12, maxWidth: 210,
      backdropFilter: "blur(12px)",
      boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
    }}>
      <div style={{
        fontFamily: "'Chakra Petch', system-ui, sans-serif",
        color: "#4a5874", marginBottom: 6, fontSize: 9,
        letterSpacing: "0.1em", textTransform: "uppercase",
      }}>
        T+{fmtMinutes(label ?? 0)}
      </div>
      {sorted.map(e => {
        const team = teams.find(t => t.teamId === e.dataKey);
        return (
          <div key={e.dataKey} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
            <span style={{
              width: 7, height: 7, borderRadius: "50%",
              background: e.stroke ?? team?.accentColor ?? "#60a5ff",
              flexShrink: 0,
              boxShadow: `0 0 5px ${e.stroke ?? team?.accentColor ?? "#60a5ff"}`,
            }} />
            <span style={{
              fontFamily: "Inter, system-ui", color: "#a9b8d8", flex: 1, fontSize: 11,
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>
              {team?.teamName ?? e.dataKey}
            </span>
            <span style={{
              fontFamily: "'JetBrains Mono', monospace", color: "#eaf0ff", fontWeight: 700, fontSize: 11,
            }}>
              {e.value}
            </span>
          </div>
        );
      })}
    </div>
  );
}
