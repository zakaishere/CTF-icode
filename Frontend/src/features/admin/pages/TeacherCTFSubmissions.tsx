"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import { Shield, CheckCircle2, XCircle, Users } from "lucide-react";
import { toast } from "@/components/ui/PSPToast";
import { getTeacherCTFChallenge, CTFChallengeDetailResponse } from "@/lib/api";

interface Props { challengeId: string }

const TeacherCTFSubmissions = ({ challengeId }: Props) => {
  const [detail, setDetail]   = useState<CTFChallengeDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab]         = useState<"solves" | "attempts">("solves");

  useEffect(() => {
    (async () => {
      try {
        const d = await getTeacherCTFChallenge(challengeId);
        setDetail(d);
      } catch {
        toast.error("Failed to load challenge data", "Please try again.");
      } finally {
        setLoading(false);
      }
    })();
  }, [challengeId]);

  const fmt = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
      + " " + d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  };

  return (
    <>
      <Navbar />
      <div className="psp-breadcrumb">
        <Link href="/admin">icode-ctf</Link> ›{" "}
        <Link href="/admin/ctf">CTF Challenges</Link> ›{" "}
        {detail
          ? <><Link href={`/admin/ctf/${challengeId}/edit`}>{detail.title}</Link> › <span style={{ color: "var(--text-primary)" }}>Submissions</span></>
          : <span style={{ color: "var(--text-primary)" }}>Submissions</span>
        }
      </div>

      <div className="psp-main">

        {loading ? (
          <div>
            {[...Array(3)].map((_, i) => (
              <div key={i} className="skel" style={{ height: 56, borderRadius: 6, marginBottom: 10 }} />
            ))}
          </div>
        ) : !detail ? (
          <div className="psp-empty">
            <Shield size={28} />
            <p>Challenge not found or you don't have access.</p>
          </div>
        ) : (
          <>
            {/* Header */}
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20 }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Shield size={18} color="var(--blue)" />
                  <h1 className="psp-title" style={{ margin: 0 }}>{detail.title}</h1>
                  <span className={`psp-badge ${detail.difficulty === "EASY" ? "b-easy" : detail.difficulty === "MEDIUM" ? "b-med" : "b-hard"}`} style={{ fontSize: 10 }}>
                    {detail.difficulty.charAt(0) + detail.difficulty.slice(1).toLowerCase()}
                  </span>
                </div>
                <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
                  {detail.category} · {detail.basePoints} pts
                </p>
              </div>
              <Link href={`/admin/ctf/${challengeId}/edit`}>
                <button className="psp-btn psp-btn-secondary" style={{ fontSize: 12, height: 32 }}>
                  Edit Challenge
                </button>
              </Link>
            </div>

            {/* Stats row */}
            <div className="psp-stats" style={{ marginBottom: 20 }}>
              <div className="psp-stat-card">
                <div className="psp-stat-icon ic-green"><CheckCircle2 size={16} /></div>
                <div><div className="psp-stat-val">{detail.solveCount}</div><div className="psp-stat-lbl">Solves</div></div>
              </div>
              <div className="psp-stat-card">
                <div className="psp-stat-icon ic-orange"><Users size={16} /></div>
                <div><div className="psp-stat-val">{detail.attemptCount}</div><div className="psp-stat-lbl">Attempts</div></div>
              </div>
              <div className="psp-stat-card">
                <div className="psp-stat-icon ic-blue"><Shield size={16} /></div>
                <div>
                  <div className="psp-stat-val">
                    {detail.attemptCount > 0 ? Math.round((detail.solveCount / detail.attemptCount) * 100) : 0}%
                  </div>
                  <div className="psp-stat-lbl">Solve Rate</div>
                </div>
              </div>
            </div>

            {/* Tabs */}
            <div className="psp-filter-bar" style={{ marginBottom: 12 }}>
              <button className={`psp-ftab${tab === "solves" ? " on" : ""}`} onClick={() => setTab("solves")}>
                Solves ({detail.recentSolves.length})
              </button>
              <button className={`psp-ftab${tab === "attempts" ? " on" : ""}`} onClick={() => setTab("attempts")}>
                Recent Attempts ({detail.recentSubmissions.length})
              </button>
            </div>

            {/* Solves table */}
            {tab === "solves" && (
              <div className="psp-card" style={{ padding: 0, overflow: "hidden" }}>
                {detail.recentSolves.length === 0 ? (
                  <div className="psp-empty"><Shield size={24} /><p>No solves yet.</p></div>
                ) : (
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ borderBottom: "1px solid var(--border)", background: "var(--bg-secondary)" }}>
                        {["Student", "Solved At", "Points Awarded"].map(h => (
                          <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontSize: 11, fontWeight: 600,
                            color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {detail.recentSolves.map((s, i) => (
                        <tr key={i} style={{ borderBottom: "1px solid var(--border)" }}>
                          <td style={{ padding: "10px 14px", fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
                            {s.userDisplayName}
                          </td>
                          <td style={{ padding: "10px 14px", fontSize: 12, color: "var(--text-muted)", fontFamily: "monospace" }}>
                            {fmt(s.solvedAt)}
                          </td>
                          <td style={{ padding: "10px 14px" }}>
                            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--green)" }}>
                              +{s.pointsAwarded}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}

            {/* Attempts table */}
            {tab === "attempts" && (
              <div className="psp-card" style={{ padding: 0, overflow: "hidden" }}>
                {detail.recentSubmissions.length === 0 ? (
                  <div className="psp-empty"><Shield size={24} /><p>No submissions yet.</p></div>
                ) : (
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ borderBottom: "1px solid var(--border)", background: "var(--bg-secondary)" }}>
                        {["Student", "Submitted", "Result", "Time"].map(h => (
                          <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontSize: 11, fontWeight: 600,
                            color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {detail.recentSubmissions.map((s, i) => (
                        <tr key={i} style={{ borderBottom: "1px solid var(--border)" }}>
                          <td style={{ padding: "10px 14px", fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
                            {s.userDisplayName}
                          </td>
                          <td style={{ padding: "10px 14px", fontSize: 12, fontFamily: "monospace", color: "var(--text-secondary)" }}>
                            {s.submittedValueMasked}
                          </td>
                          <td style={{ padding: "10px 14px" }}>
                            {s.correct ? (
                              <span style={{ display: "flex", alignItems: "center", gap: 4, color: "var(--green)", fontSize: 12, fontWeight: 600 }}>
                                <CheckCircle2 size={13} /> Correct
                              </span>
                            ) : (
                              <span style={{ display: "flex", alignItems: "center", gap: 4, color: "var(--red)", fontSize: 12, fontWeight: 600 }}>
                                <XCircle size={13} /> Wrong
                              </span>
                            )}
                          </td>
                          <td style={{ padding: "10px 14px", fontSize: 12, color: "var(--text-muted)", fontFamily: "monospace" }}>
                            {fmt(s.submittedAt)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}

          </>
        )}
      </div>
    </>
  );
};

export default TeacherCTFSubmissions;
