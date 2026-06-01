"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  X, Check, CheckCircle2, AlertCircle, Loader2, Lightbulb,
  Pause, Infinity as InfinityIcon, Trophy, Flag, Terminal, Key, ChevronRight, FileDown,
} from "lucide-react";
import { toast } from "@/components/ui/PSPToast";
import InstancePanel from "@/components/ctf/InstancePanel";
import {
  getCtfCompetitionChallenges, submitCtfCompetitionFlag, unlockCTFHint,
  getMyCtfAttempts, getChallengeSolvers,
  type CTFCompetitionChallengeDTO,
  type CTFAttemptDTO,
  type CTFChallengeSolverDTO,
} from "@/lib/api";
import { CAT_CONFIG, DIFF_COLORS } from "./categoryConfig";

interface Props {
  competitionId: string;
  challengeId:   string;
  teamId?:       string;
  canSolve:      boolean;
  isPaused:      boolean;
  isEnded:       boolean;
  onClose:       () => void;
  onSolved?:     (challengeId: string, points: number) => void;
}

const DIFF_CLASS: Record<string, string> = {
  EASY:   "badge-easy",
  MEDIUM: "badge-medium",
  HARD:   "badge-hard",
  INSANE: "badge-insane",
};

export default function ChallengeModal({
  competitionId, challengeId, teamId, canSolve, isPaused, isEnded, onClose, onSolved,
}: Props) {
  const [challenge, setChallenge] = useState<CTFCompetitionChallengeDTO | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [closing,   setClosing]   = useState(false);

  const [unlockedHints, setUnlockedHints] = useState<Record<string, string>>({});
  const [unlockingHint, setUnlockingHint] = useState<string | null>(null);

  const handleUnlockHint = async (hintId: string) => {
    if (unlockingHint) return;
    setUnlockingHint(hintId);
    try {
      const res = await unlockCTFHint(challenge?.id ?? challengeId, hintId, { competitionId, teamId });
      setUnlockedHints(prev => ({ ...prev, [hintId]: res.text ?? "" }));
    } catch (e: unknown) {
      toast.error("Unlock failed", e instanceof Error ? e.message : "Could not unlock hint.");
    } finally {
      setUnlockingHint(null);
    }
  };

  const [flag,    setFlag]    = useState("");
  const [busy,    setBusy]    = useState(false);
  const [result,  setResult]  = useState<{ correct: boolean; message: string } | null>(null);
  const [subState, setSubState] = useState<"idle" | "checking" | "wrong" | "correct">("idle");

  const inputRef      = useRef<HTMLInputElement>(null);
  const wrongTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [attempts,          setAttempts]          = useState<CTFAttemptDTO[]>([]);
  const [attemptsUsed,      setAttemptsUsed]      = useState(0);
  const [attemptsRemaining, setAttemptsRemaining] = useState<number | null>(null);
  const [lockedOut,         setLockedOut]         = useState(false);
  const [newRowIds,         setNewRowIds]         = useState<Set<string>>(new Set());

  useEffect(() => {
    setLoading(true);
    Promise.all([
      getCtfCompetitionChallenges(competitionId),
      getMyCtfAttempts(competitionId, challengeId),
    ]).then(([w, hist]) => {
      const c = w.challenges.find(x => x.id === challengeId);
      setChallenge(c ?? null);
      setAttempts(hist);
      setAttemptsUsed(hist.length);
      const max = c?.maxAttempts ?? null;
      if (max != null) {
        const used = hist.length;
        setAttemptsRemaining(Math.max(0, max - used));
        setLockedOut(used >= max && !hist.some(a => a.correct));
      } else {
        setAttemptsRemaining(null);
        setLockedOut(false);
      }
    }).catch(() => {}).finally(() => setLoading(false));
  }, [competitionId, challengeId]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") doClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const doClose = () => { setClosing(true); setTimeout(onClose, 220); };

  const submit = async () => {
    if (!challenge || !canSolve || busy || !flag.trim() || lockedOut) return;
    setBusy(true);
    setSubState("checking");
    setResult(null);
    if (wrongTimerRef.current) clearTimeout(wrongTimerRef.current);
    try {
      const res = await submitCtfCompetitionFlag(competitionId, challenge.id, flag.trim());
      const hist = await getMyCtfAttempts(competitionId, challenge.id).catch(() => attempts);
      const newId = hist[0]?.id;
      if (newId) setNewRowIds(prev => new Set(prev).add(newId));
      setAttempts(hist);
      setAttemptsUsed(res.attemptsUsed ?? hist.length);
      setAttemptsRemaining(res.attemptsRemaining ?? null);
      setLockedOut(res.lockedOut ?? false);

      if (res.correct) {
        setResult({ correct: true, message: res.message });
        setSubState("correct");
        toast.success("Correct flag!", `+${res.pointsAwarded} points awarded.`);
        onSolved?.(challenge.id, res.pointsAwarded ?? 0);
        setTimeout(() => window.location.reload(), 1400);
      } else {
        setResult({ correct: false, message: res.message });
        setSubState("wrong");
        if (!res.lockedOut) {
          wrongTimerRef.current = setTimeout(() => { setResult(null); setSubState("idle"); }, 4000);
          toast.error("Wrong flag", res.message ?? "Try again.");
        }
      }
      setFlag("");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Submission failed.";
      setResult({ correct: false, message: msg });
      setSubState("wrong");
      wrongTimerRef.current = setTimeout(() => { setResult(null); setSubState("idle"); }, 4000);
    } finally {
      setBusy(false);
    }
  };

  const conf   = challenge ? (CAT_CONFIG[challenge.category] ?? null) : null;
  const accent = conf?.accent ?? "#60a5ff";
  const diffColor = challenge ? (DIFF_COLORS[challenge.difficulty] ?? "#94a3b8") : "#94a3b8";

  // Render
  if (loading) {
    return (
      <div
        className="modal-overlay"
        onClick={doClose}
        style={closing ? { opacity: 0, transition: "opacity 200ms" } : undefined}
      >
        <div
          className="modal"
          onClick={e => e.stopPropagation()}
          style={{ width: "min(96vw, 920px)", height: "min(90vh, 700px)" }}
        >
          <LoadingSkeleton />
        </div>
      </div>
    );
  }

  if (!challenge) {
    return (
      <div className="modal-overlay" onClick={doClose}>
        <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 480 }}>
          <UnavailableState onClose={doClose} />
        </div>
      </div>
    );
  }

  const c = challenge;
  const alreadySolved  = c.solvedByMe || attempts.some(a => a.correct);
  const isUnlimited    = c.maxAttempts == null;
  const attemptsMax    = c.maxAttempts ?? 0;
  const pts            = c.currentPoints ?? c.basePoints;
  const hasInstance    = c.requiresInstance;
  const hasDownload    = !!c.downloadableFileUrl;

  const flashClass =
    subState === "correct" ? " flash-ok" :
    subState === "wrong"   ? " flash-err" : "";

  return (
    <div
      className="modal-overlay"
      onClick={doClose}
      style={closing ? { opacity: 0, transition: "opacity 200ms" } : undefined}
      role="dialog"
      aria-modal="true"
    >
      <div
        className={`modal${flashClass}`}
        onClick={e => e.stopPropagation()}
        style={{ ["--cat-color" as string]: accent } as React.CSSProperties}
      >
        {/* ── HEADER — fixed at the top ── */}
        <header className="modal-head">
          <div className="modal-head-left">
            <div className="crumbs">
              <span className="cat">{conf?.label ?? c.category}</span>
              <span className="sep">/</span>
              <span
                className={`badge ${DIFF_CLASS[c.difficulty] ?? ""}`}
                style={{ color: diffColor }}
              >
                {c.difficulty}
              </span>
              <span className="sep">/</span>
              <span style={{ color: "var(--ict-text-muted)", display: "inline-flex", alignItems: "center", gap: 5 }}>
                <Flag size={10} /> {c.solveCount} solves
              </span>
              {alreadySolved && (
                <>
                  <span className="sep">/</span>
                  <span className="badge badge-solved badge-dot" style={{ padding: "3px 7px" }}>Solved</span>
                </>
              )}
            </div>
            <h2>{c.title}</h2>
          </div>
          <div className="modal-head-right">
            <div className="pts-big">
              {pts}<span className="unit">PTS</span>
            </div>
            <button className="modal-close" onClick={doClose} aria-label="Close">
              <X size={16} />
            </button>
          </div>
        </header>

        {/* ── BODY: tabs / scrollable content / sticky footer ── */}
        <div className="modal-body">
          <ModalTopTabs
            c={c}
            competitionId={competitionId}
            teamId={teamId}
            accent={accent}
            unlockedHints={unlockedHints}
            unlockingHint={unlockingHint}
            onUnlockHint={handleUnlockHint}
            attempts={attempts}
            newRowIds={newRowIds}
            scrollExtras={
              <>
                {(hasInstance || hasDownload) && (
                  <div className={`rcol-twins${hasInstance && hasDownload ? "" : " single"}`}>
                    {hasInstance && (
                      <div className="twin-slot">
                        <InstancePanel
                          challengeId={c.id}
                          challengeTitle={c.title}
                          requiresInstance
                          connectionType={c.connectionType ?? "HTTP"}
                          competitionId={competitionId}
                          teamId={teamId}
                          dark
                          compactIdle
                        />
                      </div>
                    )}
                    {hasDownload && (
                      <a
                        className="twin-action twin-slot"
                        href={c.downloadableFileUrl!}
                        target="_blank"
                        rel="noopener noreferrer"
                        download
                      >
                        <span className="glyph"><FileDown size={16} /></span>
                        <span className="lbl">
                          <span className="title">Download File</span>
                          <span className="sub">{c.downloadableFileName ?? "challenge-file"}</span>
                        </span>
                      </a>
                    )}
                  </div>
                )}

                {attempts.length > 0 && (
                  <details className="modal-attempts">
                    <summary
                      style={{
                        cursor: "pointer", listStyle: "none",
                        fontFamily: "var(--ict-font-display)",
                        fontSize: 10, fontWeight: 700,
                        letterSpacing: "0.16em", textTransform: "uppercase",
                        color: "var(--ict-text-muted)",
                        padding: "10px 24px",
                        display: "flex", alignItems: "center", gap: 6,
                        userSelect: "none",
                        borderTop: "1px solid var(--ict-border)",
                      }}
                    >
                      <ChevronRight size={11} />
                      Your attempts ({attempts.length})
                    </summary>
                    <div style={{ padding: "4px 24px 12px" }}>
                      <AttemptLog attempts={attempts} newRowIds={newRowIds} />
                    </div>
                  </details>
                )}
              </>
            }
          />

          {/* STICKY FOOTER — Submit flag, always visible */}
          <div className="rcol-bottom">
            {alreadySolved ? (
              <div className="toast success" style={{ justifyContent: "center", width: "100%" }}>
                <CheckCircle2 size={14} />
                Challenge captured. Your team has already solved this one.
              </div>
            ) : isEnded ? (
              <div className="toast" style={{ justifyContent: "center", width: "100%", color: "var(--ict-text-muted)" }}>
                Competition ended — submissions closed.
              </div>
            ) : (
              <SubmitForm
                accent={accent}
                flag={flag}
                setFlag={setFlag}
                busy={busy}
                subState={subState}
                result={result}
                isPaused={isPaused}
                lockedOut={lockedOut}
                inputRef={inputRef}
                onSubmit={submit}
                attempts={attempts}
                attemptsMax={attemptsMax}
                attemptsRemaining={attemptsRemaining}
                isUnlimited={isUnlimited}
                points={pts}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Top tabs (Description / Hints / Solves) ───────────────────────────────────

function ModalTopTabs({
  c, competitionId, teamId, accent,
  unlockedHints, unlockingHint, onUnlockHint,
  attempts, newRowIds, scrollExtras,
}: {
  c: CTFCompetitionChallengeDTO;
  competitionId: string;
  teamId?: string;
  accent: string;
  unlockedHints: Record<string, string>;
  unlockingHint: string | null;
  onUnlockHint: (id: string) => void;
  attempts: CTFAttemptDTO[];
  newRowIds: Set<string>;
  /** Content rendered inside the scroll region, below the active tab panel
   *  (twin action row, attempt log details, etc.). */
  scrollExtras?: React.ReactNode;
}) {
  void attempts; void newRowIds; // reserved for future use; mounted via scrollExtras
  const [tab, setTab] = useState<"description" | "hints" | "solves">("description");
  const hints = c.hints ?? [];
  const revealedCount = hints.filter(h => h.text || unlockedHints[h.id]).length;

  return (
    <>
      {/* Tabs bar — fixed, above the scroll region */}
      <div className="rcol-tabs" role="tablist">
        <button
          role="tab"
          aria-selected={tab === "description"}
          className={`rcol-tab${tab === "description" ? " active" : ""}`}
          onClick={() => setTab("description")}
        >
          <Terminal size={12} /> Description
        </button>
        <button
          role="tab"
          aria-selected={tab === "hints"}
          className={`rcol-tab${tab === "hints" ? " active" : ""}`}
          onClick={() => setTab("hints")}
        >
          <Key size={12} /> Hints
          <span className="pill-count">{revealedCount}/{hints.length}</span>
        </button>
        <button
          role="tab"
          aria-selected={tab === "solves"}
          className={`rcol-tab${tab === "solves" ? " active" : ""}`}
          onClick={() => setTab("solves")}
        >
          <Trophy size={12} /> Solves
          <span className="pill-count">{c.solveCount}</span>
        </button>
      </div>

      {/* SCROLL REGION — tabpanel + twin actions + attempts share one scroller */}
      <div className="modal-scroll">
        <div className="rcol-tabpanel">
          {tab === "description" && (
            <div className="desc-block">
              <div style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                {c.description}
              </div>
              <p style={{ marginTop: 16, color: "var(--ict-text-muted)", fontSize: 12 }}>
                <strong style={{ color: "var(--ict-text-dim)" }}>Rules:</strong>{" "}
                no DoS, no attacking infra, no sharing flags. Hints cost points. The flag field is rate-limited.
              </p>
            </div>
          )}

          {tab === "hints" && (
            <HintsList
              hints={hints}
              unlockedHints={unlockedHints}
              unlockingHint={unlockingHint}
              onUnlockHint={onUnlockHint}
            />
          )}

          {tab === "solves" && (
            <SolversList
              competitionId={competitionId}
              challengeId={c.id}
              myTeamId={teamId}
              solveCount={c.solveCount}
              accent={accent}
            />
          )}
        </div>

        {scrollExtras}
      </div>
    </>
  );
}

// ── Hints list ────────────────────────────────────────────────────────────────

function HintsList({
  hints, unlockedHints, unlockingHint, onUnlockHint,
}: {
  hints: { id: string; cost: number; text?: string | null }[];
  unlockedHints: Record<string, string>;
  unlockingHint: string | null;
  onUnlockHint: (id: string) => void;
}) {
  const [confirming, setConfirming] = useState<string | null>(null);

  if (hints.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: "40px 16px", color: "var(--ict-text-muted)" }}>
        <Lightbulb size={28} strokeWidth={1.3} style={{ marginBottom: 10, opacity: 0.4 }} />
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ict-text-dim)" }}>No hints available</div>
        <div style={{ fontSize: 12, marginTop: 4 }}>No hints have been added for this challenge.</div>
      </div>
    );
  }

  return (
    <>
      {hints.map((h, i) => {
        const revealedText = h.text ?? unlockedHints[h.id];
        const isUnlocking  = unlockingHint === h.id;
        const isLocked     = !revealedText;
        const isConfirming = confirming === h.id;

        return (
          <div key={h.id} className={`hint-row${revealedText ? " revealed" : ""}`}>
            <div className="num">{i + 1}</div>
            <div className="body">
              <div className="title-line">
                <span className="title">Hint {i + 1}</span>
                {revealedText
                  ? <span className="cost">−{h.cost} pts</span>
                  : isConfirming
                    ? (
                      <div style={{ display: "flex", gap: 6 }}>
                        <button
                          className="btn btn-primary btn-sm"
                          style={{ padding: "5px 12px", fontSize: 10 }}
                          onClick={() => { setConfirming(null); onUnlockHint(h.id); }}
                        >
                          Confirm
                        </button>
                        <button
                          className="btn btn-ghost btn-sm"
                          style={{ padding: "5px 12px", fontSize: 10 }}
                          onClick={() => setConfirming(null)}
                        >
                          Cancel
                        </button>
                      </div>
                    )
                    : (
                      <button
                        className="reveal-btn"
                        disabled={isUnlocking}
                        onClick={() => setConfirming(h.id)}
                      >
                        {isUnlocking
                          ? <Loader2 size={11} style={{ animation: "spin 1s linear infinite" }} />
                          : <>Reveal −{h.cost} pts</>}
                      </button>
                    )
                }
              </div>
              {revealedText && (
                <p className="txt">{revealedText || "(empty hint)"}</p>
              )}
              {isLocked && isConfirming && (
                <p className="txt" style={{ color: "var(--ict-warn)", fontWeight: 600 }}>
                  Spend {h.cost} pts to unlock this hint for your team?
                </p>
              )}
            </div>
          </div>
        );
      })}
      <p style={{
        fontSize: 11, marginTop: 10, lineHeight: 1.5,
        color: "var(--ict-text-muted)",
      }}>
        Revealing a hint deducts points from this challenge&apos;s value for your team only.
      </p>
    </>
  );
}

// ── Solvers list ──────────────────────────────────────────────────────────────

function SolversList({
  competitionId, challengeId, myTeamId, solveCount, accent,
}: {
  competitionId: string; challengeId: string; myTeamId?: string;
  solveCount: number; accent: string;
}) {
  const [solvers, setSolvers] = useState<CTFChallengeSolverDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetched, setFetched] = useState(false);

  useEffect(() => {
    if (fetched) return;
    setLoading(true);
    getChallengeSolvers(competitionId, challengeId)
      .then(setSolvers).catch(() => {})
      .finally(() => { setLoading(false); setFetched(true); });
  }, [competitionId, challengeId, fetched]);

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", paddingTop: 36 }}>
        <Loader2 size={16} color={accent} style={{ animation: "spin 1s linear infinite" }} />
      </div>
    );
  }

  if (solveCount === 0 || solvers.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: "40px 16px", color: "var(--ict-text-muted)" }}>
        <Trophy size={28} strokeWidth={1.2} style={{ marginBottom: 10, opacity: 0.4 }} />
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ict-text-dim)" }}>No solves yet</div>
        <div style={{ fontSize: 12, marginTop: 4 }}>Be the first team to crack this challenge.</div>
      </div>
    );
  }

  return (
    <div className="solves-list" style={{ maxHeight: "none" }}>
      {solvers.map((s, i) => {
        const rank = i + 1;
        const isMe = myTeamId && s.teamId === myTeamId;
        return (
          <div
            key={s.teamId}
            className={`solve-row${rank <= 3 ? " podium" : ""}${isMe ? " you" : ""}`}
          >
            <span className="rank">#{rank}</span>
            <Link
              href={`/ctf/competitions/${competitionId}/teams/${s.teamId}`}
              style={{
                fontWeight: isMe ? 600 : 400,
                color: "inherit",
                textDecoration: "none",
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                minWidth: 0, flex: 1,
              }}
            >
              {s.teamName}
            </Link>
            {s.bloodPosition === 1 && (
              <span className="badge" style={{ color: "#ef4444", borderColor: "rgba(239,68,68,0.4)", background: "rgba(239,68,68,0.1)", padding: "2px 6px", fontSize: 9 }}>
                First blood{s.bloodBonus ? ` +${s.bloodBonus}` : ""}
              </span>
            )}
            {s.bloodPosition === 2 && (
              <span className="badge" style={{ color: "#94a3b8", borderColor: "rgba(148,163,184,0.4)", background: "rgba(148,163,184,0.1)", padding: "2px 6px", fontSize: 9 }}>
                2nd blood{s.bloodBonus ? ` +${s.bloodBonus}` : ""}
              </span>
            )}
            {s.bloodPosition === 3 && (
              <span className="badge" style={{ color: "#fb923c", borderColor: "rgba(251,146,60,0.4)", background: "rgba(251,146,60,0.1)", padding: "2px 6px", fontSize: 9 }}>
                3rd blood{s.bloodBonus ? ` +${s.bloodBonus}` : ""}
              </span>
            )}
            {s.bloodPosition == null && rank === 1 && (
              <span className="badge" style={{ color: "#ef4444", borderColor: "rgba(239,68,68,0.4)", background: "rgba(239,68,68,0.1)", padding: "2px 6px", fontSize: 9 }}>
                First blood
              </span>
            )}
            {isMe && (
              <span className="badge badge-solved" style={{ padding: "2px 6px", fontSize: 9 }}>You</span>
            )}
            <span className="when">
              {new Date(s.solvedAt).toLocaleString("en-GB", {
                day: "2-digit", month: "short",
                hour: "2-digit", minute: "2-digit",
              })}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ── Submit form ───────────────────────────────────────────────────────────────

function SubmitForm({
  accent, flag, setFlag, busy, subState, result,
  isPaused, lockedOut,
  inputRef, onSubmit,
  attempts, attemptsMax, attemptsRemaining, isUnlimited, points,
}: {
  accent: string;
  flag: string; setFlag: (v: string) => void;
  busy: boolean;
  subState: "idle" | "checking" | "wrong" | "correct";
  result: { correct: boolean; message: string } | null;
  isPaused: boolean; lockedOut: boolean;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onSubmit: () => void;
  attempts: CTFAttemptDTO[];
  attemptsMax: number;
  attemptsRemaining: number | null;
  isUnlimited: boolean;
  points: number;
}) {
  const inputDisabled  = busy || isPaused || lockedOut;
  const submitDisabled = inputDisabled || !flag.trim();

  return (
    <form
      className="submit-wrap"
      onSubmit={(e) => { e.preventDefault(); onSubmit(); }}
    >
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        marginBottom: 2,
      }}>
        <span className="eyebrow">Submit flag</span>
        {!isUnlimited && (
          <span className="attempts-pill">
            <span className="n">{Math.max(0, attemptsRemaining ?? 0)}</span>/{attemptsMax} left
            <span className="attempts-dots">
              {Array.from({ length: attemptsMax }).map((_, i) => (
                <span key={i} className={`attempts-dot${i < attempts.length ? " used" : ""}`} />
              ))}
            </span>
          </span>
        )}
        {isUnlimited && !isPaused && !lockedOut && (
          <span className="attempts-pill" style={{ color: accent }}>
            <InfinityIcon size={12} /> Unlimited attempts
          </span>
        )}
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "stretch" }}>
        <div className="input-with-icon" style={{ flex: 1 }}>
          <span className="icon flag-prefix">&gt;</span>
          <input
            ref={inputRef}
            className="input"
            style={{
              paddingLeft: 36,
              fontFamily: "var(--ict-font-mono)",
              fontSize: 13,
            }}
            placeholder={lockedOut ? "No attempts remaining" : isPaused ? "Submissions paused" : "FLAG{paste_your_flag_here}"}
            value={flag}
            onChange={(e) => setFlag(e.target.value)}
            disabled={inputDisabled}
          />
        </div>
        <button
          type="submit"
          className="btn btn-primary"
          disabled={submitDisabled}
          style={{ flexShrink: 0 }}
        >
          {subState === "checking"
            ? (<><span className="spinner" /> Checking</>)
            : isPaused
              ? (<><Pause size={13} /> Paused</>)
              : lockedOut
                ? "Locked"
                : (<>Capture <Flag size={13} /></>)
          }
        </button>
      </div>

      {(isPaused || lockedOut) && subState === "idle" && (
        <div
          className="toast danger"
          style={{
            justifyContent: "center",
            background: isPaused ? "rgba(245,158,11,0.12)" : "rgba(248,113,113,0.12)",
            borderColor: isPaused ? "rgba(245,158,11,0.4)" : "rgba(248,113,113,0.4)",
            color: isPaused ? "var(--ict-warn)" : "var(--ict-danger)",
          }}
        >
          {isPaused ? <Pause size={13} /> : <AlertCircle size={13} />}
          {isPaused ? "Competition is paused" : "No attempts remaining — you are locked out"}
        </div>
      )}

      {subState === "wrong" && result && (
        <div className="toast danger" style={{ justifyContent: "center" }}>
          <X size={14} /> {result.message || `Incorrect flag · ${attemptsRemaining ?? "?"} attempts left.`}
        </div>
      )}
      {subState === "correct" && (
        <div className="toast success" style={{ justifyContent: "center" }}>
          <Check size={14} /> Captured! +{points} pts awarded.
        </div>
      )}
    </form>
  );
}

// ── Attempt log ───────────────────────────────────────────────────────────────

function AttemptLog({ attempts, newRowIds }: { attempts: CTFAttemptDTO[]; newRowIds: Set<string> }) {
  return (
    <>
      {attempts.slice().reverse().map(a => (
        <div
          key={a.id}
          className={`attempt-row ${a.correct ? "ok" : "fail"}`}
          style={newRowIds.has(a.id) ? { animation: "ict-enter 0.3s ease" } : undefined}
        >
          <span className="status-icon">
            {a.correct ? <Check size={10} strokeWidth={3} /> : <X size={10} strokeWidth={3} />}
          </span>
          <span className="flag">{a.flagMasked}</span>
          <span className="when">{relativeTime(a.submittedAt)}</span>
        </div>
      ))}
    </>
  );
}

// ── Loading skeleton ──────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "20px 24px", gap: 14 }}>
      <div style={{ borderBottom: "1px solid var(--ict-border)", paddingBottom: 14 }}>
        <div className="ict-skel" style={{ height: 12, width: 130, borderRadius: 4, marginBottom: 8 }} />
        <div className="ict-skel" style={{ height: 24, width: "55%", borderRadius: 5, marginBottom: 8 }} />
        <div className="ict-skel" style={{ height: 11, width: 220, borderRadius: 3 }} />
      </div>
      <div style={{ flex: 1 }}>
        {[88, 78, 65, 90, 50].map((w, i) => (
          <div key={i} className="ict-skel" style={{ height: 12, width: `${w}%`, borderRadius: 3, marginBottom: 10 }} />
        ))}
      </div>
      <div style={{ borderTop: "1px solid var(--ict-border)", paddingTop: 14, display: "flex", gap: 8 }}>
        <div className="ict-skel" style={{ flex: 1, height: 42, borderRadius: 6 }} />
        <div className="ict-skel" style={{ width: 140, height: 42, borderRadius: 6 }} />
      </div>
    </div>
  );
}

// ── Unavailable state ─────────────────────────────────────────────────────────

function UnavailableState({ onClose }: { onClose: () => void }) {
  return (
    <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 36 }}>
      <div style={{ textAlign: "center" }}>
        <AlertCircle size={36} color="var(--ict-text-faint)" style={{ marginBottom: 12, opacity: 0.5 }} />
        <div style={{
          fontSize: 16, fontWeight: 700, color: "var(--ict-text)", marginBottom: 6,
          fontFamily: "var(--ict-font-display)",
        }}>
          Challenge unavailable
        </div>
        <div style={{ fontSize: 13, color: "var(--ict-text-muted)", marginBottom: 20 }}>
          It may have been hidden by the organizer.
        </div>
        <button onClick={onClose} className="btn btn-secondary">Close</button>
      </div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60)  return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60)  return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24)  return `${h}h ago`;
  return new Date(iso).toLocaleDateString();
}
