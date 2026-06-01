import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get("token")?.value;
  const role  = request.cookies.get("role")?.value;

  const isAuthenticated = !!token;

  // ── Public routes — always accessible ────────────────────────────────────
  if (pathname.startsWith("/auth") || pathname.startsWith("/api")) {
    return NextResponse.next();
  }

  // ── Root "/" is the public splash for unauthenticated visitors ──────────
  if (!isAuthenticated && pathname === "/") {
    return NextResponse.next();
  }

  // ── Unauthenticated → /auth ───────────────────────────────────────────────
  if (!isAuthenticated) {
    const url = request.nextUrl.clone();
    url.pathname = "/auth";
    return NextResponse.redirect(url);
  }

  // ── /admin routes — ADMIN only ────────────────────────────────────────────
  if (pathname.startsWith("/admin")) {
    if (role !== "ADMIN") {
      const url = request.nextUrl.clone();
      url.pathname = "/welcome";
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  // ── Root → role-based landing ─────────────────────────────────────────────
  if (pathname === "/") {
    const url = request.nextUrl.clone();
    url.pathname = role === "ADMIN" ? "/admin" : "/welcome";
    return NextResponse.redirect(url);
  }

  // ── All other authenticated routes (CTF, welcome) ─────────────────────────
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
