"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import { LoadingButton } from "@/components/ui/LoadingButton";
import {
  KeyRound, ArrowRight, Trophy, Clock, Zap, Users, AlertCircle, X,
} from "lucide-react";
import {
  getCtfCompetitions,
  joinCtfByAccessCode,
  type CTFCompetitionDTO,
} from "@/lib/api";

// ── Time helpers ─────────────────────────────────────────────────────────────

function useCountdown(targetIso: string | null) {
  const [remaining, setRemaining] = useState(() =>
    targetIso ? Math.max(0, new Date(targetIso).getTime() - Date.now()) : 0);

  useEffect(() => {
    const id = setInterval(() => {
      setRemaining(targetIso ? Math.max(0, new Date(targetIso).getTime() - Date.now()) : 0);
    }, 1000);
    return () => clearInterval(id);
  }, [targetIso]);

  const total = remaining;
  const d = Math.floor(total / 86400000);
  const h = Math.floor((total % 86400000) / 3600000);
  const m = Math.floor((total % 3600000) / 60000);
  const s = Math.floor((total % 60000) / 1000);
  return { remaining, d, h, m, s };
}

function fmtCountdown(d: number, h: number, m: number, s: number) {
  if (d > 0) return `${d}d ${String(h).padStart(2, "0")}h ${String(m).padStart(2, "0")}m`;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

// ── Timer display: handles all timing modes + statuses correctly ─────────────

function TimerDisplay({ comp }: { comp: CTFCompetitionDTO }) {
  const effectiveEnd = (comp as { computedEndTime?: string | null }).computedEndTime ?? comp.endTime;
  const target = comp.started ? effectiveEnd : comp.startTime;
  const { remaining, d, h, m, s } = useCountdown(target);
  const critical = comp.started && !comp.ended && remaining < 3600_000;

  // Competition ended
  if (comp.ended || comp.status === "ENDED") {
    return null; // Status badge already says ENDED
  }

  // MANUAL/REGISTRATION mode with no fixed time
  if (!target) {
    if (comp.started) {
      return (
        <span style={{ fontSize: 12, fontWeight: 600, color: "#34d399" }}>
          <Clock size={11} style={{ display: "inline", marginRight: 5, verticalAlign: -1 }} />
          In progress
        </span>
      );
    }
    return (
      <span style={{ fontSize: 12, fontWeight: 600, color: "#60a5fa" }}>
        <Clock size={11} style={{ display: "inline", marginRight: 5, verticalAlign: -1 }} />
        Starting soon
      </span>
    );
  }

  return (
    <span style={{
      fontSize: 12, fontWeight: 600, fontFamily: "ui-monospace, monospace",
      color: critical ? "#f87171" : "#6b7ea3",
    }}>
      <Clock size={11} style={{ display: "inline", marginRight: 5, verticalAlign: -1 }} />
      {comp.started ? "Ends in " : "Starts in "}
      {fmtCountdown(d, h, m, s)}
    </span>
  );
}

// ── Access code modal ────────────────────────────────────────────────────────

function AccessCodeModal({ comp, onClose, onSuccess }: {
  comp: CTFCompetitionDTO;
  onClose: () => void;
  onSuccess: (id: string) => void;
}) {
  const [code, setCode] = useState("");
  const [validating, setValidating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  async function handleSubmit() {
    const trimmed = code.trim();
    if (!trimmed) { setError("Enter the access code."); return; }
    setError(null);
    setValidating(true);
    try {
      const joined = await joinCtfByAccessCode(trimmed);
      onSuccess(joined.id);
    } catch {
      setError("Invalid access code. Please try again.");
      setCode("");
      inputRef.current?.focus();
    } finally {
      setValidating(false);
    }
  }

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 999,
      background: "rgba(1,4,14,0.85)",
      backdropFilter: "blur(8px)",
      display: "flex", alignItems: "center", justifyContent: "center",
    }} onClick={onClose}>
      <div style={{
        background: "rgba(22,38,78,0.92)", border: "1px solid rgba(130,165,255,0.22)",
        borderRadius: 12,
        padding: 28, width: "100%", maxWidth: 380, position: "relative",
        boxShadow: "0 0 0 1px rgba(96,165,255,0.1) inset, 0 32px 96px rgba(0,0,0,0.7)",
        backdropFilter: "blur(12px)",
      }} onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} style={{
          position: "absolute", top: 14, right: 14,
          background: "transparent", border: "1px solid rgba(130,165,255,0.12)",
          borderRadius: 6, cursor: "pointer", color: "#4a5874",
          display: "flex", alignItems: "center", padding: 5,
        }}>
          <X size={14} />
        </button>

        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <KeyRound size={15} color="#60a5ff" />
          <span style={{
            fontSize: 15, fontWeight: 700, color: "#eaf0ff",
            fontFamily: "'Chakra Petch', system-ui, sans-serif", letterSpacing: "0.02em",
          }}>Access Code Required</span>
        </div>
        <p style={{ fontSize: 12, color: "#4a5874", marginBottom: 18 }}>
          &quot;{comp.title}&quot; requires an access code to enter.
        </p>

        <input
          ref={inputRef}
          type="text"
          value={code}
          onChange={(e) => { setError(null); setCode(e.target.value.toUpperCase().replace(/\s+/g, "")); }}
          onKeyDown={(e) => { if (e.key === "Enter") handleSubmit(); if (e.key === "Escape") onClose(); }}
          placeholder="ENTER CODE"
          maxLength={30}
          disabled={validating}
          style={{
            width: "100%", boxSizing: "border-box",
            background: "rgba(10,20,48,0.6)",
            border: `1px solid ${error ? "rgba(248,113,113,0.5)" : "rgba(130,165,255,0.18)"}`,
            borderRadius: 7, padding: "12px 16px", color: "#eaf0ff",
            fontFamily: "'JetBrains Mono', ui-monospace, monospace",
            fontSize: 15, fontWeight: 600, letterSpacing: "0.08em",
            outline: "none", marginBottom: 12,
          }}
        />

        {error && (
          <div style={{
            display: "flex", alignItems: "center", gap: 6,
            color: "#f87171", fontSize: 12, fontWeight: 600, marginBottom: 12,
          }}>
            <AlertCircle size={12} /> {error}
          </div>
        )}

        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onClose} disabled={validating} style={{
            flex: 1, padding: "10px 0", background: "transparent",
            border: "1px solid rgba(130,165,255,0.15)", borderRadius: 7, color: "#6b7ea3",
            fontSize: 12, fontWeight: 700, cursor: "pointer",
            fontFamily: "'Chakra Petch', system-ui, sans-serif",
            letterSpacing: "0.06em", textTransform: "uppercase",
          }}>
            Cancel
          </button>
          <LoadingButton
            loading={validating}
            onClick={handleSubmit}
            disabled={!code.trim()}
            style={{
              flex: 2, padding: "10px 0",
              background: "linear-gradient(180deg, #3b82f6 0%, #2563eb 100%)",
              border: "1px solid rgba(96,165,255,0.4)", borderRadius: 7, color: "#fff",
              fontSize: 12, fontWeight: 700, cursor: "pointer",
              fontFamily: "'Chakra Petch', system-ui, sans-serif",
              letterSpacing: "0.1em", textTransform: "uppercase",
              boxShadow: "0 0 12px rgba(59,130,246,0.3)",
            }}
          >
            Enter
          </LoadingButton>
        </div>
      </div>
    </div>
  );
}

// ── Open Competition Card ────────────────────────────────────────────────────

function CompetitionCard({ comp }: { comp: CTFCompetitionDTO }) {
  const router = useRouter();
  const [showModal, setShowModal] = useState(false);
  const ended = comp.ended || comp.status === "ENDED";

  const bannerColor = comp.bannerUrl?.startsWith("color:")
    ? comp.bannerUrl.slice(6)
    : "#3b82f6";
  const coverImageUrl = comp.coverImageUrl ?? null;

  function handleEnter(e: React.MouseEvent) {
    e.preventDefault();
    if (comp.visibility === "ACCESS_CODE") {
      setShowModal(true);
    } else {
      router.push(`/ctf/competitions/${comp.id}`);
    }
  }

  return (
    <>
      {showModal && (
        <AccessCodeModal
          comp={comp}
          onClose={() => setShowModal(false)}
          onSuccess={(id) => router.push(`/ctf/competitions/${id}`)}
        />
      )}

      <div
        className="ctf-entry-card"
        onClick={handleEnter}
        style={{
          background: "rgba(22,38,78,0.45)",
          border: "1px solid rgba(130,165,255,0.12)",
          borderRadius: 10,
          overflow: "hidden",
          transition: "all 180ms ease",
          cursor: "pointer",
          display: "flex",
          flexDirection: "column",
          minHeight: 280,
          backdropFilter: "blur(4px)",
        }}
      >
        {/* Cover image / gradient banner */}
        <div style={{
          position: "relative",
          width: "100%", height: 112, flexShrink: 0,
          background: coverImageUrl
            ? undefined
            : `linear-gradient(135deg, ${bannerColor}22 0%, ${bannerColor}40 100%)`,
          overflow: "hidden",
        }}>
          {coverImageUrl && (
            <img
              src={coverImageUrl}
              alt={comp.title}
              style={{ width: "100%", height: "100%", objectFit: "cover", opacity: 0.75 }}
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
            />
          )}
          {/* Status badge – absolute top-left */}
          <div style={{ position: "absolute", top: 10, left: 12 }}>
            {ended ? (
              <span style={{
                display: "inline-flex", alignItems: "center", gap: 5,
                background: "rgba(5,11,29,0.88)", color: "#4a5874",
                border: "1px solid rgba(130,165,255,0.15)", borderRadius: 4,
                padding: "3px 9px", fontSize: 10, fontWeight: 800,
                letterSpacing: "0.1em", backdropFilter: "blur(4px)",
                fontFamily: "'Chakra Petch', system-ui, sans-serif",
              }}>ENDED</span>
            ) : comp.started ? (
              <span style={{
                display: "inline-flex", alignItems: "center", gap: 5,
                background: "rgba(5,11,29,0.88)", color: "#34d399",
                border: "1px solid rgba(52,211,153,0.35)", borderRadius: 4,
                padding: "3px 9px", fontSize: 10, fontWeight: 800,
                letterSpacing: "0.1em", backdropFilter: "blur(4px)",
                fontFamily: "'Chakra Petch', system-ui, sans-serif",
              }}>
                <span style={{
                  width: 6, height: 6, borderRadius: "50%", background: "#34d399",
                  boxShadow: "0 0 6px #34d399",
                  animation: "ctf-pulse-dot 1.5s ease infinite",
                  flexShrink: 0,
                }} />
                LIVE
              </span>
            ) : (
              <span style={{
                display: "inline-flex", alignItems: "center", gap: 5,
                background: "rgba(5,11,29,0.88)", color: "#fbbf24",
                border: "1px solid rgba(251,191,36,0.3)", borderRadius: 4,
                padding: "3px 9px", fontSize: 10, fontWeight: 800,
                letterSpacing: "0.1em", backdropFilter: "blur(4px)",
                fontFamily: "'Chakra Petch', system-ui, sans-serif",
              }}>UPCOMING</span>
            )}
          </div>
          {/* Timer – absolute top-right */}
          <div style={{ position: "absolute", top: 10, right: 12 }}>
            <TimerDisplay comp={comp} />
          </div>
        </div>

        {/* Card body */}
        <div style={{ padding: "16px 20px 20px", display: "flex", flexDirection: "column", flex: 1 }}>
          <div style={{
            fontSize: 16, fontWeight: 700, color: "#eaf0ff", marginBottom: 6,
            fontFamily: "'Chakra Petch', system-ui, sans-serif", letterSpacing: "0.02em",
          }}>
            {comp.title}
          </div>
          {/* Fixed-height description: max 2 lines */}
          <div style={{
            fontSize: 12, color: "#4a5874", lineHeight: 1.6,
            overflow: "hidden", display: "-webkit-box",
            WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
            height: "2.8em", flexShrink: 0, marginBottom: 14,
          }}>
            {comp.description ?? ""}
          </div>

          <div style={{ display: "flex", gap: 16, fontSize: 11, color: "#6b7ea3", flexShrink: 0 }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              <Users size={11} /> Max {comp.maxTeamSize} per team
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              <Zap size={11} color="#c084fc" />
              <span style={{ color: "#c084fc" }}>{comp.scoringMode === "DYNAMIC" ? "Dynamic" : "Static"}</span>
            </span>
          </div>

          {/* Spacer pushes footer to bottom */}
          <div style={{ flex: 1 }} />

          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            paddingTop: 12, marginTop: 12, borderTop: "1px solid rgba(130,165,255,0.1)",
          }}>
            <span style={{
              fontSize: 11, color: "#4a5874",
              fontFamily: "'Chakra Petch', system-ui, sans-serif", letterSpacing: "0.06em",
            }}>
              {comp.visibility === "ACCESS_CODE" ? "🔒 Access code" : "🔓 Open to all"}
            </span>
            <span style={{
              display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 700,
              color: "#60a5ff", letterSpacing: "0.08em", textTransform: "uppercase",
              fontFamily: "'Chakra Petch', system-ui, sans-serif",
            }}>
              Enter <ArrowRight size={12} />
            </span>
          </div>
        </div>
      </div>
    </>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function CTFEntryPage() {
  const router = useRouter();

  const [accessCode, setAccessCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [accessError, setAccessError] = useState<string | null>(null);

  const [competitions, setCompetitions] = useState<CTFCompetitionDTO[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    getCtfCompetitions()
      .then(setCompetitions)
      .catch(() => setCompetitions([]))
      .finally(() => setLoading(false));
  }, []);

  const open = useMemo(
    () => competitions.filter((c) => !c.ended).slice(0, 6),
    [competitions]
  );

  async function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    const code = accessCode.trim();
    if (!code) {
      setAccessError("Please enter an access code.");
      return;
    }
    setAccessError(null);
    setSubmitting(true);
    try {
      const comp = await joinCtfByAccessCode(code);
      router.push(`/ctf/competitions/${comp.id}`);
    } catch {
      setAccessError("Invalid or expired access code.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <Navbar />

      <div style={{
        minHeight: "calc(100vh - 56px)",
        background: "radial-gradient(120% 80% at 20% 0%, #0e1c43 0%, #0a1430 45%, #050b1d 100%)",
        color: "#eaf0ff",
      }}>
        {/* HERO ── access code entry ─────────────────────────────────────── */}
        <section style={{
          padding: "72px 24px 40px",
          textAlign: "center",
          maxWidth: 720,
          margin: "0 auto",
        }}>
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            background: "rgba(59,130,246,0.08)", border: "1px solid rgba(96,165,255,0.25)",
            borderRadius: 999, padding: "5px 14px", fontSize: 11, fontWeight: 700,
            color: "#60a5ff", letterSpacing: "0.14em", textTransform: "uppercase",
            fontFamily: "'Chakra Petch', system-ui, sans-serif",
            marginBottom: 22,
          }}>
            <Trophy size={12} /> CTF Arena
          </div>

          <h1 style={{
            fontSize: 44, fontWeight: 700, color: "#eaf0ff",
            letterSpacing: "0.01em", lineHeight: 1.1, marginBottom: 14,
            fontFamily: "'Chakra Petch', system-ui, sans-serif",
            textTransform: "uppercase",
          }}>
            CTF Competitions
          </h1>
          <p style={{ fontSize: 15, color: "#6b7ea3", marginBottom: 36, lineHeight: 1.6 }}>
            Test your skills. Form a team. Compete.
          </p>

          {/* Access code box */}
          <form
            onSubmit={handleSubmit}
            style={{
              background: "rgba(22,38,78,0.45)",
              border: "1px solid rgba(130,165,255,0.18)",
              borderRadius: 10,
              padding: 22,
              boxShadow: "0 0 0 1px rgba(96,165,255,0.06) inset, 0 16px 48px rgba(0,0,0,0.4)",
              backdropFilter: "blur(8px)",
            }}
          >
            <div style={{
              display: "flex", alignItems: "center", gap: 8, marginBottom: 12,
              fontSize: 11, color: "#6b7ea3", fontWeight: 700,
              letterSpacing: "0.12em", textTransform: "uppercase",
              fontFamily: "'Chakra Petch', system-ui, sans-serif",
            }}>
              <KeyRound size={13} color="#60a5ff" />
              Enter competition access code
            </div>

            <div style={{ display: "flex", gap: 10 }}>
              <input
                type="text"
                value={accessCode}
                onChange={(e) => {
                  setAccessError(null);
                  setAccessCode(e.target.value.toUpperCase().replace(/\s+/g, ""));
                }}
                placeholder="WINTER2025"
                maxLength={30}
                autoComplete="off"
                spellCheck={false}
                style={{
                  flex: 1,
                  background: "rgba(10,20,48,0.6)",
                  border: `1px solid ${accessError ? "rgba(248,113,113,0.5)" : "rgba(130,165,255,0.18)"}`,
                  borderRadius: 7,
                  padding: "13px 16px",
                  color: "#eaf0ff",
                  fontFamily: "'JetBrains Mono', ui-monospace, monospace",
                  fontSize: 15,
                  fontWeight: 600,
                  letterSpacing: "0.08em",
                  outline: "none",
                  transition: "border-color 150ms ease, box-shadow 150ms ease",
                }}
                onFocus={(e) => {
                  (e.target as HTMLInputElement).style.borderColor = "rgba(96,165,255,0.45)";
                  (e.target as HTMLInputElement).style.boxShadow = "0 0 0 3px rgba(59,130,246,0.15), 0 0 16px rgba(59,130,246,0.2)";
                }}
                onBlur={(e) => {
                  (e.target as HTMLInputElement).style.borderColor = accessError ? "rgba(248,113,113,0.5)" : "rgba(130,165,255,0.18)";
                  (e.target as HTMLInputElement).style.boxShadow = "none";
                }}
              />
              <LoadingButton
                type="submit"
                loading={submitting}
                disabled={!accessCode.trim()}
                style={{
                  background: "linear-gradient(180deg, #3b82f6 0%, #2563eb 100%)",
                  color: "#fff",
                  border: "1px solid rgba(96,165,255,0.4)",
                  borderRadius: 7,
                  padding: "0 22px",
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  letterSpacing: "0.1em",
                  whiteSpace: "nowrap",
                  fontFamily: "'Chakra Petch', system-ui, sans-serif",
                  textTransform: "uppercase",
                  boxShadow: "0 0 12px rgba(59,130,246,0.3)",
                }}
              >
                Enter <ArrowRight size={14} />
              </LoadingButton>
            </div>

            {accessError && (
              <div style={{
                marginTop: 10, display: "flex", alignItems: "center", gap: 6,
                color: "#f87171", fontSize: 12, fontWeight: 600,
              }}>
                <AlertCircle size={13} /> {accessError}
              </div>
            )}
          </form>

          {/* Divider */}
          <div style={{
            display: "flex", alignItems: "center", gap: 14, margin: "40px 0 24px",
            color: "#2d3a52", fontSize: 11, fontWeight: 700,
            textTransform: "uppercase", letterSpacing: "0.14em",
            fontFamily: "'Chakra Petch', system-ui, sans-serif",
          }}>
            <span style={{ flex: 1, height: 1, background: "rgba(130,165,255,0.1)" }} />
            or browse open competitions
            <span style={{ flex: 1, height: 1, background: "rgba(130,165,255,0.1)" }} />
          </div>
        </section>

        {/* OPEN COMPETITIONS ─────────────────────────────────────────────── */}
        <section style={{
          maxWidth: 1100, margin: "0 auto", padding: "0 24px 80px",
        }}>
          {loading ? (
            <div style={{
              display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(420px, 1fr))", gap: 18,
            }}>
              {[0, 1].map((i) => (
                <div key={i} style={{
                  height: 220, background: "rgba(22,38,78,0.4)", border: "1px solid rgba(130,165,255,0.1)",
                  borderRadius: 10, animation: "ctf-entry-shimmer 1.6s ease-in-out infinite",
                }} />
              ))}
            </div>
          ) : open.length === 0 ? (
            <div style={{
              textAlign: "center", padding: "48px 0", color: "#4a5874",
              background: "rgba(22,38,78,0.3)", border: "1px dashed rgba(130,165,255,0.12)", borderRadius: 12,
            }}>
              <Trophy size={36} style={{ margin: "0 auto 12px", opacity: 0.3 }} />
              <div style={{ fontSize: 15, fontWeight: 600, color: "#6b7ea3", marginBottom: 6, fontFamily: "'Chakra Petch', system-ui, sans-serif" }}>
                No open competitions right now
              </div>
              <div style={{ fontSize: 13, color: "#4a5874" }}>
                Got an access code? Enter it above to join a private competition.
              </div>
            </div>
          ) : (
            <>
              <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(420px, 1fr))",
                gap: 18,
              }}>
                {open.map((c) => <CompetitionCard key={c.id} comp={c} />)}
              </div>

              <div style={{ textAlign: "center", marginTop: 32 }}>
                <Link href="/ctf/competitions" style={{
                  color: "#6b7ea3", fontSize: 12, fontWeight: 700, textDecoration: "none",
                  borderBottom: "1px solid rgba(130,165,255,0.2)", paddingBottom: 2,
                  fontFamily: "'Chakra Petch', system-ui, sans-serif",
                  letterSpacing: "0.08em", textTransform: "uppercase",
                }}>
                  See all competitions →
                </Link>
              </div>
            </>
          )}
        </section>
      </div>

      <style jsx global>{`
        .ctf-entry-card:hover {
          border-color: rgba(96,165,255,0.45) !important;
          transform: translateY(-2px);
          box-shadow: 0 0 0 1px rgba(96,165,255,0.18), 0 8px 24px rgba(59,130,246,0.2);
        }
        @keyframes ctf-entry-shimmer {
          0%,100% { opacity: 0.7; }
          50%      { opacity: 0.4; }
        }
        @keyframes ctf-pulse-dot {
          0%, 100% { opacity: 1; box-shadow: 0 0 0 2px rgba(52,211,153,0.3); }
          50%       { opacity: 0.7; box-shadow: 0 0 0 5px rgba(52,211,153,0.08); }
        }
      `}</style>
    </>
  );
}
