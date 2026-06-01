import { redirect } from "next/navigation";

/**
 * /admin/ctf/competitions → redirect to canonical competitions list at /admin/ctf
 */
export default function Page() {
  redirect("/admin/ctf");
}
