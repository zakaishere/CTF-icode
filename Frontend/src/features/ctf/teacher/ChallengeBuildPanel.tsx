"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Client as StompClient } from "@stomp/stompjs";
import SockJS from "sockjs-client";
import {
  Upload, Server, CheckCircle, XCircle, Loader2, FileArchive,
  Eye, EyeOff, AlertCircle, UploadCloud, Clock,
} from "lucide-react";
import {
  uploadCTFChallengeZip,
  setCTFChallengeRegistry,
  getCTFChallengeBuildStatus,
  getCTFChallengeBuildLog,
  getApiBaseUrl,
  type CTFChallengeBuildDTO,
  type CTFBuildWebSocketMessage,
} from "@/lib/api";
import { toast } from "@/components/ui/PSPToast";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ChallengeBuildPanelProps {
  challengeId: string;
  initialBuild?: CTFChallengeBuildDTO | null;
  onBuildReady: (imageTag: string, detectedPort?: number) => void;
}

type ActiveTab = "zip" | "registry";

// ── Colors ────────────────────────────────────────────────────────────────────

const C = {
  bg:       "#050b1d",
  surface:  "rgba(10,20,48,0.6)",
  surface2: "rgba(22,38,78,0.5)",
  border:   "rgba(130,165,255,0.15)",
  text:     "#eaf0ff",
  muted:    "#4a5874",
  secondary:"#6b7ea3",
  green:    "#34d399",
  red:      "#f87171",
  blue:     "#60a5ff",
  purple:   "#a78bfa",
  yellow:   "#fbbf24",
};

// ── Main component ────────────────────────────────────────────────────────────

export default function ChallengeBuildPanel({
  challengeId,
  initialBuild,
  onBuildReady,
}: ChallengeBuildPanelProps) {
  const [activeTab, setActiveTab]         = useState<ActiveTab>("zip");
  const [dragOver, setDragOver]           = useState(false);
  const [selectedFile, setSelectedFile]   = useState<File | null>(null);
  const [registryUrl, setRegistryUrl]     = useState("");
  const [build, setBuild]                 = useState<CTFChallengeBuildDTO | null>(initialBuild ?? null);
  const [uploading, setUploading]         = useState(false);
  const [uploadPct, setUploadPct]         = useState<number>(0);
  const [uploadDone, setUploadDone]       = useState(false); // true between xhr complete and first WS status
  const [showLog, setShowLog]             = useState(false);
  const [buildLog, setBuildLog]           = useState<string | null>(null);
  const [loadingLog, setLoadingLog]       = useState(false);

  const stompRef    = useRef<StompClient | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const isInProgress = (b: CTFChallengeBuildDTO | null) =>
    b?.buildStatus === "BUILDING" || b?.buildStatus === "PULLING" || b?.buildStatus === "PENDING";

  // ── WebSocket subscription ─────────────────────────────────────────────────

  const subscribeToWs = useCallback(() => {
    if (stompRef.current?.connected) return;

    const token = typeof window !== "undefined"
      ? localStorage.getItem("icode_ctf_token")
      : null;

    const client = new StompClient({
      webSocketFactory: () =>
        new SockJS(`${getApiBaseUrl()}/ws-endpoint`) as WebSocket,
      connectHeaders: token ? { Authorization: `Bearer ${token}` } : {},
      reconnectDelay: 5000,
      onConnect: () => {
        client.subscribe("/user/queue/ctf/build", (frame) => {
          try {
            const msg: CTFBuildWebSocketMessage = JSON.parse(frame.body);
            if (msg.challengeId !== challengeId) return;

            setUploadDone(false); // WS message arrived — clear the "queued" overlay
            setBuild((prev) => {
              if (!prev) return prev;
              return {
                ...prev,
                buildStatus: msg.status,
                builtImageTag: msg.imageTag ?? prev.builtImageTag,
                imageSizeMb: msg.imageSizeMb ?? prev.imageSizeMb,
                errorMessage: msg.error ?? prev.errorMessage,
              };
            });

            if (msg.status === "READY" && msg.imageTag) {
              onBuildReady(msg.imageTag, msg.detectedPort ?? undefined);
              const portNote = msg.detectedPort ? ` · port ${msg.detectedPort} auto-detected` : "";
              toast.success("Image ready", msg.imageTag + portNote);
              client.deactivate();
            } else if (msg.status === "FAILED") {
              toast.error("Build failed", msg.error ?? "Unknown error");
              client.deactivate();
            }
          } catch {
            // ignore malformed frames
          }
        });
      },
    });

    client.activate();
    stompRef.current = client;
  }, [challengeId, onBuildReady]);

  // Subscribe if a build is already in progress when the panel mounts
  useEffect(() => {
    if (isInProgress(build)) subscribeToWs();
    return () => { stompRef.current?.deactivate(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── File drag / drop ───────────────────────────────────────────────────────

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    if (uploading) return;
    const f = e.dataTransfer.files[0];
    if (f && f.name.toLowerCase().endsWith(".zip")) {
      setSelectedFile(f);
    } else {
      toast.error("Invalid file", "Only .zip files are accepted.");
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (!uploading) setDragOver(true);
  };

  const handleDragLeave = () => setDragOver(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) setSelectedFile(f);
  };

  // ── Upload ─────────────────────────────────────────────────────────────────

  const handleUpload = async () => {
    if (!selectedFile) {
      toast.error("No file selected", "Please select a .zip file.");
      return;
    }
    setUploading(true);
    setUploadPct(0);
    setUploadDone(false);
    try {
      await uploadCTFChallengeZip("", challengeId, selectedFile, (pct) => setUploadPct(pct));
      setUploadPct(100);
      setUploadDone(true);
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";

      const freshBuild = await getCTFChallengeBuildStatus(challengeId);
      setBuild(freshBuild);
      subscribeToWs();
      toast.success("ZIP uploaded", "Build has been queued — watch the status below.");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Upload failed.";
      toast.error("Upload failed", msg);
      setUploadDone(false);
    } finally {
      setUploading(false);
    }
  };

  // ── Registry pull ──────────────────────────────────────────────────────────

  const handleRegistryPull = async () => {
    if (!registryUrl.trim()) {
      toast.error("Registry URL required", "Enter a valid image reference.");
      return;
    }
    setUploading(true);
    try {
      await setCTFChallengeRegistry(challengeId, registryUrl.trim());
      const freshBuild = await getCTFChallengeBuildStatus(challengeId);
      setBuild(freshBuild);
      subscribeToWs();
      toast.success("Pull started", registryUrl.trim());
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to start pull.";
      toast.error("Pull failed", msg);
    } finally {
      setUploading(false);
    }
  };

  // ── Build log ──────────────────────────────────────────────────────────────

  const toggleLog = async () => {
    if (showLog) { setShowLog(false); return; }
    setLoadingLog(true);
    try {
      const log = await getCTFChallengeBuildLog(challengeId);
      setBuildLog(typeof log === "string" ? log : JSON.stringify(log));
      setShowLog(true);
    } catch {
      toast.error("Could not load log", "Try again.");
    } finally {
      setLoadingLog(false);
    }
  };

  // ── Derived ────────────────────────────────────────────────────────────────

  const dropZoneClickable = !uploading;
  const uploadButtonDisabled = uploading || !selectedFile || isInProgress(build);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{
      border: `1px solid ${C.border}`,
      borderRadius: 10,
      background: C.surface,
      overflow: "hidden",
      marginTop: 8,
    }}>

      {/* Tab strip */}
      <div style={{ display: "flex", borderBottom: `1px solid ${C.border}`, background: C.surface2 }}>
        {(["zip", "registry"] as ActiveTab[]).map((t) => {
          const active = activeTab === t;
          return (
            <button
              key={t}
              type="button"
              onClick={() => setActiveTab(t)}
              style={{
                flex: 1,
                padding: "10px 16px",
                background: "transparent",
                border: "none",
                borderBottom: `2px solid ${active ? C.purple : "transparent"}`,
                color: active ? C.text : C.muted,
                cursor: "pointer",
                fontSize: 13,
                fontWeight: 600,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                marginBottom: -1,
              }}
            >
              {t === "zip" ? <FileArchive size={13} /> : <Server size={13} />}
              {t === "zip" ? "Upload ZIP" : "Registry URL"}
            </button>
          );
        })}
      </div>

      <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>

        {/* ZIP tab */}
        {activeTab === "zip" && (
          <div>
            {/* Drop zone */}
            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onClick={() => dropZoneClickable && fileInputRef.current?.click()}
              style={{
                border: `2px dashed ${dragOver ? C.purple : uploading ? C.blue : C.border}`,
                borderRadius: 8,
                padding: "24px 16px",
                textAlign: "center",
                cursor: dropZoneClickable ? "pointer" : "default",
                background: dragOver
                  ? "rgba(167,139,250,0.06)"
                  : uploading
                    ? "rgba(99,102,241,0.04)"
                    : "transparent",
                transition: "all 0.15s ease",
                position: "relative",
                overflow: "hidden",
              }}
            >
              {uploading ? (
                /* ── Uploading state ── */
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
                  <Loader2 size={28} color={C.blue} style={{ animation: "spin 1s linear infinite" }} />
                  <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>
                    Uploading {selectedFile?.name}
                  </div>
                  <div style={{ fontSize: 11, color: C.secondary }}>
                    {uploadPct < 100
                      ? `${uploadPct}% uploaded — do not close this tab`
                      : "Upload complete, queuing build…"}
                  </div>
                  {/* Progress bar */}
                  <div style={{
                    width: "100%",
                    height: 6,
                    background: C.surface2,
                    borderRadius: 3,
                    overflow: "hidden",
                    marginTop: 4,
                  }}>
                    <div style={{
                      height: "100%",
                      width: `${uploadPct}%`,
                      background: uploadPct < 100
                        ? `linear-gradient(90deg, ${C.blue}, ${C.purple})`
                        : C.green,
                      borderRadius: 3,
                      transition: "width 0.3s ease, background 0.3s ease",
                    }} />
                  </div>
                  <div style={{ fontSize: 11, color: C.muted }}>
                    {uploadPct}% · {selectedFile ? (selectedFile.size / (1024 * 1024)).toFixed(1) : 0} MB
                  </div>
                </div>
              ) : selectedFile ? (
                /* ── File selected, ready to upload ── */
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                  <FileArchive size={28} color={C.purple} />
                  <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>
                    {selectedFile.name}
                  </div>
                  <div style={{ fontSize: 11, color: C.muted }}>
                    {(selectedFile.size / (1024 * 1024)).toFixed(1)} MB · Click &quot;Build from ZIP&quot; to upload
                  </div>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setSelectedFile(null); if (fileInputRef.current) fileInputRef.current.value = ""; }}
                    style={{
                      marginTop: 2,
                      padding: "3px 10px",
                      fontSize: 11,
                      borderRadius: 4,
                      border: `1px solid ${C.border}`,
                      background: "transparent",
                      color: C.muted,
                      cursor: "pointer",
                    }}
                  >
                    Clear
                  </button>
                </div>
              ) : (
                /* ── Idle ── */
                <>
                  <UploadCloud size={32} color={dragOver ? C.purple : C.muted} style={{ marginBottom: 10 }} />
                  <div style={{ fontSize: 13, color: C.secondary, fontWeight: 600 }}>
                    Drop a .zip file here, or click to browse
                  </div>
                  <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>
                    The ZIP must contain a Dockerfile. Max 100 MB.
                  </div>
                </>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept=".zip"
                style={{ display: "none" }}
                onChange={handleFileChange}
              />
            </div>

            <button
              type="button"
              onClick={handleUpload}
              disabled={uploadButtonDisabled}
              style={{
                marginTop: 10,
                width: "100%",
                padding: "10px 16px",
                borderRadius: 7,
                border: "none",
                background: uploadButtonDisabled ? C.surface2 : C.purple,
                color: uploadButtonDisabled ? C.muted : "#fff",
                cursor: uploadButtonDisabled ? "not-allowed" : "pointer",
                fontWeight: 600,
                fontSize: 13,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 7,
              }}
            >
              {uploading ? (
                <><Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} />
                  {uploadPct < 100 ? `Uploading… ${uploadPct}%` : "Queuing build…"}
                </>
              ) : (
                <><Upload size={14} /> {build?.buildStatus === "READY" ? "Upload New Version" : "Build from ZIP"}</>
              )}
            </button>
          </div>
        )}

        {/* Registry tab */}
        {activeTab === "registry" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div>
              <label style={{
                display: "block",
                fontSize: 11,
                fontWeight: 600,
                color: C.secondary,
                marginBottom: 5,
              }}>
                Registry image reference
              </label>
              <input
                type="text"
                value={registryUrl}
                onChange={(e) => setRegistryUrl(e.target.value)}
                placeholder="registry.example.com/my-challenge:latest"
                style={{
                  width: "100%",
                  padding: "9px 12px",
                  borderRadius: 6,
                  border: `1px solid ${C.border}`,
                  background: C.surface2,
                  color: C.text,
                  fontSize: 13,
                  fontFamily: "ui-monospace, monospace",
                  boxSizing: "border-box",
                }}
              />
              <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>
                The server will pull this image. Ensure it is accessible from the server.
              </div>
            </div>
            <button
              type="button"
              onClick={handleRegistryPull}
              disabled={uploading || !registryUrl.trim() || isInProgress(build)}
              style={{
                padding: "10px 16px",
                borderRadius: 7,
                border: "none",
                background: uploading || !registryUrl.trim() ? C.surface2 : C.blue,
                color: uploading || !registryUrl.trim() ? C.muted : "#fff",
                cursor: uploading || !registryUrl.trim() ? "not-allowed" : "pointer",
                fontWeight: 600,
                fontSize: 13,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 7,
              }}
            >
              {uploading ? (
                <><Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> Pulling…</>
              ) : (
                <><Server size={14} /> Pull from Registry</>
              )}
            </button>
          </div>
        )}

        {/* "Upload done, waiting for build" banner — shown between XHR complete and first WS status */}
        {uploadDone && !isInProgress(build) && (
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "10px 14px",
            borderRadius: 8,
            background: "rgba(99,102,241,0.08)",
            border: `1px solid rgba(99,102,241,0.25)`,
          }}>
            <Clock size={15} color={C.blue} />
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.blue }}>Build queued</div>
              <div style={{ fontSize: 11, color: C.muted }}>
                ZIP accepted — the build server is starting. Status will update automatically.
              </div>
            </div>
          </div>
        )}

        {/* Build status panel */}
        {build && (
          <BuildStatusPanel
            build={build}
            showLog={showLog}
            buildLog={buildLog}
            loadingLog={loadingLog}
            onToggleLog={toggleLog}
          />
        )}
      </div>
    </div>
  );
}

// ── Build status panel ─────────────────────────────────────────────────────────

function BuildStatusPanel({
  build, showLog, buildLog, loadingLog, onToggleLog,
}: {
  build: CTFChallengeBuildDTO;
  showLog: boolean;
  buildLog: string | null;
  loadingLog: boolean;
  onToggleLog: () => void;
}) {
  const inProgress = build.buildStatus === "BUILDING" || build.buildStatus === "PULLING" || build.buildStatus === "PENDING";
  const ready      = build.buildStatus === "READY";
  const failed     = build.buildStatus === "FAILED";

  let statusColor = C.muted;
  let StatusIcon: React.ElementType = Loader2;
  if (ready)           { statusColor = C.green;  StatusIcon = CheckCircle; }
  else if (failed)     { statusColor = C.red;    StatusIcon = XCircle; }
  else if (inProgress) { statusColor = C.purple; StatusIcon = Loader2; }

  const statusLabel: Record<CTFChallengeBuildDTO["buildStatus"], string> = {
    PENDING:  "Queued — waiting for build server…",
    BUILDING: "Building image…",
    PULLING:  "Pulling from registry…",
    READY:    "Ready",
    FAILED:   "Build failed",
    OUTDATED: "Outdated",
  };

  return (
    <div style={{
      border: `1px solid ${C.border}`,
      borderRadius: 8,
      background: C.surface2,
      overflow: "hidden",
    }}>
      {/* Status header */}
      <div style={{
        padding: "10px 14px",
        display: "flex",
        alignItems: "center",
        gap: 10,
        borderBottom: inProgress || showLog ? `1px solid ${C.border}` : "none",
      }}>
        <StatusIcon
          size={16}
          color={statusColor}
          style={inProgress ? { animation: "spin 1s linear infinite" } : undefined}
        />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: statusColor }}>
            {statusLabel[build.buildStatus]}
            {build.version > 1 && (
              <span style={{ fontSize: 11, color: C.muted, fontWeight: 400, marginLeft: 6 }}>
                v{build.version}
              </span>
            )}
          </div>
          {ready && build.builtImageTag && (
            <div style={{ fontSize: 11, color: C.muted, fontFamily: "ui-monospace, monospace", marginTop: 1 }}>
              {build.builtImageTag}
              {build.imageSizeMb != null && build.imageSizeMb > 0 && (
                <span style={{ marginLeft: 8, color: C.secondary }}>{build.imageSizeMb} MB</span>
              )}
            </div>
          )}
          {failed && build.errorMessage && (
            <div style={{ fontSize: 11, color: C.red, marginTop: 2, display: "flex", alignItems: "center", gap: 4 }}>
              <AlertCircle size={10} /> {build.errorMessage}
            </div>
          )}
        </div>

        {/* Log toggle */}
        <button
          type="button"
          onClick={onToggleLog}
          disabled={loadingLog}
          style={{
            background: "transparent",
            border: `1px solid ${C.border}`,
            borderRadius: 5,
            padding: "4px 9px",
            color: C.secondary,
            cursor: "pointer",
            fontSize: 11,
            display: "flex",
            alignItems: "center",
            gap: 4,
          }}
        >
          {loadingLog
            ? <Loader2 size={11} style={{ animation: "spin 1s linear infinite" }} />
            : showLog
              ? <><EyeOff size={11} /> Hide Log</>
              : <><Eye size={11} /> View Log</>
          }
        </button>
      </div>

      {/* Animated progress bar for any in-progress state */}
      {inProgress && (
        <div style={{ height: 3, background: C.surface, overflow: "hidden" }}>
          <div style={{
            height: "100%",
            background: `linear-gradient(90deg, transparent, ${C.purple}, transparent)`,
            animation: "ctf-build-scan 1.5s linear infinite",
            width: "40%",
          }} />
        </div>
      )}

      {/* Log viewer */}
      {showLog && (
        <div style={{ padding: 12 }}>
          <pre style={{
            margin: 0,
            padding: "10px 12px",
            background: C.bg,
            borderRadius: 6,
            fontSize: 11,
            lineHeight: 1.6,
            color: C.secondary,
            fontFamily: "ui-monospace, monospace",
            overflowX: "auto",
            maxHeight: 280,
            overflowY: "auto",
            whiteSpace: "pre-wrap",
            wordBreak: "break-all",
          }}>
            {buildLog ?? "(no log available)"}
          </pre>
        </div>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes ctf-build-scan {
          0%   { transform: translateX(-100%); }
          100% { transform: translateX(350%); }
        }
      `}</style>
    </div>
  );
}
