"use client";

import {
  Lock, Search, RefreshCw, Globe, Terminal, Eye, Puzzle, LayoutGrid,
} from "lucide-react";
import type { ReactNode } from "react";

export interface CategoryDef {
  label:  string;
  icon:   ReactNode;
  accent: string;
}

export const CAT_CONFIG: Record<string, CategoryDef> = {
  WEB:       { label: "Web",       icon: <Globe size={14} />,     accent: "#60a5ff" },
  PWN:       { label: "Pwn",       icon: <Terminal size={14} />,  accent: "#fb7185" },
  CRYPTO:    { label: "Crypto",    icon: <Lock size={14} />,      accent: "#c084fc" },
  REVERSE:   { label: "Reverse",   icon: <RefreshCw size={14} />, accent: "#fbbf24" },
  FORENSICS: { label: "Forensics", icon: <Search size={14} />,    accent: "#34d399" },
  OSINT:     { label: "OSINT",     icon: <Eye size={14} />,       accent: "#38bdf8" },
  MISC:      { label: "Misc",      icon: <Puzzle size={14} />,    accent: "#94a3b8" },
};

export const ALL_CAT: CategoryDef = {
  label:  "All",
  icon:   <LayoutGrid size={14} />,
  accent: "#60a5ff",
};

export const DIFF_COLORS: Record<string, string> = {
  EASY:   "#4ade80",
  MEDIUM: "#fbbf24",
  HARD:   "#fb7185",
  INSANE: "#c084fc",
};

export function catFor(key: string): CategoryDef {
  return key === "ALL" ? ALL_CAT : (CAT_CONFIG[key] ?? { label: key, icon: <Puzzle size={14} />, accent: "#6b7ea3" });
}
