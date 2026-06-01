import { redirect } from "next/navigation";

/**
 * The bare competition URL is kept as a stable entry point but always sends
 * players straight to /challenges (their home). There is no Overview tab in
 * the player sidebar; this redirect just makes the bare URL resolve sensibly.
 */
export default async function CTFOverviewPage({
  params,
}: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/ctf/competitions/${id}/challenges`);
}
