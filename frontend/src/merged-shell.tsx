import React, { useEffect, useMemo, useState } from "react";

import { LegacyTradingApp } from "./legacy-trading-app";

interface SessionUser {
  id: string;
  email: string;
  user_metadata?: Record<string, unknown>;
}

interface SessionResponse {
  user: SessionUser;
}

interface GenericRow {
  [key: string]: string | number | boolean | null;
}

interface TrendPayload {
  generated_at?: string;
  trend_dates: GenericRow[];
  dates_wise_single: GenericRow[];
  dates_wise_summary: GenericRow[];
  dates_wise_table: Record<string, GenericRow[]>;
}

interface TrendResponse {
  source: string;
  payload: TrendPayload;
}

interface AstroResponse {
  payload: {
    moonShift: GenericRow;
    currentPadas: GenericRow[];
    nextPadas: GenericRow[];
    nearestPriceRow: { rows: GenericRow[] };
    levels: GenericRow[];
    horaTimings: GenericRow[];
    positions: GenericRow[];
    aspects: GenericRow[];
  };
}

interface PlanetaryAspectResponse {
  payload: {
    totalRows: number;
    rows: GenericRow[];
    detailedRows: GenericRow[];
  };
}

interface MoonAscResponse {
  payload: {
    controls: { precisionMode: string };
    moon: { rawTotal: number; rawRows: GenericRow[]; filteredTotal: number; filteredRows: GenericRow[] };
    ascendant: { rawTotal: number; rawRows: GenericRow[]; filteredTotal: number; filteredRows: GenericRow[] };
  };
}

const PUBLIC_ROUTES = new Set(["/sign-in", "/sign-up"]);

function currentPath() {
  return window.location.pathname;
}

function navigate(path: string) {
  window.history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

function useRouterState() {
  const [pathname, setPathname] = useState(currentPath);

  useEffect(() => {
    function handlePopState() {
      setPathname(currentPath());
    }

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  return pathname;
}

function todayIst() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

function timeIst() {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(new Date());
}

function shiftIsoDate(isoDate: string, days: number) {
  const [year, month, day] = isoDate.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day));
  next.setUTCDate(next.getUTCDate() + days);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(next);
}

function parseTrendDate(raw: string) {
  const months = [
    "january",
    "february",
    "march",
    "april",
    "may",
    "june",
    "july",
    "august",
    "september",
    "october",
    "november",
    "december"
  ];
  const parts = /^(\d{1,2})-([A-Za-z]+)-(\d{4})$/.exec(raw.trim());
  if (parts) {
    const monthIndex = months.indexOf(parts[2].toLowerCase());
    if (monthIndex >= 0) {
      return new Date(Number(parts[3]), monthIndex, Number(parts[1]));
    }
  }
  const fallback = new Date(raw);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
}

function formatMonthYear(value: Date) {
  return value.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function getColumns(rows: GenericRow[]) {
  const keys = new Set<string>();
  rows.forEach((row) => Object.keys(row).forEach((key) => keys.add(key)));
  return [...keys];
}

function downloadRows(filename: string, rows: GenericRow[]) {
  if (!rows.length) {
    return;
  }
  const columns = getColumns(rows);
  const lines = [
    columns.join(","),
    ...rows.map((row) => columns.map((column) => JSON.stringify(String(row[column] ?? ""))).join(","))
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

function Panel({
  title,
  eyebrow,
  actions,
  children
}: {
  title: string;
  eyebrow?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[28px] border border-white/10 bg-white/5 p-6 shadow-[0_24px_80px_rgba(4,10,28,0.35)]">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          {eyebrow ? <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-cyan-300/80">{eyebrow}</div> : null}
          <h2 className="mt-2 text-2xl font-semibold text-white">{title}</h2>
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}

function DataTable({
  title,
  rows,
  exportName
}: {
  title: string;
  rows: GenericRow[];
  exportName?: string;
}) {
  const columns = useMemo(() => getColumns(rows), [rows]);

  return (
    <Panel
      title={title}
      actions={
        exportName ? (
          <button
            type="button"
            className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-slate-100"
            onClick={() => downloadRows(exportName, rows)}
          >
            Export CSV
          </button>
        ) : undefined
      }
    >
      {!rows.length ? (
        <p className="text-sm text-slate-400">No rows available.</p>
      ) : (
        <div className="max-h-[26rem] overflow-auto rounded-2xl border border-white/10">
          <table className="min-w-full text-left text-sm">
            <thead className="sticky top-0 bg-slate-950/90 text-slate-300">
              <tr>
                {columns.map((column) => (
                  <th key={column} className="border-b border-white/10 px-3 py-2 font-medium">
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={`${title}-${index}`} className="border-b border-white/5 align-top">
                  {columns.map((column) => (
                    <td key={`${index}-${column}`} className="px-3 py-2 text-slate-200">
                      {String(row[column] ?? "")}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

function SignInPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const message = new URLSearchParams(window.location.search).get("message") ?? "";

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/auth/sign-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
      });
      const payload = (await response.json()) as { detail?: string };
      if (!response.ok) {
        throw new Error(payload.detail ?? "Unable to sign in.");
      }
      navigate("/");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to sign in.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-lg items-center px-6">
      <Panel title="Sign in" eyebrow="Supabase Auth">
        <p className="mb-6 text-sm text-slate-400">Use your Supabase account to open the merged workspace.</p>
        {message ? <div className="mb-4 rounded-2xl border border-cyan-400/20 bg-cyan-400/10 px-4 py-3 text-sm text-cyan-100">{message}</div> : null}
        {error ? <div className="mb-4 rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">{error}</div> : null}
        <form className="space-y-4" onSubmit={handleSubmit}>
          <label className="block text-sm text-slate-300">
            <span className="mb-2 block">Email</span>
            <input className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
          </label>
          <label className="block text-sm text-slate-300">
            <span className="mb-2 block">Password</span>
            <input className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white" type="password" value={password} onChange={(event) => setPassword(event.target.value)} required />
          </label>
          <button type="submit" className="w-full rounded-2xl bg-cyan-400 px-4 py-3 font-semibold text-slate-950" disabled={loading}>
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>
        <button type="button" className="mt-4 text-sm font-semibold text-cyan-200" onClick={() => navigate("/sign-up")}>
          Need an account? Create one
        </button>
      </Panel>
    </div>
  );
}

function SignUpPage() {
  const [formState, setFormState] = useState({
    full_name: "",
    username: "",
    email: "",
    password: "",
    phone_number: "",
    country: "IN"
  });
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  function handleChange(key: keyof typeof formState, value: string) {
    setFormState((current) => ({ ...current, [key]: value }));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/auth/sign-up", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formState)
      });
      const payload = (await response.json()) as { detail?: string; message?: string };
      if (!response.ok) {
        throw new Error(payload.detail ?? "Unable to create account.");
      }
      setMessage(payload.message ?? "Account created.");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to create account.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-2xl items-center px-6">
      <Panel title="Create account" eyebrow="Supabase Auth">
        <p className="mb-6 text-sm text-slate-400">This preserves the donor app sign-up metadata in the merged backend flow.</p>
        {message ? <div className="mb-4 rounded-2xl border border-cyan-400/20 bg-cyan-400/10 px-4 py-3 text-sm text-cyan-100">{message}</div> : null}
        {error ? <div className="mb-4 rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">{error}</div> : null}
        <form className="grid gap-4 md:grid-cols-2" onSubmit={handleSubmit}>
          <label className="block text-sm text-slate-300"><span className="mb-2 block">Full name</span><input className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white" value={formState.full_name} onChange={(event) => handleChange("full_name", event.target.value)} /></label>
          <label className="block text-sm text-slate-300"><span className="mb-2 block">Username</span><input className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white" value={formState.username} onChange={(event) => handleChange("username", event.target.value)} required /></label>
          <label className="block text-sm text-slate-300"><span className="mb-2 block">Email</span><input className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white" type="email" value={formState.email} onChange={(event) => handleChange("email", event.target.value)} required /></label>
          <label className="block text-sm text-slate-300"><span className="mb-2 block">Password</span><input className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white" type="password" value={formState.password} onChange={(event) => handleChange("password", event.target.value)} required /></label>
          <label className="block text-sm text-slate-300"><span className="mb-2 block">Phone number</span><input className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white" value={formState.phone_number} onChange={(event) => handleChange("phone_number", event.target.value)} /></label>
          <label className="block text-sm text-slate-300"><span className="mb-2 block">Country</span><input className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white" value={formState.country} onChange={(event) => handleChange("country", event.target.value)} /></label>
          <button type="submit" className="rounded-2xl bg-cyan-400 px-4 py-3 font-semibold text-slate-950 md:col-span-2" disabled={loading}>
            {loading ? "Creating account..." : "Create account"}
          </button>
        </form>
        <button type="button" className="mt-4 text-sm font-semibold text-cyan-200" onClick={() => navigate("/sign-in")}>
          Already have an account? Sign in
        </button>
      </Panel>
    </div>
  );
}

function Shell({
  pathname,
  user,
  children
}: {
  pathname: string;
  user: SessionUser;
  children: React.ReactNode;
}) {
  const navItems = [
    { href: "/", label: "Home" },
    { href: "/workspace", label: "Upstox" },
    { href: "/ranges", label: "Ranges" },
    { href: "/trends", label: "Trends" },
    { href: "/astro", label: "Astro" },
    { href: "/astro/planetary-aspects", label: "Aspects" },
    { href: "/astro/moon-ascendant", label: "Moon/Asc" }
  ];

  async function handleSignOut() {
    await fetch("/auth/sign-out", { method: "POST" });
    navigate("/sign-in");
  }

  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-6 py-6">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.3em] text-cyan-300/80">Merged Trading Portal</div>
          <h1 className="mt-2 text-3xl font-semibold text-white">Backtest + Trend + Astro Workspace</h1>
        </div>
        <div className="flex items-center gap-3">
          <span className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-200">{user.email}</span>
          <button type="button" className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-slate-100" onClick={handleSignOut}>
            Sign out
          </button>
        </div>
      </header>
      <nav className="mx-auto flex max-w-7xl flex-wrap gap-2 px-6 pb-6">
        {navItems.map((item) => (
          <button
            key={item.href}
            type="button"
            className={`rounded-2xl px-4 py-2 text-sm font-semibold ${
              pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href))
                ? "bg-cyan-400 text-slate-950"
                : "border border-white/10 bg-white/5 text-slate-100"
            }`}
            onClick={() => navigate(item.href)}
          >
            {item.label}
          </button>
        ))}
      </nav>
      <main className="mx-auto flex max-w-7xl flex-col gap-6 px-6 pb-10">{children}</main>
    </div>
  );
}

function DashboardPage({ user }: { user: SessionUser }) {
  const [trendMeta, setTrendMeta] = useState<{ source: string; rows: number } | null>(null);
  const [tokenState, setTokenState] = useState<{ status: string; message?: string } | null>(null);

  useEffect(() => {
    void fetch("/api/trends")
      .then((response) => response.json())
      .then((payload: TrendResponse) => setTrendMeta({ source: payload.source, rows: payload.payload.trend_dates.length }))
      .catch(() => setTrendMeta(null));
    void fetch("/api/token-status")
      .then((response) => response.json())
      .then((payload) => setTokenState(payload))
      .catch(() => setTokenState(null));
  }, []);

  return (
    <>
      <Panel title="Unified Dashboard" eyebrow="Home">
        <p className="max-w-3xl text-sm leading-7 text-slate-300">
          This shell fronts the existing Upstox workflows and the imported trend/astro tools under one FastAPI-served product and one authenticated session.
        </p>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <div className="rounded-3xl border border-white/10 bg-slate-950/60 p-5">
            <div className="text-xs uppercase tracking-[0.24em] text-slate-400">User</div>
            <div className="mt-3 text-lg font-semibold text-white">{user.email}</div>
            <div className="mt-1 text-sm text-slate-400">{String(user.user_metadata?.username ?? "No username metadata")}</div>
          </div>
          <div className="rounded-3xl border border-white/10 bg-slate-950/60 p-5">
            <div className="text-xs uppercase tracking-[0.24em] text-slate-400">Trend Data</div>
            <div className="mt-3 text-lg font-semibold text-white">{trendMeta ? `${trendMeta.rows} rows` : "Unavailable"}</div>
            <div className="mt-1 text-sm text-slate-400">{trendMeta?.source ?? "No active source"}</div>
          </div>
          <div className="rounded-3xl border border-white/10 bg-slate-950/60 p-5">
            <div className="text-xs uppercase tracking-[0.24em] text-slate-400">Upstox Token</div>
            <div className="mt-3 text-lg font-semibold text-white">{tokenState?.status ?? "Unknown"}</div>
            <div className="mt-1 text-sm text-slate-400">{tokenState?.message ?? "Status from existing backend"}</div>
          </div>
        </div>
      </Panel>
      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        <Panel title="Upstox Workspace" eyebrow="Trading">
          <p className="text-sm text-slate-400">Existing snapshot, OHLC, log, and range tools remain intact under the preserved legacy workspace.</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <button type="button" className="rounded-2xl bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950" onClick={() => navigate("/workspace")}>Open Workspace</button>
            <button type="button" className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-slate-100" onClick={() => navigate("/ranges")}>Open Ranges</button>
          </div>
        </Panel>
        <Panel title="Trend Explorer" eyebrow="TrendDates">
          <p className="text-sm text-slate-400">FastAPI now owns the trend API with generated-file, configured-path, and bundled fallback support.</p>
          <div className="mt-4">
            <button type="button" className="rounded-2xl bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950" onClick={() => navigate("/trends")}>Open Trends</button>
          </div>
        </Panel>
        <Panel title="Astro Tools" eyebrow="Research">
          <p className="text-sm text-slate-400">The donor astro workspaces are reachable from the same app shell and backed by Python endpoints.</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <button type="button" className="rounded-2xl bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950" onClick={() => navigate("/astro")}>Astro Workspace</button>
            <button type="button" className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-slate-100" onClick={() => navigate("/astro/planetary-aspects")}>Aspect Explorer</button>
            <button type="button" className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-slate-100" onClick={() => navigate("/astro/moon-ascendant")}>Moon / Asc</button>
          </div>
        </Panel>
      </div>
    </>
  );
}

function TrendExplorerPage() {
  const [data, setData] = useState<TrendResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [scope, setScope] = useState<"single" | "month">("single");
  const [selectedDateKey, setSelectedDateKey] = useState("");
  const [selectedMonth, setSelectedMonth] = useState("");

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      setError("");
      try {
        const response = await fetch("/api/trends");
        const payload = (await response.json()) as TrendResponse & { detail?: string };
        if (!response.ok) {
          throw new Error(payload.detail ?? "Failed to load trends.");
        }
        setData(payload);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Failed to load trends.");
      } finally {
        setLoading(false);
      }
    }

    void loadData();
  }, []);

  const dateEntries = useMemo(() => {
    if (!data) {
      return [];
    }
    return Object.entries(data.payload.dates_wise_table)
      .map(([key, rows]) => {
        const parsed = parseTrendDate(key);
        return parsed ? { key, rows, date: parsed, month: formatMonthYear(parsed) } : null;
      })
      .filter((value): value is { key: string; rows: GenericRow[]; date: Date; month: string } => Boolean(value))
      .sort((left, right) => left.date.getTime() - right.date.getTime());
  }, [data]);

  useEffect(() => {
    if (!selectedDateKey && dateEntries.length > 0) {
      setSelectedDateKey(dateEntries[0].key);
    }
    if (!selectedMonth && dateEntries.length > 0) {
      setSelectedMonth(dateEntries[0].month);
    }
  }, [dateEntries, selectedDateKey, selectedMonth]);

  const monthOptions = useMemo(() => [...new Set(dateEntries.map((entry) => entry.month))], [dateEntries]);
  const dateRows = useMemo(() => {
    if (!data) {
      return [];
    }
    if (scope === "month") {
      return dateEntries.filter((entry) => entry.month === selectedMonth).flatMap((entry) => entry.rows);
    }
    return data.payload.dates_wise_table[selectedDateKey] ?? [];
  }, [data, dateEntries, scope, selectedDateKey, selectedMonth]);

  const filteredTrendRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = scope === "month"
      ? data?.payload.trend_dates.filter((row) => Object.values(row).some((value) => {
          const parsed = parseTrendDate(String(value ?? ""));
          return parsed ? formatMonthYear(parsed) === selectedMonth : false;
        })) ?? []
      : data?.payload.trend_dates.filter((row) => JSON.stringify(row).includes(selectedDateKey)) ?? [];
    return rows.filter((row) => !q || JSON.stringify(row).toLowerCase().includes(q));
  }, [data, scope, selectedDateKey, selectedMonth, search]);

  const filteredSummaryRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = dateEntries
      .filter((entry) => (scope === "month" ? entry.month === selectedMonth : entry.key === selectedDateKey))
      .map((entry) => ({
        Trend: entry.key,
        Count: entry.rows.length,
        Symbols: entry.rows.map((row) => String(row.Symbol ?? row.symbol ?? "")).filter(Boolean).join(", ")
      }));
    return rows.filter((row) => !q || JSON.stringify(row).toLowerCase().includes(q));
  }, [dateEntries, scope, selectedDateKey, selectedMonth, search]);

  if (loading) {
    return <Panel title="Trend Explorer">Loading trend data...</Panel>;
  }

  if (error || !data) {
    return <Panel title="Trend Explorer">{error || "No trend data available."}</Panel>;
  }

  return (
    <>
      <Panel title="Trend Explorer" eyebrow="TrendDates" actions={<span className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-200">{data.source}</span>}>
        <div className="grid gap-4 md:grid-cols-4">
          <label className="text-sm text-slate-300"><span className="mb-2 block">Search</span><input className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Symbol, date, weekday..." /></label>
          <label className="text-sm text-slate-300"><span className="mb-2 block">Scope</span><select className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white" value={scope} onChange={(event) => setScope(event.target.value as "single" | "month")}><option value="single">Single date</option><option value="month">Whole month</option></select></label>
          <label className="text-sm text-slate-300"><span className="mb-2 block">Date</span><select className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white" value={selectedDateKey} onChange={(event) => setSelectedDateKey(event.target.value)}>{dateEntries.map((entry) => <option key={entry.key} value={entry.key}>{entry.key}</option>)}</select></label>
          <label className="text-sm text-slate-300"><span className="mb-2 block">Month</span><select className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white" value={selectedMonth} onChange={(event) => setSelectedMonth(event.target.value)}>{monthOptions.map((month) => <option key={month} value={month}>{month}</option>)}</select></label>
        </div>
      </Panel>
      <div className="grid gap-6 xl:grid-cols-2">
        <DataTable title="Trend Dates" rows={filteredTrendRows} exportName="trend-dates.csv" />
        <DataTable title="Date Summary" rows={filteredSummaryRows} exportName="date-summary.csv" />
      </div>
      <DataTable title={scope === "month" ? "Rows For Selected Month" : "Rows For Selected Date"} rows={dateRows} exportName="trend-preview.csv" />
    </>
  );
}

function AstroPage() {
  const [dateValue, setDateValue] = useState(todayIst);
  const [timeValue, setTimeValue] = useState("09:15");
  const [symbol, setSymbol] = useState("NIFTY");
  const [referencePrice, setReferencePrice] = useState("25000");
  const [data, setData] = useState<AstroResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function loadAstro(nextDate = dateValue, nextTime = timeValue, nextSymbol = symbol, nextReference = referencePrice) {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ date: nextDate, time: nextTime, symbol: nextSymbol, referencePrice: nextReference });
      const response = await fetch(`/api/astro?${params.toString()}`);
      const payload = (await response.json()) as AstroResponse & { detail?: string };
      if (!response.ok) {
        throw new Error(payload.detail ?? "Failed to load astro data.");
      }
      setData(payload);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load astro data.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const nowTime = timeIst();
    setTimeValue(nowTime);
    void loadAstro(todayIst(), nowTime, symbol, referencePrice);
  }, []);

  return (
    <>
      <Panel title="Astro Workspace" eyebrow="Python API">
        <div className="grid gap-4 md:grid-cols-4">
          <label className="text-sm text-slate-300"><span className="mb-2 block">Date</span><input className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white" type="date" value={dateValue} onChange={(event) => setDateValue(event.target.value)} /></label>
          <label className="text-sm text-slate-300"><span className="mb-2 block">Time</span><input className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white" type="time" value={timeValue} onChange={(event) => setTimeValue(event.target.value)} /></label>
          <label className="text-sm text-slate-300"><span className="mb-2 block">Symbol</span><input className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white" value={symbol} onChange={(event) => setSymbol(event.target.value)} /></label>
          <label className="text-sm text-slate-300"><span className="mb-2 block">Reference price</span><input className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white" inputMode="decimal" value={referencePrice} onChange={(event) => setReferencePrice(event.target.value)} /></label>
        </div>
        <div className="mt-4 flex flex-wrap gap-3">
          <button type="button" className="rounded-2xl bg-cyan-400 px-4 py-3 font-semibold text-slate-950" onClick={() => void loadAstro()} disabled={loading}>{loading ? "Running..." : "Run Astro"}</button>
          {error ? <span className="rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">{error}</span> : null}
        </div>
      </Panel>
      {data ? (
        <>
          <div className="grid gap-6 xl:grid-cols-2">
            <DataTable title="Moon Shift Summary" rows={[data.payload.moonShift]} />
            <DataTable title="Astro Levels" rows={data.payload.levels} />
          </div>
          <div className="grid gap-6 xl:grid-cols-2">
            <DataTable title="Current Padas" rows={data.payload.currentPadas} />
            <DataTable title="Next Padas" rows={data.payload.nextPadas} />
          </div>
          <div className="grid gap-6 xl:grid-cols-2">
            <DataTable title="Hora Timings" rows={data.payload.horaTimings} />
            <DataTable title="Planet Positions" rows={data.payload.positions} />
          </div>
          <div className="grid gap-6 xl:grid-cols-2">
            <DataTable title="Raw Aspects" rows={data.payload.aspects} />
            <DataTable title="Nearest Price Rows" rows={data.payload.nearestPriceRow.rows} />
          </div>
        </>
      ) : null}
    </>
  );
}

function PlanetaryAspectsPage() {
  const [startDate, setStartDate] = useState(shiftIsoDate(todayIst(), -30));
  const [endDate, setEndDate] = useState(todayIst);
  const [moonMode, setMoonMode] = useState("exclude_moon_ascendant");
  const [planet1, setPlanet1] = useState("");
  const [planet2, setPlanet2] = useState("");
  const [aspects, setAspects] = useState("0,30,45,60,90,120,180");
  const [orb, setOrb] = useState("1");
  const [data, setData] = useState<PlanetaryAspectResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function loadRows() {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ startDate, endDate, moonMode, planet1, planet2, aspects, orb, maxRows: "12000" });
      const response = await fetch(`/api/astro/planetary-aspects?${params.toString()}`);
      const payload = (await response.json()) as PlanetaryAspectResponse & { detail?: string };
      if (!response.ok) {
        throw new Error(payload.detail ?? "Failed to load aspects.");
      }
      setData(payload);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load aspects.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Panel title="Planetary Aspect Explorer" eyebrow="Astro">
        <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
          <label className="text-sm text-slate-300"><span className="mb-2 block">Start</span><input className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white" type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} /></label>
          <label className="text-sm text-slate-300"><span className="mb-2 block">End</span><input className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white" type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} /></label>
          <label className="text-sm text-slate-300"><span className="mb-2 block">Moon mode</span><input className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white" value={moonMode} onChange={(event) => setMoonMode(event.target.value)} /></label>
          <label className="text-sm text-slate-300"><span className="mb-2 block">Planet 1</span><input className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white" value={planet1} onChange={(event) => setPlanet1(event.target.value)} /></label>
          <label className="text-sm text-slate-300"><span className="mb-2 block">Planet 2</span><input className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white" value={planet2} onChange={(event) => setPlanet2(event.target.value)} /></label>
          <label className="text-sm text-slate-300"><span className="mb-2 block">Orb</span><input className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white" value={orb} onChange={(event) => setOrb(event.target.value)} /></label>
        </div>
        <label className="mt-4 block text-sm text-slate-300"><span className="mb-2 block">Aspect list</span><input className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white" value={aspects} onChange={(event) => setAspects(event.target.value)} /></label>
        <div className="mt-4 flex flex-wrap gap-3">
          <button type="button" className="rounded-2xl bg-cyan-400 px-4 py-3 font-semibold text-slate-950" onClick={() => void loadRows()} disabled={loading}>{loading ? "Building..." : "Build Aspects"}</button>
          {error ? <span className="rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">{error}</span> : null}
        </div>
      </Panel>
      {data ? <>
        <DataTable title="Aspect Results" rows={data.payload.rows} exportName="planetary-aspects.csv" />
        <DataTable title="Detailed Rows" rows={data.payload.detailedRows} exportName="planetary-aspects-detailed.csv" />
      </> : null}
    </>
  );
}

function MoonAscendantPage() {
  const [startDate, setStartDate] = useState(shiftIsoDate(todayIst(), -7));
  const [endDate, setEndDate] = useState(todayIst);
  const [moonTarget, setMoonTarget] = useState("0");
  const [ascTarget, setAscTarget] = useState("0");
  const [tolerance, setTolerance] = useState("0.1");
  const [data, setData] = useState<MoonAscResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function loadRows() {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ startDate, endDate, includeMoon: "true", includeAsc: "true", moonTarget, ascTarget, tolerance });
      const response = await fetch(`/api/astro/moon-ascendant?${params.toString()}`);
      const payload = (await response.json()) as MoonAscResponse & { detail?: string };
      if (!response.ok) {
        throw new Error(payload.detail ?? "Failed to load moon/ascendant data.");
      }
      setData(payload);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load moon/ascendant data.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Panel title="Moon & Ascendant Explorer" eyebrow="Astro">
        <div className="grid gap-4 md:grid-cols-5">
          <label className="text-sm text-slate-300"><span className="mb-2 block">Start</span><input className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white" type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} /></label>
          <label className="text-sm text-slate-300"><span className="mb-2 block">End</span><input className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white" type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} /></label>
          <label className="text-sm text-slate-300"><span className="mb-2 block">Moon target</span><input className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white" value={moonTarget} onChange={(event) => setMoonTarget(event.target.value)} /></label>
          <label className="text-sm text-slate-300"><span className="mb-2 block">Asc target</span><input className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white" value={ascTarget} onChange={(event) => setAscTarget(event.target.value)} /></label>
          <label className="text-sm text-slate-300"><span className="mb-2 block">Tolerance</span><input className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white" value={tolerance} onChange={(event) => setTolerance(event.target.value)} /></label>
        </div>
        <div className="mt-4 flex flex-wrap gap-3">
          <button type="button" className="rounded-2xl bg-cyan-400 px-4 py-3 font-semibold text-slate-950" onClick={() => void loadRows()} disabled={loading}>{loading ? "Running..." : "Run Explorer"}</button>
          {data ? <span className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200">{data.payload.controls.precisionMode}</span> : null}
          {error ? <span className="rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">{error}</span> : null}
        </div>
      </Panel>
      {data ? <>
        <div className="grid gap-6 xl:grid-cols-2">
          <DataTable title={`Moon Raw (${data.payload.moon.rawTotal})`} rows={data.payload.moon.rawRows} exportName="moon-raw.csv" />
          <DataTable title={`Asc Raw (${data.payload.ascendant.rawTotal})`} rows={data.payload.ascendant.rawRows} exportName="asc-raw.csv" />
        </div>
        <div className="grid gap-6 xl:grid-cols-2">
          <DataTable title={`Moon Filtered (${data.payload.moon.filteredTotal})`} rows={data.payload.moon.filteredRows} exportName="moon-filtered.csv" />
          <DataTable title={`Asc Filtered (${data.payload.ascendant.filteredTotal})`} rows={data.payload.ascendant.filteredRows} exportName="asc-filtered.csv" />
        </div>
      </> : null}
    </>
  );
}

export function MergedShellApp() {
  const pathname = useRouterState();
  const [sessionUser, setSessionUser] = useState<SessionUser | null>(null);
  const [sessionChecked, setSessionChecked] = useState(false);

  useEffect(() => {
    async function loadSession() {
      try {
        const response = await fetch("/api/auth/session", { credentials: "same-origin" });
        if (response.ok) {
          const payload = (await response.json()) as SessionResponse;
          setSessionUser(payload.user);
          if (PUBLIC_ROUTES.has(currentPath())) {
            navigate("/");
          }
        } else {
          setSessionUser(null);
          if (!PUBLIC_ROUTES.has(currentPath())) {
            navigate("/sign-in");
          }
        }
      } catch {
        setSessionUser(null);
      } finally {
        setSessionChecked(true);
      }
    }

    void loadSession();
  }, [pathname]);

  if (!sessionChecked) {
    return <div className="flex min-h-screen items-center justify-center text-slate-300">Loading session...</div>;
  }

  if (!sessionUser && pathname === "/sign-up") {
    return <SignUpPage />;
  }

  if (!sessionUser) {
    return <SignInPage />;
  }

  if (pathname === "/workspace" || pathname === "/ranges" || pathname.startsWith("/range")) {
    return <LegacyTradingApp />;
  }

  return (
    <Shell pathname={pathname} user={sessionUser}>
      {pathname === "/" && <DashboardPage user={sessionUser} />}
      {pathname === "/trends" && <TrendExplorerPage />}
      {pathname === "/astro" && <AstroPage />}
      {pathname === "/astro/planetary-aspects" && <PlanetaryAspectsPage />}
      {pathname === "/astro/moon-ascendant" && <MoonAscendantPage />}
      {!["/", "/trends", "/astro", "/astro/planetary-aspects", "/astro/moon-ascendant"].includes(pathname) && (
        <Panel title="Not Found">
          <p className="text-sm text-slate-400">This route does not exist in the merged shell yet.</p>
        </Panel>
      )}
    </Shell>
  );
}
