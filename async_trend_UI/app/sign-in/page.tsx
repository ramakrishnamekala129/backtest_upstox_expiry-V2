import { redirect } from "next/navigation";
import { signInAction } from "@/app/(auth)/actions";
import { createClient } from "@/lib/supabase/server";

export default async function SignInPage({
  searchParams
}: {
  searchParams?: { error?: string; message?: string };
}) {
  const error = searchParams?.error;
  const message = searchParams?.message;
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (user) {
    redirect("/");
  }

  return (
    <main className="authPage">
      <section className="authCard">
        <p className="eyebrow">TrendDates Access</p>
        <h1>Sign in</h1>
        <p className="muted">Use your account to open the dashboard.</p>

        {message ? <p className="authMessage">{message}</p> : null}
        {error ? <p className="authError">{error}</p> : null}

        <form className="authForm" action={signInAction}>
          <label>
            <span>Email</span>
            <input type="email" name="email" autoComplete="email" required />
          </label>
          <label>
            <span>Password</span>
            <input type="password" name="password" autoComplete="current-password" required />
          </label>
          <button type="submit" className="controlBtn">
            Sign in
          </button>
        </form>

        <p className="authAlt">
          New account? <a href="/sign-up">Create one</a>
        </p>
      </section>
    </main>
  );
}
