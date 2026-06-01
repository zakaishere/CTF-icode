"use client";

import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
} from "react";
import { Client as StompClient } from "@stomp/stompjs";
import SockJS from "sockjs-client";
import {
  getCtfCompetition, getCtfMyTeam, getCtfScoreboard, getApiBaseUrl,
  type CTFCompetitionDTO, type CTFCompetitionStatus, type CTFTeamResponse,
  type CTFScoreboardEntryDTO,
} from "@/lib/api";
import { useCompetitionStatus } from "@/features/ctf/hooks/useCompetitionStatus";
import { useCTFNotifications } from "@/features/ctf/hooks/useCTFNotifications";
import type { CTFNotificationDTO } from "@/lib/api";

interface CTFContextValue {
  competition: CTFCompetitionDTO | null;
  myTeam:      CTFTeamResponse | null;
  status:      CTFCompetitionStatus | null;
  isPaused:    boolean;
  isFrozen:    boolean;
  /** True when status === ACTIVE and not paused — flag submission is allowed. */
  canSolve:    boolean;
  loading:     boolean;
  refetchStatus: () => void;
  refetchTeam:   () => Promise<void>;

  // Notifications surface — sourced from useCTFNotifications. Exposed here so
  // both the shell (bell/mute toggle) and individual pages (history list,
  // toast renderer) can read the same instance instead of mounting it twice.
  notifications: CTFNotificationDTO[];
  unreadCount:   number;
  markAllRead:   () => void;
  isMuted:       boolean;
  toggleMute:    () => void;
  pendingToasts: CTFNotificationDTO[];
  dismissToast:  (id: string) => void;

  // Cross-page challenge modal. The challenge sheet is intentionally NOT a
  // route — keeping it in context preserves the URL and the browser back
  // button. Any page can call openChallenge(id).
  selectedChallengeId: string | null;
  openChallenge:  (id: string) => void;
  closeChallenge: () => void;
}

const CTFCompetitionContext = createContext<CTFContextValue | null>(null);

export function useCTFCompetition(): CTFContextValue {
  const ctx = useContext(CTFCompetitionContext);
  if (!ctx) throw new Error("useCTFCompetition must be used inside CTFCompetitionProvider.");
  return ctx;
}

export function CTFCompetitionProvider({
  competitionId, children,
}: { competitionId: string; children: React.ReactNode }) {
  const [competition, setCompetition] = useState<CTFCompetitionDTO | null>(null);
  const [myTeam, setMyTeam]           = useState<CTFTeamResponse | null>(null);
  const [loading, setLoading]         = useState(true);
  const [selectedChallengeId, setSelected] = useState<string | null>(null);

  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  // Live status — already polls + subscribes to /topic/ctf/{id}/control.
  const statusHook = useCompetitionStatus(competitionId);

  // Notifications — single mount lives here so all pages share state.
  const notif = useCTFNotifications({
    competitionId,
    teamId: myTeam?.id ?? null,
  });

  const refetchStatus = useCallback(() => {
    getCtfCompetition(competitionId).then(c => {
      if (mountedRef.current) setCompetition(c);
    }).catch(() => { /* silent */ });
  }, [competitionId]);

  const refetchTeam = useCallback(async () => {
    try {
      const t = await getCtfMyTeam(competitionId);
      if (!mountedRef.current) return;
      // apiClient turns ResponseEntity.ok(null) into {}; treat shape without id as no team.
      setMyTeam(t && t.id ? t : null);
    } catch {
      if (mountedRef.current) setMyTeam(null);
    }
  }, [competitionId]);

  // Initial fetch.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      getCtfCompetition(competitionId),
      getCtfMyTeam(competitionId).catch(() => null),
    ]).then(async ([c, t]) => {
      if (cancelled) return;
      let resolvedTeam: CTFTeamResponse | null = t && t.id ? t : null;
      // When the competition is frozen, show the team's frozen score in the navbar
      // so players cannot infer score movement while the freeze is active.
      if (c?.isFrozen && resolvedTeam) {
        const entries = await getCtfScoreboard(competitionId).catch((): CTFScoreboardEntryDTO[] => []);
        const entry = entries.find(e => e.teamId === resolvedTeam!.id);
        if (entry) {
          resolvedTeam = { ...resolvedTeam, totalPoints: entry.totalPoints, solveCount: entry.solveCount };
        }
      }
      setCompetition(c);
      setMyTeam(resolvedTeam);
    }).catch(() => { /* surfaced by apiClient */ })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [competitionId]);

  // When the live status hook reports a transition, refetch the full
  // competition DTO so banners + canSolve update right away.
  useEffect(() => {
    if (!statusHook.status || !competition) return;
    if (statusHook.status !== competition.status) refetchStatus();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusHook.status]);

  // Keep a stable ref to myTeam.id so the scoreboard handler can read it
  // without being re-created every time myTeam changes.
  const myTeamIdRef = useRef<string | null>(null);
  useEffect(() => { myTeamIdRef.current = myTeam?.id ?? null; }, [myTeam?.id]);

  // Subscribe to scoreboard events and keep myTeam.totalPoints / solveCount live.
  useEffect(() => {
    const base = getApiBaseUrl();
    const client = new StompClient({
      webSocketFactory: () => new SockJS(`${base}/ws-endpoint`),
      reconnectDelay: 5_000,
      onConnect: () => {
        client.subscribe(`/topic/ctf/competitions/${competitionId}/scoreboard`, () => {
          const teamId = myTeamIdRef.current;
          if (!teamId) return;
          getCtfScoreboard(competitionId).then(entries => {
            if (!mountedRef.current) return;
            const entry = entries.find(e => e.teamId === teamId);
            if (!entry) return;
            setMyTeam(prev => prev ? {
              ...prev,
              totalPoints: entry.totalPoints,
              solveCount:  entry.solveCount,
            } : prev);
          }).catch(() => {});
        });
      },
    });
    client.activate();
    return () => { client.deactivate(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [competitionId]);

  const status = statusHook.status ?? competition?.status ?? null;
  const isPaused = statusHook.isPaused || competition?.isPaused || false;
  const isFrozen = statusHook.isFrozen || competition?.isFrozen || false;
  // FROZEN is a display-only feature: solving must remain open.
  // computeStatus() returns "FROZEN" (not "ACTIVE") when frozen, so we must
  // explicitly include it here, otherwise canSolve=false blocks all submissions.
  const canSolve = (status === "ACTIVE" || status === "FROZEN") && !isPaused;

  const openChallenge  = useCallback((id: string) => setSelected(id), []);
  const closeChallenge = useCallback(() => setSelected(null), []);

  const value: CTFContextValue = useMemo(() => ({
    competition, myTeam, status,
    isPaused, isFrozen, canSolve,
    loading,
    refetchStatus, refetchTeam,
    notifications: notif.notifications,
    unreadCount:   notif.unreadCount,
    markAllRead:   notif.markAllRead,
    isMuted:       notif.isMuted,
    toggleMute:    notif.toggleMute,
    pendingToasts: notif.pendingToasts,
    dismissToast:  notif.dismissToast,
    selectedChallengeId, openChallenge, closeChallenge,
  }), [
    competition, myTeam, status, isPaused, isFrozen, canSolve, loading,
    refetchStatus, refetchTeam,
    notif.notifications, notif.unreadCount, notif.markAllRead,
    notif.isMuted, notif.toggleMute, notif.pendingToasts, notif.dismissToast,
    selectedChallengeId, openChallenge, closeChallenge,
  ]);

  return (
    <CTFCompetitionContext.Provider value={value}>
      {children}
    </CTFCompetitionContext.Provider>
  );
}
