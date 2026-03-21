import { TrendDashboard } from "@/components/trend-dashboard";
import { loadTrendPayload } from "@/lib/trend-data";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/sign-in");
  }

  const data = await loadTrendPayload();
  return <TrendDashboard data={data} userEmail={user.email ?? ""} />;
}
