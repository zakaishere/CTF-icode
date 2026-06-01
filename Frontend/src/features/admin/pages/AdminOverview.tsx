"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/features/auth/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { listAdminCtfCompetitions, type CTFCompetitionDTO } from "@/lib/api";
import {
  Flag, Trophy, Plus, LogOut, Settings, ChevronRight, Users, Clock,
} from "lucide-react";

function StatusDot({ status }: { status: string }) {
  const colors: Record<string, string> = {
    ACTIVE: "#22c55e", UPCOMING: "#f59e0b", ENDED: "#6b7280",
    PAUSED: "#f97316", FROZEN: "#60a5fa",
  };
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12 }}>
      <span style={{ width: 7, height: 7, borderRadius: "50%", background: colors[status] ?? "#6b7280", flexShrink: 0, display: "inline-block" }} />
      {status}
    </span>
  );
}

export default function AdminOverview() {
  const { firstName, logout } = useAuth();
  const router = useRouter();

  const { data: competitions = [], isLoading } = useQuery<CTFCompetitionDTO[]>({
    queryKey: ["admin-competitions"],
    queryFn:  listAdminCtfCompetitions,
  });

  return (
    <div style={{ minHeight: "100vh", background: "#0a0a0a", color: "#f1f1f1", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" }}>
      {/* Navbar */}
      <nav style={{ background: "#0d0d0d", borderBottom: "1px solid #1a1a1a", padding: "0 24px", height: 52, display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 50 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <Link href="/admin" style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 700, fontSize: 16, color: "#f1f1f1", textDecoration: "none" }}>
            <Flag size={18} color="#22c55e" /> icode-ctf
          </Link>
          <span style={{ fontSize: 11, color: "#374151", userSelect: "none" }}>|</span>
          <Link href="/admin/ctf"         style={{ fontSize: 13, color: "#9ca3af", textDecoration: "none" }}>Competitions</Link>
          <Link href="/admin/ctf/library" style={{ fontSize: 13, color: "#9ca3af", textDecoration: "none" }}>Library</Link>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <span style={{ fontSize: 13, color: "#6b7280" }}>
            Admin: <strong style={{ color: "#f1f1f1" }}>{firstName ?? "Admin"}</strong>
          </span>
          <button onClick={() => { logout(); router.replace("/"); }}
            style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "#6b7280", background: "none", border: "none", cursor: "pointer", padding: "4px 8px", borderRadius: 4 }}>
            <LogOut size={13} /> Sign out
          </button>
        </div>
      </nav>

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "36px 24px" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 32 }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>Admin Dashboard</h1>
            <p style={{ fontSize: 13, color: "#6b7280", margin: "4px 0 0" }}>Manage competitions, challenges, and the challenge library.</p>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <Link href="/admin/ctf/new"
              style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600, background: "#22c55e", color: "#000", padding: "8px 16px", borderRadius: 6, textDecoration: "none" }}>
              <Plus size={14} /> New Competition
            </Link>
            <Link href="/admin/ctf/new"
              style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600, background: "#1a1a1a", border: "1px solid #2a2a2a", color: "#f1f1f1", padding: "8px 16px", borderRadius: 6, textDecoration: "none" }}>
              <Plus size={14} /> New Challenge
            </Link>
          </div>
        </div>

        {/* Quick-link cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 14, marginBottom: 40 }}>
          {[
            { href: "/admin/ctf",         icon: <Trophy size={20} color="#22c55e" />,   label: "Competitions", sub: "Create & manage CTF events" },
            { href: "/admin/ctf/library", icon: <Settings size={20} color="#f59e0b" />, label: "Library",      sub: "Reusable challenge templates" },
          ].map(({ href, icon, label, sub }) => (
            <Link key={href} href={href} style={{ textDecoration: "none" }}>
              <div style={{ background: "#111", border: "1px solid #1e1e1e", borderRadius: 8, padding: "18px 20px", cursor: "pointer", transition: "border-color 0.15s" }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = "#333")}
                onMouseLeave={e => (e.currentTarget.style.borderColor = "#1e1e1e")}>
                <div style={{ marginBottom: 10 }}>{icon}</div>
                <div style={{ fontSize: 15, fontWeight: 600, color: "#f1f1f1", marginBottom: 4 }}>{label}</div>
                <div style={{ fontSize: 12, color: "#6b7280" }}>{sub}</div>
              </div>
            </Link>
          ))}
        </div>

        {/* Competitions table */}
        <div style={{ background: "#111", border: "1px solid #1e1e1e", borderRadius: 8, overflow: "hidden" }}>
          <div style={{ padding: "16px 20px", borderBottom: "1px solid #1e1e1e", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>All Competitions</span>
            <Link href="/admin/ctf" style={{ fontSize: 12, color: "#22c55e", textDecoration: "none", display: "flex", alignItems: "center", gap: 4 }}>
              View all <ChevronRight size={12} />
            </Link>
          </div>

          {isLoading && (
            <div style={{ padding: "40px 20px", textAlign: "center", color: "#4b5563", fontSize: 13 }}>Loading…</div>
          )}
          {!isLoading && competitions.length === 0 && (
            <div style={{ padding: "40px 20px", textAlign: "center", color: "#4b5563", fontSize: 13 }}>
              No competitions yet.{" "}
              <Link href="/admin/ctf/new" style={{ color: "#22c55e" }}>Create the first one →</Link>
            </div>
          )}
          {competitions.length > 0 && (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #1e1e1e" }}>
                  {["Title", "Status", "Mode", "Visibility", "Teams", "Start", ""].map(h => (
                    <th key={h} style={{ padding: "10px 16px", textAlign: "left", fontWeight: 600, color: "#6b7280", fontSize: 11, letterSpacing: "0.05em", textTransform: "uppercase" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {competitions.map(c => (
                  <tr key={c.id} style={{ borderBottom: "1px solid #161616" }}
                    onMouseEnter={e => (e.currentTarget.style.background = "#151515")}
                    onMouseLeave={e => (e.currentTarget.style.background = "")}>
                    <td style={{ padding: "12px 16px", fontWeight: 500, color: "#f1f1f1" }}>{c.title}</td>
                    <td style={{ padding: "12px 16px" }}><StatusDot status={c.status} /></td>
                    <td style={{ padding: "12px 16px", color: "#9ca3af" }}>{c.scoringMode}</td>
                    <td style={{ padding: "12px 16px", color: "#9ca3af" }}>{c.visibility}</td>
                    <td style={{ padding: "12px 16px", color: "#9ca3af" }}>
                      <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <Users size={12} /> {c.myTeam ? "—" : "—"}
                      </span>
                    </td>
                    <td style={{ padding: "12px 16px", color: "#6b7280" }}>
                      {c.startTime ? (
                        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          <Clock size={11} /> {new Date(c.startTime).toLocaleDateString()}
                        </span>
                      ) : "—"}
                    </td>
                    <td style={{ padding: "12px 16px", textAlign: "right" }}>
                      <Link href={`/admin/ctf/${c.id}/manage`}
                        style={{ fontSize: 12, color: "#22c55e", textDecoration: "none", marginRight: 12 }}>
                        Manage
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
