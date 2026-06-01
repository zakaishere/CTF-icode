"use client";

import { CTFCompetitionProvider } from "@/features/ctf/context/CTFCompetitionContext";
import CTFShell from "@/features/ctf/shared/CTFShell";

/** Client-only wrapper so the (async) server layout can pass the route param
 *  into the React context. */
export default function CTFShellClient({
  competitionId, children,
}: { competitionId: string; children: React.ReactNode }) {
  return (
    <CTFCompetitionProvider competitionId={competitionId}>
      <CTFShell competitionId={competitionId}>{children}</CTFShell>
    </CTFCompetitionProvider>
  );
}
