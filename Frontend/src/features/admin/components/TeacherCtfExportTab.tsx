"use client";

import { useState } from "react";
import { Download, FileSpreadsheet, AlertTriangle } from "lucide-react";
import { toast } from "@/components/ui/PSPToast";
import { downloadTeacherCtfExport, downloadTeacherCtfCheatsExport } from "@/lib/api";

interface Props { competitionId: string; }

function ExportRow({
  icon, title, desc, badge, onDownload, loading,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  badge?: string;
  onDownload: () => void;
  loading: boolean;
}) {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "16px 18px", borderBottom: "1px solid var(--border)",
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        <span style={{ color: "var(--text-muted)", marginTop: 2 }}>{icon}</span>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{title}</span>
            {badge && (
              <span style={{
                fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 4,
                background: "rgba(99,102,241,0.15)", color: "#818cf8",
              }}>{badge}</span>
            )}
          </div>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>{desc}</div>
        </div>
      </div>
      <button
        className="psp-btn psp-btn-secondary psp-btn-sm"
        style={{ gap: 6, flexShrink: 0 }}
        onClick={onDownload}
        disabled={loading}
      >
        <Download size={12} /> {loading ? "Preparing…" : "Download CSV"}
      </button>
    </div>
  );
}

export default function TeacherCtfExportTab({ competitionId }: Props) {
  const [busy, setBusy] = useState<Record<string, boolean>>({});

  async function run(key: string, fn: () => Promise<void>) {
    setBusy(b => ({ ...b, [key]: true }));
    try {
      await fn();
      toast.success("Export ready", "Download started.");
    } catch {
      // toast already shown by apiClient
    } finally {
      setBusy(b => ({ ...b, [key]: false }));
    }
  }

  return (
    <div style={{ maxWidth: 720 }}>
      <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 18, lineHeight: 1.6 }}>
        Download competition data as CSV files. All times are UTC.
      </div>

      <div className="psp-card" style={{ overflow: "hidden" }}>
        <ExportRow
          icon={<FileSpreadsheet size={16} />}
          title="Full Export"
          badge="Scoreboard + Submissions"
          desc="Complete report: final rankings (rank, team, points, solves) followed by the full submissions log (team, member, challenge, category, points, timestamp)."
          onDownload={() => run("full", () => downloadTeacherCtfExport(competitionId))}
          loading={!!busy.full}
        />
        <div style={{ padding: "16px 18px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
              <span style={{ color: "var(--text-muted)", marginTop: 2 }}>
                <AlertTriangle size={16} />
              </span>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
                  Cheat Log
                </div>
                <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>
                  Cross-team flag sharing events: detected time, challenge, submitting user &amp; team, flag source team, submitted value, and dismissed/active status.
                </div>
              </div>
            </div>
            <button
              className="psp-btn psp-btn-secondary psp-btn-sm"
              style={{ gap: 6, flexShrink: 0 }}
              onClick={() => run("cheats", () => downloadTeacherCtfCheatsExport(competitionId))}
              disabled={!!busy.cheats}
            >
              <Download size={12} /> {busy.cheats ? "Preparing…" : "Download CSV"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
