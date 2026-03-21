"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { GenericRow, TrendApiResponse } from "@/lib/types";
import stockUniverseData from "@/data/stock_universes.json";

type Props = {
  data: TrendApiResponse;
  userEmail: string;
};

type AstroSnapshot = {
  date: string;
  time: string;
  symbol: string;
  referencePrice: number;
  sunSign: string;
  moonPhase: string;
  weekday: string;
  windowLabel: string;
};

type UniverseKey = "ALL" | "NIFTY50" | "NIFTY100" | "NIFTY250" | "NIFTY500" | "FNO";

const UNIVERSE_LABELS: Record<UniverseKey, string> = {
  ALL: "All Stocks",
  NIFTY50: "NIFTY 50",
  NIFTY100: "NIFTY 100",
  NIFTY250: "NIFTY 250",
  NIFTY500: "NIFTY 500",
  FNO: "F&O"
};

const UNIVERSE_SYMBOLS_BY_KEY: Record<Exclude<UniverseKey, "ALL">, readonly string[]> = {
  NIFTY50: stockUniverseData.universes.nifty50,
  NIFTY100: stockUniverseData.universes.nifty100,
  NIFTY250: stockUniverseData.universes.nifty250,
  NIFTY500: stockUniverseData.universes.nifty500,
  FNO: stockUniverseData.universes.fno
};

function cellValue(row: GenericRow, key: string): string {
  const value = row[key];
  if (value === null || value === undefined) return "";
  return String(value);
}

function getColumns(rows: GenericRow[]): string[] {
  const set = new Set<string>();
  rows.forEach((row) => Object.keys(row).forEach((key) => set.add(key)));
  return [...set];
}

function escapeCsvCell(value: string): string {
  if (/["\n,]/.test(value)) {
    return `"${value.replace(/"/g, "\"\"")}"`;
  }
  return value;
}

function rowsToCsv(rows: GenericRow[]): string {
  if (!rows.length) return "";
  const columns = getColumns(rows);
  const lines = [
    columns.map(escapeCsvCell).join(","),
    ...rows.map((row) => columns.map((column) => escapeCsvCell(cellValue(row, column))).join(","))
  ];
  return lines.join("\n");
}

function downloadCsvFile(filename: string, rows: GenericRow[]): void {
  if (!rows.length) return;
  const csv = rowsToCsv(rows);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December"
] as const;

function parseTrendDate(raw: string): Date | null {
  const text = raw.trim();
  const direct = /^(\d{1,2})-([A-Za-z]+)-(\d{4})$/.exec(text);
  if (direct) {
    const day = Number(direct[1]);
    const monthName = direct[2];
    const year = Number(direct[3]);
    const monthIndex = MONTHS.findIndex((month) => month.toLowerCase() === monthName.toLowerCase());
    if (monthIndex >= 0) {
      return new Date(year, monthIndex, day);
    }
  }
  const fallback = new Date(text);
  if (!Number.isNaN(fallback.getTime())) return fallback;
  return null;
}

function monthYearLabel(date: Date): string {
  return `${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

function dateStamp(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isSameDay(left: Date, right: Date): boolean {
  return dateStamp(left) === dateStamp(right);
}

function getIstTodayMidnight(): Date {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());

  const year = Number(parts.find((part) => part.type === "year")?.value ?? "0");
  const month = Number(parts.find((part) => part.type === "month")?.value ?? "1");
  const day = Number(parts.find((part) => part.type === "day")?.value ?? "1");
  return new Date(year, month - 1, day);
}

function valueMatchesDateKey(value: unknown, selectedDateKey: string): boolean {
  if (!selectedDateKey) return true;
  const selectedDate = parseTrendDate(selectedDateKey);
  const parsed = parseTrendDate(String(value ?? ""));
  if (!selectedDate || !parsed) return false;
  return isSameDay(parsed, selectedDate);
}

function rowMatchesDayStampSet(row: GenericRow, dayStamps: Set<string>): boolean {
  if (!dayStamps.size) return true;
  return Object.values(row).some((value) => {
    const parsed = parseTrendDate(String(value ?? ""));
    if (!parsed) return false;
    return dayStamps.has(dateStamp(parsed));
  });
}

function normalizeSymbol(value: unknown): string {
  return String(value ?? "").trim().toUpperCase();
}

function getSymbolFromRow(row: GenericRow): string {
  return normalizeSymbol(row.Symbol ?? row.symbol ?? "");
}

type DateEntry = {
  key: string;
  date: Date;
  monthYear: string;
  dayStamp: string;
  rowCount: number;
};

function findDefaultDateKey(entries: DateEntry[], todayIst: Date): string {
  const validEntries = entries.filter((entry) => entry.rowCount > 0);
  if (!validEntries.length) return entries[0]?.key ?? "";

  const todayStamp = dateStamp(todayIst);
  const todayMatch = validEntries.find((entry) => entry.dayStamp === todayStamp);
  if (todayMatch) return todayMatch.key;

  const todayTs = todayIst.getTime();
  const nearestFuture = validEntries.find((entry) => entry.date.getTime() >= todayTs);
  if (nearestFuture) return nearestFuture.key;

  return validEntries[0].key;
}

function findInitialDateKey(entries: DateEntry[]): string {
  return entries.find((entry) => entry.rowCount > 0)?.key ?? entries[0]?.key ?? "";
}

function firstDateTimestamp(row: GenericRow): number | null {
  for (const value of Object.values(row)) {
    const parsed = parseTrendDate(String(value ?? ""));
    if (parsed) return parsed.getTime();
  }
  return null;
}

function getTodayIsoDate(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

function pad(num: number): string {
  return String(num).padStart(2, "0");
}

function shiftIsoDate(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day));
  next.setUTCDate(next.getUTCDate() + days);
  return `${next.getUTCFullYear()}-${pad(next.getUTCMonth() + 1)}-${pad(next.getUTCDate())}`;
}

function getSunSignForDate(date: Date): string {
  const monthDay = (date.getMonth() + 1) * 100 + date.getDate();
  if (monthDay >= 120 && monthDay <= 218) return "Aquarius";
  if (monthDay >= 219 && monthDay <= 320) return "Pisces";
  if (monthDay >= 321 && monthDay <= 419) return "Aries";
  if (monthDay >= 420 && monthDay <= 520) return "Taurus";
  if (monthDay >= 521 && monthDay <= 620) return "Gemini";
  if (monthDay >= 621 && monthDay <= 722) return "Cancer";
  if (monthDay >= 723 && monthDay <= 822) return "Leo";
  if (monthDay >= 823 && monthDay <= 922) return "Virgo";
  if (monthDay >= 923 && monthDay <= 1022) return "Libra";
  if (monthDay >= 1023 && monthDay <= 1121) return "Scorpio";
  if (monthDay >= 1122 && monthDay <= 1221) return "Sagittarius";
  return "Capricorn";
}

function getMoonPhaseForDate(date: Date): string {
  const knownNewMoon = Date.UTC(2000, 0, 6);
  const target = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  const age = (((target - knownNewMoon) / 86400000) % 29.53058867 + 29.53058867) % 29.53058867;

  if (age < 1.84566) return "New Moon";
  if (age < 5.53699) return "Waxing Crescent";
  if (age < 9.22831) return "First Quarter";
  if (age < 12.91963) return "Waxing Gibbous";
  if (age < 16.61096) return "Full Moon";
  if (age < 20.30228) return "Waning Gibbous";
  if (age < 23.99361) return "Last Quarter";
  if (age < 27.68493) return "Waning Crescent";
  return "New Moon";
}

function buildAstroSnapshot(dateValue: string, timeValue: string, symbol: string, referencePrice: number): AstroSnapshot {
  const parsed = new Date(`${dateValue}T00:00:00`);
  return {
    date: dateValue,
    time: timeValue,
    symbol: symbol.trim().toUpperCase() || "NIFTY",
    referencePrice,
    sunSign: getSunSignForDate(parsed),
    moonPhase: getMoonPhaseForDate(parsed),
    weekday: parsed.toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" }),
    windowLabel: `${shiftIsoDate(dateValue, -45)} to ${shiftIsoDate(dateValue, -1)}`
  };
}

function getAstroLevels(referencePrice: number) {
  return [
    { label: "Support -5%", value: referencePrice * 0.95 },
    { label: "Support -2%", value: referencePrice * 0.98 },
    { label: "Reference", value: referencePrice },
    { label: "Resistance +2%", value: referencePrice * 1.02 },
    { label: "Resistance +5%", value: referencePrice * 1.05 }
  ];
}

function Table({
  title,
  rows,
  maxHeight = 380,
  exportFilename,
  exportRows
}: {
  title: string;
  rows: GenericRow[];
  maxHeight?: number;
  exportFilename?: string;
  exportRows?: GenericRow[];
}) {
  if (!rows.length) {
    return (
      <section className="panel">
        <h3>{title}</h3>
        <p className="muted">No rows found.</p>
      </section>
    );
  }

  const columns = getColumns(rows);
  const compactTable = columns.length <= 4;
  const effectiveMaxHeight = rows.length > 8 ? maxHeight : undefined;
  return (
    <section className="panel">
      <div className="panelHead">
        <h3>{title}</h3>
        {exportFilename ? (
          <button
            type="button"
            className="controlBtn secondary"
            onClick={() => downloadCsvFile(exportFilename, exportRows ?? rows)}
          >
            Export CSV
          </button>
        ) : null}
      </div>
      <div className="tableWrap" style={{ maxHeight: effectiveMaxHeight }}>
        <table style={{ minWidth: compactTable ? 560 : 920 }}>
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column}>{column}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => (
              <tr key={`${title}-${idx}`}>
                {columns.map((column) => (
                  <td key={`${idx}-${column}`}>
                    {column === "Symbols" ? (
                      <div className="symbolsCell">{cellValue(row, column)}</div>
                    ) : (
                      cellValue(row, column)
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function AstroDashboard() {
  const [astroDate, setAstroDate] = useState(getTodayIsoDate);
  const [astroTime, setAstroTime] = useState("09:15");
  const [astroSymbol, setAstroSymbol] = useState("NIFTY");
  const [referencePrice, setReferencePrice] = useState("25000");
  const [notes, setNotes] = useState(
    "Use this workspace to capture date, time, price context, and observations for astro-driven review."
  );
  const [savedSnapshots, setSavedSnapshots] = useState<AstroSnapshot[]>([]);

  const parsedReferencePrice = useMemo(() => Number(referencePrice), [referencePrice]);
  const snapshot = useMemo(() => {
    if (!astroDate || !astroTime || Number.isNaN(parsedReferencePrice)) return null;
    return buildAstroSnapshot(astroDate, astroTime, astroSymbol, parsedReferencePrice);
  }, [astroDate, astroTime, astroSymbol, parsedReferencePrice]);

  const levels = useMemo(
    () => (snapshot ? getAstroLevels(snapshot.referencePrice) : []),
    [snapshot]
  );

  function useToday() {
    setAstroDate(getTodayIsoDate());
    setAstroTime(
      new Intl.DateTimeFormat("en-GB", {
        timeZone: "Asia/Kolkata",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false
      }).format(new Date())
    );
  }

  function saveSnapshot() {
    if (!snapshot) return;
    setSavedSnapshots((current) => [snapshot, ...current].slice(0, 12));
  }

  return (
    <section className="astroPanel">
      <div className="panel astroHero">
        <div>
          <p className="eyebrow">Astro Workspace</p>
          <h3>Astro Date Review</h3>
          <p className="muted">
            Build quick date-based context with sign, moon phase, review window, and price bands.
          </p>
        </div>
        <div className="astroActions">
          <button type="button" className="controlBtn secondary" onClick={useToday}>
            Use Today
          </button>
          <button type="button" className="controlBtn" onClick={saveSnapshot} disabled={!snapshot}>
            Save Snapshot
          </button>
        </div>
      </div>

      <div className="astroGrid">
        <section className="panel">
          <h3>Inputs</h3>
          <div className="astroFormGrid">
            <label>
              Date
              <input type="date" value={astroDate} onChange={(e) => setAstroDate(e.target.value)} />
            </label>
            <label>
              Time
              <input type="time" value={astroTime} onChange={(e) => setAstroTime(e.target.value)} />
            </label>
            <label>
              Symbol
              <input value={astroSymbol} onChange={(e) => setAstroSymbol(e.target.value)} placeholder="NIFTY" />
            </label>
            <label>
              Reference Price
              <input
                inputMode="decimal"
                value={referencePrice}
                onChange={(e) => setReferencePrice(e.target.value)}
                placeholder="25000"
              />
            </label>
          </div>
        </section>

        <section className="panel">
          <h3>Overview</h3>
          <div className="astroStats">
            <article className="astroStatCard">
              <span>Sun Sign</span>
              <strong>{snapshot?.sunSign ?? "-"}</strong>
            </article>
            <article className="astroStatCard">
              <span>Moon Phase</span>
              <strong>{snapshot?.moonPhase ?? "-"}</strong>
            </article>
            <article className="astroStatCard">
              <span>Weekday</span>
              <strong>{snapshot?.weekday ?? "-"}</strong>
            </article>
            <article className="astroStatCard">
              <span>Review Window</span>
              <strong>{snapshot?.windowLabel ?? "-"}</strong>
            </article>
          </div>
        </section>
      </div>

      <div className="astroGrid">
        <section className="panel">
          <h3>Reference Price Levels</h3>
          <div className="astroLevels">
            {levels.map((level) => (
              <article key={level.label} className="astroLevelRow">
                <span>{level.label}</span>
                <strong>{level.value.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</strong>
              </article>
            ))}
          </div>
        </section>

        <section className="panel">
          <h3>Astro Notes</h3>
          <textarea
            className="astroNotes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Add observations, signals, and timing notes."
          />
        </section>
      </div>

      <section className="panel">
        <h3>Saved Snapshots</h3>
        {!savedSnapshots.length ? (
          <p className="muted">No snapshots saved yet.</p>
        ) : (
          <div className="tableWrap" style={{ maxHeight: 340 }}>
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Time</th>
                  <th>Symbol</th>
                  <th>Sun Sign</th>
                  <th>Moon Phase</th>
                  <th>Price</th>
                </tr>
              </thead>
              <tbody>
                {savedSnapshots.map((item, index) => (
                  <tr key={`${item.date}-${item.time}-${index}`}>
                    <td>{item.date}</td>
                    <td>{item.time}</td>
                    <td>{item.symbol}</td>
                    <td>{item.sunSign}</td>
                    <td>{item.moonPhase}</td>
                    <td>{item.referencePrice.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </section>
  );
}

export function TrendDashboard({ data, userEmail }: Props) {
  const [symbolQuery, setSymbolQuery] = useState("");
  const [dateSortOrder, setDateSortOrder] = useState<"asc" | "desc">("asc");
  const [selectedUniverse, setSelectedUniverse] = useState<UniverseKey>("ALL");
  const [dateScope, setDateScope] = useState<"single" | "month">("single");

  const payload = data.payload;
  const trendRows = payload.trend_dates;
  const allSymbols = useMemo(() => {
    const set = new Set<string>();
    trendRows.forEach((row) => {
      const symbol = getSymbolFromRow(row);
      if (symbol) set.add(symbol);
    });
    return set;
  }, [trendRows]);

  const selectedUniverseSymbols = useMemo(() => {
    if (selectedUniverse === "ALL") return null;
    const symbols = UNIVERSE_SYMBOLS_BY_KEY[selectedUniverse];
    const allowed = new Set<string>();
    symbols.forEach((symbol) => {
      if (allSymbols.has(symbol)) allowed.add(symbol);
    });
    return allowed;
  }, [allSymbols, selectedUniverse]);

  const universeOptions = useMemo(() => {
    const keys: UniverseKey[] = ["ALL", "NIFTY50", "NIFTY100", "NIFTY250", "NIFTY500", "FNO"];
    return keys.map((key) => {
      const count =
        key === "ALL"
          ? allSymbols.size
          : UNIVERSE_SYMBOLS_BY_KEY[key].reduce((acc, symbol) => acc + Number(allSymbols.has(symbol)), 0);
      return { key, label: UNIVERSE_LABELS[key], count };
    });
  }, [allSymbols]);

  const selectedUniverseCount =
    universeOptions.find((option) => option.key === selectedUniverse)?.count ?? 0;

  const rowMatchesUniverse = useCallback(
    (row: GenericRow): boolean => {
      if (!selectedUniverseSymbols) return true;
      const symbol = getSymbolFromRow(row);
      if (!symbol) return false;
      return selectedUniverseSymbols.has(symbol);
    },
    [selectedUniverseSymbols]
  );

  const sortedDateKeysAsc = useMemo(
    () =>
      Object.keys(payload.dates_wise_table).sort((a, b) => {
        const da = parseTrendDate(a);
        const db = parseTrendDate(b);
        if (da && db) return da.getTime() - db.getTime();
        return a.localeCompare(b);
      }),
    [payload.dates_wise_table]
  );

  const dateEntriesAsc = useMemo(
    () =>
      sortedDateKeysAsc
        .map((key) => {
          const date = parseTrendDate(key);
          if (!date) return null;
          return {
            key,
            date,
            monthYear: monthYearLabel(date),
            dayStamp: dateStamp(date),
            rowCount: (payload.dates_wise_table[key] ?? []).filter((row) => rowMatchesUniverse(row)).length
          } satisfies DateEntry;
        })
        .filter((entry): entry is DateEntry => Boolean(entry)),
    [sortedDateKeysAsc, payload.dates_wise_table, rowMatchesUniverse]
  );

  const monthYearOptions = useMemo(() => {
    const set = new Set<string>();
    dateEntriesAsc.forEach((entry) => set.add(entry.monthYear));
    return Array.from(set);
  }, [dateEntriesAsc]);

  const defaultDateKey = useMemo(() => findInitialDateKey(dateEntriesAsc), [dateEntriesAsc]);

  const defaultMonthYear = useMemo(() => {
    const matchingEntry = dateEntriesAsc.find((entry) => entry.key === defaultDateKey);
    return matchingEntry?.monthYear ?? monthYearOptions[0] ?? "";
  }, [dateEntriesAsc, defaultDateKey, monthYearOptions]);

  const [selectedDateKey, setSelectedDateKey] = useState(defaultDateKey);
  const [selectedMonthYear, setSelectedMonthYear] = useState(defaultMonthYear);
  const [hasAppliedPreferredDate, setHasAppliedPreferredDate] = useState(false);

  useEffect(() => {
    if (!selectedDateKey || !dateEntriesAsc.some((entry) => entry.key === selectedDateKey)) {
      setSelectedDateKey(defaultDateKey);
    }
  }, [dateEntriesAsc, defaultDateKey, selectedDateKey]);

  useEffect(() => {
    if (hasAppliedPreferredDate || !dateEntriesAsc.length) return;
    const preferredDateKey = findDefaultDateKey(dateEntriesAsc, getIstTodayMidnight());
    if (preferredDateKey && preferredDateKey !== selectedDateKey) {
      setSelectedDateKey(preferredDateKey);
    }
    setHasAppliedPreferredDate(true);
  }, [dateEntriesAsc, hasAppliedPreferredDate, selectedDateKey]);

  useEffect(() => {
    setHasAppliedPreferredDate(false);
  }, [defaultDateKey]);

  useEffect(() => {
    const selectedEntry = dateEntriesAsc.find((entry) => entry.key === selectedDateKey);
    if (selectedEntry?.monthYear && selectedEntry.monthYear !== selectedMonthYear) {
      setSelectedMonthYear(selectedEntry.monthYear);
      return;
    }
    if (!selectedEntry && defaultMonthYear && defaultMonthYear !== selectedMonthYear) {
      setSelectedMonthYear(defaultMonthYear);
    }
  }, [dateEntriesAsc, defaultMonthYear, selectedDateKey, selectedMonthYear]);

  const dateEntriesForRail = useMemo(() => {
    const ordered = dateSortOrder === "asc" ? dateEntriesAsc : [...dateEntriesAsc].reverse();
    if (!selectedMonthYear) return ordered;
    return ordered.filter((entry) => entry.monthYear === selectedMonthYear);
  }, [dateEntriesAsc, dateSortOrder, selectedMonthYear]);

  const monthDateKeys = useMemo(() => dateEntriesForRail.map((entry) => entry.key), [dateEntriesForRail]);
  const selectedMonthDayStamps = useMemo(() => {
    const stamps = new Set<string>();
    dateEntriesAsc.forEach((entry) => {
      if (entry.monthYear === selectedMonthYear) {
        stamps.add(entry.dayStamp);
      }
    });
    return stamps;
  }, [dateEntriesAsc, selectedMonthYear]);

  const selectedMonthIndex = useMemo(() => {
    return monthYearOptions.indexOf(selectedMonthYear);
  }, [monthYearOptions, selectedMonthYear]);

  const canSelectPrevMonth = selectedMonthIndex > 0;
  const canSelectNextMonth = selectedMonthIndex >= 0 && selectedMonthIndex < monthYearOptions.length - 1;

  function stepMonth(step: -1 | 1) {
    if (selectedMonthIndex < 0) return;
    const next = monthYearOptions[selectedMonthIndex + step];
    if (!next) return;
    setSelectedMonthYear(next);

    const selectedInNextMonth = dateEntriesAsc.some(
      (entry) => entry.key === selectedDateKey && entry.monthYear === next
    );
    if (selectedInNextMonth) return;

    const fallbackKey = dateEntriesAsc.find((entry) => entry.monthYear === next && entry.rowCount > 0)?.key;
    setSelectedDateKey(fallbackKey ?? "");
  }

  function onMonthYearChange(nextMonthYear: string) {
    setSelectedMonthYear(nextMonthYear);
    const selectedInMonth = dateEntriesAsc.some(
      (entry) => entry.key === selectedDateKey && entry.monthYear === nextMonthYear
    );
    if (selectedInMonth) return;
    const fallbackKey = dateEntriesAsc.find(
      (entry) => entry.monthYear === nextMonthYear && entry.rowCount > 0
    )?.key;
    setSelectedDateKey(fallbackKey ?? "");
  }

  function onDateSelect(nextDateKey: string) {
    setSelectedDateKey(nextDateKey);
    const entry = dateEntriesAsc.find((candidate) => candidate.key === nextDateKey);
    if (entry && entry.monthYear !== selectedMonthYear) {
      setSelectedMonthYear(entry.monthYear);
    }
  }

  const selectedDateIndexInRail = useMemo(
    () => monthDateKeys.indexOf(selectedDateKey),
    [monthDateKeys, selectedDateKey]
  );
  const canSelectPrevDate = selectedDateIndexInRail > 0;
  const canSelectNextDate =
    selectedDateIndexInRail >= 0 && selectedDateIndexInRail < monthDateKeys.length - 1;

  function stepDate(step: -1 | 1) {
    if (selectedDateIndexInRail < 0) return;
    const nextKey = monthDateKeys[selectedDateIndexInRail + step];
    if (nextKey) onDateSelect(nextKey);
  }

  function resetFilters() {
    setSymbolQuery("");
    setDateSortOrder("asc");
    setSelectedUniverse("ALL");
    setDateScope("single");
    setSelectedMonthYear(defaultMonthYear);
    setSelectedDateKey(defaultDateKey);
  }

  const filteredTrendRows = useMemo(() => {
    const q = symbolQuery.trim().toLowerCase();
    const direction = dateSortOrder === "asc" ? 1 : -1;
    const matchWholeMonth = dateScope === "month" || (q.length > 0 && selectedMonthDayStamps.size > 0);
    return trendRows
      .filter((row) => {
        if (!rowMatchesUniverse(row)) return false;
        if (matchWholeMonth) {
          if (!rowMatchesDayStampSet(row, selectedMonthDayStamps)) return false;
        } else if (selectedDateKey) {
          const matchesDate = Object.values(row).some((value) => {
            return valueMatchesDateKey(value, selectedDateKey);
          });
          if (!matchesDate) return false;
        }
        if (q && !JSON.stringify(row).toLowerCase().includes(q)) return false;
        return true;
      })
      .sort((a, b) => {
        const ta = firstDateTimestamp(a);
        const tb = firstDateTimestamp(b);
        if (ta === null && tb === null) return 0;
        if (ta === null) return 1;
        if (tb === null) return -1;
        return (ta - tb) * direction;
      });
  }, [
    trendRows,
    symbolQuery,
    selectedDateKey,
    dateSortOrder,
    selectedMonthDayStamps,
    rowMatchesUniverse,
    dateScope
  ]);

  const filteredSummaryRows = useMemo(() => {
    const q = symbolQuery.trim().toLowerCase();
    const direction = dateSortOrder === "asc" ? 1 : -1;
    const matchWholeMonth = dateScope === "month" || (q.length > 0 && selectedMonthDayStamps.size > 0);
    const rows = Object.entries(payload.dates_wise_table).map(([dateKey, rowsForDate]) => {
      const filteredRowsForDate = rowsForDate.filter((row) => rowMatchesUniverse(row));
      const date = parseTrendDate(dateKey);
      const week = date ? date.toLocaleDateString("en-US", { weekday: "long" }) : "";
      return {
        Trend: dateKey,
        Week: week,
        Count: filteredRowsForDate.length,
        Symbols: filteredRowsForDate
          .map((row) => getSymbolFromRow(row))
          .filter((symbol, index, arr) => symbol && arr.indexOf(symbol) === index)
          .join(", ")
      } satisfies GenericRow;
    });
    return rows
      .filter((row) => {
        if (Number(row.Count ?? 0) <= 0) return false;
        if (matchWholeMonth) {
          if (!rowMatchesDayStampSet(row, selectedMonthDayStamps)) return false;
        } else if (selectedDateKey) {
          const matchesDate = Object.values(row).some((value) => {
            return valueMatchesDateKey(value, selectedDateKey);
          });
          if (!matchesDate) return false;
        }
        if (q && !JSON.stringify(row).toLowerCase().includes(q)) return false;
        return true;
      })
      .sort((a, b) => {
        const ta = firstDateTimestamp(a);
        const tb = firstDateTimestamp(b);
        if (ta === null && tb === null) return 0;
        if (ta === null) return 1;
        if (tb === null) return -1;
        return (ta - tb) * direction;
      });
  }, [
    payload.dates_wise_table,
    symbolQuery,
    selectedDateKey,
    dateSortOrder,
    selectedMonthDayStamps,
    rowMatchesUniverse,
    dateScope
  ]);

  const selectedDateRows = useMemo(() => {
    if (dateScope === "month") {
      return monthDateKeys.flatMap((dateKey) =>
        (payload.dates_wise_table[dateKey] ?? []).filter((row) => rowMatchesUniverse(row))
      );
    }
    return selectedDateKey
      ? (payload.dates_wise_table[selectedDateKey] ?? []).filter((row) => rowMatchesUniverse(row))
      : [];
  }, [dateScope, selectedDateKey, payload.dates_wise_table, rowMatchesUniverse, monthDateKeys]);

  const activeFilterChips = useMemo(() => {
    const chips: string[] = [];
    if (selectedUniverse !== "ALL") chips.push(`Universe: ${UNIVERSE_LABELS[selectedUniverse]}`);
    if (symbolQuery.trim()) chips.push(`Search: "${symbolQuery.trim()}"`);
    chips.push(`Scope: ${dateScope === "month" ? "Whole Month" : "Single Date"}`);
    chips.push(`Order: ${dateSortOrder === "asc" ? "Oldest → Newest" : "Newest → Oldest"}`);
    if (dateScope === "month" && selectedMonthYear) chips.push(`Month: ${selectedMonthYear}`);
    if (dateScope === "single" && selectedDateKey) chips.push(`Date: ${selectedDateKey}`);
    return chips;
  }, [dateScope, dateSortOrder, selectedDateKey, selectedMonthYear, selectedUniverse, symbolQuery]);

  return (
    <main className="page">
      <header className="hero">
        <div className="heroTop">
          <div>
            <p className="eyebrow">TrendDates Intelligence</p>
            <h1>Stock Trend Date Explorer</h1>
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
        <p className="muted">Authenticated dashboard access is enabled.</p>
        <div className="heroKpis">
          <span className="kpiPill">Universe: {UNIVERSE_LABELS[selectedUniverse]} ({selectedUniverseCount})</span>
          <span className="kpiPill">Mode: {dateScope === "month" ? "Whole Month" : "Single Date"}</span>
          <span className="kpiPill">Rows: {filteredTrendRows.length}</span>
        </div>
        <div className="quickNav">
          <a className="controlBtn secondary" href="#filters">
            Filters
          </a>
          <a className="controlBtn secondary" href="#results">
            Results
          </a>
          <a className="controlBtn secondary" href="#preview">
            Preview
          </a>
        </div>
        <div className="astroTopNav">
          <Link className="controlBtn secondary" href="/astro">
            Open Astro Workspace
          </Link>
          <Link className="controlBtn secondary" href="/astro/planetary-aspects">
            Planetary Aspect Explorer
          </Link>
          <Link className="controlBtn secondary" href="/astro/moon-ascendant">
            Ascendant & Moon
          </Link>
        </div>
      </header>

      <section className="filtersPanel" id="filters">
        <div className="controlGrid">
          <label className="searchField controlGridSearch">
            <span>Search trend rows</span>
            <div className="searchInputRow">
              <input
                placeholder="Type symbol, date, weekday..."
                value={symbolQuery}
                onChange={(e) => setSymbolQuery(e.target.value)}
                aria-label="Search trend rows"
              />
              {symbolQuery ? (
                <button type="button" className="controlBtn secondary searchClearBtn" onClick={() => setSymbolQuery("")}>
                  Clear
                </button>
              ) : null}
            </div>
          </label>

          <article className="controlCard">
            <div className="controlHead">
              <h4>Stock Universe</h4>
              <p>
                {UNIVERSE_LABELS[selectedUniverse]} (
                {universeOptions.find((option) => option.key === selectedUniverse)?.count ?? 0} symbols)
              </p>
            </div>
            <div className="controlActions">
              <select
                className="controlSelect"
                value={selectedUniverse}
                onChange={(e) => setSelectedUniverse(e.target.value as UniverseKey)}
              >
                {universeOptions.map((option) => (
                  <option key={option.key} value={option.key}>
                    {option.label} ({option.count})
                  </option>
                ))}
              </select>
            </div>
          </article>

          <article className="controlCard">
            <div className="controlHead">
              <h4>Month-Year</h4>
              <p>
                {selectedMonthYear
                  ? `${selectedMonthYear} (${monthDateKeys.length} dates)`
                  : "No month selected"}
              </p>
            </div>
            <div className="controlActions">
              <button
                type="button"
                className="controlBtn"
                disabled={!canSelectPrevMonth}
                onClick={() => stepMonth(-1)}
              >
                Previous
              </button>
              <select
                className="controlSelect"
                value={selectedMonthYear}
                onChange={(e) => onMonthYearChange(e.target.value)}
              >
                {monthYearOptions.map((monthYear) => (
                  <option key={monthYear} value={monthYear}>
                    {monthYear}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="controlBtn"
                disabled={!canSelectNextMonth}
                onClick={() => stepMonth(1)}
              >
                Next
              </button>
            </div>
          </article>

          <article className="controlCard controlCardMonthFilter">
            <div className="controlHead">
              <h4>Month Filter</h4>
              <p className="selectedDateSummary">
                {dateScope === "month"
                  ? selectedMonthYear
                    ? `Selected: ${selectedMonthYear} (${selectedDateRows.length} stocks)`
                    : "No month selected"
                  : selectedDateKey
                    ? `Selected: ${selectedDateKey} (${selectedDateRows.length} stocks)`
                    : "No valid date available"}
              </p>
            </div>
            <div className="controlActions controlActionsDate">
              <button
                type="button"
                className="controlBtn secondary"
                disabled={!canSelectPrevDate}
                onClick={() => stepDate(-1)}
              >
                Previous Date
              </button>
              <button
                type="button"
                className="controlBtn secondary"
                disabled={!canSelectNextDate}
                onClick={() => stepDate(1)}
              >
                Next Date
              </button>
            </div>
            {!monthDateKeys.length ? <p className="muted">No dates available for this month.</p> : null}
          </article>

          <article className="controlCard controlCardScope">
            <div className="controlHead">
              <h4>Scope</h4>
              <p>{dateScope === "single" ? "Single date mode" : "Whole month mode"}</p>
            </div>
            <div className="segmented">
              <button
                type="button"
                className={`segmentBtn ${dateScope === "single" ? "active" : ""}`}
                onClick={() => setDateScope("single")}
              >
                Single Date
              </button>
              <button
                type="button"
                className={`segmentBtn ${dateScope === "month" ? "active" : ""}`}
                onClick={() => setDateScope("month")}
              >
                Whole Month
              </button>
            </div>
          </article>

          <article className="controlCard controlCardOrder">
            <div className="controlHead">
              <h4>Date Order</h4>
              <p>{dateSortOrder === "asc" ? "Oldest to newest" : "Newest to oldest"}</p>
            </div>
            <div className="segmented">
              <button
                type="button"
                className={`segmentBtn ${dateSortOrder === "asc" ? "active" : ""}`}
                onClick={() => setDateSortOrder("asc")}
              >
                Ascending
              </button>
              <button
                type="button"
                className={`segmentBtn ${dateSortOrder === "desc" ? "active" : ""}`}
                onClick={() => setDateSortOrder("desc")}
              >
                Descending
              </button>
            </div>
          </article>
        </div>
        <div className="filterStatusBar" aria-live="polite">
          <p className="muted">
            Showing <strong>{filteredTrendRows.length}</strong> trend rows and{" "}
            <strong>{filteredSummaryRows.length}</strong> summary rows.
          </p>
          <div className="activeChipRow">
            {activeFilterChips.map((chip) => (
              <span key={chip} className="activeChip">
                {chip}
              </span>
            ))}
          </div>
          <button type="button" className="controlBtn secondary" onClick={resetFilters}>
            Reset Filters
          </button>
        </div>
      </section>

      <div className="grid2" id="results">
        <Table title="Trend Dates" rows={filteredTrendRows} exportFilename="trend-dates.csv" />
        <Table
          title="Date-Wise Summary"
          rows={filteredSummaryRows}
          exportFilename="date-wise-summary.csv"
        />
      </div>

      <section className="panel" id="preview">
        <h3>Date-Wise Table Preview</h3>
        <p className="muted">
          Showing rows for{" "}
          <strong>
            {dateScope === "month"
              ? selectedMonthYear || "no month selected"
              : selectedDateKey || "no date selected"}
          </strong>
        </p>
        <div className="spacer" />
        <Table
          title={dateScope === "month" ? "Rows For Selected Month" : "Rows For Selected Date"}
          rows={selectedDateRows}
          maxHeight={450}
          exportFilename={dateScope === "month" ? "rows-for-selected-month.csv" : "rows-for-selected-date.csv"}
        />
      </section>
    </main>
  );
}
