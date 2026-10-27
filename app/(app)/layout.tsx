import { redirect } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import { SAMPLE_TASKS } from "@/lib/sample";
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

  return (
    <div className="shell">
      <Sidebar badges={{ assignments: SAMPLE_TASKS.length }} userEmail={user.email ?? ""} />
      {children}
    </div>
  );
}
