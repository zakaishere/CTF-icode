import type { Metadata } from "next";
import CTFShellClient from "./CTFShellClient";

export const metadata: Metadata = {
  title: "CTF Competition — PSP",
};

interface LayoutProps {
  children: React.ReactNode;
  params:   Promise<{ id: string }>;
}

/**
 * (ctf) route group layout. This intentionally renders the CTF-specific shell
 * INSTEAD of the regular PSP navbar — none of the child routes shows the main
 * navbar.
 *
 * Note: the root `src/app/layout.tsx` only sets up html/body/providers, so we
 * don't need a separate (main) group to keep the main navbar away from here.
 * Pages outside (ctf) include their own <Navbar /> directly.
 */
export default async function CTFGroupLayout({ children, params }: LayoutProps) {
  const { id } = await params;
  return <CTFShellClient competitionId={id}>{children}</CTFShellClient>;
}
