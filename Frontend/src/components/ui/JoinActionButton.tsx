"use client";

import { useState } from "react";
import { LoadingButton } from "./LoadingButton";

type VisibilityMode = "REQUEST_BASED" | "ACCESS_CODE" | "PUBLIC_OPEN" | "MODULE_ONLY" | string;
type JoinStatus     = "NONE" | "PENDING" | "APPROVED" | "REJECTED" | "NOT_REQUESTED" | string;
type ItemStatus     = "UPCOMING" | "REGISTRATION_OPEN" | "REGISTRATION" | "OPEN" | "ACTIVE" | "LIVE" | "CLOSED" | "ENDED" | string;
type ItemType       = "EXAM" | "TP" | "COMPETITION";

interface JoinActionButtonProps {
  id:           string;
  type:         ItemType;
  visibility:   VisibilityMode;
  itemStatus:   ItemStatus;
  myJoinStatus: JoinStatus;
  onAction:     (action: string, id: string, extra?: string) => Promise<void> | void;
}

export function JoinActionButton({
  id, type, visibility, itemStatus, myJoinStatus, onAction,
}: JoinActionButtonProps) {
  const [loading,        setLoading]        = useState(false);
  const [showCodeInput,  setShowCodeInput]  = useState(false);
  const [code,           setCode]           = useState("");

  const st  = (itemStatus    || "").toUpperCase();
  const vis = (visibility    || "").toUpperCase();
  const js  = (myJoinStatus  || "NONE").toUpperCase();

  const isEnded    = st === "CLOSED" || st === "ENDED";
  const isActive   = st === "ACTIVE" || st === "LIVE";
  const isReg      = st === "REGISTRATION_OPEN" || st === "REGISTRATION" || st === "OPEN";
  const isApproved = js === "APPROVED";
  const isPending  = js === "PENDING";
  const isRejected = js === "REJECTED";

  const run = async (action: string, extra?: string) => {
    setLoading(true);
    try { await onAction(action, id, extra); }
    finally { setLoading(false); }
  };

  /* ── ENDED / CLOSED ── */
  if (isEnded) {
    return (
      <button onClick={() => onAction("view-results", id)} className="btn btn-secondary btn-sm">
        View Results →
      </button>
    );
  }

  /* ── APPROVED ── */
  if (isApproved) {
    if (isActive) {
      return (
        <button
          onClick={() => onAction("enter", id)}
          className="btn btn-urgent btn-md"
          style={{ minWidth: 160 }}
        >
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: "rgba(255,255,255,0.9)", display: "inline-block", animation: "badge-pulse 1s ease-in-out infinite" }} />
          Enter {type === "COMPETITION" ? "Arena" : "Exam"} Now →
        </button>
      );
    }
    if (isReg) {
      return (
        <button onClick={() => onAction("lobby", id)} className="btn btn-success btn-md">
          ✓ Enter Lobby →
        </button>
      );
    }
    return (
      <button disabled className="btn btn-secondary btn-sm" style={{ opacity: 0.7 }}>
        ✓ Approved — waiting for start
      </button>
    );
  }

  /* ── PENDING ── */
  if (isPending) {
    return (
      <button disabled className="btn btn-secondary btn-sm" style={{ opacity: 0.9 }}>
        <span style={{
          width: 6, height: 6, borderRadius: "50%", background: "#ff8b00",
          display: "inline-block", marginRight: 4,
          animation: "badge-pulse 1.2s ease-in-out infinite",
        }} />
        Request Pending
      </button>
    );
  }

  /* ── REJECTED ── */
  if (isRejected) {
    return (
      <span className="badge badge-red" style={{ padding: "4px 10px" }}>
        ✗ Request Rejected
      </span>
    );
  }

  /* ── NOT JOINED — pick by visibility ── */

  if (vis === "MODULE_ONLY") {
    return (
      <button onClick={() => onAction("enter", id)} className="btn btn-primary btn-md">
        Open →
      </button>
    );
  }

  if (vis === "PUBLIC_OPEN" || vis === "OPEN" || (!vis && type !== "COMPETITION")) {
    return (
      <LoadingButton
        loading={loading}
        loadingText="Registering..."
        variant="primary"
        size="md"
        onClick={() => run("register")}
      >
        Register Now →
      </LoadingButton>
    );
  }

  if (vis === "ACCESS_CODE") {
    if (showCodeInput) {
      return (
        <div className="inline-code-entry">
          <input
            autoFocus
            value={code}
            onChange={e => setCode(e.target.value.toUpperCase().slice(0, 12))}
            onKeyDown={e => {
              if (e.key === "Enter" && code.trim()) run("enter-code", code);
              if (e.key === "Escape") { setShowCodeInput(false); setCode(""); }
            }}
            placeholder="ENTER CODE"
          />
          <LoadingButton
            loading={loading}
            loadingText="Joining..."
            variant="primary"
            size="sm"
            onClick={() => { if (code.trim()) run("enter-code", code); }}
          >
            Join
          </LoadingButton>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => { setShowCodeInput(false); setCode(""); }}
          >
            ✕
          </button>
        </div>
      );
    }
    return (
      <button onClick={() => setShowCodeInput(true)} className="btn btn-secondary btn-md">
        Enter Code →
      </button>
    );
  }

  /* REQUEST_BASED (default fallback) */
  return (
    <LoadingButton
      loading={loading}
      loadingText="Sending..."
      variant="secondary"
      size="md"
      onClick={() => run("request")}
    >
      Request to Join
    </LoadingButton>
  );
}
