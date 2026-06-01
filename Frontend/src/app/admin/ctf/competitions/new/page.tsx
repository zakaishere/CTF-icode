import { redirect } from "next/navigation";

/**
 * /admin/ctf/competitions/new → redirect to canonical create-competition form at /admin/ctf/new
 */
export default function Page() {
  redirect("/admin/ctf/new");
}
