import { AstroPage } from "@/components/astro-page";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function AstroRoutePage() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/sign-in");
  }

  return <AstroPage userEmail={user.email ?? ""} />;
}
