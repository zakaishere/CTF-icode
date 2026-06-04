"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Plus, Eye, EyeOff, Edit2, Flag, Lightbulb, X, Trash2, AlertCircle,
  Server, FileText, Cpu, HardDrive, Network, Terminal, Globe, Box,
  Info, Copy, Check, ChevronRight, UploadCloud, FileArchive, BookOpen,
  Search, Filter, Download, Zap, Square, RefreshCw, ExternalLink,
  ChevronDown, SlidersHorizontal, Droplets,
} from "lucide-react";
import { toast } from "@/components/ui/PSPToast";
import {
  getTeacherCtfCompetitionChallenges,
  addTeacherCtfChallenge, updateTeacherCtfChallenge,
  rotateTeacherCtfChallengeFlag,
  revealTeacherCtfChallenge, hideTeacherCtfChallenge,
  addTeacherCtfHint, deleteTeacherCtfHint,
  getCTFChallengeBuildStatus, uploadCTFChallengeZip,
  getCtfLibrary, addLibraryChallengeToCompetition,
  getCtfInstanceStatus, startCTFInstance, stopCTFInstance,
  type CTFCompetitionChallengeDTO,
  type TeacherCtfChallengeCreateRequest, type TeacherCtfChallengeUpdateRequest,
  type CTFChallengeBuildDTO, type CTFLibraryChallengeDTO,
  type CTFInstanceResponse,
} from "@/lib/api";
import ChallengeBuildPanel from "@/features/ctf/admin/ChallengeBuildPanel";

const CATEGORIES = ["CRYPTO", "FORENSICS", "REVERSE", "WEB", "PWN", "OSINT", "MISC"] as const;
const DIFFICULTIES = ["EASY", "MEDIUM", "HARD"] as const;

// ── Color maps (shared) ─────────────────────────────────────────────────────

const CAT_COLORS: Record<string, { bg: string; fg: string }> = {
  CRYPTO:    { bg: "rgba(96,165,250,0.14)",  fg: "#60a5fa" },
  FORENSICS: { bg: "rgba(167,139,250,0.14)", fg: "#a78bfa" },
  REVERSE:   { bg: "rgba(251,146,60,0.14)",  fg: "#fb923c" },
  WEB:       { bg: "rgba(34,197,94,0.14)",   fg: "#4ade80" },
  PWN:       { bg: "rgba(239,68,68,0.14)",   fg: "#f87171" },
  OSINT:     { bg: "rgba(234,179,8,0.14)",   fg: "#facc15" },
  MISC:      { bg: "rgba(148,163,184,0.14)", fg: "#94a3b8" },
};
const DIFF_COLORS: Record<string, { bg: string; fg: string }> = {
  EASY:   { bg: "rgba(34,197,94,0.12)",  fg: "#4ade80" },
  MEDIUM: { bg: "rgba(251,146,60,0.12)", fg: "#fb923c" },
  HARD:   { bg: "rgba(239,68,68,0.12)",  fg: "#f87171" },
};

// ── Filter select ────────────────────────────────────────────────────────────

function FilterSelect({
  value, onChange, options, placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder: string;
}) {
  return (
    <div style={{ position: "relative", display: "inline-flex", alignItems: "center" }}>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{
          appearance: "none",
          padding: "6px 28px 6px 10px",
          borderRadius: 6,
          border: `1px solid ${value !== "" ? "rgba(99,102,241,0.5)" : "var(--border)"}`,
          background: value !== "" ? "rgba(99,102,241,0.08)" : "var(--bg-secondary)",
          color: value !== "" ? "#818cf8" : "var(--text-secondary)",
          fontSize: 12, fontWeight: 600, cursor: "pointer",
          outline: "none",
        }}
      >
        <option value="">{placeholder}</option>
        {options.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <ChevronDown size={11} style={{
        position: "absolute", right: 8, pointerEvents: "none",
        color: value !== "" ? "#818cf8" : "var(--text-muted)",
      }} />
    </div>
  );
}

// ── Challenge row ────────────────────────────────────────────────────────────

function ChallengeRow({
  c, competitionId,
  onReveal, onHide, onEdit, onPreview, onHint, onFlag,
}: {
  c: CTFCompetitionChallengeDTO;
  competitionId: string;
  onReveal: () => void;
  onHide: () => void;
  onEdit: () => void;
  onPreview: () => void;
  onHint: () => void;
  onFlag: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const cat  = CAT_COLORS[c.category]  ?? CAT_COLORS.MISC!;
  const diff = DIFF_COLORS[c.difficulty] ?? DIFF_COLORS.EASY!;

  return (
    <tr
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        borderBottom: "1px solid var(--border)",
        background: hovered ? "var(--bg-hover)" : "transparent",
        transition: "background 100ms",
      }}
    >
      {/* Title */}
      <td style={{ padding: "10px 14px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontWeight: 700, color: "var(--text-primary)", fontSize: 13 }}>{c.title}</span>
          {c.requiresInstance && (
            <span style={{
              fontSize: 9, padding: "1px 5px", borderRadius: 3, fontWeight: 700,
              background: "rgba(167,139,250,0.14)", color: "#a78bfa",
            }}>DOCKER</span>
          )}
        </div>
        {c.downloadableFileUrl && (
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2, display: "flex", alignItems: "center", gap: 3 }}>
            <Download size={10} /> file attached
          </div>
        )}
      </td>

      {/* Category */}
      <td style={{ padding: "10px 14px" }}>
        <span style={{
          display: "inline-block", padding: "2px 8px", borderRadius: 4,
          fontSize: 10, fontWeight: 700, background: cat.bg, color: cat.fg,
        }}>{c.category}</span>
      </td>

      {/* Difficulty */}
      <td style={{ padding: "10px 14px" }}>
        <span style={{
          display: "inline-block", padding: "2px 8px", borderRadius: 4,
          fontSize: 10, fontWeight: 700, background: diff.bg, color: diff.fg,
        }}>{c.difficulty}</span>
      </td>

      {/* Points */}
      <td style={{ padding: "10px 14px" }}>
        <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
          {c.basePoints}
        </span>
      </td>

      {/* Solves */}
      <td style={{ padding: "10px 14px", color: "var(--text-muted)", fontSize: 13 }}>{c.solveCount}</td>

      {/* Status badge */}
      <td style={{ padding: "10px 14px" }}>
        {c.isHidden ? (
          <span style={{
            display: "inline-flex", alignItems: "center", gap: 4,
            padding: "3px 8px", borderRadius: 4, fontSize: 10, fontWeight: 700,
            background: "rgba(148,163,184,0.12)", color: "#94a3b8",
            border: "1px solid rgba(148,163,184,0.25)",
          }}>
            <EyeOff size={10} /> Hidden
          </span>
        ) : (
          <span style={{
            display: "inline-flex", alignItems: "center", gap: 4,
            padding: "3px 8px", borderRadius: 4, fontSize: 10, fontWeight: 700,
            background: "rgba(34,197,94,0.12)", color: "#4ade80",
            border: "1px solid rgba(34,197,94,0.25)",
          }}>
            <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#4ade80" }} />
            Visible
          </span>
        )}
      </td>

      {/* Actions */}
      <td style={{ padding: "8px 14px" }}>
        <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
          <ActionBtn title="Preview challenge" onClick={onPreview} color="#818cf8">
            <Eye size={12} />
          </ActionBtn>
          <ActionBtn title="Edit challenge" onClick={onEdit}>
            <Edit2 size={12} />
          </ActionBtn>
          <div style={{ width: 1, background: "var(--border)", margin: "2px 2px" }} />
          {c.isHidden
            ? <ActionBtn title="Reveal to students" onClick={onReveal} color="#4ade80"><Eye size={12} /></ActionBtn>
            : <ActionBtn title="Hide from students" onClick={onHide} color="#fbbf24"><EyeOff size={12} /></ActionBtn>
          }
          <ActionBtn title="Manage hints" onClick={onHint}>
            <Lightbulb size={12} />
          </ActionBtn>
          <ActionBtn title="Rotate flag" onClick={onFlag}>
            <Flag size={12} />
          </ActionBtn>
        </div>
      </td>
    </tr>
  );
}

// ── Props ────────────────────────────────────────────────────────────────────

interface Props {
  competitionId: string;
  onChanged: () => void;
}

// ── Main component ───────────────────────────────────────────────────────────

export default function TeacherCtfChallengesTab({ competitionId, onChanged }: Props) {
  const [list, setList] = useState<CTFCompetitionChallengeDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [panel, setPanel] = useState<{ mode: "create" } | { mode: "edit"; challenge: CTFCompetitionChallengeDTO } | null>(null);
  const [previewChallenge, setPreviewChallenge] = useState<CTFCompetitionChallengeDTO | null>(null);
  const [flagModal, setFlagModal] = useState<CTFCompetitionChallengeDTO | null>(null);
  const [hintFor, setHintFor] = useState<CTFCompetitionChallengeDTO | null>(null);
  const [libraryPanelOpen, setLibraryPanelOpen] = useState(false);

  // ── Filter state ───────────────────────────────────────────────────────────
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState("");
  const [filterDiff, setFilterDiff] = useState("");
  const [filterStatus, setFilterStatus] = useState("");

  const reload = async () => {
    setLoading(true);
    try {
      const challenges = await getTeacherCtfCompetitionChallenges(competitionId);
      setList(challenges ?? []);
    } catch {
      toast.error("Failed to load challenges", "Please try again.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { reload(); }, [competitionId]);

  const onReveal = async (c: CTFCompetitionChallengeDTO) => {
    try {
      await revealTeacherCtfChallenge(competitionId, c.id);
      toast.success("Revealed", `"${c.title}" is now visible to students.`);
      reload(); onChanged();
    } catch { /* toasted */ }
  };
  const onHide = async (c: CTFCompetitionChallengeDTO) => {
    try {
      await hideTeacherCtfChallenge(competitionId, c.id);
      toast.success("Hidden", `"${c.title}" is hidden from students.`);
      reload(); onChanged();
    } catch { /* toasted */ }
  };

  // ── Filtered list ──────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return list.filter(c => {
      if (q && !c.title.toLowerCase().includes(q) && !c.category.toLowerCase().includes(q)) return false;
      if (filterCat && c.category !== filterCat) return false;
      if (filterDiff && c.difficulty !== filterDiff) return false;
      if (filterStatus === "VISIBLE" && c.isHidden) return false;
      if (filterStatus === "HIDDEN" && !c.isHidden) return false;
      return true;
    });
  }, [list, search, filterCat, filterDiff, filterStatus]);

  const hasFilters = search || filterCat || filterDiff || filterStatus;
  const clearFilters = () => { setSearch(""); setFilterCat(""); setFilterDiff(""); setFilterStatus(""); };

  const cats = useMemo(() => Array.from(new Set(list.map(c => c.category))).sort(), [list]);

  return (
    <div>
      {/* ── Top bar ──────────────────────────────────────────────────────── */}
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        marginBottom: 14, gap: 12, flexWrap: "wrap",
      }}>
        <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
          {hasFilters
            ? <>{filtered.length} of {list.length} challenge{list.length !== 1 ? "s" : ""}</>
            : <>{list.length} challenge{list.length !== 1 ? "s" : ""} in this competition</>
          }
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="psp-btn psp-btn-secondary" style={{ gap: 6 }} onClick={() => setLibraryPanelOpen(true)}>
            <BookOpen size={13} /> From Library
          </button>
          <button className="psp-btn psp-btn-primary" style={{ gap: 6 }} onClick={() => setPanel({ mode: "create" })}>
            <Plus size={13} /> Add Challenge
          </button>
        </div>
      </div>

      {/* ── Filter toolbar ───────────────────────────────────────────────── */}
      <div style={{
        display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap", alignItems: "center",
        padding: "10px 14px", borderRadius: 8,
        border: "1px solid var(--border)", background: "var(--bg-secondary)",
      }}>
        <SlidersHorizontal size={13} style={{ color: "var(--text-muted)", flexShrink: 0 }} />

        {/* Search */}
        <div style={{ position: "relative", flex: "1 1 180px", minWidth: 140 }}>
          <Search size={12} style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
          <input
            className="input"
            placeholder="Search by title or category…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ paddingLeft: 28, height: 32, fontSize: 12 }}
          />
        </div>

        {/* Category */}
        <FilterSelect
          value={filterCat}
          onChange={setFilterCat}
          placeholder="Category"
          options={cats.map(c => ({ value: c, label: c }))}
        />

        {/* Difficulty */}
        <FilterSelect
          value={filterDiff}
          onChange={setFilterDiff}
          placeholder="Difficulty"
          options={[
            { value: "EASY", label: "Easy" },
            { value: "MEDIUM", label: "Medium" },
            { value: "HARD", label: "Hard" },
          ]}
        />

        {/* Status */}
        <FilterSelect
          value={filterStatus}
          onChange={setFilterStatus}
          placeholder="Status"
          options={[
            { value: "VISIBLE", label: "Visible" },
            { value: "HIDDEN", label: "Hidden" },
          ]}
        />

        {/* Clear */}
        {hasFilters && (
          <button
            onClick={clearFilters}
            style={{
              display: "inline-flex", alignItems: "center", gap: 4,
              padding: "5px 10px", borderRadius: 6, fontSize: 11, fontWeight: 600,
              background: "transparent", border: "1px solid rgba(239,68,68,0.35)",
              color: "#f87171", cursor: "pointer",
            }}
          >
            <X size={10} /> Clear
          </button>
        )}
      </div>

      {/* ── Table ────────────────────────────────────────────────────────── */}
      {loading ? (
        <div className="skel" style={{ height: 240, borderRadius: 8 }} />
      ) : list.length === 0 ? (
        <div className="psp-empty">
          <div className="psp-empty-title">No challenges yet</div>
          <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
            Add your first challenge — it&apos;ll be hidden by default until you reveal it.
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="psp-empty">
          <div className="psp-empty-title">No matches</div>
          <div style={{ fontSize: 13, color: "var(--text-muted)" }}>Try adjusting your search or filters.</div>
        </div>
      ) : (
        <div style={{ overflowX: "auto", border: "1px solid var(--border)", borderRadius: 8, background: "var(--surface)" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: "2px solid var(--border)" }}>
                {["Title", "Category", "Difficulty", "Points", "Solves", "Status", "Actions"].map(h => (
                  <th key={h} style={{
                    padding: "10px 14px", textAlign: "left",
                    fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase",
                    letterSpacing: "0.07em", fontWeight: 700,
                    background: "var(--bg-secondary)",
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(c => (
                <ChallengeRow
                  key={c.id}
                  c={c}
                  competitionId={competitionId}
                  onReveal={() => onReveal(c)}
                  onHide={() => onHide(c)}
                  onEdit={() => setPanel({ mode: "edit", challenge: c })}
                  onPreview={() => setPreviewChallenge(c)}
                  onHint={() => setHintFor(c)}
                  onFlag={() => setFlagModal(c)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Modals & panels ──────────────────────────────────────────────── */}

      {previewChallenge && (
        <ChallengePreviewDrawer
          challenge={previewChallenge}
          competitionId={competitionId}
          onClose={() => setPreviewChallenge(null)}
          onEdit={() => { setPanel({ mode: "edit", challenge: previewChallenge }); setPreviewChallenge(null); }}
        />
      )}

      {panel && (
        <ChallengePanel
          competitionId={competitionId}
          mode={panel.mode}
          existing={panel.mode === "edit" ? panel.challenge : undefined}
          onClose={() => setPanel(null)}
          onSaved={() => { reload(); onChanged(); setPanel(null); }}
          onJustCreated={() => { reload(); onChanged(); }}
        />
      )}

      {flagModal && (
        <FlagRotateModal
          competitionId={competitionId}
          challenge={flagModal}
          onClose={() => setFlagModal(null)}
          onDone={() => { reload(); setFlagModal(null); }}
        />
      )}

      {hintFor && (
        <HintManagerModal
          competitionId={competitionId}
          challenge={hintFor}
          onClose={() => setHintFor(null)}
          onChanged={() => reload()}
        />
      )}

      {libraryPanelOpen && (
        <LibraryPickerPanel
          competitionId={competitionId}
          onClose={() => setLibraryPanelOpen(false)}
          onAdded={() => { reload(); onChanged(); }}
        />
      )}
    </div>
  );
}

// ── Challenge Preview Drawer ─────────────────────────────────────────────────

function ChallengePreviewDrawer({
  challenge, competitionId, onClose, onEdit,
}: {
  challenge: CTFCompetitionChallengeDTO;
  competitionId: string;
  onClose: () => void;
  onEdit: () => void;
}) {
  const cat  = CAT_COLORS[challenge.category]  ?? CAT_COLORS.MISC!;
  const diff = DIFF_COLORS[challenge.difficulty] ?? DIFF_COLORS.EASY!;

  const [instance, setInstance] = useState<CTFInstanceResponse | null>(null);
  const [instanceBusy, setInstanceBusy] = useState(false);
  const [instanceError, setInstanceError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Fetch existing admin instance on open (if challenge requires one)
  useEffect(() => {
    if (!challenge.requiresInstance) return;
    getCtfInstanceStatus(challenge.id)
      .then(r => setInstance(r))
      .catch(() => {});
  }, [challenge.id, challenge.requiresInstance]);

  const launchInstance = async () => {
    setInstanceBusy(true);
    setInstanceError(null);
    try {
      const r = await startCTFInstance(challenge.id, { competitionId });
      setInstance(r);
    } catch (e: any) {
      setInstanceError(e?.message ?? "Failed to launch instance.");
    } finally {
      setInstanceBusy(false);
    }
  };

  const killInstance = async () => {
    if (!instance) return;
    setInstanceBusy(true);
    try {
      await stopCTFInstance(challenge.id, instance.instanceId);
      setInstance(null);
    } catch (e: any) {
      setInstanceError(e?.message ?? "Failed to stop instance.");
    } finally {
      setInstanceBusy(false);
    }
  };

  const copyConnection = async () => {
    const conn = instance?.connectionString ?? instance?.accessUrl ?? "";
    if (!conn) return;
    try { await navigator.clipboard.writeText(conn); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch {}
  };

  const connStr = instance?.connectionString ?? instance?.accessUrl ?? null;
  const isRunning = instance?.status === "RUNNING" || instance?.status === "STARTING";

  return (
    <div
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 300,
        display: "flex", justifyContent: "flex-end", backdropFilter: "blur(2px)",
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: 560, maxWidth: "96vw", height: "100vh", display: "flex", flexDirection: "column",
          background: "var(--bg-elevated)", boxShadow: "-16px 0 48px rgba(0,0,0,0.45)",
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{
          padding: "14px 20px", borderBottom: "1px solid var(--border)",
          background: "var(--bg-secondary)",
          display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12,
        }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6, flexWrap: "wrap" }}>
              <span style={{
                fontSize: 10, padding: "2px 7px", borderRadius: 4, fontWeight: 700,
                background: cat.bg, color: cat.fg,
              }}>{challenge.category}</span>
              <span style={{
                fontSize: 10, padding: "2px 7px", borderRadius: 4, fontWeight: 700,
                background: diff.bg, color: diff.fg,
              }}>{challenge.difficulty}</span>
              {challenge.isHidden ? (
                <span style={{
                  fontSize: 10, padding: "2px 7px", borderRadius: 4, fontWeight: 700,
                  background: "rgba(148,163,184,0.12)", color: "#94a3b8",
                }}>Hidden</span>
              ) : (
                <span style={{
                  fontSize: 10, padding: "2px 7px", borderRadius: 4, fontWeight: 700,
                  background: "rgba(34,197,94,0.12)", color: "#4ade80",
                }}>Visible</span>
              )}
            </div>
            <div style={{ fontSize: 17, fontWeight: 800, color: "var(--text-primary)", lineHeight: 1.2 }}>
              {challenge.title}
            </div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
              {challenge.basePoints} pts · {challenge.solveCount} solve{challenge.solveCount !== 1 ? "s" : ""}
              {challenge.hints.length > 0 && ` · ${challenge.hints.length} hint${challenge.hints.length !== 1 ? "s" : ""}`}
            </div>
          </div>
          <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
            <button
              onClick={onEdit}
              style={{
                display: "inline-flex", alignItems: "center", gap: 5,
                padding: "6px 10px", borderRadius: 6, fontSize: 12, fontWeight: 600,
                background: "var(--bg-hover)", border: "1px solid var(--border)",
                color: "var(--text-secondary)", cursor: "pointer",
              }}
            >
              <Edit2 size={12} /> Edit
            </button>
            <button onClick={onClose} style={{
              background: "transparent", border: "1px solid var(--border)", borderRadius: 6,
              cursor: "pointer", color: "var(--text-muted)", padding: "6px 8px",
              display: "flex", alignItems: "center",
            }}>
              <X size={15} />
            </button>
          </div>
        </div>

        {/* Scrollable body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "20px" }}>

          {/* Player's View label */}
          <div style={{
            display: "flex", alignItems: "center", gap: 6, marginBottom: 14,
            fontSize: 10, fontWeight: 700, color: "var(--text-muted)",
            textTransform: "uppercase", letterSpacing: "0.07em",
          }}>
            <Eye size={11} /> Player&apos;s view
          </div>

          {/* Description */}
          <div style={{
            padding: "16px 18px", borderRadius: 8,
            border: "1px solid var(--border)", background: "var(--bg-secondary)",
            marginBottom: 16,
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>
              Description
            </div>
            {challenge.description ? (
              <pre style={{
                margin: 0, fontFamily: "inherit", fontSize: 13, lineHeight: 1.7,
                color: "var(--text-secondary)", whiteSpace: "pre-wrap", wordBreak: "break-word",
              }}>{challenge.description}</pre>
            ) : (
              <div style={{ fontSize: 12, color: "var(--text-muted)", fontStyle: "italic" }}>
                No description provided.
              </div>
            )}
          </div>

          {/* Downloadable file */}
          {challenge.downloadableFileUrl && (
            <div style={{
              display: "flex", alignItems: "center", gap: 10, padding: "12px 14px",
              borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg-secondary)",
              marginBottom: 16,
            }}>
              <Download size={14} style={{ color: "#60a5fa", flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)" }}>
                  {challenge.downloadableFileName ?? "Challenge file"}
                </div>
                <div style={{ fontSize: 11, color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {challenge.downloadableFileUrl}
                </div>
              </div>
              <a
                href={challenge.downloadableFileUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: "inline-flex", alignItems: "center", gap: 4,
                  padding: "5px 10px", borderRadius: 6, fontSize: 11, fontWeight: 600,
                  background: "var(--bg-hover)", border: "1px solid var(--border)",
                  color: "var(--text-secondary)", textDecoration: "none",
                }}
              >
                <ExternalLink size={11} /> Open
              </a>
            </div>
          )}

          {/* Hints */}
          {challenge.hints.length > 0 && (
            <div style={{
              padding: "14px 16px", borderRadius: 8,
              border: "1px solid rgba(251,191,36,0.2)", background: "rgba(251,191,36,0.04)",
              marginBottom: 16,
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#fbbf24", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>
                Hints ({challenge.hints.length})
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {challenge.hints.map((h, i) => (
                  <div key={h.id} style={{
                    display: "flex", gap: 10, padding: "8px 10px",
                    borderRadius: 6, background: "rgba(251,191,36,0.06)", border: "1px solid rgba(251,191,36,0.15)",
                  }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: "#fbbf24", minWidth: 52 }}>Hint {i + 1}</span>
                    <span style={{ fontSize: 12, color: "var(--text-secondary)", flex: 1 }}>{h.text}</span>
                    <span style={{ fontSize: 10, color: "var(--text-muted)", flexShrink: 0 }}>{h.cost} pts</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Docker instance testing ─────────────────────────────────── */}
          {challenge.requiresInstance && (
            <div style={{
              borderRadius: 8, border: "1px solid rgba(167,139,250,0.3)",
              background: "rgba(167,139,250,0.04)", overflow: "hidden",
            }}>
              {/* Section header */}
              <div style={{
                padding: "12px 16px", borderBottom: "1px solid rgba(167,139,250,0.15)",
                background: "rgba(167,139,250,0.06)",
                display: "flex", alignItems: "center", gap: 8,
              }}>
                <Zap size={13} style={{ color: "#a78bfa" }} />
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)" }}>
                    Instance Testing
                  </div>
                  <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 1 }}>
                    Admin test — spawns a real container to verify the challenge works
                  </div>
                </div>
              </div>

              <div style={{ padding: "14px 16px" }}>
                {instanceError && (
                  <div style={{
                    display: "flex", alignItems: "center", gap: 6, marginBottom: 12,
                    padding: "8px 12px", borderRadius: 6, fontSize: 12,
                    background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)",
                    color: "#f87171",
                  }}>
                    <AlertCircle size={12} /> {instanceError}
                  </div>
                )}

                {!instance || !isRunning ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {/* Config summary */}
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      <span style={{
                        fontSize: 10, padding: "2px 8px", borderRadius: 4, fontWeight: 700,
                        background: "rgba(167,139,250,0.12)", color: "#a78bfa",
                      }}>
                        {challenge.connectionType ?? "DOCKER"}
                      </span>
                      {challenge.dockerExposedPort && (
                        <span style={{
                          fontSize: 10, padding: "2px 8px", borderRadius: 4, fontWeight: 700,
                          background: "var(--bg-secondary)", color: "var(--text-muted)",
                          fontFamily: "ui-monospace, monospace",
                        }}>
                          :{challenge.dockerExposedPort}
                        </span>
                      )}
                      {challenge.dockerMemoryMb && (
                        <span style={{
                          fontSize: 10, padding: "2px 8px", borderRadius: 4, fontWeight: 700,
                          background: "var(--bg-secondary)", color: "var(--text-muted)",
                        }}>
                          {challenge.dockerMemoryMb} MB
                        </span>
                      )}
                    </div>

                    <button
                      className="psp-btn psp-btn-primary"
                      style={{
                        gap: 6, justifyContent: "center", alignSelf: "flex-start",
                        background: "linear-gradient(135deg, #7c3aed, #6d28d9)",
                        borderColor: "#7c3aed",
                      }}
                      disabled={instanceBusy}
                      onClick={launchInstance}
                    >
                      {instanceBusy ? (
                        <><RefreshCw size={12} style={{ animation: "spin 1s linear infinite" }} /> Launching…</>
                      ) : (
                        <><Zap size={12} /> Launch Test Instance</>
                      )}
                    </button>
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {/* Status */}
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      {instance.status === "STARTING" ? (
                        <RefreshCw size={12} style={{ color: "#fbbf24", animation: "spin 1s linear infinite" }} />
                      ) : (
                        <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#4ade80", animation: "ctf-pulse 2s infinite" }} />
                      )}
                      <span style={{ fontSize: 12, fontWeight: 700, color: instance.status === "STARTING" ? "#fbbf24" : "#4ade80" }}>
                        {instance.status === "STARTING" ? "Starting…" : "Running"}
                      </span>
                      <span style={{ fontSize: 11, color: "var(--text-muted)", marginLeft: 4 }}>
                        Expires {new Date(instance.expiresAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>

                    {/* Connection string */}
                    {connStr && (
                      <div style={{
                        display: "flex", alignItems: "center", gap: 8,
                        padding: "8px 12px", borderRadius: 6,
                        background: "rgba(0,0,0,0.25)", border: "1px solid rgba(167,139,250,0.25)",
                      }}>
                        {challenge.connectionType === "HTTP" ? <Globe size={12} style={{ color: "#60a5fa", flexShrink: 0 }} /> : <Terminal size={12} style={{ color: "#60a5fa", flexShrink: 0 }} />}
                        <span style={{ flex: 1, fontFamily: "ui-monospace, monospace", fontSize: 12, color: "#a5b4fc", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {challenge.connectionType === "TCP" ? `nc ${connStr}` : connStr}
                        </span>
                        <button type="button" onClick={copyConnection} style={{
                          background: "none", border: "none", cursor: "pointer",
                          display: "flex", alignItems: "center", gap: 3,
                          fontSize: 11, color: copied ? "#4ade80" : "#64748b",
                        }}>
                          {copied ? <><Check size={11} /> Copied</> : <><Copy size={11} /> Copy</>}
                        </button>
                        {challenge.connectionType === "HTTP" && (
                          <a href={connStr} target="_blank" rel="noopener noreferrer" style={{
                            display: "flex", alignItems: "center", gap: 3,
                            fontSize: 11, color: "#818cf8", textDecoration: "none",
                          }}>
                            <ExternalLink size={11} /> Open
                          </a>
                        )}
                      </div>
                    )}

                    <button
                      onClick={killInstance}
                      disabled={instanceBusy}
                      style={{
                        display: "inline-flex", alignItems: "center", gap: 5,
                        padding: "6px 12px", borderRadius: 6, fontSize: 12, fontWeight: 600,
                        alignSelf: "flex-start",
                        background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.3)",
                        color: "#f87171", cursor: "pointer",
                      }}
                    >
                      {instanceBusy ? <RefreshCw size={12} style={{ animation: "spin 1s linear infinite" }} /> : <Square size={12} />}
                      Stop Instance
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Library picker panel ─────────────────────────────────────────────────────────

function LibraryPickerPanel({
  competitionId, onClose, onAdded,
}: {
  competitionId: string;
  onClose: () => void;
  onAdded: () => void;
}) {
  const [challenges, setChallenges] = useState<CTFLibraryChallengeDTO[]>([]);
  const [loading, setLoading]       = useState(true);
  const [search, setSearch]         = useState("");
  const [catFilter, setCatFilter]   = useState("ALL");
  const [adding, setAdding]         = useState<string | null>(null);

  useEffect(() => {
    getCtfLibrary()
      .then(setChallenges)
      .catch(() => toast.error("Failed to load library", "Please try again."))
      .finally(() => setLoading(false));
  }, []);

  const visible = challenges.filter(c => {
    const matchesCat = catFilter === "ALL" || c.category === catFilter;
    const q = search.toLowerCase();
    const matchesSearch = !q || c.title.toLowerCase().includes(q) || c.category.toLowerCase().includes(q);
    return matchesCat && matchesSearch;
  });

  const handleAdd = async (c: CTFLibraryChallengeDTO) => {
    setAdding(c.id);
    try {
      await addLibraryChallengeToCompetition(c.id, competitionId);
      toast.success("Added from library", `"${c.title}" added to this competition.`);
      onAdded();
    } catch (e: any) {
      toast.error("Failed to add", e?.message ?? "Please try again.");
    } finally {
      setAdding(null);
    }
  };

  const cats = ["ALL", ...Array.from(new Set(challenges.map(c => c.category)))];

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 300,
      display: "flex", justifyContent: "flex-end", backdropFilter: "blur(2px)",
    }} onClick={onClose}>
      <div style={{
        width: 560, maxWidth: "96vw", height: "100vh", display: "flex", flexDirection: "column",
        background: "var(--surface)", boxShadow: "-12px 0 40px rgba(0,0,0,0.4)",
      }} onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div style={{
          padding: "16px 24px", borderBottom: "1px solid var(--border)",
          display: "flex", justifyContent: "space-between", alignItems: "center",
          background: "var(--bg-secondary)",
        }}>
          <div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600 }}>
              Challenge Library
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)", marginTop: 2 }}>
              Add from Library
            </div>
          </div>
          <button onClick={onClose} style={{
            background: "transparent", border: "1px solid var(--border)", borderRadius: 6,
            cursor: "pointer", color: "var(--text-muted)", padding: 6, display: "flex",
          }}>
            <X size={16} />
          </button>
        </div>

        {/* Search + filter */}
        <div style={{ padding: "12px 20px", borderBottom: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ position: "relative" }}>
            <Search size={13} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
            <input
              className="input"
              placeholder="Search challenges…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ paddingLeft: 30 }}
            />
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {cats.map(cat => (
              <button key={cat} type="button" onClick={() => setCatFilter(cat)} style={{
                padding: "3px 10px", borderRadius: 4, fontSize: 11, fontWeight: 600,
                border: "1px solid",
                borderColor: catFilter === cat ? "var(--purple, #a78bfa)" : "var(--border)",
                background: catFilter === cat ? "rgba(167,139,250,0.12)" : "transparent",
                color: catFilter === cat ? "var(--purple, #a78bfa)" : "var(--text-muted)",
                cursor: "pointer",
              }}>
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* List */}
        <div style={{ flex: 1, overflowY: "auto", padding: "12px 20px", display: "flex", flexDirection: "column", gap: 8 }}>
          {loading ? (
            <>
              {[1, 2, 3].map(i => <div key={i} className="skel" style={{ height: 72, borderRadius: 8 }} />)}
            </>
          ) : visible.length === 0 ? (
            <div className="psp-empty" style={{ marginTop: 40 }}>
              <BookOpen size={28} style={{ margin: "0 auto 8px", color: "var(--text-subtle)" }} />
              <div className="psp-empty-title">
                {challenges.length === 0 ? "Library is empty" : "No matches"}
              </div>
              <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                {challenges.length === 0
                  ? "Go to the Library page to create reusable challenges."
                  : "Try a different search or category."}
              </div>
            </div>
          ) : visible.map(c => {
            const cat  = CAT_COLORS[c.category]  ?? CAT_COLORS.MISC!;
            const diff = DIFF_COLORS[c.difficulty] ?? DIFF_COLORS.EASY!;
            const buildReady = c.buildStatus === "READY";
            const buildPending = c.requiresInstance && !buildReady;
            return (
              <div key={c.id} style={{
                padding: "12px 14px", borderRadius: 8,
                border: "1px solid var(--border)", background: "var(--bg-secondary)",
                display: "flex", alignItems: "center", gap: 12,
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 4 }}>
                    <span style={{
                      fontSize: 10, padding: "2px 7px", borderRadius: 4, fontWeight: 700,
                      background: cat.bg, color: cat.fg,
                    }}>{c.category}</span>
                    <span style={{
                      fontSize: 10, padding: "2px 7px", borderRadius: 4, fontWeight: 700,
                      background: diff.bg, color: diff.fg,
                    }}>{c.difficulty}</span>
                    {c.requiresInstance && (
                      <span style={{
                        fontSize: 10, padding: "2px 7px", borderRadius: 4, fontWeight: 700,
                        background: buildReady ? "rgba(34,197,94,0.1)" : "rgba(148,163,184,0.12)",
                        color: buildReady ? "#4ade80" : "#94a3b8",
                      }}>
                        {buildReady ? "Docker ✓" : "Docker – no image"}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {c.title}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
                    {c.basePoints} pts · used {c.useCount}×
                    {buildPending && <span style={{ color: "#f59e0b", marginLeft: 6 }}>⚠ image not built yet</span>}
                  </div>
                </div>
                <button
                  className="psp-btn psp-btn-primary psp-btn-sm"
                  style={{ gap: 4, flexShrink: 0 }}
                  disabled={adding === c.id}
                  onClick={() => handleAdd(c)}
                >
                  {adding === c.id ? "Adding…" : <><Plus size={11} /> Add</>}
                </button>
              </div>
            );
          })}
        </div>

        {/* Footer hint */}
        <div style={{
          padding: "10px 20px", borderTop: "1px solid var(--border)",
          background: "var(--bg-secondary)", fontSize: 11, color: "var(--text-muted)",
        }}>
          Challenges added from the library are independent copies — editing one won&apos;t affect the other.
        </div>
      </div>
    </div>
  );
}

// ── Slide-in challenge panel ────────────────────────────────────────────────────

type TabKey = "basics" | "flag" | "docker" | "hints";

interface EnvVarEntry { key: string; value: string; _id: string }

function ChallengePanel({
  competitionId, mode, existing, onClose, onSaved, onJustCreated,
}: {
  competitionId: string;
  mode: "create" | "edit";
  existing?: CTFCompetitionChallengeDTO;
  onClose: () => void;
  onSaved: () => void;
  onJustCreated?: () => void;
}) {
  // ── State ─────────────────────────────────────────────────────────────────
  const [form, setForm] = useState({
    title: existing?.title ?? "",
    authorName: existing?.authorName ?? "",
    description: existing?.description ?? "",
    category: existing?.category ?? "WEB",
    difficulty: (existing?.difficulty ?? "EASY") as "EASY" | "MEDIUM" | "HARD",
    basePoints: existing?.basePoints ?? 300,
    flagType: (existing?.flagType === "DYNAMIC" ? "DYNAMIC" : "STATIC") as "STATIC" | "DYNAMIC",
    plainFlag: "",
    flagFormat: existing?.flagFormat ?? "FLAG{?}",
    downloadableFileUrl: existing?.downloadableFileUrl ?? "",
    mediaUrl: existing?.mediaUrl ?? "",
    maxAttempts: existing?.maxAttempts != null ? String(existing.maxAttempts) : "10",
    attemptsMode: (existing?.maxAttempts == null ? "unlimited" : "limited") as "limited" | "unlimited",

    // Blood bonus
    bloodBonusEnabled: existing?.bloodBonusEnabled ?? false,
    firstBloodBonus: existing?.firstBloodBonus != null ? String(existing.firstBloodBonus) : "0",
    secondBloodBonus: existing?.secondBloodBonus != null ? String(existing.secondBloodBonus) : "0",
    thirdBloodBonus: existing?.thirdBloodBonus != null ? String(existing.thirdBloodBonus) : "0",

    // Docker
    requiresInstance: existing?.requiresInstance ?? false,
    dockerImage: existing?.dockerImage ?? "",
    // dockerExposedPort intentionally absent — auto-detected from Dockerfile EXPOSE at build time
    connectionType: (existing?.connectionType === "TCP" ? "TCP" : "HTTP") as "HTTP" | "TCP",
    dockerFlagEnv: existing?.dockerFlagEnv ?? "FLAG",
    dockerMemoryMb: existing?.dockerMemoryMb ? String(existing.dockerMemoryMb) : "",
    dockerCpuPercent: existing?.dockerCpuPercent ? String(existing.dockerCpuPercent) : "",
    dockerPidsLimit: existing?.dockerPidsLimit ? String(existing.dockerPidsLimit) : "",
  });

  const [envVars, setEnvVars] = useState<EnvVarEntry[]>(() => {
    const ev = existing?.dockerEnvVars;
    if (!ev) return [];
    return Object.entries(ev).map(([k, v]) => ({ key: k, value: v, _id: `ev-${k}` }));
  });

  const [hints, setHints] = useState<{ cost: number; text: string }[]>([]);
  const [tab, setTab] = useState<TabKey>("basics");
  const [busy, setBusy] = useState<"hidden" | "reveal" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const [currentBuild, setCurrentBuild] = useState<CTFChallengeBuildDTO | null>(null);
  const [pendingZipFile, setPendingZipFile]   = useState<File | null>(null);
  const [buildModeId, setBuildModeId]         = useState<string | null>(null);
  const [buildModeInitialBuild, setBuildModeInitialBuild] = useState<CTFChallengeBuildDTO | null>(null);
  const [zipUploading, setZipUploading]       = useState(false);
  const zipUploadProgress                     = useRef(0);

  // Load initial build status when editing a challenge that requires an instance
  useEffect(() => {
    if (mode === "edit" && existing?.requiresInstance && existing.id) {
      getCTFChallengeBuildStatus(existing.id)
        .then(b => setCurrentBuild(b))
        .catch(() => setCurrentBuild(null));
    }
  }, [mode, existing?.id, existing?.requiresInstance]);

  // ── Derived state ─────────────────────────────────────────────────────────
  const fieldErrors = useMemo(() => {
    const errs: Record<string, string> = {};
    if (!form.title.trim() || form.title.trim().length < 3)
      errs.title = "Title must be at least 3 characters";
    if (form.basePoints < 50 || form.basePoints > 5000)
      errs.basePoints = "Points must be between 50 and 5000";
    if (mode === "create" && form.flagType === "STATIC") {
      if (!form.plainFlag.trim()) errs.plainFlag = "Flag is required";
      else if (/\s/.test(form.plainFlag)) errs.plainFlag = "Flag cannot contain spaces";
      else if (form.plainFlag.trim().length < 3) errs.plainFlag = "Flag must be at least 3 characters";
    }
    if (form.requiresInstance) {
      // dockerExposedPort is auto-detected from Dockerfile EXPOSE — no manual validation needed
    }
    return errs;
  }, [form, mode]);

  const tabHasError = (t: TabKey): boolean => {
    if (t === "basics") return !!(fieldErrors.title || fieldErrors.basePoints);
    if (t === "flag")   return !!fieldErrors.plainFlag;
    if (t === "docker") return !!fieldErrors.dockerImage;
    return false;
  };

  // ── Env var helpers ────────────────────────────────────────────────────────
  const addEnvVar = () => setEnvVars(p => [...p, { key: "", value: "", _id: `ev-${Date.now()}-${Math.random()}` }]);
  const removeEnvVar = (id: string) => setEnvVars(p => p.filter(e => e._id !== id));
  const updateEnvVar = (id: string, field: "key" | "value", v: string) =>
    setEnvVars(p => p.map(e => e._id === id ? { ...e, [field]: v } : e));

  // ── Submit ─────────────────────────────────────────────────────────────────
  const save = async (reveal: boolean) => {
    setError(null);
    setTouched(new Set(["title", "basePoints", "plainFlag", "dockerImage"]));

    if (Object.keys(fieldErrors).length > 0) {
      const firstErr = Object.keys(fieldErrors)[0];
      if (["title", "basePoints"].includes(firstErr)) setTab("basics");
      else if (firstErr === "plainFlag") setTab("flag");
      else if (firstErr.startsWith("docker")) setTab("docker");
      setError(fieldErrors[firstErr]);
      return;
    }

    setBusy(reveal ? "reveal" : "hidden");

    // Build Docker env vars map — strip FLAG keys
    const flagKey = (form.dockerFlagEnv || "FLAG").toUpperCase();
    const dockerEnvVarsMap: Record<string, string> | undefined = envVars.length > 0
      ? Object.fromEntries(
          envVars
            .filter(e => e.key.trim() && e.key.toUpperCase() !== flagKey && e.key.toUpperCase() !== "FLAG")
            .map(e => [e.key.trim(), e.value]),
        )
      : undefined;

    const dockerFields = form.requiresInstance ? {
      // In create mode, dockerImage may be empty — image is uploaded after first save
      ...(form.dockerImage.trim() ? { dockerImage: form.dockerImage.trim() } : {}),
      // dockerExposedPort intentionally omitted — auto-detected from Dockerfile EXPOSE at build time
      connectionType: form.connectionType,
      dockerFlagEnv: form.dockerFlagEnv.trim() || "FLAG",
      dockerEnvVars: dockerEnvVarsMap,
      dockerMemoryMb: form.dockerMemoryMb ? parseInt(form.dockerMemoryMb) : undefined,
      dockerCpuPercent: form.dockerCpuPercent ? parseInt(form.dockerCpuPercent) : undefined,
      dockerPidsLimit: form.dockerPidsLimit ? parseInt(form.dockerPidsLimit) : undefined,
    } : {};

    try {
      if (mode === "create") {
        const payload: TeacherCtfChallengeCreateRequest = {
          title: form.title.trim(),
          authorName: form.authorName.trim() || undefined,
          description: form.description,
          category: form.category,
          difficulty: form.difficulty,
          basePoints: form.basePoints,
          flagType: form.flagType,
          plainFlag: form.flagType === "STATIC" ? form.plainFlag.trim() : undefined,
          flagFormat: form.flagType === "DYNAMIC" ? form.flagFormat.trim() : undefined,
          downloadableFileUrl: form.downloadableFileUrl || undefined,
          mediaUrl: form.mediaUrl || undefined,
          requiresInstance: form.requiresInstance,
          ...dockerFields,
          maxAttempts: form.attemptsMode === "unlimited" ? 0 : parseInt(form.maxAttempts) || 10,
          hints: hints.length > 0 ? hints : undefined,
          bloodBonusEnabled: form.bloodBonusEnabled,
          firstBloodBonus: form.bloodBonusEnabled ? (parseInt(form.firstBloodBonus) || 0) : 0,
          secondBloodBonus: form.bloodBonusEnabled ? (parseInt(form.secondBloodBonus) || 0) : 0,
          thirdBloodBonus: form.bloodBonusEnabled ? (parseInt(form.thirdBloodBonus) || 0) : 0,
        };
        const created = await addTeacherCtfChallenge(competitionId, payload);
        if (reveal) {
          await revealTeacherCtfChallenge(competitionId, created.id);
        }
        if (form.requiresInstance && pendingZipFile) {
          onJustCreated?.();
          setBusy(null);
          setZipUploading(true);
          try {
            await uploadCTFChallengeZip("", created.id, pendingZipFile, pct => {
              zipUploadProgress.current = pct;
            });
          } finally {
            setZipUploading(false);
          }
          const initialBuild = await getCTFChallengeBuildStatus(created.id).catch(() => null);
          setBuildModeInitialBuild(initialBuild);
          setBuildModeId(created.id);
          return;
        }
        toast.success(reveal ? "Challenge added and revealed" : "Challenge added (hidden)", form.title);
      } else if (existing) {
        const payload: TeacherCtfChallengeUpdateRequest = {
          title: form.title,
          authorName: form.authorName.trim() || undefined,
          description: form.description,
          category: form.category,
          difficulty: form.difficulty,
          basePoints: form.basePoints,
          flagType: form.flagType,
          flagFormat: form.flagType === "DYNAMIC" ? form.flagFormat.trim() : undefined,
          downloadableFileUrl: form.downloadableFileUrl || undefined,
          mediaUrl: form.mediaUrl || undefined,
          requiresInstance: form.requiresInstance,
          ...dockerFields,
          maxAttempts: form.attemptsMode === "unlimited" ? 0 : parseInt(form.maxAttempts) || 10,
          bloodBonusEnabled: form.bloodBonusEnabled,
          firstBloodBonus: form.bloodBonusEnabled ? (parseInt(form.firstBloodBonus) || 0) : 0,
          secondBloodBonus: form.bloodBonusEnabled ? (parseInt(form.secondBloodBonus) || 0) : 0,
          thirdBloodBonus: form.bloodBonusEnabled ? (parseInt(form.thirdBloodBonus) || 0) : 0,
        };
        await updateTeacherCtfChallenge(competitionId, existing.id, payload);
        toast.success("Challenge updated", form.title);
      }
      onSaved();
    } catch (e: any) {
      setError(e?.message ?? "Failed to save challenge.");
    } finally {
      setBusy(null);
    }
  };

  // ── Build mode: shown after two-step Docker challenge creation ───────────────
  if (zipUploading || buildModeId) {
    return (
      <div style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 300,
        display: "flex", justifyContent: "flex-end", backdropFilter: "blur(2px)",
      }}>
        <div style={{
          width: 680, maxWidth: "96vw", height: "100vh", display: "flex", flexDirection: "column",
          background: "var(--surface)", boxShadow: "-12px 0 40px rgba(0,0,0,0.4)",
        }}>
          <div style={{
            padding: "16px 24px", borderBottom: "1px solid var(--border)",
            display: "flex", justifyContent: "space-between", alignItems: "center",
            background: "var(--bg-secondary)",
          }}>
            <div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600 }}>
                Docker Build
              </div>
              <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)", marginTop: 2 }}>
                {form.title || "Challenge"}
              </div>
            </div>
            <button onClick={() => { onSaved(); }} style={{
              background: "transparent", border: "1px solid var(--border)", borderRadius: 6,
              cursor: "pointer", color: "var(--text-muted)", padding: 6, display: "flex",
            }}>
              <X size={16} />
            </button>
          </div>
          <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>
            {zipUploading ? (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, paddingTop: 40 }}>
                <UploadCloud size={36} color="#a78bfa" />
                <div style={{ fontSize: 14, color: "var(--text-primary)", fontWeight: 600 }}>Uploading ZIP…</div>
                <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Please wait while your build context is uploaded.</div>
              </div>
            ) : buildModeId ? (
              <ChallengeBuildPanel
                challengeId={buildModeId}
                initialBuild={buildModeInitialBuild}
                onBuildReady={(imageTag, detectedPort) => {
                  onJustCreated?.();
                  toast.success("Image ready", imageTag);
                  void detectedPort;
                  onSaved();
                }}
              />
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  const showErr = (key: string): string | null =>
    touched.has(key) && fieldErrors[key] ? fieldErrors[key] : null;

  const TABS: { key: TabKey; label: string; icon: React.ElementType }[] = [
    { key: "basics", label: "Basics",  icon: FileText },
    { key: "flag",   label: "Flag",    icon: Flag },
    { key: "docker", label: "Docker",  icon: Server },
    { key: "hints",  label: "Hints",   icon: Lightbulb },
  ];

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 300,
      display: "flex", justifyContent: "flex-end", backdropFilter: "blur(2px)",
    }} onClick={onClose}>
      <div style={{
        width: 680, maxWidth: "96vw", height: "100vh", display: "flex", flexDirection: "column",
        background: "var(--bg-elevated)", boxShadow: "-16px 0 48px rgba(0,0,0,0.45)",
      }} onClick={(e) => e.stopPropagation()}>

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div style={{
          padding: "16px 24px", borderBottom: "1px solid var(--border)",
          display: "flex", justifyContent: "space-between", alignItems: "center",
          background: "var(--bg-secondary)",
        }}>
          <div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600 }}>
              {mode === "create" ? "New Challenge" : "Edit Challenge"}
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)", marginTop: 2 }}>
              {mode === "create" ? (form.title || "Untitled challenge") : existing?.title}
            </div>
          </div>
          <button onClick={onClose} style={{
            background: "transparent", border: "1px solid var(--border)", borderRadius: 6,
            cursor: "pointer", color: "var(--text-muted)", padding: 6, display: "flex",
          }}>
            <X size={16} />
          </button>
        </div>

        {/* ── Tab strip ───────────────────────────────────────────────────── */}
        <div style={{
          display: "flex", borderBottom: "1px solid var(--border)",
          background: "var(--bg-secondary)", paddingLeft: 16, gap: 4,
        }}>
          {TABS.map(t => {
            const Icon = t.icon;
            const active = tab === t.key;
            const hasErr = tabHasError(t.key) && touched.size > 0;
            return (
              <button key={t.key} onClick={() => setTab(t.key)} style={{
                background: "transparent", border: "none", cursor: "pointer",
                padding: "12px 16px", fontSize: 13, fontWeight: 600,
                color: active ? "var(--text-primary)" : "var(--text-muted)",
                borderBottom: `2px solid ${active ? "var(--blue)" : "transparent"}`,
                display: "flex", alignItems: "center", gap: 6, position: "relative",
                marginBottom: -1,
              }}>
                <Icon size={13} />
                {t.label}
                {t.key === "docker" && form.requiresInstance && (
                  <span style={{
                    fontSize: 9, padding: "1px 6px", borderRadius: 10,
                    background: "rgba(167,139,250,0.15)", color: "var(--purple, #a78bfa)",
                    fontWeight: 700,
                  }}>ON</span>
                )}
                {t.key === "hints" && hints.length > 0 && (
                  <span style={{
                    fontSize: 9, padding: "1px 6px", borderRadius: 10,
                    background: "rgba(251,191,36,0.15)", color: "#fbbf24", fontWeight: 700,
                  }}>{hints.length}</span>
                )}
                {hasErr && (
                  <span style={{ width: 6, height: 6, borderRadius: 3, background: "#ef4444" }} />
                )}
              </button>
            );
          })}
        </div>

        {/* ── Error banner ────────────────────────────────────────────────── */}
        {error && (
          <div style={{
            margin: "12px 24px 0", display: "flex", alignItems: "center", gap: 8,
            background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.3)",
            color: "#f87171", borderRadius: 6, padding: "10px 12px", fontSize: 12,
          }}>
            <AlertCircle size={14} /> {error}
          </div>
        )}

        {/* ── Tab content (scrollable) ────────────────────────────────────── */}
        <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>

          {tab === "basics" && (
            <BasicsTab form={form} setForm={setForm} showErr={showErr} setTouched={setTouched} />
          )}

          {tab === "flag" && (
            <FlagTab form={form} setForm={setForm} mode={mode} showErr={showErr} setTouched={setTouched} />
          )}

          {tab === "docker" && (
            <DockerTab
              form={form}
              setForm={setForm}
              envVars={envVars}
              addEnvVar={addEnvVar}
              removeEnvVar={removeEnvVar}
              updateEnvVar={updateEnvVar}
              showErr={showErr}
              setTouched={setTouched}
              mode={mode}
              existingChallengeId={existing?.id}
              existingPort={existing?.dockerExposedPort}
              currentBuild={currentBuild}
              pendingZipFile={pendingZipFile}
              onPendingZipSelected={setPendingZipFile}
              onBuildReady={(imageTag) => {
                setCurrentBuild(prev => prev
                  ? { ...prev, buildStatus: "READY" as const, builtImageTag: imageTag }
                  : null);
                // Container port is auto-detected server-side and stored on the challenge.
                // The build panel re-fetches challenge data after READY, so the read-only
                // port badge refreshes without any manual state update here.
                setForm((f: typeof form) => ({ ...f, dockerImage: imageTag }));
              }}
            />
          )}

          {tab === "hints" && (
            <HintsTab hints={hints} setHints={setHints} disabled={mode !== "create"} />
          )}
        </div>

        {/* ── Footer actions ──────────────────────────────────────────────── */}
        {(() => {
          const buildInProgress =
            form.requiresInstance &&
            (currentBuild?.buildStatus === "BUILDING" || currentBuild?.buildStatus === "PULLING");
          return (
            <div style={{
              padding: "14px 24px", borderTop: "1px solid var(--border)",
              background: "var(--bg-secondary)",
              display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12,
            }}>
              <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                {buildInProgress
                  ? "Waiting for image build to complete…"
                  : Object.keys(fieldErrors).length > 0
                    ? `${Object.keys(fieldErrors).length} field${Object.keys(fieldErrors).length > 1 ? "s" : ""} need attention`
                    : mode === "create" ? "Ready to add" : "All set"}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="psp-btn psp-btn-secondary" onClick={onClose} disabled={busy !== null}>
                  Cancel
                </button>
                {mode === "create" ? (
                  <>
                    <button className="psp-btn psp-btn-secondary" onClick={() => save(false)} disabled={busy !== null || buildInProgress}>
                      {busy === "hidden" ? "Saving…" : "Save as Hidden"}
                    </button>
                    <button className="psp-btn psp-btn-primary" onClick={() => save(true)} disabled={busy !== null || buildInProgress}
                      style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      {busy === "reveal" ? "Publishing…" : "Add & Reveal"} <ChevronRight size={13} />
                    </button>
                  </>
                ) : (
                  <button
                    className="psp-btn psp-btn-primary"
                    onClick={() => save(false)}
                    disabled={busy !== null || buildInProgress}
                    title={buildInProgress ? "Waiting for image build to complete" : undefined}
                  >
                    {busy ? "Saving…" : "Save changes"}
                  </button>
                )}
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
}

// ── Basics tab ──────────────────────────────────────────────────────────────

function BasicsTab({
  form, setForm, showErr, setTouched,
}: {
  form: any;
  setForm: (f: any) => void;
  showErr: (key: string) => string | null;
  setTouched: (cb: (prev: Set<string>) => Set<string>) => void;
}) {
  const markTouched = (k: string) => setTouched(prev => new Set([...prev, k]));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Section icon={FileText} title="Challenge details" desc="Title, description and difficulty shown to players.">
        <Field label="Title" required error={showErr("title")}>
          <input className="input" value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            onBlur={() => markTouched("title")}
            placeholder="e.g. SQLi 101"
          />
        </Field>
        <Field label="Author" hint="Displayed in the challenge modal (optional).">
          <input className="input" value={form.authorName}
            onChange={(e) => setForm({ ...form, authorName: e.target.value })}
            placeholder="e.g. John Doe"
          />
        </Field>
        <Field label="Description" hint="Markdown / pre-formatted text is preserved.">
          <textarea className="input" rows={5} value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="Describe the challenge, give hints, link to writeups after the comp ends…"
          />
        </Field>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
          <Field label="Category">
            <select className="input" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="Difficulty">
            <select className="input" value={form.difficulty}
              onChange={(e) => setForm({ ...form, difficulty: e.target.value as "EASY" | "MEDIUM" | "HARD" })}>
              {DIFFICULTIES.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </Field>
          <Field label="Base points" error={showErr("basePoints")}>
            <input className="input" type="number" min={50} max={5000} value={form.basePoints}
              onChange={(e) => setForm({ ...form, basePoints: Number(e.target.value) })}
              onBlur={() => markTouched("basePoints")}
            />
          </Field>
          <Field label="Attempts per team">
            <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
              {(["limited", "unlimited"] as const).map(mode => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setForm({ ...form, attemptsMode: mode })}
                  style={{
                    flex: 1, padding: "6px 0", borderRadius: 6, cursor: "pointer",
                    border: form.attemptsMode === mode ? "1px solid #6366f1" : "1px solid var(--border)",
                    background: form.attemptsMode === mode ? "rgba(99,102,241,0.15)" : "transparent",
                    color: form.attemptsMode === mode ? "#a5b4fc" : "var(--text-muted)",
                    fontSize: 12, fontWeight: 600,
                  }}
                >
                  {mode === "unlimited" ? "Unlimited ∞" : "Limited"}
                </button>
              ))}
            </div>
            {form.attemptsMode === "limited" && (
              <input
                className="input"
                type="number"
                min={1}
                placeholder="e.g. 10"
                value={form.maxAttempts}
                onChange={(e) => setForm({ ...form, maxAttempts: e.target.value })}
              />
            )}
          </Field>
        </div>
      </Section>

      <Section icon={Box} title="Downloadable file (optional)" desc="A direct download link for files players need (binaries, ZIPs).">
        <Field label="File URL">
          <input className="input" value={form.downloadableFileUrl}
            onChange={(e) => setForm({ ...form, downloadableFileUrl: e.target.value })}
            placeholder="https://…/challenge.zip"
          />
        </Field>
      </Section>

      <Section icon={Globe} title="Media (optional)" desc="Image or GIF displayed inside the challenge modal.">
        <Field label="Media URL">
          <input className="input" value={form.mediaUrl}
            onChange={(e) => setForm({ ...form, mediaUrl: e.target.value })}
            placeholder="https://…/image.png"
          />
        </Field>
      </Section>

      <Section icon={Droplets} title="Blood bonuses (optional)" desc="Award extra points to the 1st, 2nd, and 3rd teams to solve this challenge. Does not affect the displayed challenge value.">
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: form.bloodBonusEnabled ? 14 : 0 }}>
          <button
            type="button"
            onClick={() => setForm({ ...form, bloodBonusEnabled: !form.bloodBonusEnabled })}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "6px 14px", borderRadius: 6, cursor: "pointer",
              border: form.bloodBonusEnabled ? "1px solid #ef4444" : "1px solid var(--border)",
              background: form.bloodBonusEnabled ? "rgba(239,68,68,0.12)" : "transparent",
              color: form.bloodBonusEnabled ? "#fca5a5" : "var(--text-muted)",
              fontSize: 12, fontWeight: 600,
            }}
          >
            <Droplets size={13} />
            {form.bloodBonusEnabled ? "Enabled" : "Enable blood bonuses"}
          </button>
        </div>
        {form.bloodBonusEnabled && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
            <Field label="1st blood bonus (pts)">
              <input className="input" type="number" min={0} value={form.firstBloodBonus}
                onChange={(e) => setForm({ ...form, firstBloodBonus: e.target.value })}
                placeholder="e.g. 100"
              />
            </Field>
            <Field label="2nd blood bonus (pts)">
              <input className="input" type="number" min={0} value={form.secondBloodBonus}
                onChange={(e) => setForm({ ...form, secondBloodBonus: e.target.value })}
                placeholder="e.g. 50"
              />
            </Field>
            <Field label="3rd blood bonus (pts)">
              <input className="input" type="number" min={0} value={form.thirdBloodBonus}
                onChange={(e) => setForm({ ...form, thirdBloodBonus: e.target.value })}
                placeholder="e.g. 25"
              />
            </Field>
          </div>
        )}
      </Section>
    </div>
  );
}

// ── Flag tab ────────────────────────────────────────────────────────────────

function FlagTab({
  form, setForm, mode, showErr, setTouched,
}: {
  form: any;
  setForm: (f: any) => void;
  mode: "create" | "edit";
  showErr: (key: string) => string | null;
  setTouched: (cb: (prev: Set<string>) => Set<string>) => void;
}) {
  if (mode === "edit") {
    return (
      <Section icon={Flag} title="Flag rotation" desc="Use the 'Change flag' action on the challenge row to rotate the flag — it regenerates per-team flags atomically.">
        <div style={{ padding: 14, background: "var(--bg-secondary)", borderRadius: 6, fontSize: 12, color: "var(--text-muted)" }}>
          Flags can&apos;t be edited inline to prevent accidental wipes of team progress. Close this panel and click the <Flag size={11} style={{ verticalAlign: "middle" }} /> icon on the challenge.
        </div>
      </Section>
    );
  }
  return (
    <Section icon={Flag} title="Flag setup" desc="How players prove they solved the challenge.">
      <Field label="Flag Type">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {(["STATIC", "DYNAMIC"] as const).map(type => (
            <label key={type} style={{
              display: "flex", alignItems: "flex-start", gap: 10,
              padding: "12px 14px", borderRadius: 6, cursor: "pointer",
              border: `1px solid ${form.flagType === type ? "var(--blue)" : "var(--border)"}`,
              background: form.flagType === type ? "rgba(96,165,250,0.06)" : "transparent",
            }}>
              <input type="radio" name="flagType" value={type} checked={form.flagType === type}
                onChange={() => setForm({ ...form, flagType: type })}
                style={{ marginTop: 2, accentColor: "var(--blue)" }} />
              <div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>
                  {type === "STATIC" ? "Static — one flag for all teams" : "Dynamic — unique per team"}
                </div>
                <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 3, lineHeight: 1.5 }}>
                  {type === "STATIC"
                    ? "Simple. You set the flag now and it's the same for everyone."
                    : "Anti-cheat. Each team gets a unique flag injected into their Docker container."}
                </div>
              </div>
            </label>
          ))}
        </div>
      </Field>

      {form.flagType === "STATIC" ? (
        <Field label="Flag value" required error={showErr("plainFlag")} hint="Stored as SHA-256 — never visible after saving.">
          <input className="input" value={form.plainFlag}
            placeholder="e.g. CTF{example_flag}"
            onChange={(e) => setForm({ ...form, plainFlag: e.target.value })}
            onBlur={() => setTouched(prev => new Set([...prev, "plainFlag"]))}
            style={{ fontFamily: "ui-monospace, monospace" }}
          />
        </Field>
      ) : (
        <>
          <Field
            label="Flag format"
            hint="Use ? where the per-team random part goes. e.g. UNICTF{web_?} → UNICTF{web_a1b2c3…}. Any prefix works — HTB{?}, FLAG{?}, etc."
          >
            <input className="input" value={form.flagFormat}
              placeholder="e.g. FLAG{?} or UNICTF{web_?}"
              onChange={(e) => setForm({ ...form, flagFormat: e.target.value })}
              style={{ fontFamily: "ui-monospace, monospace" }}
            />
          </Field>
          <div style={{
            padding: "12px 14px", borderRadius: 6, marginTop: 10,
            background: "rgba(96,165,250,0.06)", border: "1px solid rgba(96,165,250,0.2)",
            fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.6,
          }}>
            <strong>Dynamic flags</strong> are unique per team — the <code>?</code> in your format is
            replaced with an HMAC-derived token from <code>competition + challenge + team</code>.
            The team&apos;s flag is injected into the container as the <code>{form.dockerFlagEnv || "FLAG"}</code> env
            var at spawn time; your app should read it and show it to the player. If a team submits
            another team&apos;s flag it&apos;s still counted wrong, but logged as a cheat event the host can see.
          </div>
        </>
      )}
    </Section>
  );
}

// ── Docker tab ──────────────────────────────────────────────────────────────

function DockerTab({
  form, setForm, envVars, addEnvVar, removeEnvVar, updateEnvVar, showErr, setTouched,
  mode, existingChallengeId, existingPort, currentBuild, pendingZipFile, onPendingZipSelected, onBuildReady,
}: {
  form: any;
  setForm: (f: any) => void;
  envVars: EnvVarEntry[];
  addEnvVar: () => void;
  removeEnvVar: (id: string) => void;
  updateEnvVar: (id: string, field: "key" | "value", v: string) => void;
  showErr: (key: string) => string | null;
  setTouched: (cb: (prev: Set<string>) => Set<string>) => void;
  mode: "create" | "edit";
  existingChallengeId?: string;
  existingPort?: number | null;
  currentBuild: CTFChallengeBuildDTO | null;
  pendingZipFile: File | null;
  onPendingZipSelected: (f: File | null) => void;
  onBuildReady: (imageTag: string, detectedPort?: number) => void;
}) {
  const markTouched = (k: string) => setTouched(prev => new Set([...prev, k]));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Toggle */}
      <label style={{
        display: "flex", alignItems: "center", gap: 14, cursor: "pointer",
        padding: 16, borderRadius: 8,
        border: `1px solid ${form.requiresInstance ? "var(--purple, #a78bfa)" : "var(--border)"}`,
        background: form.requiresInstance ? "rgba(167,139,250,0.06)" : "var(--bg-secondary)",
        transition: "all 0.15s ease",
      }}>
        <div style={{
          width: 42, height: 24, borderRadius: 12, position: "relative",
          background: form.requiresInstance ? "var(--purple, #a78bfa)" : "var(--border)",
          transition: "background 0.2s ease",
        }}>
          <div style={{
            position: "absolute", top: 2, left: form.requiresInstance ? 20 : 2,
            width: 20, height: 20, borderRadius: 10, background: "#fff",
            transition: "left 0.2s ease", boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
          }} />
        </div>
        <input type="checkbox" checked={form.requiresInstance}
          onChange={(e) => setForm({ ...form, requiresInstance: e.target.checked })}
          style={{ display: "none" }}
        />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>
            Requires a live Docker instance
          </div>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
            Each player gets their own container — auto-destroyed after 30 minutes.
          </div>
        </div>
        {form.requiresInstance && (
          <span style={{
            fontSize: 10, padding: "3px 8px", borderRadius: 4, fontWeight: 700,
            background: "var(--purple, #a78bfa)", color: "#fff",
          }}>ENABLED</span>
        )}
      </label>

      {/* Config — appears when enabled */}
      {form.requiresInstance && (
        <>
          <Section icon={Network} title="Connection type" desc="How players will interact with the container.">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {([
                { id: "HTTP", label: "HTTP (Web)", desc: "Browser-based — opens a URL.", icon: Globe },
                { id: "TCP",  label: "TCP (PWN)",  desc: "netcat / raw socket — nc host port.", icon: Terminal },
              ] as const).map(opt => {
                const Icon = opt.icon;
                const active = form.connectionType === opt.id;
                return (
                  <label key={opt.id} style={{
                    display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer",
                    padding: 14, borderRadius: 6,
                    border: `1px solid ${active ? "var(--purple, #a78bfa)" : "var(--border)"}`,
                    background: active ? "rgba(167,139,250,0.06)" : "transparent",
                  }}>
                    <input type="radio" name="connType" value={opt.id} checked={active}
                      onChange={() => setForm({ ...form, connectionType: opt.id })}
                      style={{ marginTop: 3, accentColor: "var(--purple, #a78bfa)" }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                        <Icon size={13} color={active ? "var(--purple, #a78bfa)" : "var(--text-muted)"} />
                        <span style={{ fontSize: 13, fontWeight: 600 }}>{opt.label}</span>
                      </div>
                      <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{opt.desc}</div>
                    </div>
                  </label>
                );
              })}
            </div>
          </Section>

          <Section icon={Server} title="Container image" desc="The Docker image to run for each player instance.">
            {mode === "edit" && existingChallengeId ? (
              <ChallengeBuildPanel
                challengeId={existingChallengeId}
                initialBuild={currentBuild}
                onBuildReady={onBuildReady}
              />
            ) : (
              <PendingZipPicker file={pendingZipFile} onFileSelected={onPendingZipSelected} />
            )}
            {/* Container port — read-only badge, auto-detected from Dockerfile EXPOSE */}
            <div style={{
              marginTop: 12, display: "flex", alignItems: "center", gap: 8,
              padding: "9px 12px", borderRadius: 6,
              border: "1px solid var(--border)", background: "var(--bg-secondary)",
              fontSize: 12,
            }}>
              <span style={{ color: "var(--text-muted)" }}>Container port:</span>
              {existingPort != null ? (
                <>
                  <span style={{
                    fontWeight: 700, color: "var(--text-primary)",
                    fontFamily: "ui-monospace, monospace",
                  }}>
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
          </Section>

          <Section icon={Flag} title="Flag injection" desc="Server injects the flag into the container at startup.">
            <Field label="Env var name"
              hint={`Inside the container: read process.env.${form.dockerFlagEnv || "FLAG"} (Node), os.environ['${form.dockerFlagEnv || "FLAG"}'] (Python), or $${form.dockerFlagEnv || "FLAG"} (Bash).`}>
              <input className="input" value={form.dockerFlagEnv}
                onChange={(e) => setForm({ ...form, dockerFlagEnv: e.target.value })}
                placeholder="FLAG"
                style={{ fontFamily: "ui-monospace, monospace", maxWidth: 220 }}
              />
            </Field>
          </Section>

          <Section icon={FileText} title="Extra environment variables" desc="Optional config passed to the container. FLAG is auto-injected — don't add it here.">
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {envVars.length === 0 && (
                <div style={{
                  padding: "12px 14px", borderRadius: 6, background: "var(--bg-secondary)",
                  border: "1px dashed var(--border)",
                  fontSize: 11, color: "var(--text-muted)", textAlign: "center",
                }}>
                  No extra env vars yet
                </div>
              )}
              {envVars.map(ev => {
                const isFlagAttempt = ev.key.toUpperCase() === (form.dockerFlagEnv || "FLAG").toUpperCase()
                  || ev.key.toUpperCase() === "FLAG";
                return (
                  <div key={ev._id} style={{ display: "flex", gap: 6, alignItems: "stretch" }}>
                    <input className="input" placeholder="KEY"
                      value={ev.key}
                      onChange={(e) => updateEnvVar(ev._id, "key", e.target.value)}
                      style={{
                        flex: "0 0 40%", fontFamily: "ui-monospace, monospace",
                        borderColor: isFlagAttempt && ev.key ? "#f59e0b" : undefined,
                      }}
                      spellCheck={false}
                    />
                    <input className="input" placeholder="value"
                      value={ev.value}
                      onChange={(e) => updateEnvVar(ev._id, "value", e.target.value)}
                      style={{ flex: 1, fontFamily: "ui-monospace, monospace" }}
                      spellCheck={false}
                    />
                    <button type="button" onClick={() => removeEnvVar(ev._id)} style={{
                      background: "transparent", border: "1px solid var(--border)", borderRadius: 6,
                      padding: "0 10px", cursor: "pointer", color: "#ef4444",
                      display: "flex", alignItems: "center",
                    }}>
                      <Trash2 size={13} />
                    </button>
                  </div>
                );
              })}
              {envVars.some(ev => ev.key.toUpperCase() === (form.dockerFlagEnv || "FLAG").toUpperCase() && ev.key) && (
                <div style={{ fontSize: 11, color: "#f59e0b", display: "flex", gap: 4, alignItems: "center", marginTop: 4 }}>
                  <AlertCircle size={11} /> The {form.dockerFlagEnv || "FLAG"} key will be silently dropped — it&apos;s server-injected.
                </div>
              )}
              <button type="button" onClick={addEnvVar} className="psp-btn psp-btn-secondary"
                style={{ alignSelf: "flex-start", gap: 4, marginTop: 6, padding: "6px 12px", fontSize: 12 }}>
                <Plus size={11} /> Add variable
              </button>
            </div>
          </Section>

          <Section icon={Cpu} title="Resource limits" desc="Leave blank for safe defaults (128 MB, 50% CPU, 100 PIDs).">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
              <Field label="Memory (MB)">
                <input className="input" type="number" min={16} max={2048} placeholder="128"
                  value={form.dockerMemoryMb}
                  onChange={(e) => setForm({ ...form, dockerMemoryMb: e.target.value })}
                />
              </Field>
              <Field label="CPU (%)">
                <input className="input" type="number" min={1} max={100} placeholder="50"
                  value={form.dockerCpuPercent}
                  onChange={(e) => setForm({ ...form, dockerCpuPercent: e.target.value })}
                />
              </Field>
              <Field label="PID limit">
                <input className="input" type="number" min={10} max={1000} placeholder="100"
                  value={form.dockerPidsLimit}
                  onChange={(e) => setForm({ ...form, dockerPidsLimit: e.target.value })}
                />
              </Field>
            </div>
          </Section>

          <SecurityInfo connectionType={form.connectionType} flagEnv={form.dockerFlagEnv || "FLAG"} />
          <StarterTemplates connectionType={form.connectionType} flagEnv={form.dockerFlagEnv || "FLAG"} />
        </>
      )}
    </div>
  );
}

// ── Hints tab ───────────────────────────────────────────────────────────────

function HintsTab({
  hints, setHints, disabled,
}: {
  hints: { cost: number; text: string }[];
  setHints: (h: { cost: number; text: string }[]) => void;
  disabled: boolean;
}) {
  if (disabled) {
    return (
      <Section icon={Lightbulb} title="Hints" desc="Hints can only be added during creation — for existing challenges, use the lightbulb icon on the row.">
        <div style={{ padding: 14, background: "var(--bg-secondary)", borderRadius: 6, fontSize: 12, color: "var(--text-muted)" }}>
          Close this panel and click <Lightbulb size={11} style={{ verticalAlign: "middle" }} /> next to the challenge.
        </div>
      </Section>
    );
  }
  return (
    <Section icon={Lightbulb} title={`Hints (${hints.length})`} desc="Players spend points to unlock hints. Once unlocked they can't be deleted.">
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {hints.length === 0 && (
          <div style={{
            padding: 14, borderRadius: 6, background: "var(--bg-secondary)",
            border: "1px dashed var(--border)", textAlign: "center",
            fontSize: 12, color: "var(--text-muted)",
          }}>
            No hints yet. Players will solve unaided.
          </div>
        )}
        {hints.map((h, i) => (
          <div key={i} style={{
            padding: 12, borderRadius: 6, background: "var(--bg-secondary)",
            border: "1px solid var(--border)",
            display: "flex", flexDirection: "column", gap: 8,
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600 }}>Hint #{i + 1}</span>
              <button type="button" onClick={() => setHints(hints.filter((_, idx) => idx !== i))} style={{
                background: "transparent", border: "none", cursor: "pointer", color: "#ef4444", display: "flex",
              }}>
                <Trash2 size={12} />
              </button>
            </div>
            <textarea className="input" rows={2} value={h.text} placeholder="The hint text shown when unlocked…"
              onChange={(e) => {
                const next = [...hints]; next[i] = { ...h, text: e.target.value }; setHints(next);
              }} />
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Costs</span>
              <input className="input" type="number" min={0} value={h.cost} style={{ width: 80 }}
                onChange={(e) => {
                  const next = [...hints]; next[i] = { ...h, cost: Number(e.target.value) }; setHints(next);
                }} />
              <span style={{ fontSize: 11, color: "var(--text-muted)" }}>points to unlock</span>
            </div>
          </div>
        ))}
        <button type="button" className="psp-btn psp-btn-secondary"
          style={{ alignSelf: "flex-start", gap: 4, padding: "6px 12px", fontSize: 12 }}
          onClick={() => setHints([...hints, { cost: 25, text: "" }])}>
          <Plus size={11} /> Add hint
        </button>
      </div>
    </Section>
  );
}

// ── ZIP file picker for create mode ─────────────────────────────────────────

function PendingZipPicker({ file, onFileSelected }: { file: File | null; onFileSelected: (f: File | null) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept=".zip"
        style={{ display: "none" }}
        onChange={e => onFileSelected(e.target.files?.[0] ?? null)}
      />
      {file ? (
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "10px 14px", borderRadius: 6,
          background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.3)",
        }}>
          <FileArchive size={14} color="#6366f1" style={{ flexShrink: 0 }} />
          <span style={{ flex: 1, fontSize: 12, color: "#a5b4fc", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{file.name}</span>
          <button type="button" onClick={() => onFileSelected(null)} style={{
            background: "none", border: "none", cursor: "pointer", color: "#64748b",
            display: "flex", padding: 2,
          }}>
            <X size={12} />
          </button>
        </div>
      ) : (
        <button type="button" onClick={() => inputRef.current?.click()} style={{
          width: "100%", padding: "12px 14px", borderRadius: 6,
          border: "1px dashed rgba(167,139,250,0.4)",
          background: "rgba(167,139,250,0.04)", cursor: "pointer",
          display: "flex", alignItems: "center", gap: 8,
          fontSize: 12, color: "#94a3b8",
        }}>
          <UploadCloud size={14} color="#a78bfa" style={{ flexShrink: 0 }} />
          Pick your Docker build-context ZIP — it will upload automatically after you save
        </button>
      )}
    </div>
  );
}

// ── Section / Field primitives ──────────────────────────────────────────────

function Section({
  icon: Icon, title, desc, children,
}: { icon: React.ElementType; title: string; desc?: string; children: React.ReactNode }) {
  return (
    <div style={{
      border: "1px solid var(--border)", borderRadius: 8, background: "var(--surface)",
      overflow: "hidden",
    }}>
      <div style={{
        padding: "12px 16px", background: "var(--bg-secondary)",
        borderBottom: "1px solid var(--border)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Icon size={14} color="var(--text-secondary)" />
          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{title}</span>
        </div>
        {desc && <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 3 }}>{desc}</div>}
      </div>
      <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>
        {children}
      </div>
    </div>
  );
}

function Field({
  label, hint, required, error, children,
}: { label: string; hint?: string; required?: boolean; error?: string | null; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 5 }}>
        {label}{required && <span style={{ color: "#ef4444", marginLeft: 3 }}>*</span>}
      </label>
      {children}
      {error
        ? <div style={{ fontSize: 11, color: "#ef4444", marginTop: 4, display: "flex", gap: 4, alignItems: "center" }}>
            <AlertCircle size={11} /> {error}
          </div>
        : hint && <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4, lineHeight: 1.5 }}>{hint}</div>}
    </div>
  );
}

// ── Security info box ──────────────────────────────────────────────────────

function SecurityInfo({ connectionType, flagEnv }: { connectionType: "HTTP" | "TCP"; flagEnv: string }) {
  return (
    <div style={{
      padding: 14, borderRadius: 8,
      background: "rgba(96,165,250,0.05)", border: "1px solid rgba(96,165,250,0.18)",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
        <Info size={13} color="var(--blue)" />
        <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)" }}>How instances work</span>
      </div>
      <ul style={{ margin: 0, paddingLeft: 18, fontSize: 11, color: "var(--text-muted)", lineHeight: 1.7 }}>
        <li>Each player gets <strong style={{ color: "var(--text-secondary)" }}>their own container</strong> on demand — port mapping is randomized.</li>
        <li>Container <strong style={{ color: "var(--text-secondary)" }}>auto-destroys after 30 minutes</strong>; players can renew twice before requesting a fresh one.</li>
        <li>The flag is injected as <code>{flagEnv}</code> env var at spawn time — never exposed via API.</li>
        <li>Isolated internal network (no internet), <code>CAP_NET_ADMIN</code> / <code>CAP_SYS_ADMIN</code> dropped, PID-limit enforced.</li>
        {connectionType === "TCP"
          ? <li>Players will connect with <code>nc &lt;host&gt; &lt;port&gt;</code>. Print the flag to stdout on solve.</li>
          : <li>Players will open <code>http://&lt;host&gt;:&lt;port&gt;/</code> in their browser.</li>}
      </ul>
    </div>
  );
}

// ── Starter templates ──────────────────────────────────────────────────────

interface TemplateFile { path: string; code: string | ((env: string) => string); }
interface Template { id: string; name: string; files: TemplateFile[]; }

const TEMPLATES: Record<"HTTP" | "TCP", Template[]> = {
  HTTP: [
    {
      id: "flask",
      name: "Python · Flask",
      files: [
        {
          path: "Dockerfile",
          code: `FROM python:3.11-slim
RUN pip install flask
WORKDIR /app
COPY app.py .
EXPOSE 8080
CMD ["python", "app.py"]`,
        },
        {
          path: "app.py",
          code: (env: string) => `import os
from flask import Flask, request

app = Flask(__name__)
FLAG = os.environ.get("${env}", "FLAG{flag_not_set}")

@app.route("/")
def index():
    return "<h1>Welcome to the challenge</h1>"

# Replace this with your real challenge logic.
@app.route("/admin")
def admin():
    if request.args.get("token") == "secret":
        return FLAG
    return "Access denied", 403

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8080)`,
        },
      ],
    },
    {
      id: "node",
      name: "Node.js",
      files: [
        {
          path: "Dockerfile",
          code: `FROM node:20-alpine
WORKDIR /app
COPY server.js .
EXPOSE 8080
CMD ["node", "server.js"]`,
        },
        {
          path: "server.js",
          code: (env: string) => `const http = require("http");
const FLAG = process.env.${env} ?? "FLAG{flag_not_set}";

http.createServer((req, res) => {
  // Replace with real challenge logic.
  if (req.url === "/admin?token=secret") {
    res.end(FLAG);
  } else {
    res.end("<h1>Welcome to the challenge</h1>");
  }
}).listen(8080);`,
        },
      ],
    },
  ],
  TCP: [
    {
      id: "bash",
      name: "Bash · socat",
      files: [
        {
          path: "Dockerfile",
          code: `FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y socat && rm -rf /var/lib/apt/lists/*
COPY challenge.sh /challenge.sh
RUN chmod +x /challenge.sh
EXPOSE 1337
CMD ["socat", "TCP-LISTEN:1337,reuseaddr,fork", "EXEC:/challenge.sh"]`,
        },
        {
          path: "challenge.sh",
          code: (env: string) => `#!/bin/bash
# Real flag is injected via the ${env} env var at container start.
FLAG="\${${env}:-FLAG{flag_not_set}}"

echo "Welcome to the challenge!"
echo -n "Enter the password: "
read answer

if [ "$answer" = "h@ck_the_planet" ]; then
    echo "Correct! Here's your flag: $FLAG"
else
    echo "Wrong."
fi`,
        },
      ],
    },
    {
      id: "pwn",
      name: "C · PWN",
      files: [
        {
          path: "Dockerfile",
          code: `FROM ubuntu:22.04
RUN apt-get update && apt-get install -y socat gcc && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY chal.c .
RUN gcc -o chal chal.c -no-pie
EXPOSE 1337
CMD ["socat", "TCP-LISTEN:1337,reuseaddr,fork", "EXEC:./chal"]`,
        },
        {
          path: "chal.c",
          code: (env: string) => `#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>

int main() {
    setvbuf(stdout, NULL, _IONBF, 0);
    char *flag = getenv("${env}");
    if (!flag) flag = "FLAG{flag_not_set}";

    char buf[64];
    puts("== buffer overflow demo ==");
    printf("input: ");
    gets(buf);  // intentionally vulnerable
    if (strcmp(buf, "open sesame") == 0) {
        printf("flag: %s\\n", flag);
    }
    return 0;
}`,
        },
      ],
    },
  ],
};

function StarterTemplates({ connectionType, flagEnv }: { connectionType: "HTTP" | "TCP"; flagEnv: string }) {
  const [open, setOpen] = useState(false);
  const templates = TEMPLATES[connectionType];
  const [activeId, setActiveId] = useState<string>(templates[0]!.id);
  const [copied, setCopied] = useState<string | null>(null);

  // Reset the active template when connection type changes.
  useEffect(() => { setActiveId(TEMPLATES[connectionType][0]!.id); }, [connectionType]);

  const tpl = templates.find(t => t.id === activeId) ?? templates[0]!;

  const copy = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(null), 1500);
    } catch { /* no-op */ }
  };

  return (
    <div style={{
      borderRadius: 8, border: "1px solid var(--border)", overflow: "hidden",
    }}>
      <button type="button" onClick={() => setOpen(o => !o)} style={{
        width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "12px 16px", background: "var(--bg-secondary)", border: "none", cursor: "pointer",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Box size={14} color="var(--text-secondary)" />
          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>Starter templates</span>
          <span style={{ fontSize: 10, color: "var(--text-muted)", padding: "2px 6px", borderRadius: 3, background: "var(--bg-tertiary)" }}>
            {connectionType}
          </span>
        </div>
        <ChevronRight size={14} style={{
          transform: open ? "rotate(90deg)" : "none", transition: "transform 0.2s ease",
          color: "var(--text-muted)",
        }} />
      </button>

      {open && (
        <div style={{ padding: 14, background: "var(--surface)" }}>
          {/* Tabs */}
          <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
            {templates.map(t => (
              <button key={t.id} type="button" onClick={() => setActiveId(t.id)} style={{
                padding: "5px 12px", borderRadius: 5, fontSize: 11, fontWeight: 600,
                border: "1px solid", cursor: "pointer",
                borderColor: activeId === t.id ? "var(--purple, #a78bfa)" : "var(--border)",
                background: activeId === t.id ? "rgba(167,139,250,0.1)" : "transparent",
                color: activeId === t.id ? "var(--purple, #a78bfa)" : "var(--text-muted)",
              }}>
                {t.name}
              </button>
            ))}
          </div>

          {/* Files */}
          {tpl.files.map(f => {
            const codeStr = typeof f.code === "function" ? f.code(flagEnv) : f.code;
            const key = `${activeId}-${f.path}`;
            return (
              <div key={f.path} style={{ marginBottom: 10 }}>
                <div style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "6px 10px", background: "var(--bg-tertiary)",
                  borderRadius: "5px 5px 0 0", borderBottom: "1px solid var(--border)",
                }}>
                  <span style={{ fontSize: 11, fontFamily: "ui-monospace, monospace", color: "var(--text-secondary)" }}>
                    {f.path}
                  </span>
                  <button type="button" onClick={() => copy(codeStr, key)} style={{
                    background: "transparent", border: "none", cursor: "pointer",
                    display: "flex", alignItems: "center", gap: 4,
                    fontSize: 10, color: "var(--text-muted)",
                  }}>
                    {copied === key ? <><Check size={10} color="#22c55e" /> Copied</> : <><Copy size={10} /> Copy</>}
                  </button>
                </div>
                <pre style={{
                  margin: 0, padding: "10px 12px", borderRadius: "0 0 5px 5px",
                  background: "var(--bg-secondary)", fontSize: 11, lineHeight: 1.6,
                  color: "var(--text-secondary)", fontFamily: "ui-monospace, monospace",
                  overflowX: "auto", maxHeight: 220,
                }}>{codeStr}</pre>
              </div>
            );
          })}

          <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 8, lineHeight: 1.5 }}>
            Build → push to a registry the server can pull → set the image name above. The <code>{flagEnv}</code> env var is auto-injected.
          </div>
        </div>
      )}
    </div>
  );
}

// ── Flag rotation modal ────────────────────────────────────────────────────────

function FlagRotateModal({
  competitionId, challenge, onClose, onDone,
}: {
  competitionId: string;
  challenge: CTFCompetitionChallengeDTO;
  onClose: () => void;
  onDone: () => void;
}) {
  const [flag, setFlag] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rotate = async () => {
    setError(null);
    if (!flag.trim() || flag.trim().length < 3 || /\s/.test(flag)) {
      setError("Flag must be at least 3 characters and contain no spaces");
      return;
    }
    setBusy(true);
    try {
      await rotateTeacherCtfChallengeFlag(competitionId, challenge.id, flag.trim());
      toast.success("Flag rotated", "All per-team flags have been regenerated.");
      onDone();
    } catch (e: any) {
      setError(e?.message ?? "Failed to rotate flag.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 300,
    }} onClick={onClose}>
      <div className="psp-card" style={{ width: 440, maxWidth: "92vw", padding: 20 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <span style={{ fontSize: 16, fontWeight: 700 }}>Change flag for "{challenge.title}"</span>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)" }}>
            <X size={16} />
          </button>
        </div>
        <div style={{
          fontSize: 12, color: "#fbbf24",
          background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.3)",
          borderRadius: 6, padding: "8px 12px", marginBottom: 14,
          display: "flex", alignItems: "center", gap: 6,
        }}>
          <AlertCircle size={13} /> This will regenerate flags for every team in this competition. Old flags become invalid.
        </div>

        {error && (
          <div style={{ fontSize: 12, color: "#f87171", marginBottom: 10 }}>{error}</div>
        )}

        <input className="input" value={flag} onChange={(e) => setFlag(e.target.value)}
          placeholder="e.g. CTF{new_flag}"
          style={{ fontFamily: "ui-monospace, monospace", marginBottom: 14 }}
        />

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button className="psp-btn psp-btn-secondary" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="psp-btn psp-btn-primary" onClick={rotate} disabled={busy}>
            {busy ? "Rotating…" : "Confirm Change"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Hint manager modal ─────────────────────────────────────────────────────────

function HintManagerModal({
  competitionId, challenge, onClose, onChanged,
}: {
  competitionId: string;
  challenge: CTFCompetitionChallengeDTO;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [hints, setHints] = useState(challenge.hints ?? []);
  const [newCost, setNewCost] = useState(25);
  const [newText, setNewText] = useState("");
  const [busy, setBusy] = useState(false);

  const add = async () => {
    if (!newText.trim()) return;
    setBusy(true);
    try {
      const updated = await addTeacherCtfHint(competitionId, challenge.id, { cost: newCost, text: newText.trim() });
      setHints(updated.hints ?? []);
      setNewText(""); setNewCost(25);
      onChanged();
      toast.success("Hint added", "Students can now unlock it.");
    } catch { /* toasted */ } finally { setBusy(false); }
  };

  const remove = async (hintId: string) => {
    if (!confirm("Delete this hint? If any team has unlocked it, deletion will be refused.")) return;
    setBusy(true);
    try {
      const updated = await deleteTeacherCtfHint(competitionId, challenge.id, hintId);
      setHints(updated.hints ?? []);
      onChanged();
      toast.success("Hint deleted", "");
    } catch { /* toasted */ } finally { setBusy(false); }
  };

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 300,
    }} onClick={onClose}>
      <div className="psp-card" style={{ width: 520, maxWidth: "92vw", padding: 20 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <span style={{ fontSize: 16, fontWeight: 700 }}>Hints for "{challenge.title}"</span>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)" }}>
            <X size={16} />
          </button>
        </div>

        <div style={{ marginBottom: 12 }}>
          {hints.length === 0 ? (
            <div style={{ fontSize: 12, color: "var(--text-muted)", padding: 8 }}>No hints yet.</div>
          ) : hints.map(h => (
            <div key={h.id} style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "8px 10px", border: "1px solid var(--border)", borderRadius: 6, marginBottom: 6,
            }}>
              <span style={{ fontSize: 11, color: "#fbbf24", fontWeight: 700, minWidth: 50 }}>{h.cost} pts</span>
              <span style={{ flex: 1, fontSize: 13 }}>{h.text || <em style={{ color: "var(--text-muted)" }}>(no text)</em>}</span>
              <IconBtn title="Delete" onClick={() => remove(h.id)}><Trash2 size={12} /></IconBtn>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
          <input className="input" type="number" min={0} value={newCost}
            onChange={(e) => setNewCost(Number(e.target.value))} style={{ width: 90 }} placeholder="Cost"
          />
          <input className="input" value={newText}
            placeholder="New hint text"
            onChange={(e) => setNewText(e.target.value)} style={{ flex: 1 }}
            onKeyDown={(e) => { if (e.key === "Enter") add(); }}
          />
          <button className="psp-btn psp-btn-primary" style={{ gap: 4 }} onClick={add} disabled={busy || !newText.trim()}>
            <Plus size={11} /> Add
          </button>
        </div>

        <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
          You can't delete a hint once a team has paid to unlock it.
        </div>
      </div>
    </div>
  );
}

// ── Small helpers ──────────────────────────────────────────────────────────────

function ActionBtn({
  title, children, onClick, color,
}: {
  title: string; children: React.ReactNode; onClick: () => void; color?: string;
}) {
  const [hov, setHov] = useState(false);
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        background: hov ? "var(--bg-hover)" : "var(--bg-secondary)",
        border: "1px solid var(--border)",
        borderRadius: 5, padding: "5px 7px",
        color: hov && color ? color : "var(--text-secondary)",
        cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4,
        transition: "all 100ms",
      }}
    >
      {children}
    </button>
  );
}

// Keep IconBtn as alias used by HintManagerModal
const IconBtn = ActionBtn;
