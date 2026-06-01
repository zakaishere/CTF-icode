"use client";

import { useEffect, useRef, useState } from "react";
import { Client as StompClient } from "@stomp/stompjs";
import SockJS from "sockjs-client";
import {
  getCtfCompetitionStatus,
  getApiBaseUrl,
  type CTFCompetitionStatus,
  type CTFCompetitionStatusPayload,
  ApiException,
} from "@/lib/api";
import { toast } from "@/components/ui/PSPToast";

const POLL_MS     = 30_000;
const MAX_BACKOFF = 120_000; // 2 minutes max when rate-limited

export interface UseCompetitionStatusResult {
  status:           CTFCompetitionStatus | null;
  payload:          CTFCompetitionStatusPayload | null;
  canEnterArena:    boolean;
  startTime:        string | null;
  endTime:          string | null;
  isPaused:         boolean;
  isFrozen:         boolean;
  refresh:          () => Promise<void>;
}

/**
 * Polls GET /api/ctf/competitions/{id}/status every 30s AND subscribes to the
 * /topic/ctf/{id}/control WebSocket channel for instant updates.
 *
 * On status transitions (e.g. UPCOMING → ACTIVE) it surfaces a toast — callers
 * that need to react beyond the toast (e.g. re-fetch challenges) should watch
 * the returned `status` field.
 */
export function useCompetitionStatus(competitionId: string | undefined): UseCompetitionStatusResult {
  const [payload, setPayload] = useState<CTFCompetitionStatusPayload | null>(null);
  const stompRef       = useRef<StompClient | null>(null);
  const prevStatusRef  = useRef<CTFCompetitionStatus | null>(null);
  const backoffUntilRef = useRef<number>(0); // timestamp: don't poll before this

  const fetchOnce = async () => {
    if (!competitionId) return;
    // Respect backoff window set by a previous 429 response.
    if (Date.now() < backoffUntilRef.current) return;
    try {
      const next = await getCtfCompetitionStatus(competitionId);
      setPayload(next);
      const prev = prevStatusRef.current;
      if (prev && prev !== next.status) {
        notifyTransition(prev, next.status);
      }
      prevStatusRef.current = next.status;
    } catch (err) {
      if (err instanceof ApiException && err.isRateLimited()) {
        // Back off for the server-suggested time (or 60s minimum).
        const waitMs = Math.min(
          ((err.retryAfter ?? 60) + 5) * 1000,
          MAX_BACKOFF,
        );
        backoffUntilRef.current = Date.now() + waitMs;
      }
      // All other errors are silent — endpoint may flake.
    }
  };

  // Initial fetch + 30s poll
  useEffect(() => {
    if (!competitionId) return;
    fetchOnce();
    const id = setInterval(fetchOnce, POLL_MS);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [competitionId]);

  // WebSocket subscription for instant updates
  useEffect(() => {
    if (!competitionId) return;
    const base = getApiBaseUrl();
    const client = new StompClient({
      webSocketFactory: () => new SockJS(`${base}/ws-endpoint`),
      reconnectDelay: 5_000,
      onConnect: () => {
        client.subscribe(`/topic/ctf/${competitionId}/control`, (msg) => {
          try {
            const body = JSON.parse(msg.body) as { event?: string; status?: CTFCompetitionStatusPayload };
            if (body.status) {
              const prev = prevStatusRef.current;
              setPayload(body.status);
              if (prev && prev !== body.status.status) {
                notifyTransition(prev, body.status.status);
              }
              prevStatusRef.current = body.status.status;
            } else {
              // No status payload — re-fetch as a fallback
              fetchOnce();
            }
          } catch {}
        });
      },
    });
    client.activate();
    stompRef.current = client;
    return () => { client.deactivate(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [competitionId]);

  return {
    status:        payload?.status ?? null,
    payload,
    canEnterArena: payload?.canEnterArena ?? false,
    startTime:     payload?.startTime ?? null,
    endTime:       payload?.endTime ?? null,
    isPaused:      payload?.isPaused ?? false,
    isFrozen:      payload?.isFrozen ?? false,
    refresh:       fetchOnce,
  };
}

function notifyTransition(prev: CTFCompetitionStatus, next: CTFCompetitionStatus) {
  if (next === "ACTIVE" && prev === "UPCOMING") {
    toast.success("Competition has started!", "Time to start solving.");
  } else if (next === "PAUSED") {
    toast.info("Competition paused", "Submissions are temporarily disabled.");
  } else if (next === "ACTIVE" && prev === "PAUSED") {
    toast.success("Competition resumed", "You can submit flags again.");
  } else if (next === "FROZEN") {
    toast.info("Scoreboard frozen", "Solving continues but rankings are hidden.");
  } else if (next === "ENDED") {
    toast.info("Competition ended", "Check the final scoreboard.");
  }
}
