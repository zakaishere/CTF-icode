interface Props {
  used: number;
  total: number;
  label?: string;
  color?: string;
}

export default function TimeProgress({ used, total, label, color = "#0052cc" }: Props) {
  const pct = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0;
  return (
    <div style={{ width: "100%" }}>
      {label && (
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>
          <span>{label}</span>
          <span>{used}/{total}</span>
        </div>
      )}
      <div style={{ background: "var(--border)", height: 3, borderRadius: 2 }}>
        <div style={{ background: color, height: 3, borderRadius: 2, width: `${pct}%`, transition: "width 0.3s" }} />
      </div>
    </div>
  );
}
