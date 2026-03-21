import { MoonAscendantExplorer } from "@/components/moon-ascendant-explorer";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function MoonAscendantRoutePage() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/sign-in");
  }

  return <MoonAscendantExplorer userEmail={user.email ?? ""} />;
}
