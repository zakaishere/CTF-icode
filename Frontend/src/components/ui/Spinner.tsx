import { Loader2 } from "lucide-react";

export default function Spinner({ size = 20 }: { size?: number }) {
  return (
    <Loader2
      size={size}
      style={{ animation: "spin 1s linear infinite", color: "#0052cc" }}
    />
  );
}
