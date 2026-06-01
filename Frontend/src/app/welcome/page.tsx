"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useAuth } from "@/features/auth/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { getCtfCompetitions, type CTFCompetitionDTO } from "@/lib/api";
import {
  ArrowRight, LogOut, Shield, Users, Flag, Trophy, Clock,
} from "lucide-react";
import AmbientBackdrop from "@/features/ctf/shared/AmbientBackdrop";

/* ── Countdown helper ────────────────────────────────────────────── */

function pad2(n: number) { return String(n).padStart(2, "0"); }

function useCountdown(iso: string | null | undefined) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!iso) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [iso]);
  if (!iso) return { hms: "—", d: 0, h: 0, m: 0, s: 0, ms: 0 };
  const ms = Math.max(0, new Date(iso).getTime() - now);
  const total = Math.floor(ms / 1000);
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const hms = d > 0
    ? `${d}:${pad2(h)}:${pad2(m)}:${pad2(s)}`
    : `${pad2(h)}:${pad2(m)}:${pad2(s)}`;
  return { hms, d, h, m, s, ms };
}

function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
  });
}

function fmtDateTime(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  const date = d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  return `${date} · ${time}`;
}

function effectiveEnd(c: CTFCompetitionDTO): string | null {
  if (c.computedEndTime) return c.computedEndTime;
  if (c.endTime)         return c.endTime;
  if (c.startTime && c.durationHours) {
    const ms = new Date(c.startTime).getTime() + c.durationHours * 3_600_000;
    return new Date(ms).toISOString();
  }
  return null;
}

function statusOf(c: CTFCompetitionDTO): "live" | "upcoming" | "ended" {
  if (c.status === "ACTIVE" || c.status === "FROZEN" || c.status === "PAUSED") return "live";
  if (c.status === "ENDED")  return "ended";
  return "upcoming";
}

function StatusBadge({ comp }: { comp: CTFCompetitionDTO }) {
  const s = statusOf(comp);
  if (s === "live")     return <span className="badge badge-live badge-dot">Live</span>;
  if (s === "upcoming") return <span className="badge badge-info badge-dot">Upcoming</span>;
  return <span className="badge">Ended</span>;
}

function MetaRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="label">{label}</div>
      <div className="value">{value}</div>
    </div>
  );
}

/* ── Featured card ────────────────────────────────────────────────── */

function FeaturedCard({ comp, onEnter }: { comp: CTFCompetitionDTO; onEnter: () => void }) {
  const status  = statusOf(comp);
  const isLive  = status === "live";
  const isUp    = status === "upcoming";
  const isEnded = status === "ended";

  const endIso   = effectiveEnd(comp);
  const countIso = isLive ? endIso : isUp ? comp.startTime : null;
  const { hms }  = useCountdown(countIso);

  const myTeam       = comp.myTeam;
  const isRegistered = myTeam != null;
  const memberCount  = myTeam?.members?.length ?? 0;

  return (
    <div className="featured-card">
      <div className="featured-card-bg" />
      <div className="featured-card-content">
        <div>
          <div className="badges-row">
            <StatusBadge comp={comp} />
            <span className="badge badge-cat">CTF · 2026</span>
            {comp.scoringMode && (
              <span className="badge">{comp.scoringMode === "DYNAMIC" ? "Dynamic scoring" : "Static scoring"}</span>
            )}
          </div>
          <h2>{comp.title}</h2>
          {comp.description && <p className="desc">{comp.description}</p>}

          <div className="meta-grid">
            <MetaRow
              label={isUp ? "Starts" : "Started"}
              value={fmtDateTime(comp.startTime)}
            />
            <MetaRow label="Ends" value={fmtDateTime(endIso)} />
            <MetaRow label="Max team size" value={comp.maxTeamSize ?? "—"} />
            <MetaRow label="Visibility" value={comp.visibility?.replace("_", " ") ?? "—"} />

            {isRegistered && (
              <>
                <MetaRow
                  label="Team"
                  value={
                    <span style={{ color: "var(--ict-accent-bright)", fontWeight: 700 }}>
                      {myTeam!.name}
                    </span>
                  }
                />
                <MetaRow
                  label="Score"
                  value={
                    <span style={{
                      fontFamily: "var(--ict-font-mono)", fontWeight: 700,
                      color: "var(--ict-success)",
                    }}>
                      {(myTeam!.totalPoints ?? 0).toLocaleString()} pts
                    </span>
                  }
                />
              </>
            )}
          </div>

          <button className="ict-btn ict-btn-outline ict-btn-lg" onClick={onEnter}>
            {isUp ? "View competition" : "Enter CTF"}
            <ArrowRight size={14} />
          </button>
        </div>

        <aside className="featured-card-side">
          <div className="timer-label">
            {isLive ? "Time remaining" : isUp ? "Starts in" : "Archived"}
          </div>

          <div className="big-timer" style={{ fontVariantNumeric: "tabular-nums" }}>
            {isLive || isUp ? hms : "—"}
          </div>

          <div style={{ height: 1, background: "var(--ict-border)", margin: "4px 0" }} />

          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--ict-text-dim)" }}>
            <span>Status</span>
            <span style={{ fontWeight: 600, color: isLive ? "var(--ict-success)" : isEnded ? "var(--ict-text-muted)" : "var(--ict-accent-bright)" }}>
              {isLive ? "LIVE" : isUp ? "REGISTRATION" : "ENDED"}
            </span>
          </div>

          {comp.maxTeamSize > 0 && (
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--ict-text-dim)" }}>
              <span>Team size</span>
              <span className="mono" style={{ color: "var(--ict-text)" }}>
                {isRegistered
                  ? `${memberCount} / ${comp.maxTeamSize}`
                  : `up to ${comp.maxTeamSize}`}
              </span>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

/* ── Compact comp card row ───────────────────────────────────────── */

function CompCardRow({ comp }: { comp: CTFCompetitionDTO }) {
  const router  = useRouter();
  const status  = statusOf(comp);
  const isLive  = status === "live";
  const isUp    = status === "upcoming";
  const endIso  = effectiveEnd(comp);
  const target  = isLive ? endIso : isUp ? comp.startTime : null;
  const { hms } = useCountdown(target);

  const myTeam      = comp.myTeam;
  const memberCount = myTeam?.members?.length ?? 0;

  return (
    <article
      className={`comp-card ${status}`}
      onClick={() => router.push(`/ctf/competitions/${comp.id}`)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") router.push(`/ctf/competitions/${comp.id}`);
      }}
    >
      <div className={`comp-card-thumb${status === "ended" ? " placeholder" : ""}`}>
        {status === "ended" && <Trophy size={28} />}
      </div>
      <div className="comp-card-info">
        <div className="top">
          <h3>{comp.title}</h3>
          <StatusBadge comp={comp} />
        </div>
        <div className="meta">
          {comp.maxTeamSize > 0 && (
            <span className="item">
              <Users size={12} />
              {myTeam
                ? `${memberCount} / ${comp.maxTeamSize}`
                : `up to ${comp.maxTeamSize}`}
            </span>
          )}
          {comp.startTime && (
            <span className="item"><Clock size={12} /> {fmtDate(comp.startTime)}</span>
          )}
          {comp.scoringMode && (
            <span className="item"><Flag size={12} /> {comp.scoringMode === "DYNAMIC" ? "Dynamic" : "Static"}</span>
          )}
        </div>
      </div>
      <div className="comp-card-cta">
        <span
          className={`countdown-mini ${status === "live" ? "live-pulse" : status === "upcoming" ? "upcoming" : "ended"}`}
          style={{ fontVariantNumeric: "tabular-nums" }}
        >
          {target ? hms : "Closed"}
        </span>
        <span style={{
          fontSize: 10, letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 600,
          color: "var(--ict-text-muted)",
        }}>
          {isLive ? "ends in" : isUp ? "starts in" : "archived"}
        </span>
      </div>
    </article>
  );
}

function SkeletonRows() {
  return (
    <div className="comp-list">
      {[1, 2, 3].map(i => (
        <div key={i} className="comp-card" style={{ pointerEvents: "none" }}>
          <div className="ict-skel" style={{ width: 88, height: 88, borderRadius: 6 }} />
          <div className="comp-card-info">
            <div className="ict-skel" style={{ height: 20, width: "55%", marginBottom: 8 }} />
            <div className="ict-skel" style={{ height: 12, width: "80%" }} />
          </div>
          <div className="comp-card-cta">
            <div className="ict-skel" style={{ height: 14, width: 80, marginBottom: 8 }} />
            <div className="ict-skel" style={{ height: 10, width: 60 }} />
          </div>
        </div>
      ))}
    </div>
  );
}

/* ── Page ─────────────────────────────────────────────────────────── */

export default function WelcomePage() {
  const { isAuthenticated, role, firstName, logout } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isAuthenticated) router.replace("/auth");
  }, [isAuthenticated, router]);

  const { data: competitions, isLoading } = useQuery<CTFCompetitionDTO[]>({
    queryKey: ["ctf-competitions"],
    queryFn:  getCtfCompetitions,
    enabled:  isAuthenticated,
  });

  const all = competitions ?? [];
  const live     = all.filter(c => statusOf(c) === "live");
  const upcoming = all.filter(c => statusOf(c) === "upcoming");
  const ended    = all.filter(c => statusOf(c) === "ended");

  const featured = useMemo(
    () => live[0] ?? upcoming[0] ?? ended[0] ?? null,
    [live, upcoming, ended]
  );

  if (!isAuthenticated) return null;

  const featuredId = featured?.id;
  const others = all.filter(c => c.id !== featuredId);

  return (
    <div className="icode-ctf hub-wrap-ambient">
      <AmbientBackdrop />

      {/* ── Slim translucent nav ── */}
      <nav
        style={{
          position: "sticky", top: 0, zIndex: 50,
          background: "rgba(5,11,29,0.55)",
          backdropFilter: "blur(14px)",
          WebkitBackdropFilter: "blur(14px)",
          borderBottom: "1px solid rgba(96,165,255,0.12)",
        }}
      >
        <div
          style={{
            maxWidth: 1100, margin: "0 auto", padding: "0 24px",
            height: 52, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16,
          }}
        >
          <Link href="/welcome" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
            <Image
              src="/icode-logo.svg"
              alt="iCODE"
              width={26}
              height={26}
              style={{ filter: "drop-shadow(0 0 8px rgba(96,165,255,0.5))" }}
            />
            <span className="logo-wordmark" style={{ fontSize: 16 }}>
              <span className="i">i</span>CODE
              <span style={{
                fontFamily: "var(--ict-font-display)",
                color: "var(--ict-text-muted)", fontSize: 10, marginLeft: 8, letterSpacing: "0.22em",
                fontWeight: 600,
              }}>
                CTF
              </span>
            </span>
          </Link>

          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            {role === "ADMIN" && (
              <Link
                href="/admin"
                className="btn btn-secondary btn-sm"
                style={{
                  color: "var(--ict-warn)",
                  borderColor: "rgba(251,191,36,0.4)",
                  background: "rgba(251,191,36,0.06)",
                  textDecoration: "none",
                }}
              >
                <Shield size={12} /> Admin
              </Link>
            )}

            <span style={{
              fontFamily: "var(--ict-font-display)",
              fontSize: 13, fontWeight: 600,
              letterSpacing: "0.06em",
              color: "var(--ict-accent-bright)",
              textShadow: "0 0 10px rgba(96,165,255,0.35)",
            }}>
              {firstName ?? "Player"}
            </span>

            <button
              onClick={() => { logout(); router.replace("/auth"); }}
              className="icon-btn"
              title="Sign out"
              aria-label="Sign out"
            >
              <LogOut size={14} />
            </button>
          </div>
        </div>
      </nav>

      {/* ── Content ── */}
      <main className="hub-content">
        <div className="hub-greeting">
          Welcome back, <span className="hub-greeting-name">{firstName ?? "Player"}</span>
        </div>

        {isLoading ? (
          <SkeletonRows />
        ) : all.length === 0 ? (
          <div className="hub-empty">
            <Trophy size={40} style={{ margin: "0 auto 12px", color: "var(--ict-text-muted)", opacity: 0.5 }} />
            <div className="hub-empty-title">No competitions yet</div>
            <p style={{ fontSize: 13, color: "var(--ict-text-muted)" }}>
              Check back soon — challenges are on the way.
            </p>
          </div>
        ) : (
          <>
            {featured && (
              <FeaturedCard
                comp={featured}
                onEnter={() => router.push(`/ctf/competitions/${featured.id}`)}
              />
            )}

            {others.length > 0 && (
              <div className="comp-list">
                {others.map(c => <CompCardRow key={c.id} comp={c} />)}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
