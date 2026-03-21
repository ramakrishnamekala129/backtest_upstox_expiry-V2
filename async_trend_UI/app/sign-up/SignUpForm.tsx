"use client";

import { useState, useTransition } from "react";
import { signUpAction } from "@/app/(auth)/actions";

const COUNTRIES = [
  { code: "IN", name: "India", dial: "+91" },
  { code: "US", name: "United States", dial: "+1" },
  { code: "GB", name: "United Kingdom", dial: "+44" },
  { code: "CA", name: "Canada", dial: "+1" },
  { code: "AU", name: "Australia", dial: "+61" },
  { code: "DE", name: "Germany", dial: "+49" },
  { code: "FR", name: "France", dial: "+33" },
  { code: "SG", name: "Singapore", dial: "+65" },
  { code: "AE", name: "UAE", dial: "+971" },
  { code: "JP", name: "Japan", dial: "+81" },
  { code: "CN", name: "China", dial: "+86" },
  { code: "BR", name: "Brazil", dial: "+55" },
  { code: "ZA", name: "South Africa", dial: "+27" },
  { code: "NG", name: "Nigeria", dial: "+234" },
  { code: "PK", name: "Pakistan", dial: "+92" },
  { code: "BD", name: "Bangladesh", dial: "+880" },
  { code: "LK", name: "Sri Lanka", dial: "+94" },
  { code: "MY", name: "Malaysia", dial: "+60" },
  { code: "ID", name: "Indonesia", dial: "+62" },
  { code: "PH", name: "Philippines", dial: "+63" },
  { code: "TH", name: "Thailand", dial: "+66" },
  { code: "VN", name: "Vietnam", dial: "+84" },
  { code: "OTHER", name: "Other", dial: "+" }
];

interface Props {
  error?: string;
}

export function SignUpForm({ error }: Props) {
  const [selectedCountry, setSelectedCountry] = useState(COUNTRIES[0]);
  const [phone, setPhone] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleCountryChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const found = COUNTRIES.find((c) => c.code === e.target.value);
    if (found) setSelectedCountry(found);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    const rawPhone = String(data.get("phone_number") ?? "").trim();
    data.set("phone_number", rawPhone ? selectedCountry.dial + rawPhone : "");
    startTransition(async () => {
      await signUpAction(data);
    });
  }

  return (
    <main className="authPage">
      <section className="authCard signUpCard">
        <div className="authCardHeader">
          <p className="eyebrow">TrendDates Access</p>
          <h1>Create account</h1>
          <p className="muted">Join TrendDates to access the dashboard.</p>
        </div>

        {error && <p className="authError">{error}</p>}

        <form className="authForm" onSubmit={handleSubmit}>
          <div className="authRow">
            <label>
              <span>Full Name</span>
              <input
                type="text"
                name="full_name"
                placeholder="Ramakrishna Mekala"
                autoComplete="name"
                required
              />
            </label>
            <label>
              <span>Username</span>
              <div className="inputPrefix">
                <span className="prefixAt">@</span>
                <input
                  type="text"
                  name="username"
                  placeholder="ramak"
                  autoComplete="username"
                  pattern="[a-zA-Z0-9_]+"
                  title="Only letters, numbers, and underscores"
                  required
                  className="inputWithPrefix"
                />
              </div>
            </label>
          </div>

          <label>
            <span>Email</span>
            <input
              type="email"
              name="email"
              placeholder="you@example.com"
              autoComplete="email"
              required
            />
          </label>

          <label>
            <span>Password</span>
            <input
              type="password"
              name="password"
              placeholder="Min. 6 characters"
              autoComplete="new-password"
              minLength={6}
              required
            />
          </label>

          <label>
            <span>Phone Number</span>
            <div className="phoneRow">
              <select
                className="countryDialSelect"
                value={selectedCountry.code}
                onChange={handleCountryChange}
                aria-label="Country dial code"
              >
                {COUNTRIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code} {c.dial}
                  </option>
                ))}
              </select>
              <input
                type="tel"
                name="phone_number"
                placeholder="9876543210"
                autoComplete="tel-national"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="phoneInput"
              />
            </div>
          </label>

          <label>
            <span>Country</span>
            <select name="country" defaultValue="IN">
              {COUNTRIES.filter((c) => c.code !== "OTHER").map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name}
                </option>
              ))}
              <option value="OTHER">Other</option>
            </select>
          </label>

          <button type="submit" className="controlBtn authSubmitBtn" disabled={isPending}>
            {isPending ? "Creating account..." : "Create account"}
          </button>
        </form>

        <p className="authAlt">
          Already have an account? <a href="/sign-in">Sign in</a>
        </p>
      </section>
    </main>
  );
}
