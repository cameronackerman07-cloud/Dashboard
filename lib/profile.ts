import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export type Profile = { id: string; email: string; displayName: string };

// The signed-in user and their display name, read once per request (the layout
// and the page can both ask without a second database trip).
export const getProfile = cache(async (): Promise<Profile | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase.from("profiles").select("display_name").eq("id", user.id).maybeSingle();
  const email = user.email ?? "";
  const fromMeta = typeof user.user_metadata?.display_name === "string" ? user.user_metadata.display_name : "";
  const displayName = (data?.display_name as string | null)?.trim() || fromMeta.trim() || email.split("@")[0] || "there";
  return { id: user.id, email, displayName };
});
