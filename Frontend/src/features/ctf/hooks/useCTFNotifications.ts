"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Client as StompClient } from "@stomp/stompjs";
import SockJS from "sockjs-client";
import {
  getCtfNotifications, getApiBaseUrl,
  ApiException,
  type CTFNotificationDTO,
} from "@/lib/api";
import { playNotificationSound, soundForType } from "@/features/ctf/lib/notificationSound";

const MUTE_KEY = "ctf_sounds_muted";
const MAX_HISTORY = 50;

export interface UseCTFNotificationsResult {
  notifications:  CTFNotificationDTO[];
  unreadCount:    number;
  markAllRead:    () => void;
  isMuted:        boolean;
  toggleMute:     () => void;
  /** Latest unseen toast — UI clears via dismissToast once shown. */
  pendingToasts:  CTFNotificationDTO[];
  dismissToast:   (id: string) => void;
}

interface Props {
  competitionId: string | undefined;
  teamId?:       string | null;
}

/**
 * Core notification plumbing. Wires REST history + WS subscriptions + sound +
 * a toast queue. Survives re-renders by storing the STOMP client in a ref and
 * de-duping incoming notifications by id (the same notification can arrive
 * twice if the broker echoes — once for the competition channel and once for
 * the team channel).
 */
export function useCTFNotifications({ competitionId, teamId }: Props): UseCTFNotificationsResult {
  const [notifications, setNotifications] = useState<CTFNotificationDTO[]>([]);
  const [unreadCount,   setUnread]        = useState(0);
  const [pendingToasts, setPendingToasts] = useState<CTFNotificationDTO[]>([]);
  const [isMuted, setIsMuted] = useState(false);

  const stompRef       = useRef<StompClient | null>(null);
  const interactedRef  = useRef(false);
  const seenIdsRef     = useRef<Set<string>>(new Set());

  // ── Hydrate persisted mute state ───────────────────────────────────────────
  useEffect(() => {
    if (typeof window === "undefined") return;
    setIsMuted(window.localStorage.getItem(MUTE_KEY) === "true");
  }, []);

  // ── First-gesture detection — required to satisfy browser autoplay rules ──
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onFirst = () => { interactedRef.current = true; };
    window.addEventListener("pointerdown", onFirst, { once: true });
    window.addEventListener("keydown",     onFirst, { once: true });
    return () => {
      window.removeEventListener("pointerdown", onFirst);
      window.removeEventListener("keydown",     onFirst);
    };
  }, []);

  const ingest = useCallback((n: CTFNotificationDTO, opts: { silent?: boolean } = {}) => {
    if (seenIdsRef.current.has(n.id)) return;
    seenIdsRef.current.add(n.id);

    setNotifications(prev => {
      const next = [n, ...prev];
      if (next.length > MAX_HISTORY) next.length = MAX_HISTORY;
      return next;
    });

    if (!opts.silent) {
      setUnread(c => c + 1);
      setPendingToasts(p => [n, ...p]);
      const kind = soundForType(n.type);
      if (kind) {
        void playNotificationSound(kind, {
          muted: isMuted,
          hasInteracted: interactedRef.current,
        });
      }
    }
  }, [isMuted]);

  // ── Initial fetch of history ───────────────────────────────────────────────
  useEffect(() => {
    if (!competitionId) return;
    let cancelled = false;
    getCtfNotifications(competitionId).then(list => {
      if (cancelled) return;
      // Backfill silently — these are history entries, not new events.
      // Mark them all as seen so a follow-up WS push doesn't re-toast them.
      list.forEach(n => seenIdsRef.current.add(n.id));
      setNotifications(list);
    }).catch((err) => {
      // Rate-limited on history fetch — not critical; WS will deliver live events.
      // Any other error is also silent — notifications history is non-critical.
      if (err instanceof ApiException && err.isRateLimited()) return;
      // silence all others too
    });
    return () => { cancelled = true; };
  }, [competitionId]);

  // ── STOMP subscription to the competition + (optionally) team channel ─────
  useEffect(() => {
    if (!competitionId) return;
    const base = getApiBaseUrl();
    const client = new StompClient({
      webSocketFactory: () => new SockJS(`${base}/ws-endpoint`),
      reconnectDelay: 5_000,
      onConnect: () => {
        client.subscribe(`/topic/ctf/${competitionId}/notifications`, msg => {
          try { ingest(JSON.parse(msg.body) as CTFNotificationDTO); } catch {}
        });
        if (teamId) {
          client.subscribe(`/topic/ctf/team/${teamId}/notifications`, msg => {
            try { ingest(JSON.parse(msg.body) as CTFNotificationDTO); } catch {}
          });
        }
      },
    });
    client.activate();
    stompRef.current = client;
    return () => {
      void client.deactivate();
      stompRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [competitionId, teamId]);

  const markAllRead = useCallback(() => setUnread(0), []);

  const toggleMute = useCallback(() => {
    setIsMuted(prev => {
      const next = !prev;
      if (typeof window !== "undefined") {
        window.localStorage.setItem(MUTE_KEY, String(next));
      }
      return next;
    });
  }, []);

  const dismissToast = useCallback((id: string) => {
    setPendingToasts(p => p.filter(t => t.id !== id));
  }, []);

  return {
    notifications,
    unreadCount,
    markAllRead,
    isMuted,
    toggleMute,
    pendingToasts,
    dismissToast,
  };
}
