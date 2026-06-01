"use client";

import { useState, useEffect } from "react";
import { Clock } from "lucide-react";

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function formatCountdown(ms: number) {
  if (ms <= 0) return "Starting…";
  const totalSecs = Math.floor(ms / 1000);
  const d = Math.floor(totalSecs / 86400);
  const h = Math.floor((totalSecs % 86400) / 3600);
  const m = Math.floor((totalSecs % 3600) / 60);
  const s = totalSecs % 60;
  if (d > 0) return `${d}d ${pad(h)}h ${pad(m)}m`;
  if (h > 0) return `${pad(h)}h ${pad(m)}m ${pad(s)}s`;
  return `${pad(m)}m ${pad(s)}s`;
}

interface Props {
  targetDate: string | null | undefined;
  label?: string;
}

export default function MiniCountdown({ targetDate, label = "Starts in" }: Props) {
  const [ms, setMs] = useState<number>(() =>
    targetDate ? new Date(targetDate).getTime() - Date.now() : 0
  );

  useEffect(() => {
    if (!targetDate) return;
    const tick = () => setMs(new Date(targetDate).getTime() - Date.now());
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [targetDate]);

  if (!targetDate) return null;

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        fontSize: 11,
        fontWeight: 600,
        color: ms <= 0 ? "#00875a" : ms < 3_600_000 ? "#de350b" : "#0052cc",
        background: ms <= 0 ? "#e3fcef" : ms < 3_600_000 ? "#ffebe6" : "#deebff",
        borderRadius: 3,
        padding: "2px 7px",
      }}
    >
      <Clock size={10} />
      {label} {formatCountdown(ms)}
    </span>
  );
}
