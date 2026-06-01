"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import {
  Plus, Search, Edit2, Trash2, Eye, EyeOff, Flag,
  ChevronLeft, ChevronRight, Shield, Trophy,
} from "lucide-react";
import { toast } from "@/components/ui/PSPToast";
import {
  getTeacherCTFChallenges,
  toggleTeacherCTFChallenge,
  deleteTeacherCTFChallenge,
  CTFChallengeResponse,
} from "@/lib/api";

// ─── Badge helpers ────────────────────────────────────────────────────────────

function diffBadge(d: string) {
  if (d === "EASY")   return "b-easy";
  if (d === "MEDIUM") return "b-med";
  return "b-hard";
}

function catColor(cat: string): React.CSSProperties {
  const map: Record<string, string> = {
    CRYPTO:    "var(--purple)",
    FORENSICS: "var(--blue)",
    REVERSE:   "var(--orange)",
    WEB:       "var(--red)",
    MISC:      "var(--text-muted)",
    OSINT:     "var(--green)",
    PWN:       "#d97706",
  };
  return { color: map[cat] ?? "var(--text-muted)" };
}

const iconBtn: React.CSSProperties = {
  width: 28, height: 28, display: "flex", alignItems: "center",
  justifyContent: "center", border: "none", background: "none",
  cursor: "pointer", color: "var(--text-muted)", borderRadius: 3,
  transition: "background 0.1s, color 0.1s",
};

const PAGE_SIZE = 20;

// ─── Component ────────────────────────────────────────────────────────────────

const TeacherCTF = () => {
  const [challenges, setChallenges]   = useState<CTFChallengeResponse[]>([]);
  const [isLoading, setIsLoading]     = useState(false);
  const [currentPage, setCurrentPage] = useState(0);

  const [search, setSearch]             = useState("");
  const [catFilter, setCatFilter]       = useState("all");
  const [diffFilter, setDiffFilter]     = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => { fetchChallenges(); }, []);

  const fetchChallenges = async () => {
    setIsLoading(true);
    try {
      const data = await getTeacherCTFChallenges();
      setChallenges(data);
    } catch {
      toast.error("Failed to load challenges", "Could not fetch your CTF challenges.");
    } finally {
      setIsLoading(false);
    }
  };

  const filtered = challenges.filter(c => {
    const q = search.toLowerCase();
    const matchSearch = c.title.toLowerCase().includes(q) || c.category.toLowerCase().includes(q);
    const matchCat    = catFilter === "all"    || c.category === catFilter;
    const matchDiff   = diffFilter === "all"   || c.difficulty === diffFilter;
    const matchStatus = statusFilter === "all"
      || (statusFilter === "active"   &&  c.isActive)
      || (statusFilter === "inactive" && !c.isActive);
    return matchSearch && matchCat && matchDiff && matchStatus;
  });

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = filtered.slice(currentPage * PAGE_SIZE, currentPage * PAGE_SIZE + PAGE_SIZE);

  const handleToggle = async (id: string) => {
    try {
      const updated = await toggleTeacherCTFChallenge(id);
      setChallenges(prev => prev.map(c => c.id === id ? updated : c));
      toast.success(updated.isActive ? "Challenge published" : "Challenge hidden", updated.title);
    } catch {
      toast.error("Failed to toggle challenge", "Please try again.");
    }
  };

  const confirmDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      await deleteTeacherCTFChallenge(deleteId);
      setChallenges(prev => prev.filter(c => c.id !== deleteId));
      toast.success("Challenge deleted", "It's gone for good.");
    } catch {
      toast.error("Failed to delete challenge", "Please try again.");
    } finally {
      setDeleting(false);
      setDeleteId(null);
    }
  };

  const totalSolves   = challenges.reduce((a, c) => a + c.solveCount,   0);
  const totalAttempts = challenges.reduce((a, c) => a + c.attemptCount, 0);
  const activeCount   = challenges.filter(c => c.isActive).length;

  return (
    <>
      <Navbar />
      <div className="psp-breadcrumb">
        <Link href="/admin">icode-ctf</Link> ›{" "}
        <span style={{ color: "var(--text-primary)" }}>CTF Challenges</span>
      </div>

      <div className="psp-main">

        {/* ── Page header ── */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)" }}>CTF Challenges</div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 3 }}>
              {challenges.length} challenge{challenges.length !== 1 ? "s" : ""} in your library — manage, publish, and track solves
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <Link href="/admin/ctf">
              <button className="psp-btn psp-btn-secondary">
                <Trophy size={13} /> Competitions
              </button>
            </Link>
            <Link href="/admin/ctf/new">
              <button className="psp-btn psp-btn-secondary">
                <Flag size={13} /> New Challenge
              </button>
            </Link>
          </div>
        </div>

        {/* ── Stats ── */}
        <div className="psp-stats">
          <div className="psp-stat-card">
            <div className="psp-stat-icon ic-blue"><Flag size={20} /></div>
            <div><div className="psp-stat-val">{challenges.length}</div><div className="psp-stat-lbl">Total</div></div>
          </div>
          <div className="psp-stat-card">
            <div className="psp-stat-icon ic-green"><Eye size={20} /></div>
            <div><div className="psp-stat-val">{activeCount}</div><div className="psp-stat-lbl">Active</div></div>
          </div>
          <div className="psp-stat-card">
            <div className="psp-stat-icon ic-purple"><Shield size={20} /></div>
            <div><div className="psp-stat-val">{totalSolves}</div><div className="psp-stat-lbl">Solves</div></div>
          </div>
          <div className="psp-stat-card">
            <div className="psp-stat-icon ic-orange"><Search size={20} /></div>
            <div><div className="psp-stat-val">{totalAttempts}</div><div className="psp-stat-lbl">Attempts</div></div>
          </div>
        </div>

        {/* ── Challenges card ── */}
        <div className="psp-card">

          {/* Card header */}
          <div className="psp-card-header">
            <span className="psp-card-title">All Challenges</span>
            <div style={{ position: "relative" }}>
              <Search
                size={12}
                style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", color: "var(--text-subtle)", pointerEvents: "none" }}
              />
              <input
                className="psp-search"
                style={{ paddingLeft: 26, width: 220 }}
                placeholder="Search challenges…"
                value={search}
                onChange={e => { setSearch(e.target.value); setCurrentPage(0); }}
              />
            </div>
          </div>

          {/* Filter bar */}
          <div className="psp-filter-bar">
            {(["all","active","inactive"] as const).map(s => (
              <button key={s} className={`psp-ftab${statusFilter === s ? " on" : ""}`}
                onClick={() => { setStatusFilter(s); setCurrentPage(0); }}>
                {s === "all" ? "All Status" : s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
            <span style={{ margin: "0 8px", color: "var(--border-strong)", fontSize: 14, userSelect: "none" }}>|</span>
            {(["all","CRYPTO","FORENSICS","REVERSE","WEB","MISC","OSINT","PWN"] as const).map(c => (
              <button key={c} className={`psp-ftab${catFilter === c ? " on" : ""}`}
                onClick={() => { setCatFilter(c); setCurrentPage(0); }}>
                {c === "all" ? "All Categories" : c}
              </button>
            ))}
            <span style={{ margin: "0 8px", color: "var(--border-strong)", fontSize: 14, userSelect: "none" }}>|</span>
            {(["all","EASY","MEDIUM","HARD"] as const).map(d => (
              <button key={d} className={`psp-ftab${diffFilter === d ? " on" : ""}`}
                onClick={() => { setDiffFilter(d); setCurrentPage(0); }}>
                {d === "all" ? "All Difficulties" : d.charAt(0) + d.slice(1).toLowerCase()}
              </button>
            ))}
          </div>

          {/* Loading skeletons */}
          {isLoading && Array.from({ length: 5 }).map((_, i) => (
            <div key={i} style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ flex: 1 }}>
                <div className="skel" style={{ width: "45%", height: 13, borderRadius: 2, marginBottom: 8 }} />
                <div className="skel" style={{ width: "25%", height: 10, borderRadius: 2 }} />
              </div>
              <div className="skel" style={{ width: 56, height: 20, borderRadius: 2 }} />
              <div className="skel" style={{ width: 56, height: 20, borderRadius: 2 }} />
            </div>
          ))}

          {/* Empty state */}
          {!isLoading && filtered.length === 0 && (
            <div className="psp-empty">
              <div className="psp-empty-title">No challenges found</div>
              <div style={{ fontSize: 13 }}>
                {search || catFilter !== "all" || diffFilter !== "all" || statusFilter !== "all"
                  ? "Try adjusting your filters."
                  : <>Create your first CTF challenge.{" "}
                    <Link href="/admin/ctf/new" style={{ color: "#0052cc", fontWeight: 600 }}>Get started →</Link>
                  </>
                }
              </div>
            </div>
          )}

          {/* Rows */}
          {!isLoading && paged.map(c => (
            <ChallengeRow
              key={c.id}
              challenge={c}
              onToggle={() => handleToggle(c.id)}
              onDelete={() => setDeleteId(c.id)}
            />
          ))}

          {/* Pagination */}
          {!isLoading && pages > 1 && (
            <div style={{ padding: "10px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", borderTop: "1px solid var(--border)" }}>
              <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                Page {currentPage + 1} of {pages} · {filtered.length} total
              </span>
              <div style={{ display: "flex", gap: 6 }}>
                <button
                  className="psp-btn psp-btn-secondary psp-btn-sm"
                  disabled={currentPage === 0}
                  onClick={() => setCurrentPage(p => Math.max(0, p - 1))}
                >
                  <ChevronLeft size={12} /> Prev
                </button>
                <button
                  className="psp-btn psp-btn-secondary psp-btn-sm"
                  disabled={currentPage >= pages - 1}
                  onClick={() => setCurrentPage(p => Math.min(pages - 1, p + 1))}
                >
                  Next <ChevronRight size={12} />
                </button>
              </div>
            </div>
          )}

        </div>
      </div>

      {/* ── Delete confirm modal ── */}
      {!!deleteId && (
        <div className="psp-modal-overlay" onClick={e => e.target === e.currentTarget && setDeleteId(null)}>
          <div className="psp-modal" style={{ width: 400 }}>
            <div className="psp-modal-header">
              <span style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)" }}>Delete challenge?</span>
              <button style={iconBtn} onClick={() => setDeleteId(null)}>✕</button>
            </div>
            <div className="psp-modal-body" style={{ fontSize: 13, color: "var(--text-secondary)" }}>
              If students have already solved this challenge it will be hidden (soft-deleted). Otherwise it will be permanently removed.
            </div>
            <div className="psp-modal-footer">
              <button className="psp-btn psp-btn-secondary" onClick={() => setDeleteId(null)}>Cancel</button>
              <button
                className="psp-btn psp-btn-danger"
                disabled={deleting}
                onClick={confirmDelete}
              >
                {deleting ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

// ─── Row sub-component ────────────────────────────────────────────────────────

interface RowProps {
  challenge: CTFChallengeResponse;
  onToggle:  () => void;
  onDelete:  () => void;
}

function ChallengeRow({ challenge: c, onToggle, onDelete }: RowProps) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      style={{
        display: "flex", alignItems: "center", padding: "10px 16px",
        borderBottom: "1px solid var(--border)",
        background: hovered ? "var(--bg-secondary)" : "transparent",
        transition: "background 0.1s", gap: 12,
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Title + meta */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", marginBottom: 2 }}>
          {c.title}
        </div>
        <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
          <span style={{ fontWeight: 700, ...catColor(c.category) }}>{c.category}</span>
          {" · "}{c.hints?.length ?? 0} hint{c.hints?.length !== 1 ? "s" : ""}
          {" · "}max {c.maxAttempts} attempts
        </div>
      </div>

      {/* Difficulty */}
      <span className={`psp-badge ${diffBadge(c.difficulty)}`} style={{ fontSize: 10 }}>
        {c.difficulty.charAt(0) + c.difficulty.slice(1).toLowerCase()}
      </span>

      {/* Status */}
      <span className={`psp-badge ${c.isActive ? "b-tp" : "b-priv"}`} style={{ fontSize: 10 }}>
        {c.isActive ? "Active" : "Hidden"}
      </span>

      {/* Points */}
      <span style={{ fontSize: 12, color: "var(--text-primary)", fontWeight: 600, minWidth: 40, textAlign: "right" }}>
        {c.basePoints} pts
      </span>

      {/* Solves */}
      <span style={{ fontSize: 12, color: "var(--green)", fontWeight: 600, minWidth: 50, textAlign: "right" }}>
        {c.solveCount} solve{c.solveCount !== 1 ? "s" : ""}
      </span>

      {/* Actions */}
      <div style={{ display: "flex", gap: 2, flexShrink: 0 }}>
        <Link href={`/admin/ctf/${c.id}/submissions`}>
          <button style={iconBtn} title="View submissions"><Search size={14} /></button>
        </Link>
        <button style={iconBtn} title={c.isActive ? "Hide" : "Publish"} onClick={onToggle}>
          {c.isActive ? <EyeOff size={14} /> : <Eye size={14} />}
        </button>
        <Link href={`/admin/ctf/${c.id}/edit`}>
          <button style={iconBtn} title="Edit"><Edit2 size={14} /></button>
        </Link>
        <button style={{ ...iconBtn, color: "var(--red)" }} title="Delete" onClick={onDelete}>
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
}

export default TeacherCTF;
