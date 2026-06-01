"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import { toast } from "@/components/ui/PSPToast";
import {
  BookOpen, Plus, X, Server, Flag, Lightbulb, FileText, Box,
  Network, Terminal, Globe, Trash2, AlertCircle, Check,
  UploadCloud, FileArchive, Info,
} from "lucide-react";
import {
  getCtfLibrary, createCtfLibraryChallenge, updateCtfLibraryChallenge,
  deleteCtfLibraryChallenge, addLibraryChallengeToCompetition,
  listTeacherCtfCompetitions, getCTFChallengeBuildStatus, uploadCTFChallengeZip,
  type CTFLibraryChallengeDTO, type CTFCompetitionDTO, type CTFChallengeBuildDTO,
} from "@/lib/api";
import ChallengeBuildPanel from "@/features/ctf/admin/ChallengeBuildPanel";

const CATEGORIES = ["ALL", "CRYPTO", "FORENSICS", "WEB", "REVERSE", "PWN", "OSINT", "MISC"] as const;
type Cat = typeof CATEGORIES[number];

const CAT_COLORS: Record<string, string> = {
  CRYPTO: "#a78bfa", FORENSICS: "#60a5fa", WEB: "#f87171",
  REVERSE: "#fb923c", PWN: "#facc15", OSINT: "#34d399", MISC: "#94a3b8",
};
const DIFF_COLORS: Record<string, string> = {
  EASY: "#22c55e", MEDIUM: "#f59e0b", HARD: "#ef4444",
};

// ─────────────────────────────────────────────────────────────────────────────

export default function CTFLibraryPage() {
  const [list, setList]           = useState<CTFLibraryChallengeDTO[]>([]);
  const [loading, setLoading]     = useState(true);
  const [filter, setFilter]       = useState<Cat>("ALL");
  const [panel, setPanel]         = useState<
    | null
    | { mode: "create" }
    | { mode: "edit"; challenge: CTFLibraryChallengeDTO }
  >(null);
  const [addModal, setAddModal]   = useState<CTFLibraryChallengeDTO | null>(null);

  const reload = async () => {
    setLoading(true);
    try {
      setList(await getCtfLibrary());
    } catch {
      toast.error("Failed to load library", "Please try again.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { reload(); }, []);

  const filtered = filter === "ALL"
    ? list
    : list.filter(c => c.category === filter);

  const handleDelete = async (c: CTFLibraryChallengeDTO) => {
    if (!confirm(`Delete "${c.title}" from your library?`)) return;
    try {
      await deleteCtfLibraryChallenge(c.id);
      toast.success("Deleted", `"${c.title}" removed from library.`);
      reload();
    } catch { /* toasted */ }
  };

  return (
    <>
      <Navbar />
      <div className="psp-breadcrumb">
        <Link href="/admin">icode-ctf</Link> ›{" "}
        <Link href="/admin/ctf">CTF</Link> ›{" "}
        <span style={{ color: "var(--text-primary)" }}>Library</span>
      </div>

      <div className="psp-main" style={{ maxWidth: 1100 }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <BookOpen size={20} color="#a78bfa" />
              <span style={{ fontSize: 20, fontWeight: 700 }}>Challenge Library</span>
            </div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
              Reusable challenges you can drop into any competition — no rebuild needed.
            </div>
          </div>
          <button
            className="psp-btn psp-btn-primary"
            style={{ gap: 6 }}
            onClick={() => setPanel({ mode: "create" })}
          >
            <Plus size={13} /> New Challenge
          </button>
        </div>

        {/* Filter bar */}
        <div style={{ display: "flex", gap: 6, marginBottom: 18, flexWrap: "wrap" }}>
          {CATEGORIES.map(cat => (
            <button
              key={cat}
              type="button"
              onClick={() => setFilter(cat)}
              style={{
                padding: "5px 12px", borderRadius: 20, fontSize: 11, fontWeight: 600,
                cursor: "pointer",
                background: filter === cat
                  ? (cat === "ALL" ? "rgba(99,102,241,0.15)" : `${CAT_COLORS[cat]}22`)
                  : "var(--bg-secondary)",
                color: filter === cat
                  ? (cat === "ALL" ? "#818cf8" : CAT_COLORS[cat])
                  : "var(--text-muted)",
                border: filter === cat
                  ? `1px solid ${cat === "ALL" ? "rgba(99,102,241,0.4)" : `${CAT_COLORS[cat]}55`}`
                  : "1px solid var(--border)",
              }}
            >
              {cat}
              {cat !== "ALL" && (
                <span style={{ marginLeft: 5, opacity: 0.7 }}>
                  {list.filter(c => c.category === cat).length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Grid */}
        {loading ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 14 }}>
            {[1, 2, 3].map(i => (
              <div key={i} className="skel" style={{ height: 160, borderRadius: 8 }} />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div style={{
            textAlign: "center", padding: "60px 20px",
            background: "var(--bg-secondary)", borderRadius: 8,
            border: "1px dashed var(--border)", color: "var(--text-muted)", fontSize: 13,
          }}>
            {list.length === 0
              ? "No library challenges yet. Click \"New Challenge\" to create your first reusable challenge."
              : `No ${filter} challenges in your library.`}
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 14 }}>
            {filtered.map(c => (
              <LibraryCard
                key={c.id}
                challenge={c}
                onEdit={() => setPanel({ mode: "edit", challenge: c })}
                onDelete={() => handleDelete(c)}
                onAddToCompetition={() => setAddModal(c)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Challenge panel (create / edit) */}
      {panel && (
        <LibraryPanel
          mode={panel.mode}
          existing={panel.mode === "edit" ? panel.challenge : undefined}
          onClose={() => setPanel(null)}
          onSaved={() => { reload(); setPanel(null); }}
          onJustCreated={reload}
        />
      )}

      {/* Add to competition modal */}
      {addModal && (
        <AddToCompetitionModal
          challenge={addModal}
          onClose={() => setAddModal(null)}
          onAdded={() => { reload(); setAddModal(null); }}
        />
      )}
    </>
  );
}

// ── Library card ──────────────────────────────────────────────────────────────

function LibraryCard({
  challenge: c, onEdit, onDelete, onAddToCompetition,
}: {
  challenge: CTFLibraryChallengeDTO;
  onEdit: () => void;
  onDelete: () => void;
  onAddToCompetition: () => void;
}) {
  const catColor  = CAT_COLORS[c.category] ?? "#94a3b8";
  const diffColor = DIFF_COLORS[c.difficulty] ?? "#94a3b8";

  const buildDot = () => {
    if (!c.buildStatus) return null;
    const map: Record<string, { color: string; label: string }> = {
      READY:    { color: "#22c55e", label: "READY" },
      BUILDING: { color: "#f59e0b", label: "BUILDING" },
      PULLING:  { color: "#f59e0b", label: "PULLING" },
      FAILED:   { color: "#ef4444", label: "FAILED" },
      PENDING:  { color: "#94a3b8", label: "PENDING" },
    };
    const s = map[c.buildStatus] ?? { color: "#94a3b8", label: c.buildStatus };
    return (
      <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <span style={{ width: 7, height: 7, borderRadius: "50%", background: s.color, flexShrink: 0 }} />
        <span style={{ fontSize: 10, color: s.color, fontWeight: 700 }}>{s.label}</span>
      </span>
    );
  };

  return (
    <div className="psp-card" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
      {/* Top badges */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{
          fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 4,
          background: `${catColor}18`, color: catColor, border: `1px solid ${catColor}44`,
        }}>{c.category}</span>
        <span style={{
          fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 4,
          background: `${diffColor}18`, color: diffColor, border: `1px solid ${diffColor}44`,
        }}>{c.difficulty}</span>
      </div>

      {/* Title + points */}
      <div>
        <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>{c.title}</div>
        <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
          {c.basePoints} pts · {c.flagType ?? "STATIC"}
        </div>
      </div>

      {/* Docker info */}
      {c.requiresInstance && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11 }}>
          <Server size={11} color="#a78bfa" style={{ flexShrink: 0 }} />
          <span style={{
            color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis",
            whiteSpace: "nowrap", flex: 1, fontFamily: "ui-monospace, monospace",
          }}>
            {c.builtImageTag ?? c.dockerImage ?? "no image"}
          </span>
          {buildDot()}
        </div>
      )}

      {/* Use count */}
      <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
        {c.useCount === 0
          ? "Not used in any competition yet"
          : `Used in ${c.useCount} competition${c.useCount !== 1 ? "s" : ""}`}
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
        <button
          type="button"
          className="psp-btn psp-btn-primary"
          style={{ flex: 1, fontSize: 12, padding: "6px 0", gap: 4 }}
          onClick={onAddToCompetition}
        >
          <Plus size={11} /> Add to Competition
        </button>
        <button
          type="button"
          className="psp-btn psp-btn-secondary"
          style={{ fontSize: 12, padding: "6px 10px" }}
          onClick={onEdit}
        >
          Edit
        </button>
        <button
          type="button"
          className="psp-btn psp-btn-secondary"
          style={{ fontSize: 12, padding: "6px 10px", color: "#f87171", borderColor: "rgba(239,68,68,0.3)" }}
          onClick={onDelete}
        >
          <Trash2 size={12} />
        </button>
      </div>
    </div>
  );
}

// ── Add to competition modal ──────────────────────────────────────────────────

function AddToCompetitionModal({
  challenge, onClose, onAdded,
}: {
  challenge: CTFLibraryChallengeDTO;
  onClose: () => void;
  onAdded: () => void;
}) {
  const [competitions, setCompetitions] = useState<CTFCompetitionDTO[]>([]);
  const [selected, setSelected]         = useState("");
  const [busy, setBusy]                 = useState(false);

  useEffect(() => {
    listTeacherCtfCompetitions()
      .then(list => {
        const active = list.filter(c => c.status !== "ENDED");
        setCompetitions(active);
        if (active.length === 1) setSelected(active[0].id);
      })
      .catch(() => {});
  }, []);

  const handleAdd = async () => {
    if (!selected) { toast.warning("No competition selected", "Pick a competition first."); return; }
    setBusy(true);
    try {
      await addLibraryChallengeToCompetition(challenge.id, selected);
      const comp = competitions.find(c => c.id === selected);
      toast.success("Challenge added", `"${challenge.title}" added to ${comp?.title ?? "competition"}.`);
      onAdded();
    } catch { /* toasted */ } finally { setBusy(false); }
  };

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 200,
      background: "rgba(0,0,0,0.6)", backdropFilter: "blur(3px)",
      display: "flex", alignItems: "center", justifyContent: "center",
    }} onClick={onClose}>
      <div style={{
        background: "var(--surface)", borderRadius: 10,
        border: "1px solid var(--border)", padding: 24,
        width: 420, maxWidth: "95vw",
        boxShadow: "0 20px 60px rgba(0,0,0,0.4)",
      }} onClick={e => e.stopPropagation()}>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>Add to Competition</div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", display: "flex" }}>
            <X size={16} />
          </button>
        </div>

        <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 16 }}>
          Adding: <strong style={{ color: "var(--text-primary)" }}>{challenge.title}</strong>
        </div>

        <label style={{ fontSize: 11, color: "var(--text-secondary)", fontWeight: 600, display: "block", marginBottom: 6 }}>
          Competition
        </label>

        {competitions.length === 0 ? (
          <div style={{
            padding: "10px 12px", background: "var(--bg-secondary)",
            borderRadius: 6, fontSize: 12, color: "var(--text-muted)",
          }}>
            No active competitions. Create one first.
          </div>
        ) : (
          <select
            className="input"
            value={selected}
            onChange={e => setSelected(e.target.value)}
          >
            <option value="">— select a competition —</option>
            {competitions.map(c => (
              <option key={c.id} value={c.id}>{c.title} ({c.status})</option>
            ))}
          </select>
        )}

        <div style={{ display: "flex", gap: 8, marginTop: 18, justifyContent: "flex-end" }}>
          <button className="psp-btn psp-btn-secondary" onClick={onClose}>Cancel</button>
          <button
            className="psp-btn psp-btn-primary"
            disabled={!selected || busy}
            onClick={handleAdd}
          >
            {busy ? "Adding…" : "Add Challenge"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Library challenge panel (create / edit) ───────────────────────────────────

type TabKey = "basics" | "flag" | "docker" | "hints";

interface LibraryPanelProps {
  mode: "create" | "edit";
  existing?: CTFLibraryChallengeDTO;
  onClose: () => void;
  onSaved: () => void;
  onJustCreated: () => void;
}

const PANEL_CATEGORIES = ["CRYPTO", "FORENSICS", "REVERSE", "WEB", "PWN", "OSINT", "MISC"] as const;
const PANEL_DIFFICULTIES = ["EASY", "MEDIUM", "HARD"] as const;

function LibraryPanel({ mode, existing, onClose, onSaved, onJustCreated }: LibraryPanelProps) {
  const [tab, setTab]   = useState<TabKey>("basics");
  const [busy, setBusy] = useState(false);
  const [err, setErr]   = useState<string | null>(null);

  const [form, setForm] = useState({
    title:              existing?.title ?? "",
    description:        existing?.description ?? "",
    category:           existing?.category ?? "WEB",
    difficulty:         (existing?.difficulty ?? "EASY") as "EASY" | "MEDIUM" | "HARD",
    basePoints:         existing?.basePoints ?? 300,
    flagType:           (existing?.flagType === "DYNAMIC" ? "DYNAMIC" : "STATIC") as "STATIC" | "DYNAMIC",
    plainFlag:          "",
    flagFormat:         existing?.flagFormat ?? "FLAG{?}",
    requiresInstance:   existing?.requiresInstance ?? false,
    dockerImage:        existing?.dockerImage ?? "",
    // dockerExposedPort absent — auto-detected from Dockerfile EXPOSE at build time
    connectionType:     (existing?.connectionType === "TCP" ? "TCP" : "HTTP") as "HTTP" | "TCP",
    dockerFlagEnv:      existing?.dockerFlagEnv ?? "FLAG",
    dockerMemoryMb:     existing?.dockerMemoryMb ? String(existing.dockerMemoryMb) : "",
    dockerCpuPercent:   existing?.dockerCpuPercent ? String(existing.dockerCpuPercent) : "",
    dockerPidsLimit:    existing?.dockerPidsLimit ? String(existing.dockerPidsLimit) : "",
    downloadableFileUrl: existing?.downloadableFileUrl ?? "",
    maxAttempts:         existing?.maxAttempts != null ? String(existing.maxAttempts) : "10",
    attemptsMode:        (existing?.maxAttempts == null ? "unlimited" : "limited") as "limited" | "unlimited",
  });

  const [hints, setHints] = useState<{ cost: number; text: string }[]>(
    existing?.hints?.map(h => ({ cost: h.cost, text: h.text ?? "" })) ?? [],
  );

  // Bug-4 pattern: two-step Docker create for library challenges
  const [pendingZipFile, setPendingZipFile]   = useState<File | null>(null);
  const [buildModeId, setBuildModeId]         = useState<string | null>(null);
  const [buildModeInitialBuild, setBuildModeInitialBuild] = useState<CTFChallengeBuildDTO | null>(null);
  const [zipUploading, setZipUploading]       = useState(false);

  const fieldErrors: Record<string, string> = {};
  if (!form.title.trim() || form.title.trim().length < 3)
    fieldErrors.title = "Title must be at least 3 characters";
  if (form.basePoints < 50 || form.basePoints > 5000)
    fieldErrors.basePoints = "Points must be between 50 and 5 000";
  if (mode === "create" && form.flagType === "STATIC" && !form.plainFlag.trim())
    fieldErrors.plainFlag = "Flag is required";
  // dockerExposedPort is auto-detected from Dockerfile EXPOSE — no manual validation needed

  const save = async () => {
    setErr(null);
    if (Object.keys(fieldErrors).length > 0) {
      const first = Object.keys(fieldErrors)[0];
      if (first === "title" || first === "basePoints") setTab("basics");
      else if (first === "plainFlag") setTab("flag");
      else setTab("docker");
      setErr(Object.values(fieldErrors)[0]);
      return;
    }

    setBusy(true);
    const dockerFields = form.requiresInstance ? {
      ...(form.dockerImage.trim() ? { dockerImage: form.dockerImage.trim() } : {}),
      // dockerExposedPort intentionally omitted — auto-detected from Dockerfile EXPOSE at build time
      connectionType:     form.connectionType,
      dockerFlagEnv:      form.dockerFlagEnv.trim() || "FLAG",
      dockerMemoryMb:     form.dockerMemoryMb ? parseInt(form.dockerMemoryMb) : undefined,
      dockerCpuPercent:   form.dockerCpuPercent ? parseInt(form.dockerCpuPercent) : undefined,
      dockerPidsLimit:    form.dockerPidsLimit ? parseInt(form.dockerPidsLimit) : undefined,
    } : {};

    const payload = {
      title:              form.title.trim(),
      description:        form.description,
      category:           form.category,
      difficulty:         form.difficulty,
      basePoints:         form.basePoints,
      flagType:           form.flagType,
      plainFlag:          form.flagType === "STATIC" ? form.plainFlag.trim() : undefined,
      flagFormat:         form.flagType === "DYNAMIC" ? form.flagFormat.trim() : undefined,
      downloadableFileUrl: form.downloadableFileUrl || undefined,
      maxAttempts:        form.attemptsMode === "unlimited" ? 0 : parseInt(form.maxAttempts) || 10,
      requiresInstance:   form.requiresInstance,
      ...dockerFields,
      hints: hints.length > 0 ? hints : undefined,
    };

    try {
      if (mode === "create") {
        const created = await createCtfLibraryChallenge(payload);
        if (form.requiresInstance && pendingZipFile) {
          onJustCreated();
          setBusy(false);
          setZipUploading(true);
          try {
            await uploadCTFChallengeZip("", created.id, pendingZipFile);
          } finally {
            setZipUploading(false);
          }
          const initialBuild = await getCTFChallengeBuildStatus(created.id).catch(() => null);
          setBuildModeInitialBuild(initialBuild);
          setBuildModeId(created.id);
          return;
        }
        toast.success("Challenge saved to library", form.title);
      } else if (existing) {
        await updateCtfLibraryChallenge(existing.id, payload);
        toast.success("Challenge updated", form.title);
      }
      onSaved();
    } catch (e: any) {
      setErr(e?.message ?? "Failed to save challenge.");
    } finally {
      setBusy(false);
    }
  };

  // Build mode overlay
  if (zipUploading || buildModeId) {
    return (
      <PanelShell title="Docker Build" subtitle={form.title || "Library challenge"} onClose={onSaved}>
        <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>
          {zipUploading ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, paddingTop: 40 }}>
              <UploadCloud size={36} color="#a78bfa" />
              <div style={{ fontSize: 14, fontWeight: 600 }}>Uploading ZIP…</div>
              <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Please wait while your build context is uploaded.</div>
            </div>
          ) : buildModeId ? (
            <ChallengeBuildPanel
              challengeId={buildModeId}
              initialBuild={buildModeInitialBuild}
              onBuildReady={(imageTag) => {
                toast.success("Image ready", imageTag);
                onJustCreated();
                onSaved();
              }}
            />
          ) : null}
        </div>
      </PanelShell>
    );
  }

  const TABS: { key: TabKey; label: string; icon: React.ReactNode }[] = [
    { key: "basics", label: "Basics",  icon: <FileText size={13} /> },
    { key: "flag",   label: "Flag",    icon: <Flag size={13} /> },
    { key: "docker", label: "Docker",  icon: <Server size={13} /> },
    { key: "hints",  label: "Hints",   icon: <Lightbulb size={13} /> },
  ];

  return (
    <PanelShell
      title={mode === "create" ? "New Library Challenge" : "Edit Challenge"}
      subtitle={mode === "create" ? (form.title || "Untitled") : (existing?.title ?? "")}
      onClose={onClose}
      tabBar={
        <div style={{ display: "flex", borderBottom: "1px solid var(--border)", background: "var(--bg-secondary)", paddingLeft: 16, gap: 4 }}>
          {TABS.map(t => {
            const active = tab === t.key;
            const hasErr = (
              (t.key === "basics" && (fieldErrors.title || fieldErrors.basePoints)) ||
              (t.key === "flag"   && fieldErrors.plainFlag) ||
              (t.key === "docker" && false) /* no docker field errors — port is auto-detected */
            );
            return (
              <button key={t.key} onClick={() => setTab(t.key)} style={{
                background: "transparent", border: "none", cursor: "pointer",
                padding: "12px 16px", fontSize: 13, fontWeight: active ? 700 : 500,
                color: active ? "var(--text-primary)" : "var(--text-muted)",
                borderBottom: `2px solid ${active ? "var(--blue)" : "transparent"}`,
                display: "flex", alignItems: "center", gap: 6, marginBottom: -1,
              }}>
                {t.icon} {t.label}
                {t.key === "docker" && form.requiresInstance && (
                  <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 10, background: "rgba(167,139,250,0.15)", color: "#a78bfa", fontWeight: 700 }}>ON</span>
                )}
                {t.key === "hints" && hints.length > 0 && (
                  <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 10, background: "rgba(251,191,36,0.15)", color: "#fbbf24", fontWeight: 700 }}>{hints.length}</span>
                )}
                {hasErr && <span style={{ width: 6, height: 6, borderRadius: 3, background: "#ef4444" }} />}
              </button>
            );
          })}
        </div>
      }
    >
      {err && (
        <div style={{ margin: "12px 24px 0", display: "flex", alignItems: "center", gap: 8, background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.3)", color: "#f87171", borderRadius: 6, padding: "10px 12px", fontSize: 12 }}>
          <AlertCircle size={14} /> {err}
        </div>
      )}

      <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>
        {tab === "basics" && (
          <BasicsSection form={form} setForm={setForm} errors={fieldErrors} />
        )}
        {tab === "flag" && (
          <FlagSection form={form} setForm={setForm} mode={mode} errors={fieldErrors} />
        )}
        {tab === "docker" && (
          <DockerSection
            form={form} setForm={setForm} errors={fieldErrors}
            mode={mode} existingId={existing?.id}
            existingPort={existing?.dockerExposedPort ?? null}
            pendingZipFile={pendingZipFile} onPendingZipSelected={setPendingZipFile}
          />
        )}
        {tab === "hints" && (
          <HintsSection hints={hints} setHints={setHints} />
        )}
      </div>

      <div style={{ padding: "14px 24px", borderTop: "1px solid var(--border)", background: "var(--bg-secondary)", display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <button className="psp-btn psp-btn-secondary" onClick={onClose}>Cancel</button>
        <button
          className="psp-btn psp-btn-primary"
          disabled={busy}
          onClick={save}
          style={{ gap: 6 }}
        >
          {busy ? "Saving…" : (mode === "create" ? "Save to Library" : "Update")}
        </button>
      </div>
    </PanelShell>
  );
}

// ── Panel shell ───────────────────────────────────────────────────────────────

function PanelShell({
  title, subtitle, onClose, tabBar, children,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  tabBar?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 100,
      display: "flex", justifyContent: "flex-end", backdropFilter: "blur(2px)",
    }} onClick={onClose}>
      <div style={{
        width: 680, maxWidth: "96vw", height: "100vh", display: "flex", flexDirection: "column",
        background: "var(--surface)", boxShadow: "-12px 0 40px rgba(0,0,0,0.4)",
      }} onClick={e => e.stopPropagation()}>
        <div style={{ padding: "16px 24px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center", background: "var(--bg-secondary)" }}>
          <div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600 }}>{title}</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)", marginTop: 2 }}>{subtitle}</div>
          </div>
          <button onClick={onClose} style={{ background: "transparent", border: "1px solid var(--border)", borderRadius: 6, cursor: "pointer", color: "var(--text-muted)", padding: 6, display: "flex" }}>
            <X size={16} />
          </button>
        </div>
        {tabBar}
        {children}
      </div>
    </div>
  );
}

// ── Form sections ─────────────────────────────────────────────────────────────

function BasicsSection({ form, setForm, errors }: { form: any; setForm: (f: any) => void; errors: Record<string, string> }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <PanelSection icon={FileText} title="Challenge details" desc="Title, description and difficulty shown to players.">
        <PanelField label="Title" required error={errors.title}>
          <input className="input" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="e.g. SQLi 101" />
        </PanelField>
        <PanelField label="Description" hint="Markdown / pre-formatted text is preserved.">
          <textarea className="input" rows={4} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Describe the challenge…" />
        </PanelField>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
          <PanelField label="Category">
            <select className="input" value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>
              {PANEL_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </PanelField>
          <PanelField label="Difficulty">
            <select className="input" value={form.difficulty} onChange={e => setForm({ ...form, difficulty: e.target.value })}>
              {PANEL_DIFFICULTIES.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </PanelField>
          <PanelField label="Base points" error={errors.basePoints}>
            <input className="input" type="number" min={50} max={5000} value={form.basePoints} onChange={e => setForm({ ...form, basePoints: Number(e.target.value) })} />
          </PanelField>
        </div>
        <PanelField label="Attempts per team">
          <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
            {(["limited", "unlimited"] as const).map(mode => (
              <button key={mode} type="button"
                onClick={() => setForm({ ...form, attemptsMode: mode })}
                style={{ padding: "5px 14px", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer", border: `1px solid ${form.attemptsMode === mode ? "var(--blue)" : "var(--border)"}`, background: form.attemptsMode === mode ? "rgba(96,165,250,0.12)" : "transparent", color: form.attemptsMode === mode ? "var(--blue)" : "var(--text-muted)" }}>
                {mode === "unlimited" ? "Unlimited ∞" : "Limited"}
              </button>
            ))}
          </div>
          {form.attemptsMode === "limited" && (
            <input className="input" type="number" min={1} value={form.maxAttempts}
              onChange={e => setForm({ ...form, maxAttempts: e.target.value })}
              placeholder="Max attempts per team" />
          )}
        </PanelField>
      </PanelSection>
      <PanelSection icon={Box} title="Downloadable file (optional)">
        <PanelField label="File URL">
          <input className="input" value={form.downloadableFileUrl} onChange={e => setForm({ ...form, downloadableFileUrl: e.target.value })} placeholder="https://…/challenge.zip" />
        </PanelField>
      </PanelSection>
    </div>
  );
}

function FlagSection({ form, setForm, mode, errors }: { form: any; setForm: (f: any) => void; mode: string; errors: Record<string, string> }) {
  if (mode === "edit") {
    return (
      <PanelSection icon={Flag} title="Flag" desc="To rotate the flag, delete and re-create this library challenge.">
        <div style={{ padding: 14, background: "var(--bg-secondary)", borderRadius: 6, fontSize: 12, color: "var(--text-muted)" }}>
          Flag type: <strong>{form.flagType}</strong>. Flag rotation is not supported inline — create a new library challenge to change the flag.
        </div>
      </PanelSection>
    );
  }
  return (
    <PanelSection icon={Flag} title="Flag setup" desc="How players prove they solved the challenge.">
      <PanelField label="Flag Type">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {(["STATIC", "DYNAMIC"] as const).map(type => (
            <label key={type} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "12px 14px", borderRadius: 6, cursor: "pointer", border: `1px solid ${form.flagType === type ? "var(--blue)" : "var(--border)"}`, background: form.flagType === type ? "rgba(96,165,250,0.06)" : "transparent" }}>
              <input type="radio" checked={form.flagType === type} onChange={() => setForm({ ...form, flagType: type })} style={{ marginTop: 2, accentColor: "var(--blue)" }} />
              <div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{type === "STATIC" ? "Static — one flag for all" : "Dynamic — unique per team"}</div>
                <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 3 }}>
                  {type === "STATIC" ? "Simplest. You set the flag now." : "Anti-cheat. Each team gets a unique flag injected into their container."}
                </div>
              </div>
            </label>
          ))}
        </div>
      </PanelField>
      {form.flagType === "STATIC" ? (
        <PanelField label="Flag value" required error={errors.plainFlag} hint="Stored as SHA-256 — never visible after saving.">
          <input className="input" value={form.plainFlag} placeholder="e.g. CTF{example_flag}" onChange={e => setForm({ ...form, plainFlag: e.target.value })} />
        </PanelField>
      ) : (
        <PanelField label="Flag format" hint={'Use "?" as the placeholder for the per-team token. E.g. "FLAG{?}"'}>
          <input className="input" value={form.flagFormat} onChange={e => setForm({ ...form, flagFormat: e.target.value })} placeholder="FLAG{?}" style={{ fontFamily: "ui-monospace, monospace" }} />
        </PanelField>
      )}
    </PanelSection>
  );
}

function DockerSection({
  form, setForm, errors, mode, existingId, existingPort, pendingZipFile, onPendingZipSelected,
}: {
  form: any; setForm: (f: any) => void; errors: Record<string, string>;
  mode: string; existingId?: string; existingPort?: number | null;
  pendingZipFile: File | null; onPendingZipSelected: (f: File | null) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Toggle */}
      <label style={{ display: "flex", alignItems: "center", gap: 14, cursor: "pointer", padding: 16, borderRadius: 8, border: `1px solid ${form.requiresInstance ? "var(--purple, #a78bfa)" : "var(--border)"}`, background: form.requiresInstance ? "rgba(167,139,250,0.06)" : "var(--bg-secondary)" }}>
        <div style={{ width: 42, height: 24, borderRadius: 12, position: "relative", background: form.requiresInstance ? "#a78bfa" : "var(--border)" }}>
          <div style={{ position: "absolute", top: 2, left: form.requiresInstance ? 20 : 2, width: 20, height: 20, borderRadius: 10, background: "#fff", transition: "left 0.2s ease" }} />
        </div>
        <input type="checkbox" checked={form.requiresInstance} onChange={e => setForm({ ...form, requiresInstance: e.target.checked })} style={{ display: "none" }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 600 }}>Requires a live Docker instance</div>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>Each player gets their own container.</div>
        </div>
      </label>

      {form.requiresInstance && (
        <>
          <PanelSection icon={Server} title="Container image" desc="The Docker image to run for each player instance.">
            {mode === "edit" && existingId ? (
              <ChallengeBuildPanel challengeId={existingId} initialBuild={null} onBuildReady={imageTag => setForm((f: any) => ({ ...f, dockerImage: imageTag }))} />
            ) : (
              <ZipPicker file={pendingZipFile} onFileSelected={onPendingZipSelected} />
            )}
            {/* Container port — read-only, auto-detected from Dockerfile EXPOSE */}
            <div style={{
              marginTop: 12, display: "flex", alignItems: "center", gap: 8,
              padding: "9px 12px", borderRadius: 6,
              border: "1px solid var(--border)", background: "var(--bg-secondary)",
              fontSize: 12,
            }}>
              <span style={{ color: "var(--text-muted)" }}>Container port:</span>
              {existingPort != null ? (
                <>
                  <span style={{ fontWeight: 700, color: "var(--text-primary)", fontFamily: "ui-monospace, monospace" }}>
                    {existingPort}
                  </span>
                  <span style={{ color: "var(--text-muted)", fontSize: 11 }}>
                    (auto-detected from Dockerfile EXPOSE)
                  </span>
                </>
              ) : (
                <span style={{ color: "var(--text-muted)", fontSize: 11, fontStyle: "italic" }}>
                  auto-detected from <code>EXPOSE</code> in your Dockerfile after upload
                </span>
              )}
            </div>
          </PanelSection>

          <PanelSection icon={Network} title="Connection type">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {([
                { id: "HTTP", label: "HTTP (Web)", icon: Globe },
                { id: "TCP",  label: "TCP (PWN)",  icon: Terminal },
              ] as const).map(opt => {
                const Icon = opt.icon;
                const active = form.connectionType === opt.id;
                return (
                  <label key={opt.id} style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", padding: 12, borderRadius: 6, border: `1px solid ${active ? "#a78bfa" : "var(--border)"}`, background: active ? "rgba(167,139,250,0.06)" : "transparent" }}>
                    <input type="radio" checked={active} onChange={() => setForm({ ...form, connectionType: opt.id })} style={{ accentColor: "#a78bfa" }} />
                    <Icon size={13} color={active ? "#a78bfa" : "var(--text-muted)"} />
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{opt.label}</span>
                  </label>
                );
              })}
            </div>
          </PanelSection>

          <PanelSection icon={Flag} title="Flag injection" desc="Server injects the flag into the container at startup.">
            <PanelField label="Env var name">
              <input className="input" value={form.dockerFlagEnv} onChange={e => setForm({ ...form, dockerFlagEnv: e.target.value })} placeholder="FLAG" style={{ fontFamily: "ui-monospace, monospace", maxWidth: 220 }} />
            </PanelField>
          </PanelSection>
        </>
      )}
    </div>
  );
}

function HintsSection({ hints, setHints }: { hints: { cost: number; text: string }[]; setHints: (h: { cost: number; text: string }[]) => void }) {
  return (
    <PanelSection icon={Lightbulb} title={`Hints (${hints.length})`} desc="Players spend points to unlock hints.">
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {hints.length === 0 && (
          <div style={{ padding: 14, borderRadius: 6, background: "var(--bg-secondary)", border: "1px dashed var(--border)", textAlign: "center", fontSize: 12, color: "var(--text-muted)" }}>
            No hints yet.
          </div>
        )}
        {hints.map((h, i) => (
          <div key={i} style={{ padding: 12, borderRadius: 6, background: "var(--bg-secondary)", border: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600 }}>Hint #{i + 1}</span>
              <button type="button" onClick={() => setHints(hints.filter((_, idx) => idx !== i))} style={{ background: "none", border: "none", cursor: "pointer", color: "#ef4444", display: "flex" }}>
                <Trash2 size={12} />
              </button>
            </div>
            <textarea className="input" rows={2} value={h.text} placeholder="Hint text…" onChange={e => { const next = [...hints]; next[i] = { ...h, text: e.target.value }; setHints(next); }} />
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Costs</span>
              <input className="input" type="number" min={0} value={h.cost} style={{ width: 80 }} onChange={e => { const next = [...hints]; next[i] = { ...h, cost: Number(e.target.value) }; setHints(next); }} />
              <span style={{ fontSize: 11, color: "var(--text-muted)" }}>pts to unlock</span>
            </div>
          </div>
        ))}
        <button type="button" className="psp-btn psp-btn-secondary" style={{ alignSelf: "flex-start", gap: 4, padding: "6px 12px", fontSize: 12 }} onClick={() => setHints([...hints, { cost: 25, text: "" }])}>
          <Plus size={11} /> Add hint
        </button>
      </div>
    </PanelSection>
  );
}

// ── ZIP picker (same pattern as TeacherCtfChallengesTab) ─────────────────────

function ZipPicker({ file, onFileSelected }: { file: File | null; onFileSelected: (f: File | null) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div>
      <input ref={inputRef} type="file" accept=".zip" style={{ display: "none" }} onChange={e => onFileSelected(e.target.files?.[0] ?? null)} />
      {file ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderRadius: 6, background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.3)" }}>
          <FileArchive size={14} color="#6366f1" style={{ flexShrink: 0 }} />
          <span style={{ flex: 1, fontSize: 12, color: "#a5b4fc", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{file.name}</span>
          <button type="button" onClick={() => onFileSelected(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "#64748b", display: "flex", padding: 2 }}><X size={12} /></button>
        </div>
      ) : (
        <button type="button" onClick={() => inputRef.current?.click()} style={{ width: "100%", padding: "12px 14px", borderRadius: 6, border: "1px dashed rgba(167,139,250,0.4)", background: "rgba(167,139,250,0.04)", cursor: "pointer", display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "#94a3b8" }}>
          <UploadCloud size={14} color="#a78bfa" style={{ flexShrink: 0 }} />
          Pick your Docker build-context ZIP — uploads automatically after saving
        </button>
      )}
    </div>
  );
}

// ── Primitives ────────────────────────────────────────────────────────────────

function PanelSection({ icon: Icon, title, desc, children }: { icon: React.ElementType; title: string; desc?: string; children: React.ReactNode }) {
  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: 8, background: "var(--surface)", overflow: "hidden" }}>
      <div style={{ padding: "12px 16px", background: "var(--bg-secondary)", borderBottom: "1px solid var(--border)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Icon size={14} color="var(--text-secondary)" />
          <span style={{ fontSize: 13, fontWeight: 600 }}>{title}</span>
        </div>
        {desc && <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 3 }}>{desc}</div>}
      </div>
      <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>
        {children}
      </div>
    </div>
  );
}

function PanelField({ label, hint, required, error, children }: { label: string; hint?: string; required?: boolean; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 5 }}>
        {label}{required && <span style={{ color: "#ef4444", marginLeft: 3 }}>*</span>}
      </label>
      {children}
      {error && <div style={{ fontSize: 11, color: "#ef4444", marginTop: 4 }}>{error}</div>}
      {!error && hint && <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>{hint}</div>}
    </div>
  );
}
