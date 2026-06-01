"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import {
  Lock, Search, CheckCircle2, AlertCircle, Loader2, LayoutGrid, Users,
} from "lucide-react";
import {
  getCtfCompetitionChallenges,
  type CTFChallengeListResponse, type CTFCompetitionChallengeDTO,
} from "@/lib/api";
import { useCTFCompetition } from "@/features/ctf/context/CTFCompetitionContext";
import { CAT_CONFIG, catFor } from "@/features/ctf/shared/categoryConfig";
import ChallengeCard from "@/features/ctf/shared/ChallengeCard";
import { toast } from "@/components/ui/PSPToast";
import { ErrorState } from "@/components/ui/ErrorState";
import { LoadingScreen } from "@/components/ui/LoadingScreen";

const pad2 = (n: number) => String(n).padStart(2, "0");

export default function ChallengesPage() {
  const { id } = useParams<{ id: string }>();
  const ctx = useCTFCompetition();

  const [data, setData]       = useState<CTFChallengeListResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = () => {
    setLoading(true);
    getCtfCompetitionChallenges(id)
      .then(setData)
      .catch(() => toast.error("Failed to load challenges", "Please try again."))
      .finally(() => setLoading(false));
  };

  useEffect(() => { reload(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [id]);

  // Status transitions (UPCOMING → ACTIVE etc.) ask for a refetch, since the
  // shape of the response changes (UPCOMING returns categoryCounts, otherwise
  // a real challenge list).
  useEffect(() => {
    if (!ctx.status) return;
    reload();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx.status]);

  // Also re-fetch when a notification suggests the catalog changed.
  useEffect(() => {
    const latest = ctx.notifications[0];
    if (!latest) return;
    if (latest.type === "NEW_CHALLENGE" || latest.type === "CHALLENGE_UPDATED" || latest.type === "HINT_ADDED") {
      reload();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx.notifications]);

  if (loading || !ctx.competition) {
    return <PageSpinner />;
  }

  const status = ctx.status ?? ctx.competition.status;

  if (status === "UPCOMING") {
    return <PreStartView startTime={ctx.competition.startTime} categoryCounts={data?.categoryCounts ?? null} hasTeam={ctx.myTeam !== null} />;
  }

  // Active/Ended but no team: show gate instead of challenges grid
  if (!ctx.myTeam) {
    return <NoTeamView competition={ctx.competition} status={status} />;
  }

  return (
    <ActiveBoard
      competitionId={id}
      challenges={data?.challenges ?? []}
      isEnded={status === "ENDED"}
    />
  );
}

// ── Pre-start view ────────────────────────────────────────────────────────────

function PreStartView({ startTime, categoryCounts, hasTeam }: {
  startTime: string | null;
  categoryCounts: Record<string, number> | null;
  hasTeam: boolean;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const ms = startTime ? Math.max(0, new Date(startTime).getTime() - now) : null;
  const total = ms !== null ? Math.floor(ms / 1000) : null;
  const d = total !== null ? Math.floor(total / 86400) : 0;
  const h = total !== null ? Math.floor((total % 86400) / 3600) : 0;
  const m = total !== null ? Math.floor((total % 3600) / 60) : 0;
  const s = total !== null ? total % 60 : 0;

  useEffect(() => {
    if (ms === 0 && typeof window !== "undefined") {
      const t = setTimeout(() => window.location.reload(), 1500);
      return () => clearTimeout(t);
    }
  }, [ms]);

  const totalChallenges = categoryCounts
    ? Object.values(categoryCounts).reduce((a, b) => a + b, 0)
    : null;

  return (
    <div style={{
      maxWidth: 640, margin: "40px auto", textAlign: "center",
      display: "flex", flexDirection: "column", alignItems: "center", gap: 28,
      padding: "0 20px",
    }}>
      {/* Lock icon with glow */}
      <div style={{
        width: 80, height: 80, borderRadius: "50%",
        background: "rgba(96,165,255,0.06)",
        border: "1px solid rgba(96,165,255,0.15)",
        display: "flex", alignItems: "center", justifyContent: "center",
        boxShadow: "0 0 30px rgba(96,165,255,0.12)",
      }}>
        <Lock size={32} color="#3b82f6" />
      </div>
      <div>
        <div style={{
          fontFamily: "'Chakra Petch', system-ui, sans-serif",
          fontSize: 22, fontWeight: 700, color: "#eaf0ff",
          letterSpacing: "0.02em",
        }}>
          Challenges are locked
        </div>
        <div style={{
          fontFamily: "Inter, system-ui, sans-serif",
          fontSize: 13, color: "#4a5874", marginTop: 6,
        }}>
          {ms !== null ? "The competition starts in:" : "Waiting for the host to start the competition."}
        </div>
      </div>

      {ms !== null && (
        <div style={{
          display: "flex", gap: 14,
          fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontWeight: 800,
        }}>
          <Unit n={d} label="days" />
          <Sep />
          <Unit n={h} label="hrs" />
          <Sep />
          <Unit n={m} label="min" />
          <Sep />
          <Unit n={s} label="sec" />
        </div>
      )}

      {categoryCounts && Object.keys(categoryCounts).length > 0 && (
        <div style={{ marginTop: 4 }}>
          <div style={{
            display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap",
            marginBottom: 10, opacity: 0.5,
          }}>
            {Object.keys(categoryCounts).map(cat => {
              const c = catFor(cat);
              return (
                <span key={cat} style={{ color: c.accent, display: "inline-flex", alignItems: "center" }}>
                  {c.icon}
                </span>
              );
            })}
          </div>
          <div style={{
            fontFamily: "'Chakra Petch', system-ui, sans-serif",
            fontSize: 10, color: "#4a5874", letterSpacing: "0.1em", textTransform: "uppercase",
          }}>
            {Object.keys(categoryCounts).map(c => catFor(c).label).join(" · ")}
          </div>
          {totalChallenges !== null && (
            <div style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 12, color: "#60a5ff", marginTop: 8, fontWeight: 700,
            }}>
              {totalChallenges} challenge{totalChallenges !== 1 ? "s" : ""} waiting
            </div>
          )}
        </div>
      )}

      {!hasTeam && (
        <div style={{
          background: "rgba(251,191,36,0.06)", border: "1px solid rgba(251,191,36,0.25)",
          borderRadius: 8, padding: "14px 18px", display: "flex", gap: 10, alignItems: "center",
          marginTop: 4,
        }}>
          <AlertCircle size={18} color="#fbbf24" />
          <div style={{ textAlign: "left" }}>
            <div style={{
              fontFamily: "'Chakra Petch', system-ui, sans-serif",
              fontSize: 12, fontWeight: 700, color: "#fbbf24", letterSpacing: "0.04em",
            }}>
              You don&apos;t have a team yet
            </div>
            <div style={{ fontSize: 12, color: "#8b9ab5", marginTop: 4 }}>
              Join or create one before the competition starts.
            </div>
          </div>
          <Link href="team" className="ict-btn ict-btn-primary" style={{ marginLeft: 8, fontSize: 11 }}>
            Go to My Team →
          </Link>
        </div>
      )}
    </div>
  );
}

// ── No team view ──────────────────────────────────────────────────────────────

function NoTeamView({ competition, status }: {
  competition: { registrationOpen: boolean; id?: string };
  status: string | null;
}) {
  const canJoin = competition.registrationOpen && status !== "ENDED";

  return (
    <div style={{
      maxWidth: 480, margin: "40px auto", textAlign: "center",
      display: "flex", flexDirection: "column", alignItems: "center", gap: 20,
      padding: "0 20px",
    }}>
      <div style={{
        width: 80, height: 80, borderRadius: "50%",
        background: "rgba(96,165,255,0.06)",
        border: "1px solid rgba(96,165,255,0.15)",
        display: "flex", alignItems: "center", justifyContent: "center",
        boxShadow: "0 0 30px rgba(96,165,255,0.12)",
      }}>
        <Users size={32} color="#3b82f6" />
      </div>
      <div>
        <div style={{
          fontFamily: "'Chakra Petch', system-ui, sans-serif",
          fontSize: 22, fontWeight: 700, color: "#eaf0ff", letterSpacing: "0.02em",
        }}>
          No Team Yet
        </div>
        <div style={{ fontSize: 13, color: "#4a5874", marginTop: 6 }}>
          You need to be on a team to view and solve challenges.
        </div>
      </div>

      {canJoin ? (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center" }}>
          <Link href="team" className="ict-btn ict-btn-primary">
            Join a Team →
          </Link>
          <Link href="team" className="ict-btn">
            Create a Team →
          </Link>
        </div>
      ) : status === "ENDED" ? (
        <div style={{
          background: "rgba(130,165,255,0.06)", border: "1px solid rgba(130,165,255,0.15)",
          borderRadius: 8, padding: "12px 16px", fontSize: 13, color: "#8b9ab5",
          fontFamily: "Inter, system-ui",
        }}>
          This competition has ended — team registration is closed.
        </div>
      ) : (
        <div style={{
          background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.22)",
          borderRadius: 8, padding: "12px 16px", fontSize: 13, color: "#f87171",
          fontFamily: "Inter, system-ui",
        }}>
          Team registration is closed. You cannot join or create a team at this time.
        </div>
      )}
    </div>
  );
}

function Unit({ n, label }: { n: number; label: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
      <div style={{
        minWidth: 64, padding: "10px 14px",
        background: "rgba(96,165,255,0.06)",
        border: "1px solid rgba(96,165,255,0.18)",
        borderRadius: 8,
        textAlign: "center",
      }}>
        <span style={{
          fontFamily: "'JetBrains Mono', ui-monospace, monospace",
          fontSize: 30, fontWeight: 800, color: "#eaf0ff", lineHeight: 1,
          textShadow: "0 0 20px rgba(96,165,255,0.4)",
        }}>
          {pad2(n)}
        </span>
      </div>
      <span style={{
        fontFamily: "'Chakra Petch', system-ui, sans-serif",
        fontSize: 9, color: "#4a5874", letterSpacing: "0.14em", textTransform: "uppercase", fontWeight: 700,
      }}>
        {label}
      </span>
    </div>
  );
}
function Sep() {
  return (
    <span style={{
      fontFamily: "'JetBrains Mono', monospace",
      fontSize: 28, color: "rgba(96,165,255,0.25)", lineHeight: 1,
      alignSelf: "flex-start", marginTop: 10,
    }}>:</span>
  );
}

// ── Active board ─────────────────────────────────────────────────────────────

function ActiveBoard({ competitionId, challenges, isEnded }: {
  competitionId: string;
  challenges: CTFCompetitionChallengeDTO[];
  isEnded: boolean;
}) {
  const ctx          = useCTFCompetition();
  const searchParams = useSearchParams();
  const [activeCat, setActiveCat] = useState<string>("ALL");
  const [query, setQuery]         = useState("");

  // Difficulty + status come from URL params (set by the navtabs bar)
  const difficulty   = searchParams.get("diff")   ?? "ALL";
  const solvedFilter = searchParams.get("status") ?? "ALL";

  const [newAt, setNewAt] = useState<Record<string, number>>({});
  useEffect(() => {
    const latest = ctx.notifications[0];
    if (!latest || latest.type !== "NEW_CHALLENGE") return;
    const cid = typeof latest.metadata?.challengeId === "string" ? latest.metadata.challengeId : null;
    if (cid) setNewAt(prev => ({ ...prev, [cid]: Date.now() }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx.notifications]);

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (Object.keys(newAt).length === 0) return;
    const t = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(t);
  }, [newAt]);

  const cats = useMemo(() => {
    const present = new Set(challenges.map(c => c.category));
    return ["ALL", ...Object.keys(CAT_CONFIG).filter(k => present.has(k))];
  }, [challenges]);

  const filtered = useMemo(() => challenges.filter(c => {
    if (activeCat !== "ALL" && c.category !== activeCat) return false;
    if (difficulty !== "ALL" && c.difficulty !== difficulty) return false;
    if (solvedFilter === "UNSOLVED" && c.solvedByMe) return false;
    if (solvedFilter === "SOLVED" && !c.solvedByMe) return false;
    if (query.trim() && !c.title.toLowerCase().includes(query.trim().toLowerCase())) return false;
    return true;
  }), [challenges, activeCat, difficulty, solvedFilter, query]);

  return (
    <div className="ctf-challenges-layout">

      {/* ── Left sidebar: categories only ──────────────────────────────────── */}
      <aside className="ctf-cat-sidebar">
        <div className="ctf-sidebar-section-title">Categories</div>
        {cats.map(cat => {
          const conf = catFor(cat);
          const inCat = cat === "ALL" ? challenges : challenges.filter(c => c.category === cat);
          const solved = inCat.filter(c => c.solvedByMe).length;
          const total  = inCat.length;
          const allSolved = total > 0 && solved === total;
          const active = activeCat === cat;
          return (
            <button
              key={cat}
              type="button"
              className={`ctf-cat-item${active ? " active" : ""}${allSolved ? " all-solved" : ""}`}
              style={{ "--cat-accent": conf.accent } as React.CSSProperties}
              onClick={() => setActiveCat(cat)}
            >
              <span className="ctf-cat-icon" style={{ color: conf.accent }}>
                {cat === "ALL" ? <LayoutGrid size={14} /> : conf.icon}
              </span>
              <span className="ctf-cat-label">{conf.label}</span>
              <span className={`ctf-cat-count${allSolved ? " done" : ""}`}>
                {allSolved
                  ? <CheckCircle2 size={11} />
                  : <>{solved}<span style={{ opacity: 0.4 }}>/{total}</span></>
                }
              </span>
            </button>
          );
        })}
      </aside>

      {/* ── Right: search + challenge grid ─────────────────────────────────── */}
      <div className="ctf-challenges-content">

        {/* Search bar */}
        <div className="ctf-chall-search">
          <Search size={14} color="#4a5874" />
          <input
            placeholder="Search challenges…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{
              background: "transparent", border: "none", outline: "none",
              color: "#eaf0ff", flex: 1,
              fontFamily: "Inter, system-ui, sans-serif", fontSize: 13,
            }}
          />
        </div>

        {/* Grid */}
        {filtered.length === 0 ? (
          <div style={{
            border: "1px dashed rgba(130,165,255,0.12)", borderRadius: 10, padding: 60,
            textAlign: "center", color: "#4a5874",
            background: "rgba(96,165,255,0.02)",
            fontFamily: "Inter, system-ui, sans-serif",
            fontSize: 13,
          }}>
            {challenges.length === 0
              ? "No challenges have been revealed yet."
              : "No challenges match the current filters."}
          </div>
        ) : (
          <div className="ctf-challenge-grid">
            {filtered.map(c => (
              <ChallengeCard
                key={c.id}
                challenge={c}
                onOpen={ctx.openChallenge}
                isNew={newAt[c.id] !== undefined && now - newAt[c.id] < 60_000}
              />
            ))}
          </div>
        )}

        {isEnded && (
          <div style={{
            marginTop: 18, padding: "10px 14px",
            background: "rgba(130,165,255,0.04)", border: "1px solid rgba(130,165,255,0.12)", borderRadius: 8,
            fontFamily: "'Chakra Petch', system-ui, sans-serif",
            fontSize: 11, color: "#4a5874", textAlign: "center",
            letterSpacing: "0.08em", textTransform: "uppercase",
          }}>
            Competition has ended — challenges remain visible for review but submissions are closed.
          </div>
        )}
      </div>
    </div>
  );
}

function PageSpinner() {
  return (
    <div style={{ display: "flex", justifyContent: "center", padding: 60 }}>
      <Loader2 size={28} style={{ animation: "spin 1s linear infinite", color: "#60a5ff" }} />
    </div>
  );
}
