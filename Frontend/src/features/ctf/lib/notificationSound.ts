"use client";

import type { CTFNotificationType } from "@/lib/api";

/**
 * Sound layer for CTF notifications. Two modes:
 *   1. Attempt to load + play an MP3 from /public/sounds/ctf/.
 *   2. If the file 404s, synthesize a tone with Web Audio API.
 *
 * Sounds only ever play after the user has clicked at least once in the
 * document — browser autoplay policies reject before that. The `hasInteracted`
 * gate is wired up from the hook by listening for a one-time pointerdown.
 */

type SoundKind = "notify" | "new-challenge" | "warning" | "solve" | "disqualify";

const FILES: Record<SoundKind, string> = {
  "notify":        "/sounds/ctf/notify.mp3",
  "new-challenge": "/sounds/ctf/new-challenge.mp3",
  "warning":       "/sounds/ctf/warning.mp3",
  "solve":         "/sounds/ctf/solve.mp3",
  "disqualify":    "/sounds/ctf/warning.mp3",
};

// Each audio element is reused so we don't leak elements across re-renders.
const audioCache = new Map<SoundKind, HTMLAudioElement | "MISSING">();

let audioCtx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (audioCtx) return audioCtx;
  const Ctor: typeof AudioContext | undefined =
    (window as unknown as { AudioContext?: typeof AudioContext }).AudioContext
    ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  audioCtx = new Ctor();
  return audioCtx;
}

/**
 * Maps notification type → sound kind. The categorization is opinionated:
 *  - state changes (paused / ending) use "warning"
 *  - new challenge gets its own distinct sound
 *  - everything else uses the general chime
 */
export function soundForType(type: CTFNotificationType): SoundKind | null {
  switch (type) {
    case "NEW_CHALLENGE":          return "new-challenge";
    case "COMPETITION_PAUSED":     return "warning";
    case "COMPETITION_ENDING_SOON":return "warning";
    case "COMPETITION_ENDED":      return "warning";
    case "TEAM_DISQUALIFIED":      return "disqualify";
    case "COMPETITION_RESUMED":
    case "SCOREBOARD_FROZEN":
    case "SCOREBOARD_UNFROZEN":
    case "HINT_ADDED":
    case "CHALLENGE_UPDATED":
    case "CUSTOM":
      return "notify";
    case "COMPETITION_STARTED":
      return "notify";
    default:
      return null;
  }
}

export interface PlayOptions {
  muted: boolean;
  hasInteracted: boolean;
}

export async function playNotificationSound(kind: SoundKind, opts: PlayOptions): Promise<void> {
  if (opts.muted || !opts.hasInteracted) return;
  if (typeof document !== "undefined" && document.hidden) return;

  // Try the MP3 first.
  const cached = audioCache.get(kind);
  if (cached === "MISSING") {
    playFallbackTone(kind);
    return;
  }
  let el = cached as HTMLAudioElement | undefined;
  if (!el) {
    el = new Audio(FILES[kind]);
    el.preload = "auto";
    el.volume  = 0.5;
    audioCache.set(kind, el);
  }
  try {
    el.currentTime = 0;
    await el.play();
  } catch {
    // Most likely the file is missing or the browser blocked playback.
    audioCache.set(kind, "MISSING");
    playFallbackTone(kind);
  }
}

/** Web Audio fallback — synthesizes a brief tone with shape that fits the kind. */
function playFallbackTone(kind: SoundKind) {
  const ctx = getCtx();
  if (!ctx) return;
  if (ctx.state === "suspended") {
    // Resuming requires a user gesture; this call may fail silently otherwise.
    void ctx.resume();
  }

  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain).connect(ctx.destination);

  switch (kind) {
    case "notify": {
      osc.type = "sine";
      osc.frequency.setValueAtTime(880, now);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.18, now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.1);
      osc.start(now);
      osc.stop(now + 0.12);
      return;
    }
    case "new-challenge": {
      osc.type = "sine";
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.3);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.2, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.3);
      osc.start(now);
      osc.stop(now + 0.35);
      return;
    }
    case "warning":
    case "disqualify": {
      osc.type = "square";
      osc.frequency.setValueAtTime(330, now);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.15, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.5);
      osc.start(now);
      osc.stop(now + 0.55);
      return;
    }
    case "solve": {
      osc.type = "triangle";
      osc.frequency.setValueAtTime(523, now);            // C5
      osc.frequency.setValueAtTime(659, now + 0.08);     // E5
      osc.frequency.setValueAtTime(784, now + 0.16);     // G5
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.2, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.3);
      osc.start(now);
      osc.stop(now + 0.35);
      return;
    }
  }
}
