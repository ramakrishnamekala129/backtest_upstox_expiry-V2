import { PlanetaryAspectExplorer } from "@/components/planetary-aspect-explorer";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function PlanetaryAspectsRoutePage() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/sign-in");
  }

  return <PlanetaryAspectExplorer userEmail={user.email ?? ""} />;
}

