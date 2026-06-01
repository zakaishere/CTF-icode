import { redirect } from "next/navigation";

/**
 * The overview route is a stable URL but always sends users to /challenges.
 * Keeping it as a dedicated page (rather than a top-level rewrite) lets the
 * sidebar's Overview entry highlight when this URL is visited briefly, and
 * gives us somewhere to render an explicit "summary" view later if needed.
 */
export default async function CTFOverviewPage({
  params,
}: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/ctf/competitions/${id}/challenges`);
}
