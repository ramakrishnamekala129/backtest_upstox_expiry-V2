"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { AstroApiResponse, AstroPayload, AstroSummaryRow, AstroTableRow } from "@/lib/types";

type Props = {
  userEmail: string;
  mode?: "full" | "moon-asc";
};

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

function SummaryTable({ rows }: { rows: AstroSummaryRow }) {
  return (
    <div className="astroSummaryList">
      {Object.entries(rows).map(([label, value]) => (
        <article key={label} className="astroKeyValue">
          <span>{label}</span>
          <strong>{String(value ?? "-")}</strong>
        </article>
      ))}
    </div>
  );
}

function DataTable({ title, rows, maxHeight = 360 }: { title: string; rows: AstroTableRow[]; maxHeight?: number }) {
  const columns = useMemo(() => {
    const keys = new Set<string>();
    rows.forEach((row) => Object.keys(row).forEach((key) => keys.add(key)));
    return [...keys];
  }, [rows]);

  return (
    <section className="panel">
      <h3>{title}</h3>
      {!rows.length ? (
        <p className="muted">No rows available.</p>
      ) : (
        <div className="tableWrap" style={{ maxHeight }}>
          <table>
            <thead>
              <tr>
                {columns.map((column) => (
                  <th key={column}>{column}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={`${title}-${index}`}>
                  {columns.map((column) => (
                    <td key={`${index}-${column}`}>{String(row[column] ?? "")}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export function AstroPage({ userEmail, mode = "full" }: Props) {
  const [date, setDate] = useState(todayIst);
  const [time, setTime] = useState("09:15");
  const [symbol, setSymbol] = useState("NIFTY");
  const [referencePrice, setReferencePrice] = useState("25000");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [payload, setPayload] = useState<AstroPayload | null>(null);

  async function loadAstro(nextDate = date, nextTime = time, nextSymbol = symbol, nextReferencePrice = referencePrice) {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({
        date: nextDate,
        time: nextTime,
        symbol: nextSymbol,
        referencePrice: nextReferencePrice
      });
      const response = await fetch(`/api/astro?${params.toString()}`, { cache: "no-store" });
      const json = (await response.json()) as AstroApiResponse & { error?: string };
      if (!response.ok || !("payload" in json)) {
        throw new Error(json.error ?? "Failed to load astro data");
      }
      setPayload(json.payload);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load astro data");
      setPayload(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setTime(timeIst());
    void loadAstro(todayIst(), timeIst(), symbol, referencePrice);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="page">
      <header className="hero">
        <div className="heroTop">
          <div>
            <p className="eyebrow">TrendDates Intelligence</p>
            <h1>Astro Workspace</h1>
            <p className="muted">Moon shift, padas, levels, hora, event tables, and aspect views in one workflow.</p>
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
          {mode === "full" ? (
            <Link className="controlBtn secondary" href="/astro/moon-ascendant">
              Moon & Ascendant Tab
            </Link>
          ) : (
            <Link className="controlBtn secondary" href="/astro">
              Full Astro Tab
            </Link>
          )}
          <button
            type="button"
            className="controlBtn secondary"
            onClick={() => {
              const nextDate = todayIst();
              const nextTime = timeIst();
              setDate(nextDate);
              setTime(nextTime);
              void loadAstro(nextDate, nextTime, symbol, referencePrice);
            }}
          >
            Use Today
          </button>
        </div>
      </header>

      <section className="filtersPanel astroFilters">
        <div className="astroFormGrid">
          <label>
            Date
            <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
          </label>
          <label>
            Time
            <input type="time" value={time} onChange={(event) => setTime(event.target.value)} />
          </label>
          <label>
            Symbol
            <input value={symbol} onChange={(event) => setSymbol(event.target.value)} />
          </label>
          <label>
            Reference Price
            <input value={referencePrice} onChange={(event) => setReferencePrice(event.target.value)} inputMode="decimal" />
          </label>
        </div>
        <div className="astroActions">
          <button type="button" className="controlBtn" onClick={() => void loadAstro()} disabled={loading}>
            {loading ? "Loading..." : "Run Astro"}
          </button>
          {payload ? (
            <p className="muted">
              {payload.snapshot.date} {payload.snapshot.time} IST for {payload.snapshot.symbol}
            </p>
          ) : null}
        </div>
        {error ? <p className="astroError">{error}</p> : null}
        {payload?.errors.length ? (
          <div className="astroWarningList">
            {payload.errors.map((item) => (
              <p key={`${item.section}-${item.message}`} className="muted">
                {item.section}: {item.message}
              </p>
            ))}
          </div>
        ) : null}
      </section>

      {payload ? (
        <>
          <section className="panel">
            <h3>Moon Shift Summary</h3>
            <SummaryTable rows={payload.moonShift} />
          </section>

          {mode === "full" ? (
            <>
              <div className="astroGrid">
                <DataTable title="Current Padas" rows={payload.currentPadas} />
                <DataTable title="Next Padas" rows={payload.nextPadas} />
              </div>

              <div className="astroGrid">
                <DataTable title="Nearest Price Rows" rows={payload.nearestPriceRow.rows} />
                <DataTable title="Astro Levels" rows={payload.levels} />
              </div>

              <div className="astroGrid">
                <DataTable title="Hora Timings" rows={payload.horaTimings} maxHeight={520} />
                <DataTable title="Aspect Matrix" rows={payload.aspectMatrix} maxHeight={520} />
              </div>

              <DataTable title="Planetary Levels" rows={payload.planetaryLevels} />

              <div className="astroGrid">
                <DataTable title="Transit" rows={payload.monthlyEvents.transit} />
                <DataTable title="Yoga" rows={payload.monthlyEvents.yoga} />
              </div>

              <div className="astroGrid">
                <DataTable title="Retrograde" rows={payload.monthlyEvents.retrograde} />
                <DataTable title="Asta" rows={payload.monthlyEvents.asta} />
              </div>

              <DataTable title="Planet Positions" rows={payload.positions} />
              <DataTable title="Raw Aspects" rows={payload.aspects} />
            </>
          ) : (
            <>
              <DataTable
                title="Moon & Ascendant Positions"
                rows={payload.positions.filter((row) => row.Planet === "Moon" || row.Planet === "Ascendant")}
              />

              <div className="astroGrid">
                <DataTable title="Aspects (With Moon)" rows={payload.filteredAspects.withMoon} />
                <DataTable title="Aspects (With Ascendant)" rows={payload.filteredAspects.withAscendant} />
              </div>

              <div className="astroGrid">
                <DataTable title="Aspects (Moon Or Ascendant)" rows={payload.filteredAspects.withMoonOrAscendant} />
                <DataTable
                  title="Aspects (Without Moon And Ascendant)"
                  rows={payload.filteredAspects.withoutMoonOrAscendant}
                />
              </div>
            </>
          )}
        </>
      ) : null}
    </main>
  );
}
