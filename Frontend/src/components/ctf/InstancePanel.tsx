"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Client as StompClient } from "@stomp/stompjs";
import SockJS from "sockjs-client";
import { Monitor, ExternalLink, Copy, RefreshCw, Square, AlertCircle, Clock, Loader2, ServerCrash, TimerOff, Terminal, Play } from "lucide-react";
import {
  getCtfInstanceStatus, startCTFInstance, renewCTFInstance, stopCTFInstance,
  getApiBaseUrl,
  type CTFInstanceResponse, type CTFInstanceWebSocketMessage,
} from "@/lib/api";
import { toast } from "@/components/ui/PSPToast";

// Backend uses LocalDateTime (no timezone) — always treat as UTC so the
// countdown is correct regardless of the user's local timezone.
function expiryMs(ts: string): number {
  const s = /[Z+]|\d{2}:\d{2}$/.test(ts) ? ts : ts + "Z";
  return new Date(s).getTime();
}

// ── Constants ─────────────────────────────────────────────────────────────────

// Time-based startup messages — chosen by elapsed seconds since STARTING began,
// so the player gets feedback that matches how long Docker actually takes.
const STARTING_MESSAGES: { until: number; text: string }[] = [
  { until: 10,       text: "Starting container..." },
  { until: 30,       text: "Pulling challenge environment..." },
  { until: 60,       text: "Almost ready..." },
  { until: Infinity, text: "Taking longer than usual — still working..." },
];

function startingMessage(elapsedSeconds: number): string {
  return (STARTING_MESSAGES.find(m => elapsedSeconds < m.until)
    ?? STARTING_MESSAGES[STARTING_MESSAGES.length - 1]).text;
}

// ── Types ─────────────────────────────────────────────────────────────────────

// CHECKING = first status fetch in flight; we don't know yet whether an instance
// exists, so we must NOT show the "Start Instance" button (would be misleading).
type PanelState = "CHECKING" | "IDLE" | "STARTING" | "RUNNING" | "FAILED" | "EXPIRED" | "AT_CAPACITY" | "LIMIT";

export interface InstancePanelProps {
  challengeId:    string;
  challengeTitle: string;
  requiresInstance: boolean;
  /** "HTTP" (default) or "TCP" */
  connectionType?: "HTTP" | "TCP";
  /** Pass to scope the instance to a competition team */
  competitionId?: string;
  teamId?: string;
  /** true = arena dark theme (#0f172a base), false = main theme CSS vars */
  dark?: boolean;
  /**
   * When true, the IDLE state renders as a compact `.twin-action` button
   * (icon + label only, no surrounding card). Used inside the challenge modal
   * so it visually matches the Download File twin. All other states (STARTING,
   * RUNNING, FAILED, EXPIRED, AT_CAPACITY) render as before.
   */
  compactIdle?: boolean;
}

// ── Colour palettes ───────────────────────────────────────────────────────────

const DARK = {
  card:        "rgba(10,20,48,0.55)",
  cardBorder:  "rgba(130,165,255,0.12)",
  text:        "#eaf0ff",
  muted:       "#4a5874",
  secondary:   "#6b7ea3",
  green:       "#34d399",
  red:         "#f87171",
  yellow:      "#fbbf24",
  blue:        "#60a5ff",
  purple:      "#c084fc",
  bg:          "#050b1d",
  codeBg:      "#050b1d",
};

const LIGHT = {
  card:        "var(--bg-secondary)",
  cardBorder:  "var(--border)",
  text:        "var(--text-primary)",
  muted:       "var(--text-muted)",
  secondary:   "var(--text-secondary)",
  green:       "var(--green)",
  red:         "var(--red)",
  yellow:      "var(--orange)",
  blue:        "var(--blue)",
  purple:      "#a78bfa",
  bg:          "var(--bg-primary)",
  codeBg:      "var(--bg-secondary)",
};

// ── Countdown bar ─────────────────────────────────────────────────────────────

function CountdownBar({
  expiresAt, c,
}: { expiresAt: string; c: typeof DARK }) {
  const [remaining, setRemaining] = useState(0);
  const [total, setTotal]         = useState(1);

  useEffect(() => {
    const expMs = expiryMs(expiresAt);
    setTotal(Math.max(1, Math.round((expMs - Date.now()) / 1000)));
    const calc = () => Math.max(0, Math.floor((expMs - Date.now()) / 1000));
    setRemaining(calc());
    const t = setInterval(() => setRemaining(calc()), 1000);
    return () => clearInterval(t);
  }, [expiresAt]);

  const fraction = remaining / total;
  const minutes  = Math.floor(remaining / 60);
  const seconds  = remaining % 60;
  const barColor = remaining < 300 ? c.red
                 : remaining < 600 ? c.yellow
                 : c.green;
  const urgent = remaining < 300 && remaining > 0;

  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{
        display: "flex", justifyContent: "space-between",
        fontSize: 11, color: c.muted, marginBottom: 5,
      }}>
        <span>Expires in</span>
        <span style={{
          color: barColor, fontWeight: 700, fontFamily: "monospace",
          animation: urgent ? "ctf-timer-blink 1s infinite" : undefined,
        }}>
          {minutes}:{String(seconds).padStart(2, "0")}
        </span>
      </div>
      <div style={{
        height: 4, background: c.cardBorder, borderRadius: 2, overflow: "hidden",
      }}>
        <div style={{
          height: "100%", borderRadius: 2,
          width: `${Math.round(fraction * 100)}%`,
          background: barColor,
          transition: "width 1s linear, background 0.5s",
        }} />
      </div>
      {urgent && (
        <div style={{
          marginTop: 5, fontSize: 11, color: c.red, fontWeight: 600,
          display: "flex", alignItems: "center", gap: 4,
          animation: "ctf-timer-blink 1s infinite",
        }}>
          <Clock size={11} /> Expiring soon!
        </div>
      )}
    </div>
  );
}

// ── Animated progress bar (indeterminate) ─────────────────────────────────────

function IndeterminateBar({ c }: { c: typeof DARK }) {
  return (
    <div style={{
      height: 3, background: c.cardBorder, borderRadius: 2,
      overflow: "hidden", marginBottom: 10,
    }}>
      <div style={{
        height: "100%", width: "40%",
        background: c.blue,
        borderRadius: 2,
        animation: "ctf-ticker-scroll 1.6s ease-in-out infinite",
      }} />
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function InstancePanel({
  challengeId, challengeTitle, requiresInstance,
  connectionType: configConnType = "HTTP",
  competitionId, teamId,
  dark = false,
  compactIdle = false,
}: InstancePanelProps) {
  const c = dark ? DARK : LIGHT;

  // Start in CHECKING (when an instance is required) so the IDLE "Start Instance"
  // button never flashes before we've fetched the real status on (re)open.
  const [state, setState]     = useState<PanelState>(requiresInstance ? "CHECKING" : "IDLE");
  const [instance, setInstance] = useState<CTFInstanceResponse | null>(null);
  const [busy, setBusy]       = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [startError, setStartError] = useState<string | null>(null);
  const [copied, setCopied]   = useState(false);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stompRef   = useRef<StompClient | null>(null);
  const instanceId = useRef<string | null>(null);

  // Derive connection type: prefer what the instance reports, fall back to prop
  const connType: "HTTP" | "TCP" =
    (instance?.connectionType as "HTTP" | "TCP" | null) ?? configConnType;
  const connString = instance?.connectionString ?? instance?.accessUrl ?? null;

  const sessionKey = `ctf-instance-${challengeId}${teamId ? `-${teamId}` : ""}`;

  // ── Track elapsed time while STARTING (drives the time-based messages) ─────
  useEffect(() => {
    if (state !== "STARTING") { setElapsed(0); return; }
    const start = Date.now();
    const tick = () => setElapsed(Math.floor((Date.now() - start) / 1000));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [state]);

  // ── Poll status while STARTING (fallback if the WS RUNNING/FAILED is missed),
  // and bound the spinner so it can never hang forever.
  useEffect(() => {
    if (state !== "STARTING") return;
    const started = Date.now();
    const t = setInterval(() => {
      if (Date.now() - started > 180_000) {   // 3 min hard timeout
        setState("FAILED");
        setBusy(false);
        return;
      }
      getCtfInstanceStatus(challengeId, teamId).then(s => {
        if (!s) return;
        instanceId.current = s.instanceId;
        if (s.status === "RUNNING") {
          setInstance(s);
          setState("RUNNING");
          sessionStorage.setItem(sessionKey, s.instanceId);
        } else if (s.status === "FAILED") {
          setState("FAILED");
          setBusy(false);
          sessionStorage.removeItem(sessionKey);
        }
      }).catch(() => { /* transient — keep spinning */ });
    }, 5_000);
    return () => clearInterval(t);
  }, [state, challengeId, teamId, sessionKey]);

  // ── Client-side expiry: flip to EXPIRED the instant the clock runs out, ────
  // without waiting for the backend cleanup job (which can lag up to 60s).
  useEffect(() => {
    if (state !== "RUNNING" || !instance?.expiresAt) return;
    const ms = expiryMs(instance.expiresAt) - Date.now();
    if (ms <= 0) { setState("EXPIRED"); return; }
    const t = setTimeout(() => setState("EXPIRED"), ms);
    return () => clearTimeout(t);
  }, [state, instance?.expiresAt]);

  // ── Fallback reconcile poll while EXPIRED (in case the WS update is missed).
  // Only reverts to RUNNING if the backend genuinely has a non-expired instance
  // (e.g. renewed elsewhere) — never flips back to a stale, already-expired one.
  useEffect(() => {
    if (state !== "EXPIRED") return;
    const t = setInterval(() => {
      getCtfInstanceStatus(challengeId, teamId).then(s => {
        if (s && s.status === "RUNNING" && s.expiresAt &&
            expiryMs(s.expiresAt) > Date.now()) {
          instanceId.current = s.instanceId;
          setInstance(s);
          setState("RUNNING");
        } else if (!s || s.status === "EXPIRED" || s.status === "STOPPED") {
          sessionStorage.removeItem(sessionKey);
        }
      }).catch(() => { /* transient — keep showing EXPIRED */ });
    }, 15_000);
    return () => clearInterval(t);
  }, [state, challengeId, teamId, sessionKey]);

  // ── WebSocket subscription ────────────────────────────────────────────────
  const connectWS = useCallback(() => {
    if (stompRef.current?.connected) return;
    const token = typeof window !== "undefined"
      ? localStorage.getItem("icode_ctf_token") : null;

    const client = new StompClient({
      webSocketFactory: () => new SockJS(`${getApiBaseUrl()}/ws-endpoint`),
      connectHeaders: token ? { Authorization: `Bearer ${token}` } : {},
      reconnectDelay: 5000,
      onConnect: () => {
        client.subscribe("/user/queue/ctf/instance", (frame) => {
          const msg: CTFInstanceWebSocketMessage = JSON.parse(frame.body);
          if (instanceId.current && msg.instanceId !== instanceId.current) return;

          if (msg.status === "RUNNING") {
            const updated: CTFInstanceResponse = {
              instanceId:       msg.instanceId,
              connectionType:   msg.connectionType ?? null,
              connectionString: msg.connectionString ?? null,
              accessUrl:        msg.accessUrl ?? null,
              expiresAt:        msg.expiresAt ?? new Date(Date.now() + 30 * 60 * 1000).toISOString(),
              status:           "RUNNING",
              message:          null,
              renewalCount:     msg.renewalCount ?? 0,
            };
            setInstance(updated);
            setState("RUNNING");
            sessionStorage.setItem(sessionKey, msg.instanceId);
          } else if (msg.status === "FAILED") {
            setState("FAILED");
            setBusy(false);
            sessionStorage.removeItem(sessionKey);
          } else if (msg.status === "EXPIRED") {
            setState("EXPIRED");
            setInstance(null);
            sessionStorage.removeItem(sessionKey);
          }
        });
      },
    });
    client.activate();
    stompRef.current = client;
  }, [sessionKey]);

  // ── On mount: check existing instance ────────────────────────────────────
  useEffect(() => {
    if (!requiresInstance) return;
    connectWS();

    const cachedId = sessionStorage.getItem(sessionKey);
    if (cachedId) instanceId.current = cachedId;

    getCtfInstanceStatus(challengeId, teamId).then(status => {
      if (!status) { setState("IDLE"); return; }
      instanceId.current = status.instanceId;
      setInstance(status);
      if (status.status === "STARTING") {
        setState("STARTING");
      } else if (status.status === "RUNNING") {
        setState("RUNNING");
      } else {
        setState("IDLE");
      }
    }).catch(() => setState("IDLE"));

    return () => {
      stompRef.current?.deactivate();
      stompRef.current = null;
    };
  }, [challengeId, requiresInstance, connectWS, teamId, sessionKey]);

  // ── Actions ───────────────────────────────────────────────────────────────
  const handleStart = async () => {
    setBusy(true);
    setState("STARTING");
    setElapsed(0);
    try {
      const res = await startCTFInstance(challengeId, {
        competitionId: competitionId ?? undefined,
        teamId:        teamId        ?? undefined,
      });
      instanceId.current = res.instanceId;
      sessionStorage.setItem(sessionKey, res.instanceId);
      setInstance(res);
      if (res.status === "RUNNING") setState("RUNNING");
    } catch (err: any) {
      const code   = err?.code ?? "";
      const status = err?.status;
      if (code === "CTF_CAPACITY" || status === 503) {
        setState("AT_CAPACITY");
      } else if (status === 429) {
        // Per-user instance limit (or rate limit) — show the backend's real reason,
        // not a generic "failed to start".
        setStartError(err?.message || "You already have the maximum number of instances running. Stop one before starting another.");
        setState("LIMIT");
      } else {
        setStartError(err?.message || null);
        setState("FAILED");
      }
    }
    setBusy(false);
  };

  const handleRenew = async () => {
    if (!instance) return;
    setBusy(true);
    try {
      const res = await renewCTFInstance(challengeId, instance.instanceId);
      setInstance(res);
      toast.success("Renewed", "Instance extended by 30 minutes.");
    } catch (err: any) {
      toast.error("Renewal failed", err?.message ?? "Try again.");
    }
    setBusy(false);
  };

  const handleStop = async () => {
    if (!instance) return;
    setBusy(true);
    try {
      await stopCTFInstance(challengeId, instance.instanceId);
      setInstance(null);
      setState("IDLE");
      sessionStorage.removeItem(sessionKey);
    } catch { /* handled */ }
    setBusy(false);
  };

  // connString for TCP is stored as "host:port" — split so nc gets separate args.
  const [tcpHost, tcpPort] = (connType === "TCP" && connString?.includes(":"))
    ? connString.split(":")
    : [connString ?? "", ""];
  const ncCommand = connType === "TCP" ? `nc ${tcpHost} ${tcpPort}` : connString ?? "";

  const copyConn = () => {
    if (!connString) return;
    const toCopy = connType === "TCP" ? ncCommand : connString;
    navigator.clipboard.writeText(toCopy);
    setCopied(true);
    toast.success("Copied", toCopy);
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    copyTimerRef.current = setTimeout(() => setCopied(false), 2000);
  };

  // ── Render ────────────────────────────────────────────────────────────────
  if (!requiresInstance) return null;

  const cardStyle: React.CSSProperties = {
    background:   c.card,
    border:       `1px solid ${c.cardBorder}`,
    borderRadius: 8,
    padding:      16,
    marginBottom: 16,
  };

  // First status fetch in flight — show a neutral loader, never the Start button.
  if (state === "CHECKING") {
    if (compactIdle) return (
      <button type="button" className="twin-action" disabled>
        <span className="glyph">
          <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} />
        </span>
        <span className="lbl">
          <span className="title">Checking…</span>
          <span className="sub">instance status</span>
        </span>
      </button>
    );
    return (
      <div style={cardStyle}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Loader2 size={14} color={c.blue} style={{ animation: "spin 1s linear infinite" }} />
          <span style={{ fontSize: 12, color: c.secondary }}>Checking instance status…</span>
        </div>
      </div>
    );
  }

  if (state === "IDLE") {
    // Compact twin-button variant — used inside the challenge modal so the
    // Start Instance button is visually identical to the Download File twin
    // (same shape, same size, same hover/focus/glow — only icon + label differ).
    if (compactIdle) return (
      <button
        type="button"
        className="twin-action"
        onClick={handleStart}
        disabled={busy}
      >
        <span className="glyph">
          {busy
            ? <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} />
            : <Play size={16} />}
        </span>
        <span className="lbl">
          <span className="title">Start Instance</span>
          <span className="sub">{connType} environment</span>
        </span>
      </button>
    );

    return (
    <div style={cardStyle}>
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        marginBottom: 10,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <Monitor size={12} color={c.muted} />
          <span style={{
            fontSize: 10, fontWeight: 700, color: c.muted,
            textTransform: "uppercase", letterSpacing: "0.1em",
          }}>
            Instance
          </span>
        </div>
        <span style={{
          fontSize: 9, fontWeight: 700, padding: "1px 6px", borderRadius: 3,
          background: connType === "TCP" ? "rgba(167,139,250,0.12)" : "rgba(96,165,250,0.1)",
          color: connType === "TCP" ? c.purple : c.blue,
          letterSpacing: "0.06em",
        }}>{connType}</span>
      </div>
      <button
        onClick={handleStart}
        disabled={busy}
        style={{
          width: "100%",
          display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
          background: `linear-gradient(180deg, #3b82f6 0%, #2563eb 100%)`,
          color: "#fff",
          border: "1px solid rgba(96,165,255,0.4)", borderRadius: 6,
          padding: "9px 14px", fontSize: 12.5, fontWeight: 700,
          cursor: "pointer", opacity: busy ? 0.6 : 1,
          letterSpacing: "0.06em",
          boxShadow: "0 0 12px rgba(59,130,246,0.3), 0 0 0 1px rgba(96,165,255,0.3) inset",
          transition: "all 0.15s ease-in-out",
          fontFamily: "'Chakra Petch', system-ui, sans-serif",
          textTransform: "uppercase" as const,
        }}
      >
        {busy
          ? <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} />
          : <>▶ Start Instance</>}
      </button>
    </div>
    );
  }

  if (state === "STARTING") return (
    <div style={cardStyle}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <Loader2 size={14} color={c.blue} style={{ animation: "spin 1s linear infinite" }} />
        <span style={{ fontSize: 13, fontWeight: 700, color: c.text }}>
          Spinning up your environment
        </span>
      </div>
      <IndeterminateBar c={c} />
      {/* URL skeleton shimmer */}
      <div style={{
        height: 32, borderRadius: 5, marginBottom: 10,
        background: `linear-gradient(90deg, ${c.cardBorder} 25%, rgba(255,255,255,0.06) 50%, ${c.cardBorder} 75%)`,
        backgroundSize: "800px 100%",
        animation: "ctf-shimmer 1.6s ease-in-out infinite",
      }} />
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <div style={{ width: 6, height: 6, borderRadius: "50%", background: c.blue, animation: "ctf-pulse-dot 1.2s ease infinite" }} />
        <div style={{ fontSize: 12, color: c.secondary }}>
          {startingMessage(elapsed)}
        </div>
      </div>
      <div style={{ fontSize: 11, color: c.muted, marginTop: 4 }}>
        Usually ready in 5–10 seconds
      </div>
    </div>
  );

  if (state === "RUNNING" && instance) {
    const maxRenewals   = 3;
    const renewsLeft    = maxRenewals - (instance.renewalCount ?? 0);
    const urgentBorder  = instance.expiresAt &&
      (expiryMs(instance.expiresAt) - Date.now()) < 300_000;

    return (
      <div style={{
        ...cardStyle,
        border: `1px solid ${urgentBorder ? c.red : c.cardBorder}`,
        boxShadow: urgentBorder ? `0 0 0 1px ${c.red}40` : undefined,
        animation: urgentBorder ? "ctf-timer-blink 2s infinite" : "ctf-running-in 0.3s cubic-bezier(0.16,1,0.3,1)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <div style={{
            width: 8, height: 8, borderRadius: "50%", background: c.green,
            boxShadow: `0 0 6px ${c.green}`,
            animation: "ctf-pulse-dot 2s infinite",
          }} />
          <span style={{ fontSize: 13, fontWeight: 700, color: c.text }}>
            Instance Running
          </span>
          <span style={{
            fontSize: 10, fontWeight: 600, padding: "2px 6px", borderRadius: 4,
            background: connType === "TCP" ? "rgba(167,139,250,0.15)" : "rgba(96,165,250,0.12)",
            color: connType === "TCP" ? c.purple : c.blue,
          }}>{connType}</span>
        </div>

        {/* Connection row */}
        {connType === "TCP" ? (
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: c.muted, marginBottom: 5 }}>Connect with:</div>
            <div style={{
              display: "flex", alignItems: "center", gap: 6,
              background: c.bg, border: `1px solid ${c.cardBorder}`,
              borderRadius: 5, padding: "6px 10px",
            }}>
              <Terminal size={12} color={c.purple} style={{ flexShrink: 0 }} />
              <code style={{ flex: 1, fontSize: 12, color: c.purple, fontFamily: "monospace", wordBreak: "break-all" }}>
                {ncCommand}
              </code>
              <button
                onClick={copyConn}
                title="Copy command"
                style={{
                  background: "none", border: "none", cursor: "pointer",
                  color: copied ? c.green : c.muted, flexShrink: 0,
                  display: "flex", alignItems: "center", gap: 4,
                  fontSize: 11, fontWeight: copied ? 700 : 400,
                  transition: "color 150ms",
                }}
              >
                {copied ? "Copied!" : <Copy size={13} />}
              </button>
            </div>
          </div>
        ) : (
          <div style={{
            display: "flex", alignItems: "center", gap: 6, marginBottom: 12,
            background: c.bg, border: `1px solid ${c.cardBorder}`,
            borderRadius: 5, padding: "6px 10px",
          }}>
            <code style={{ flex: 1, fontSize: 12, color: c.blue, fontFamily: "monospace", wordBreak: "break-all" }}>
              {connString}
            </code>
            <a
              href={connString ?? "#"}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: c.blue, flexShrink: 0, display: "flex", alignItems: "center" }}
              title="Open in new tab"
            >
              <ExternalLink size={13} />
            </a>
            <button
              onClick={copyConn}
              title="Copy URL"
              style={{
                background: "none", border: "none", cursor: "pointer",
                color: copied ? c.green : c.muted, flexShrink: 0,
                display: "flex", alignItems: "center", gap: 4,
                fontSize: 11, fontWeight: copied ? 700 : 400,
                transition: "color 150ms",
              }}
            >
              {copied ? "Copied!" : <Copy size={13} />}
            </button>
          </div>
        )}

        {/* Countdown */}
        {instance.expiresAt && <CountdownBar expiresAt={instance.expiresAt} c={c} />}

        {/* Actions */}
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={handleRenew}
            disabled={busy || renewsLeft <= 0}
            title={renewsLeft <= 0 ? "Max renewals reached" : `Extend by 30 min (${renewsLeft} left)`}
            style={{
              display: "flex", alignItems: "center", gap: 5,
              background: c.bg, border: `1px solid ${c.cardBorder}`,
              color: renewsLeft <= 0 ? c.muted : c.secondary,
              borderRadius: 5, padding: "6px 12px", fontSize: 12, fontWeight: 600,
              cursor: renewsLeft <= 0 ? "not-allowed" : "pointer",
              opacity: busy ? 0.6 : 1,
            }}
          >
            <RefreshCw size={11} />
            {renewsLeft <= 0 ? "Max renewals" : "Extend 30 min"}
          </button>

          <button
            onClick={handleStop}
            disabled={busy}
            style={{
              display: "flex", alignItems: "center", gap: 5,
              background: "transparent", border: `1px solid ${c.red}50`,
              color: c.red, borderRadius: 5,
              padding: "6px 12px", fontSize: 12, fontWeight: 600,
              cursor: "pointer", opacity: busy ? 0.6 : 1,
            }}
          >
            <Square size={11} />
            Terminate
          </button>
        </div>
      </div>
    );
  }

  if (state === "FAILED") return (
    <div style={{ ...cardStyle, border: `1px solid ${c.red}50` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <ServerCrash size={14} color={c.red} />
        <span style={{ fontSize: 13, fontWeight: 700, color: c.red }}>
          Instance Failed to Start
        </span>
      </div>
      <div style={{ fontSize: 12, color: c.muted, marginBottom: 12 }}>
        {startError || "The challenge environment could not start. Try again."}
      </div>
      <button
        onClick={handleStart}
        disabled={busy}
        style={{
          background: c.bg, border: `1px solid ${c.cardBorder}`,
          color: c.secondary, borderRadius: 5,
          padding: "6px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer",
        }}
      >
        Retry
      </button>
    </div>
  );

  // Per-user instance limit reached — distinct from a start failure: the user
  // simply has too many instances running and must stop one first.
  if (state === "LIMIT") return (
    <div style={{ ...cardStyle, border: `1px solid ${c.yellow}40` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <AlertCircle size={14} color={c.yellow} />
        <span style={{ fontSize: 13, fontWeight: 700, color: c.yellow }}>
          Instance Limit Reached
        </span>
      </div>
      <div style={{ fontSize: 12, color: c.muted, marginBottom: 12 }}>
        {startError || "Stop one of your running instances before starting another."}
      </div>
      <button
        onClick={() => setState("IDLE")}
        disabled={busy}
        style={{
          background: c.bg, border: `1px solid ${c.cardBorder}`,
          color: c.secondary, borderRadius: 5,
          padding: "6px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer",
        }}
      >
        OK
      </button>
    </div>
  );

  if (state === "EXPIRED") return (
    <div style={{ ...cardStyle, border: `1px solid ${c.cardBorder}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <TimerOff size={14} color={c.muted} />
        <span style={{ fontSize: 13, fontWeight: 700, color: c.text }}>
          Instance Expired
        </span>
      </div>
      <div style={{ fontSize: 12, color: c.muted, marginBottom: 12 }}>
        Your environment was cleaned up.
      </div>
      <button
        onClick={handleStart}
        disabled={busy}
        style={{
          display: "flex", alignItems: "center", gap: 6,
          background: c.blue, color: "#fff",
          border: "none", borderRadius: 6,
          padding: "7px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer",
        }}
      >
        Start New Instance
      </button>
    </div>
  );

  if (state === "AT_CAPACITY") return (
    <div style={{ ...cardStyle, border: `1px solid ${c.yellow}40` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <Clock size={14} color={c.yellow} />
        <span style={{ fontSize: 13, fontWeight: 700, color: c.yellow }}>
          Server At Capacity
        </span>
      </div>
      <div style={{ fontSize: 12, color: c.muted, marginBottom: 12 }}>
        All instance slots are in use. Please wait and try again.
      </div>
      <button
        onClick={handleStart}
        disabled={busy}
        style={{
          background: c.bg, border: `1px solid ${c.cardBorder}`,
          color: c.secondary, borderRadius: 5,
          padding: "6px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer",
        }}
      >
        Check Again
      </button>
    </div>
  );

  return null;
}
