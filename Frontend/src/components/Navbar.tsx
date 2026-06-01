"use client";

import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import {
  Home, Trophy, Flag, Shield, LogOut, User,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/features/auth/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";

// ── Role-based nav links ─────────────────────────────────────────────────────

const playerLinks = [
  { href: "/welcome",          label: "Home",         icon: <Home size={14} />,   exact: true },
  { href: "/ctf/competitions", label: "Competitions", icon: <Trophy size={14} /> },
  { href: "/ctf",              label: "Challenges",   icon: <Flag size={14} /> },
];

const adminLinks = [
  { href: "/admin",             label: "Dashboard",    icon: <Home size={14} />,    exact: true },
  { href: "/admin/ctf",         label: "Competitions", icon: <Trophy size={14} />, exact: false },
  { href: "/admin/ctf/library", label: "Library",      icon: <Shield size={14} /> },
];

// ── Theme toggle ─────────────────────────────────────────────────────────────

function ThemeToggle() {
  const { isDark, toggleTheme } = useTheme();
  return (
    <button
      onClick={toggleTheme}
      title={isDark ? "Switch to light" : "Switch to dark"}
      className="psp-nav-btn"
      style={{
        background: isDark ? "rgba(76,154,255,0.1)" : "rgba(255,255,255,0.12)",
        border:     isDark ? "1px solid rgba(76,154,255,0.2)" : "1px solid rgba(255,255,255,0.2)",
        color:      isDark ? "#4c9aff" : "white",
      }}
    >
      {isDark ? (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="4"/>
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>
        </svg>
      ) : (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
        </svg>
      )}
    </button>
  );
}

// ── Navbar ───────────────────────────────────────────────────────────────────

export default function Navbar() {
  const pathname = usePathname();
  const router   = useRouter();
  const { isAuthenticated, role, username, email, logout } = useAuth();

  const links = role === "ADMIN" ? adminLinks : playerLinks;

  const isActive = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname === href || pathname.startsWith(href + "/");


  return (
    <nav className="psp-navbar">
      {/* Logo */}
      <Link href={role === "ADMIN" ? "/admin" : "/welcome"} className="psp-nav-logo">
        <Flag size={16} color="#22c55e" style={{ flexShrink: 0 }} />
        icode-ctf
      </Link>

      {isAuthenticated && (
        <>
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`psp-nav-link${isActive(l.href, l.exact) ? " active" : ""}`}
            >
              {l.icon}
              {l.label}
            </Link>
          ))}

          <div className="psp-nav-right">
            <ThemeToggle />

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="psp-nav-name-btn"
                  title={email || "Account"}
                >
                  {username || "Player"}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <div className="px-3 py-2">
                  <p className="text-sm font-semibold">{username || "Player"}</p>
                  <p className="text-xs text-[#5e6c84] truncate">{email}</p>
                  <p className="text-xs text-[#5e6c84] mt-0.5">{role}</p>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="cursor-pointer text-sm">
                  <User className="mr-2 h-3.5 w-3.5" /> Profile
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="cursor-pointer text-sm text-red-600 focus:text-red-600"
                  onClick={() => { logout(); router.push("/"); }}
                >
                  <LogOut className="mr-2 h-3.5 w-3.5" /> Log out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </>
      )}

      {!isAuthenticated && (
        <div className="psp-nav-right">
          <Link href="/auth" className="psp-nav-link"
            style={{ border: "1.5px solid rgba(255,255,255,0.45)", borderRadius: 3, height: 32, padding: "0 14px" }}>
            Sign In
          </Link>
        </div>
      )}
    </nav>
  );
}
