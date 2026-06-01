"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import { Trophy, Clock, Users, Plus, ChevronRight, Zap, Lock, Calendar } from "lucide-react";
import {
  getCtfCompetitions,
  type CTFCompetitionDTO,
} from "@/lib/api";

// ── iCODE palette tokens ─────────────────────────────────────────────────────
const T = {
  surface1:    "rgba(22,38,78,0.45)",
  surface2:    "rgba(30,50,100,0.62)",
  surfaceHover:"rgba(14,28,67,0.4)",
  border:      "rgba(130,165,255,0.12)",
  borderHover: "rgba(96,165,255,0.45)",
  borderFaint: "rgba(130,165,255,0.08)",
  borderPill:  "rgba(130,165,255,0.15)",
  text:        "#eaf0ff",
  muted:       "#6b7ea3",
  faint:       "#4a5874",
  accent:      "#60a5ff",
  green:       "#34d399",
  yellow:      "#fbbf24",
  red:         "#f87171",
  purple:      "#c084fc",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function useCountdown(targetIso: string) {
  const [remaining, setRemaining] = useState(0);

  useEffect(() => {
    const tick = () => setRemaining(Math.max(0, new Date(targetIso).getTime() - Date.now()));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [targetIso]);

  const d = Math.floor(remaining / 86400000);
  const h = Math.floor((remaining % 86400000) / 3600000);
  const m = Math.floor((remaining % 3600000) / 60000);
  const s = Math.floor((remaining % 60000) / 1000);
  return { remaining, d, h, m, s };
}

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function fmtCountdown(d: number, h: number, m: number, s: number) {
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  return `${m}m ${s}s`;
}

// ── Active Competition Card ────────────────────────────────────────────────────

function ActiveCard({ comp }: { comp: CTFCompetitionDTO }) {
  const { d, h, m, s } = useCountdown(comp.endTime ?? "");

  return (
    <Link href={`/ctf/competitions/${comp.id}`} style={{ textDecoration: "none" }}>
      <div style={{
        background: "linear-gradient(135deg, rgba(22,38,78,0.6) 0%, rgba(14,28,67,0.8) 100%)",
        border: `1px solid ${T.border}`,
        borderRadius: 8,
        overflow: "hidden",
        cursor: "pointer",
        transition: "border-color 150ms ease, transform 150ms ease, box-shadow 150ms ease",
        backdropFilter: "blur(4px)",
        WebkitBackdropFilter: "blur(4px)",
        position: "relative",
      }}
        onMouseEnter={e => {
          const el = e.currentTarget as HTMLDivElement;
          el.style.borderColor = T.borderHover;
          el.style.transform = "translateY(-2px)";
          el.style.boxShadow = "0 8px 32px rgba(59,130,246,0.15)";
        }}
        onMouseLeave={e => {
          const el = e.currentTarget as HTMLDivElement;
          el.style.borderColor = T.border;
          el.style.transform = "translateY(0)";
          el.style.boxShadow = "none";
        }}
      >
        {/* Banner / gradient area */}
        <div style={{
          height: 120,
          background: comp.bannerUrl
            ? `url(${comp.bannerUrl}) center/cover`
            : "linear-gradient(135deg, #1d4ed8 0%, #4f46e5 50%, #7c3aed 100%)",
          position: "relative",
          display: "flex",
          alignItems: "flex-start",
          padding: "12px 16px",
          justifyContent: "space-between",
        }}>
          {/* Live badge */}
          <span style={{
            background: "rgba(0,0,0,0.55)", backdropFilter: "blur(6px)",
            border: "1px solid rgba(52,211,153,0.3)",
            borderRadius: 20, padding: "3px 10px", fontSize: 11,
            fontWeight: 700, color: T.text,
            fontFamily: "'Chakra Petch', system-ui, sans-serif",
            letterSpacing: "0.08em", textTransform: "uppercase",
            display: "flex", alignItems: "center", gap: 5,
          }}>
            <span style={{
              width: 6, height: 6, borderRadius: "50%",
              background: T.green,
              boxShadow: `0 0 0 2px rgba(52,211,153,0.3)`,
              animation: "ctf-comp-pulse 2s infinite",
              display: "inline-block",
            }} />
            LIVE NOW
          </span>
        </div>

        {/* Body */}
        <div style={{ padding: "16px 18px" }}>
          <div style={{
            fontSize: 16, fontWeight: 700, color: T.text, marginBottom: 6,
            fontFamily: "'Chakra Petch', system-ui, sans-serif",
          }}>
            {comp.title}
          </div>
          {comp.description && (
            <div style={{
              fontSize: 13, color: T.muted, marginBottom: 12,
              overflow: "hidden", display: "-webkit-box",
              WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
            }}>
              {comp.description}
            </div>
          )}

          <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: T.muted }}>
              <Clock size={13} color={T.red} />
              <span style={{ color: T.red, fontWeight: 600, fontFamily: "'JetBrains Mono', monospace" }}>
                Ends in {comp.endTime ? fmtCountdown(d, h, m, s) : "—"}
              </span>
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: T.muted }}>
              <Users size={13} color={T.faint} /> Max {comp.maxTeamSize} per team
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: T.muted }}>
              <Zap size={13} color={T.purple} />
              <span style={{ color: T.purple }}>{comp.scoringMode === "DYNAMIC" ? "Dynamic" : "Static"} scoring</span>
            </span>
          </div>

          <div style={{
            marginTop: 14, display: "flex", alignItems: "center", justifyContent: "flex-end",
            fontSize: 12, color: T.accent, fontWeight: 600, gap: 4,
            fontFamily: "'Chakra Petch', system-ui, sans-serif",
            letterSpacing: "0.04em",
          }}>
            Enter Competition <ChevronRight size={13} />
          </div>
        </div>
      </div>
    </Link>
  );
}

// ── Upcoming Competition Card ──────────────────────────────────────────────────

function UpcomingCard({ comp }: { comp: CTFCompetitionDTO }) {
  const { d, h, m } = useCountdown(comp.startTime ?? "");

  return (
    <Link href={`/ctf/competitions/${comp.id}`} style={{ textDecoration: "none" }}>
      <div style={{
        background: T.surface1,
        border: `1px solid ${T.border}`,
        borderRadius: 8, padding: "16px 18px",
        cursor: "pointer",
        transition: "border-color 150ms ease, transform 150ms ease, box-shadow 150ms ease",
        backdropFilter: "blur(4px)",
        WebkitBackdropFilter: "blur(4px)",
      }}
        onMouseEnter={e => {
          const el = e.currentTarget as HTMLDivElement;
          el.style.borderColor = T.borderHover;
          el.style.transform = "translateY(-2px)";
          el.style.boxShadow = "0 8px 24px rgba(59,130,246,0.12)";
        }}
        onMouseLeave={e => {
          const el = e.currentTarget as HTMLDivElement;
          el.style.borderColor = T.border;
          el.style.transform = "translateY(0)";
          el.style.boxShadow = "none";
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 8 }}>
          <div style={{
            fontSize: 14, fontWeight: 700, color: T.text,
            fontFamily: "'Chakra Petch', system-ui, sans-serif",
          }}>{comp.title}</div>
          <span style={{
            background: "rgba(59,130,246,0.08)", border: `1px solid rgba(96,165,255,0.25)`,
            borderRadius: 4, padding: "2px 8px", fontSize: 10,
            fontWeight: 700, color: T.accent, whiteSpace: "nowrap",
            fontFamily: "'Chakra Petch', system-ui, sans-serif",
            letterSpacing: "0.1em",
          }}>
            UPCOMING
          </span>
        </div>

        <div style={{ fontSize: 12, color: T.faint, marginBottom: 10 }}>
          Starts in{" "}
          <span style={{ color: T.text, fontWeight: 600, fontFamily: "'JetBrains Mono', monospace" }}>
            {fmtCountdown(d, h, m, 0)}
          </span>
          {" · "}Starts {fmtDate(comp.startTime)}
        </div>

        <div style={{ display: "flex", gap: 12, fontSize: 11, color: T.faint }}>
          <span><Users size={11} style={{ display: "inline", marginRight: 3 }} />{comp.maxTeamSize} per team</span>
          <span><Zap size={11} style={{ display: "inline", marginRight: 3 }} />{comp.scoringMode}</span>
          {comp.visibility !== "PUBLIC" && (
            <span><Lock size={11} style={{ display: "inline", marginRight: 3 }} />{comp.visibility.replace("_", " ")}</span>
          )}
        </div>
      </div>
    </Link>
  );
}

// ── Past Competition Row ───────────────────────────────────────────────────────

function PastRow({ comp }: { comp: CTFCompetitionDTO }) {
  return (
    <Link href={`/ctf/competitions/${comp.id}`} style={{ textDecoration: "none" }}>
      <div style={{
        display: "flex", alignItems: "center", padding: "10px 16px",
        borderBottom: `1px solid ${T.borderFaint}`,
        cursor: "pointer", transition: "background 150ms ease",
        gap: 16,
      }}
        onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.background = T.surfaceHover}
        onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.background = "transparent"}
      >
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: T.muted }}>{comp.title}</div>
        </div>
        <div style={{ fontSize: 12, color: T.faint, whiteSpace: "nowrap", fontFamily: "'JetBrains Mono', monospace" }}>
          <Calendar size={11} style={{ display: "inline", marginRight: 4 }} />
          {fmtDate(comp.startTime)} → {fmtDate(comp.endTime)}
        </div>
        <span style={{ fontSize: 11, color: T.faint }}>Ended</span>
        <ChevronRight size={13} color={T.borderHover} style={{ opacity: 0.4 }} />
      </div>
    </Link>
  );
}

// ── Section Header ─────────────────────────────────────────────────────────────

function SectionHeader({ icon, label, count }: { icon: React.ReactNode; label: string; count?: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
      {icon}
      <span style={{
        fontSize: 11, fontWeight: 800, color: T.muted,
        textTransform: "uppercase", letterSpacing: "0.14em",
        fontFamily: "'Chakra Petch', system-ui, sans-serif",
      }}>
        {label}
      </span>
      {count !== undefined && (
        <span style={{
          background: "rgba(22,38,78,0.6)", border: `1px solid ${T.borderPill}`,
          borderRadius: 10, padding: "1px 7px", fontSize: 11, fontWeight: 700, color: T.faint,
          fontFamily: "'JetBrains Mono', monospace",
        }}>{count}</span>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function CTFCompetitionsPage() {
  const [competitions, setCompetitions] = useState<CTFCompetitionDTO[]>([]);
  const [loading, setLoading] = useState(true);

  const [role, setRole] = useState<string | null>(null);

  useEffect(() => {
    setRole(typeof window !== "undefined" ? localStorage.getItem("icode_ctf_role") : null);
    getCtfCompetitions()
      .then(setCompetitions)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const active   = competitions.filter(c => c.started && !c.ended);
  const upcoming = competitions.filter(c => !c.started);
  const past     = competitions.filter(c => c.ended);

  const canCreate = role === "ADMIN";

  return (
    <>
      <Navbar />
      <div className="psp-breadcrumb">
        <Link href="/welcome">icode-ctf</Link> ›{" "}
        <Link href="/ctf">CTF</Link> ›{" "}
        <span style={{ color: "var(--text-primary)" }}>Competitions</span>
      </div>

      <div className="psp-main" style={{ maxWidth: 1000 }}>
        {/* Page header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 28 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
              <Trophy size={22} color={T.accent} />
              <span style={{
                fontSize: 22, fontWeight: 800, color: "var(--text-primary)",
                fontFamily: "'Chakra Petch', system-ui, sans-serif",
                textTransform: "uppercase", letterSpacing: "0.04em",
              }}>
                CTF Competitions
              </span>
            </div>
            <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
              Team-based capture-the-flag competitions with live scoreboards.
            </div>
          </div>
          {canCreate && (
            <Link href="/admin/ctf/competitions/new">
              <button className="ict-btn" style={{ gap: 6 }}>
                <Plus size={14} /> Create Competition
              </button>
            </Link>
          )}
        </div>

        {loading ? (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            {[...Array(4)].map((_, i) => (
              <div key={i} className="ict-skel" style={{ height: 200, borderRadius: 8 }} />
            ))}
          </div>
        ) : (
          <>
            {/* Active Now */}
            {active.length > 0 && (
              <section style={{ marginBottom: 36 }}>
                <SectionHeader
                  icon={<span style={{
                    width: 8, height: 8, borderRadius: "50%", background: T.green,
                    display: "inline-block", boxShadow: `0 0 0 2px rgba(52,211,153,0.3)`,
                    animation: "ctf-comp-pulse 2s infinite",
                  }} />}
                  label="Active Now"
                  count={active.length}
                />
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(420px, 1fr))", gap: 14 }}>
                  {active.map(c => <ActiveCard key={c.id} comp={c} />)}
                </div>
              </section>
            )}

            {/* Upcoming */}
            {upcoming.length > 0 && (
              <section style={{ marginBottom: 36 }}>
                <SectionHeader
                  icon={<Calendar size={14} color={T.accent} />}
                  label="Upcoming"
                  count={upcoming.length}
                />
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
                  {upcoming.map(c => <UpcomingCard key={c.id} comp={c} />)}
                </div>
              </section>
            )}

            {/* Past */}
            {past.length > 0 && (
              <section>
                <SectionHeader
                  icon={<Clock size={14} color={T.faint} />}
                  label="Past"
                  count={past.length}
                />
                <div style={{
                  background: "rgba(10,20,48,0.5)",
                  border: `1px solid ${T.border}`,
                  borderRadius: 8, overflow: "hidden",
                  backdropFilter: "blur(4px)",
                  WebkitBackdropFilter: "blur(4px)",
                }}>
                  {past.map(c => <PastRow key={c.id} comp={c} />)}
                </div>
              </section>
            )}

            {/* Empty state */}
            {competitions.length === 0 && (
              <div style={{ textAlign: "center", padding: "80px 0", color: T.faint }}>
                <Trophy size={40} style={{ margin: "0 auto 16px", opacity: 0.3, color: T.accent }} />
                <div style={{
                  fontSize: 16, fontWeight: 600, marginBottom: 6, color: T.muted,
                  fontFamily: "'Chakra Petch', system-ui, sans-serif",
                }}>No competitions yet</div>
                <div style={{ fontSize: 13, color: T.faint }}>
                  {canCreate ? "Create the first CTF competition." : "Check back soon for upcoming CTF competitions."}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <style jsx global>{`
        @keyframes ctf-comp-pulse {
          0%, 100% { opacity: 1; box-shadow: 0 0 0 2px rgba(52,211,153,0.3); }
          50%       { opacity: 0.7; box-shadow: 0 0 0 4px rgba(52,211,153,0.12); }
        }
      `}</style>
    </>
  );
}
