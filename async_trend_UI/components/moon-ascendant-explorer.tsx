"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

type Row = {
  date_key: string;
  time: string;
  timezone: string;
  datetime_key: string;
  value: number;
  longitude: number;
};

type ApiPayload = {
  range: { startDate: string; endDate: string; daySpan: number };
  controls: {
    precisionMode: "node_swisseph" | "python_swisseph" | "js_fallback";
  };
  moon: { rawTotal: number; rawRows: Row[]; filteredTotal: number; filteredRows: Row[] };
  ascendant: { rawTotal: number; rawRows: Row[]; filteredTotal: number; filteredRows: Row[] };
};

type Props = {
  userEmail: string;
};

function todayIst() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

function shiftIsoDate(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day));
  next.setUTCDate(next.getUTCDate() + days);
  const y = next.getUTCFullYear();
  const m = String(next.getUTCMonth() + 1).padStart(2, "0");
  const d = String(next.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function RowTable({ rows }: { rows: Row[] }) {
  return (
    <div className="tableWrap" style={{ maxHeight: 420 }}>
      <table>
        <thead>
          <tr>
            <th>date_key</th>
            <th>time</th>
            <th>timezone</th>
            <th>datetime_key</th>
            <th>value</th>
            <th>longitude</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={`${row.datetime_key}-${index}`}>
              <td>{row.date_key}</td>
              <td>{row.time}</td>
              <td>{row.timezone}</td>
              <td>{row.datetime_key}</td>
              <td>{row.value}</td>
              <td>{row.longitude}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function MoonAscendantExplorer({ userEmail }: Props) {
  const [startDate, setStartDate] = useState(() => shiftIsoDate(todayIst(), -30));
  const [endDate, setEndDate] = useState(todayIst);
  const [includeMoon, setIncludeMoon] = useState(true);
  const [includeAscendant, setIncludeAscendant] = useState(true);
  const [moonTarget, setMoonTarget] = useState("0");
  const [ascTarget, setAscTarget] = useState("0");
  const [tolerance, setTolerance] = useState("0.1");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [payload, setPayload] = useState<ApiPayload | null>(null);
  const [rawTab, setRawTab] = useState<"moon" | "ascendant">("moon");
  const [filteredTab, setFilteredTab] = useState<"moon" | "ascendant">("moon");

  const moonRawRows = useMemo(() => payload?.moon.rawRows ?? [], [payload]);
  const ascRawRows = useMemo(() => payload?.ascendant.rawRows ?? [], [payload]);
  const moonFilteredRows = useMemo(() => payload?.moon.filteredRows ?? [], [payload]);
  const ascFilteredRows = useMemo(() => payload?.ascendant.filteredRows ?? [], [payload]);

  async function runExplorer() {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({
        startDate,
        endDate,
        includeMoon: String(includeMoon),
        includeAscendant: String(includeAscendant),
        moonTarget,
        ascTarget,
        tolerance
      });
      const response = await fetch(`/api/astro/moon-ascendant?${params.toString()}`, { cache: "no-store" });
      const json = (await response.json()) as { payload?: ApiPayload; error?: string };
      if (!response.ok || !json.payload) {
        throw new Error(json.error ?? "Failed to load Moon/Ascendant explorer data");
      }
      setPayload(json.payload);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load explorer data");
      setPayload(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="page">
      <header className="hero">
        <div className="heroTop">
          <div>
            <p className="eyebrow">TrendDates Intelligence</p>
            <h1>Moon & Ascendant Explorer</h1>
          </div>
          <div className="userChip">
            <span>{userEmail}</span>
            <form action="/auth/sign-out" method="post">
              <button type="submit" className="controlBtn secondary signOutBtn">
                Sign out
              </button>
            </form>
          </div>
        </div>
        <div className="astroTopNav">
          <Link className="controlBtn secondary" href="/">
            Back To Trends
          </Link>
          <Link className="controlBtn secondary" href="/astro/planetary-aspects">
            Planetary Aspects
          </Link>
          <Link className="controlBtn secondary" href="/astro">
            Full Astro Tab
          </Link>
        </div>
        <div className="heroKpis">
          <span className="kpiPill">Range: {startDate} to {endDate}</span>
          <span className="kpiPill">Moon rows: {payload?.moon.rawTotal ?? 0}</span>
          <span className="kpiPill">Asc rows: {payload?.ascendant.rawTotal ?? 0}</span>
        </div>
        <div className="quickNav">
          <a className="controlBtn secondary" href="#moon-filters">
            Filters
          </a>
          <a className="controlBtn secondary" href="#moon-raw">
            Raw
          </a>
          <a className="controlBtn secondary" href="#moon-filtered">
            Filtered
          </a>
        </div>
      </header>

      <section className="filtersPanel astroFilters" id="moon-filters">
        <div className="moonControlRow">
          <label>
            Start Date
            <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
          </label>
          <label>
            End Date
            <input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
          </label>
          <label className="moonCheck">
            <input type="checkbox" checked={includeMoon} onChange={(event) => setIncludeMoon(event.target.checked)} />
            <span>Populate Moon cache</span>
          </label>
          <label className="moonCheck">
            <input
              type="checkbox"
              checked={includeAscendant}
              onChange={(event) => setIncludeAscendant(event.target.checked)}
            />
            <span>Populate Ascendant cache</span>
          </label>
          <label>
            Moon longitude filter
            <input value={moonTarget} onChange={(event) => setMoonTarget(event.target.value)} inputMode="decimal" />
          </label>
          <label>
            Ascendant longitude filter
            <input value={ascTarget} onChange={(event) => setAscTarget(event.target.value)} inputMode="decimal" />
          </label>
          <label>
            Tolerance (+/- degrees)
            <input value={tolerance} onChange={(event) => setTolerance(event.target.value)} inputMode="decimal" />
          </label>
          <div className="moonRunWrap">
            <button type="button" className="controlBtn" onClick={() => void runExplorer()} disabled={loading}>
              {loading ? "Loading..." : "Run Explorer"}
            </button>
          </div>
        </div>

        {error ? <p className="astroError">{error}</p> : null}
        {payload ? (
          <>
            <p className="muted">
              Range: {payload.range.startDate} to {payload.range.endDate} ({payload.range.daySpan} days)
            </p>
            <p className="muted">Precision mode: {payload.controls.precisionMode}</p>
          </>
        ) : null}
      </section>

      {payload ? (
        <>
          <section className="panel" id="moon-raw">
            <div className="segmented">
              <button
                type="button"
                className={`segmentBtn ${rawTab === "moon" ? "active" : ""}`}
                onClick={() => setRawTab("moon")}
              >
                Moon ({payload.moon.rawTotal})
              </button>
              <button
                type="button"
                className={`segmentBtn ${rawTab === "ascendant" ? "active" : ""}`}
                onClick={() => setRawTab("ascendant")}
              >
                Ascendant ({payload.ascendant.rawTotal})
              </button>
            </div>
            <div className="spacer" />
            <RowTable rows={rawTab === "moon" ? moonRawRows : ascRawRows} />
          </section>

          <section className="panel" id="moon-filtered">
            <div className="segmented">
              <button
                type="button"
                className={`segmentBtn ${filteredTab === "moon" ? "active" : ""}`}
                onClick={() => setFilteredTab("moon")}
              >
                Moon ({payload.moon.filteredTotal})
              </button>
              <button
                type="button"
                className={`segmentBtn ${filteredTab === "ascendant" ? "active" : ""}`}
                onClick={() => setFilteredTab("ascendant")}
              >
                Ascendant ({payload.ascendant.filteredTotal})
              </button>
            </div>
            <div className="spacer" />
            <RowTable rows={filteredTab === "moon" ? moonFilteredRows : ascFilteredRows} />
          </section>
        </>
      ) : null}
    </main>
  );
}
