import { redirect } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import { createClient } from "@/lib/supabase/server";

// Layout for every signed-in page. The middleware already gates access, but we
// check again here (never trust the middleware alone) and hand the user's email
// to the sidebar. Using the session makes these pages render per-request.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // Badge the Assignments nav item with the number of tasks still to do.
  const { count } = await supabase
    .from("tasks")
    .select("id", { count: "exact", head: true })
    .eq("done", false);

  return (
    <div className="shell">
      <Sidebar badges={{ assignments: count ?? 0 }} userEmail={user.email ?? ""} />
      {children}
    </div>
  );
}
