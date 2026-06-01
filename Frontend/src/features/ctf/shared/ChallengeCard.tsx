"use client";

import { Check, Flag } from "lucide-react";
import type { CTFCompetitionChallengeDTO } from "@/lib/api";
import { CAT_CONFIG } from "./categoryConfig";

interface Props {
  challenge:   CTFCompetitionChallengeDTO;
  onOpen:      (id: string) => void;
  isNew?:      boolean;
  solvedMeta?: { atIso: string | null; solverName: string | null; pointsAwarded: number | null };
}

const DIFF_CLASS: Record<string, string> = {
  EASY:   "badge-easy",
  MEDIUM: "badge-medium",
  HARD:   "badge-hard",
  INSANE: "badge-insane",
};

export default function ChallengeCard({ challenge: c, onOpen, isNew, solvedMeta }: Props) {
  const conf   = CAT_CONFIG[c.category];
  const accent = conf?.accent ?? "#60a5ff";
  const solved = c.solvedByMe;

  const displayPts = c.currentPoints ?? c.basePoints;

  return (
    <article
      className={`chal-card${solved ? " solved" : ""}`}
      style={{ ["--cat-color" as string]: accent } as React.CSSProperties}
      role="button"
      tabIndex={0}
      onClick={() => onOpen(c.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(c.id);
        }
      }}
    >
      {/* Top row: category + difficulty + solved */}
      <div className="chal-card-top">
        <span className="cat-tag">
          <span className="glyph">{conf?.icon ?? <Flag size={12} />}</span>
          {conf?.label ?? c.category}
        </span>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {isNew && (
            <span
              className="badge"
              style={{
                color: "#c084fc",
                borderColor: "rgba(192,132,252,0.4)",
                background: "rgba(192,132,252,0.1)",
              }}
            >
              NEW
            </span>
          )}
          <span className={`badge ${DIFF_CLASS[c.difficulty] ?? ""}`}>
            {c.difficulty}
          </span>
          {solved && (
            <span className="solved-check" aria-label="Solved">
              <Check size={12} strokeWidth={2.5} />
            </span>
          )}
        </div>
      </div>

      {/* Title + description */}
      <div>
        <h3 className="title">{c.title}</h3>
        {c.description && (
          <p className="desc">{c.description}</p>
        )}
      </div>

      {/* Footer: points + solves */}
      <div className="chal-card-footer">
        <div className="pts">
          {displayPts}
          <span className="unit">PTS</span>
        </div>
        <div className="solves">
          <Flag size={12} />
          {c.solveCount} solve{c.solveCount !== 1 ? "s" : ""}
        </div>
      </div>

      {/* If solved, show the "solved by X · Y ago · +N pts" meta below footer */}
      {solved && solvedMeta && (
        <div
          style={{
            fontFamily: "var(--ict-font-mono)",
            fontSize: 11,
            color: "var(--ict-text-muted)",
            marginTop: -6,
          }}
        >
          Solved
          {solvedMeta.solverName ? ` by ${solvedMeta.solverName}` : ""}
          {solvedMeta.atIso ? ` · ${timeAgo(solvedMeta.atIso)}` : ""}
          {solvedMeta.pointsAwarded !== null ? ` · +${solvedMeta.pointsAwarded} pts` : ""}
        </div>
      )}
    </article>
  );
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000)     return "just now";
  if (ms < 3_600_000)  return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}
