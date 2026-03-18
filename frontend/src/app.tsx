import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CandlestickSeries, ColorType, createChart, IChartApi, ISeriesApi } from "lightweight-charts";

import { cn } from "./lib/cn";

interface InstrumentOption {
  symbol: string;
  name: string;
  trading_symbol: string;
  instrument_key: string;
  segment: string;
}


interface StorageResponse {
  status: string;
  rows: number;
  duckdb_path: string;
  parquet_path: string;
}

interface JobStartResponse {
  status: string;
  job_id: string;
}

interface OhlcJobStatus {
  status: "running" | "completed" | "error";
  message: string;
  total: number;
  completed: number;
  stored_rows: number;
  failed_instruments: number;
  skipped_instruments?: number;
  failure_samples?: Array<{ instrument_key: string; detail: string }>;
}

interface CandleRow {
  ts: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface CandleRowsResponse {
  total: number;
  rows: CandleRow[];
}

interface IndexRow {
  instrument_key: string;
  underlying_key?: string;
  interval: string;
  from_date: string;
  to_date: string;
  rows: number;
  updated_at: string;
  option_type?: string | null;
  strike_price?: number | null;
}
interface IndexResponse {
  total: number;
  rows: IndexRow[];
}

interface StatusState {
  kind: "idle" | "success" | "error" | "loading";
  message: string;
}

const DEFAULT_STATUS: StatusState = { kind: "idle", message: "" };

const formatDate = (value: Date) => {
  const year = value.getFullYear();
  const month = `${value.getMonth() + 1}`.padStart(2, "0");
  const day = `${value.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const addMonths = (value: Date, months: number) => {
  const next = new Date(value);
  const targetMonth = next.getMonth() + months;
  next.setMonth(targetMonth);
  if (next.getMonth() !== ((targetMonth % 12) + 12) % 12) {
    next.setDate(0);
  }
  return next;
};

export function App() {
  const isRangesView = useMemo(() => window.location.pathname === "/ranges", []);
  const isRangeDetailView = useMemo(() => window.location.pathname === "/range", []);
  const today = useMemo(() => new Date(), []);
  const defaultToDate = useMemo(() => formatDate(today), [today]);
  const defaultFromDate = useMemo(() => formatDate(addMonths(today, -2)), [today]);
  const rangeDetailParams = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return {
      instrumentKey: params.get("instrument_key") ?? "",
      interval: params.get("interval") ?? "",
      fromDate: params.get("from_date") ?? "",
      toDate: params.get("to_date") ?? ""
    };
  }, []);
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<InstrumentOption[]>([]);
  const [selectedKey, setSelectedKey] = useState("");
  const [instrumentCache, setInstrumentCache] = useState<InstrumentOption[]>([]);
  const [cacheReady, setCacheReady] = useState(false);
  const [showSnapshotResults, setShowSnapshotResults] = useState(false);
  const [snapshotStatus, setSnapshotStatus] = useState<StatusState>(DEFAULT_STATUS);
  const [ohlcStatus, setOhlcStatus] = useState<StatusState>(DEFAULT_STATUS);
  const [ohlcJobId, setOhlcJobId] = useState("");
  const [ohlcProgress, setOhlcProgress] = useState<OhlcJobStatus | null>(null);

  const [ohlcQuery, setOhlcQuery] = useState("");
  const [ohlcUnderlyings, setOhlcUnderlyings] = useState<InstrumentOption[]>([]);
  const [ohlcUnderlyingKey, setOhlcUnderlyingKey] = useState("");
  const [showOhlcResults, setShowOhlcResults] = useState(false);
  const [interval, setInterval] = useState("5minute");
  const [fromDate, setFromDate] = useState(defaultFromDate);
  const [toDate, setToDate] = useState(defaultToDate);
  const [rangeUnderlyingQuery, setRangeUnderlyingQuery] = useState("");
  const [rangeUnderlyingOptions, setRangeUnderlyingOptions] = useState<InstrumentOption[]>([]);
  const [rangeUnderlyingKey, setRangeUnderlyingKey] = useState("");
  const [showRangeResults, setShowRangeResults] = useState(false);
  const [rangeContractQuery, setRangeContractQuery] = useState("");
  const [indexRows, setIndexRows] = useState<IndexRow[]>([]);
  const [indexStatus, setIndexStatus] = useState<StatusState>(DEFAULT_STATUS);
  const [rangesTotal, setRangesTotal] = useState(0);
  const rangesLimit = 200;
  const [rangesOffset, setRangesOffset] = useState(0);
  const [filterUnderlying, setFilterUnderlying] = useState("");
  const [filterInstrument, setFilterInstrument] = useState("");
  const [filterOptionType, setFilterOptionType] = useState("all");
  const [filterStrike, setFilterStrike] = useState("");
  const [filterInterval, setFilterInterval] = useState("all");
  const [filterFromDate, setFilterFromDate] = useState("");
  const [filterToDate, setFilterToDate] = useState("");
  const [filterMinRows, setFilterMinRows] = useState("");
  const [filterUpdatedAfter, setFilterUpdatedAfter] = useState("");
  const detailLimit = 200;
  const [detailOffset, setDetailOffset] = useState(0);
  const [detailTotal, setDetailTotal] = useState(0);
  const [detailRows, setDetailRows] = useState<CandleRow[]>([]);
  const [detailStatus, setDetailStatus] = useState<StatusState>(DEFAULT_STATUS);
  const chartContainerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const chartSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const [chartReady, setChartReady] = useState(false);

  const selectedOption = useMemo(
    () => options.find(option => option.instrument_key === selectedKey),
    [options, selectedKey]
  );

  const selectedUnderlying = useMemo(
    () => ohlcUnderlyings.find(option => option.instrument_key === ohlcUnderlyingKey),
    [ohlcUnderlyings, ohlcUnderlyingKey]
  );
  const selectedRangeUnderlying = useMemo(
    () => instrumentCache.find(option => option.instrument_key === rangeUnderlyingKey),
    [instrumentCache, rangeUnderlyingKey]
  );

  const summary = useMemo(() => {
    if (!selectedOption) {
      return "Select a symbol to store cached contracts.";
    }
    const label = selectedOption.name || selectedOption.symbol || selectedOption.trading_symbol;
    return `Ready to store cached contracts for ${label}.`;
  }, [selectedOption]);

  useEffect(() => {
    const loadCache = async () => {
      const cached = window.localStorage.getItem("instrument-cache-v3");
      const cachedAt = window.localStorage.getItem("instrument-cache-at-v3");
      if (cached && cachedAt) {
        const age = Date.now() - Number(cachedAt);
        if (age < 24 * 60 * 60 * 1000) {
          setInstrumentCache(JSON.parse(cached) as InstrumentOption[]);
          setCacheReady(true);
          return;
        }
      }
      try {
        const resp = await fetch("/api/instruments-cache");
        const payload = (await resp.json()) as InstrumentOption[];
        if (!resp.ok) {
          throw new Error("Cache load failed.");
        }
        window.localStorage.setItem("instrument-cache-v3", JSON.stringify(payload));
        window.localStorage.setItem("instrument-cache-at-v3", Date.now().toString());
        setInstrumentCache(payload);
        setCacheReady(true);
      } catch (err) {
        setInstrumentCache([]);
        setCacheReady(true);
      }
    };
    loadCache();
  }, []);

  useEffect(() => {
    if (!isRangesView) {
      return;
    }
    const controller = new AbortController();
    const fetchIndex = async () => {
      setIndexStatus({ kind: "loading", message: "Loading stored ranges..." });
      try {
        const params = new URLSearchParams();
        if (rangeUnderlyingKey) {
          params.set("underlying_key", rangeUnderlyingKey);
        } else if (rangeContractQuery.trim()) {
          params.set("instrument_key", rangeContractQuery.trim());
        }
        if (filterOptionType !== "all") {
          params.set("option_type", filterOptionType);
        }
        if (filterUnderlying.trim()) {
          params.set("underlying_filter", filterUnderlying.trim());
        }
        if (filterInstrument.trim()) {
          params.set("instrument_filter", filterInstrument.trim());
        }
        if (filterStrike.trim()) {
          params.set("strike_contains", filterStrike.trim());
        }
        if (filterInterval !== "all") {
          params.set("interval", filterInterval);
        }
        if (filterFromDate) {
          params.set("from_date_min", filterFromDate);
        }
        if (filterToDate) {
          params.set("to_date_max", filterToDate);
        }
        if (filterMinRows.trim()) {
          params.set("min_rows", filterMinRows.trim());
        }
        if (filterUpdatedAfter) {
          params.set("updated_after", filterUpdatedAfter);
        }
        params.set("limit", String(rangesLimit));
        params.set("offset", String(rangesOffset));
        const resp = await fetch(`/api/candles-index?${params.toString()}`, { signal: controller.signal });
        const payload = (await resp.json()) as IndexResponse;
        if (!resp.ok) {
          throw new Error("Failed to load index.");
        }
        setIndexRows(payload.rows ?? []);
        setRangesTotal(payload.total ?? 0);
        setIndexStatus({ kind: "success", message: "" });
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          return;
        }
        setIndexRows([]);
        setRangesTotal(0);
        setIndexStatus({ kind: "error", message: "Failed to load index." });
      }
    };
    const timer = window.setTimeout(fetchIndex, 200);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [
    isRangesView,
    rangeContractQuery,
    rangeUnderlyingKey,
    filterOptionType,
    filterUnderlying,
    filterInstrument,
    filterStrike,
    filterInterval,
    filterFromDate,
    filterToDate,
    filterMinRows,
    filterUpdatedAfter,
    rangesLimit,
    rangesOffset
  ]);

  useEffect(() => {
    if (!isRangeDetailView) {
      return;
    }
    setDetailOffset(0);
  }, [
    isRangeDetailView,
    rangeDetailParams.fromDate,
    rangeDetailParams.instrumentKey,
    rangeDetailParams.interval,
    rangeDetailParams.toDate
  ]);

  useEffect(() => {
    if (!isRangeDetailView) {
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
        chartSeriesRef.current = null;
      }
      setChartReady(false);
      return;
    }
    const container = chartContainerRef.current;
    if (!container) {
      return;
    }
    if (!chartRef.current) {
      const chart = createChart(container, {
        autoSize: true,
        layout: {
          background: { type: ColorType.Solid, color: "transparent" },
          textColor: "#0f172a"
        },
        grid: {
          vertLines: { color: "#e2e8f0" },
          horzLines: { color: "#e2e8f0" }
        },
        rightPriceScale: {
          borderColor: "#e2e8f0"
        },
        timeScale: {
          borderColor: "#e2e8f0",
          timeVisible: true,
          secondsVisible: false
        },
        localization: {
          timeFormatter: time => {
            const dt = new Date(time * 1000);
            return dt.toLocaleString("en-GB", {
              timeZone: "Asia/Kolkata",
              day: "2-digit",
              month: "short",
              hour: "2-digit",
              minute: "2-digit"
            });
          }
        }
      });
      chartRef.current = chart;
      chartSeriesRef.current = chart.addSeries(CandlestickSeries, {
        upColor: "#16a34a",
        downColor: "#dc2626",
        borderVisible: false,
        wickUpColor: "#16a34a",
        wickDownColor: "#dc2626"
      });
      setChartReady(true);
    }
    const handleResize = () => {
      if (!chartRef.current || !container) {
        return;
      }
      chartRef.current.applyOptions({ width: container.clientWidth });
    };
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, [isRangeDetailView]);

  useEffect(() => {
    if (!isRangeDetailView) {
      return;
    }
    const series = chartSeriesRef.current;
    const chart = chartRef.current;
    if (!series || !chart) {
      return;
    }
    const data = detailRows
      .map(row => {
        const parsed = Date.parse(row.ts);
        if (Number.isNaN(parsed)) {
          return null;
        }
        return {
          time: Math.floor(parsed / 1000),
          open: row.open,
          high: row.high,
          low: row.low,
          close: row.close
        };
      })
      .filter((item): item is { time: number; open: number; high: number; low: number; close: number } => !!item)
      .sort((a, b) => a.time - b.time);
    series.setData(data);
    if (data.length > 0) {
      chart.timeScale().fitContent();
    }
  }, [detailRows, isRangeDetailView, chartReady]);

  useEffect(() => {
    if (!isRangesView) {
      return;
    }
    setRangesOffset(0);
  }, [
    isRangesView,
    rangeUnderlyingKey,
    rangeContractQuery,
    filterUnderlying,
    filterInstrument,
    filterOptionType,
    filterStrike,
    filterInterval,
    filterFromDate,
    filterToDate,
    filterMinRows,
    filterUpdatedAfter
  ]);

  useEffect(() => {
    if (!isRangeDetailView) {
      return;
    }
    const { instrumentKey, interval: selectedInterval, fromDate: selectedFrom, toDate: selectedTo } = rangeDetailParams;
    if (!instrumentKey || !selectedInterval || !selectedFrom || !selectedTo) {
      setDetailRows([]);
      setDetailTotal(0);
      setDetailStatus({ kind: "error", message: "Missing range parameters. Return to stored ranges." });
      return;
    }
    const controller = new AbortController();
    const fetchRows = async () => {
      setDetailStatus({ kind: "loading", message: "Loading candle rows..." });
      try {
        const params = new URLSearchParams({
          instrument_key: instrumentKey,
          interval: selectedInterval,
          from_date: selectedFrom,
          to_date: selectedTo,
          limit: String(detailLimit),
          offset: String(detailOffset)
        });
        const resp = await fetch(`/api/candles-rows?${params.toString()}`, { signal: controller.signal });
        const payload = (await resp.json()) as CandleRowsResponse;
        if (!resp.ok) {
          throw new Error("Failed to load candles.");
        }
        setDetailRows(payload.rows ?? []);
        setDetailTotal(payload.total ?? 0);
        setDetailStatus({ kind: "success", message: "" });
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          return;
        }
        setDetailRows([]);
        setDetailTotal(0);
        setDetailStatus({ kind: "error", message: "Failed to load candles." });
      }
    };
    fetchRows();
    return () => controller.abort();
  }, [detailLimit, detailOffset, isRangeDetailView, rangeDetailParams]);

  const runLocalSearch = useCallback(
    (target: "snapshot" | "ohlc", search: string) => {
      const q = search.trim().toUpperCase();
      if (!q) {
        if (target === "snapshot") {
          setOptions([]);
        } else {
          setOhlcUnderlyings([]);
        }
        return;
      }
      const filtered = instrumentCache
        .filter(item => {
          const hay = `${item.symbol} ${item.name} ${item.trading_symbol} ${item.instrument_key}`.toUpperCase();
          return hay.includes(q);
        })
        .slice(0, 25);
      if (target === "snapshot") {
        setOptions(filtered);
        if (filtered.length > 0) {
          setSelectedKey(filtered[0].instrument_key);
        }
      } else {
        setOhlcUnderlyings(filtered);
        if (filtered.length > 0) {
          setOhlcUnderlyingKey(filtered[0].instrument_key);
        }
      }
    },
    [instrumentCache]
  );

  useEffect(() => {
    if (!cacheReady) {
      return;
    }
    const timer = window.setTimeout(() => {
      runLocalSearch("snapshot", query);
    }, 40);
    return () => window.clearTimeout(timer);
  }, [query, runLocalSearch, cacheReady]);

  useEffect(() => {
    if (!cacheReady) {
      return;
    }
    const timer = window.setTimeout(() => {
      runLocalSearch("ohlc", ohlcQuery);
    }, 40);
    return () => window.clearTimeout(timer);
  }, [ohlcQuery, runLocalSearch, cacheReady]);

  useEffect(() => {
    if (!cacheReady || !isRangesView) {
      return;
    }
    const timer = window.setTimeout(() => {
      const q = rangeUnderlyingQuery.trim().toUpperCase();
      if (!q) {
        setRangeUnderlyingOptions([]);
        return;
      }
      const filtered = instrumentCache
        .filter(item => {
          const hay = `${item.symbol} ${item.name} ${item.trading_symbol} ${item.instrument_key}`.toUpperCase();
          return hay.includes(q);
        })
        .slice(0, 25);
      setRangeUnderlyingOptions(filtered);
    }, 40);
    return () => window.clearTimeout(timer);
  }, [cacheReady, instrumentCache, isRangesView, rangeUnderlyingQuery]);

  const handleQueryChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(event.target.value);
  }, []);

  const handleSelectOption = useCallback((option: InstrumentOption) => {
    setSelectedKey(option.instrument_key);
    setQuery(option.name || option.symbol || option.trading_symbol);
    setShowSnapshotResults(false);
  }, []);

  const handleSelectUnderlying = useCallback((option: InstrumentOption) => {
    setOhlcUnderlyingKey(option.instrument_key);
    setOhlcQuery(option.name || option.symbol || option.trading_symbol);
    setShowOhlcResults(false);
  }, []);

  const handleSelectRangeUnderlying = useCallback((option: InstrumentOption) => {
    setRangeUnderlyingKey(option.instrument_key);
    setRangeUnderlyingQuery(option.name || option.symbol || option.trading_symbol);
    setRangeContractQuery("");
    setShowRangeResults(false);
  }, []);

  const handlePrevDetailPage = useCallback(() => {
    setDetailOffset(prev => Math.max(0, prev - detailLimit));
  }, [detailLimit]);

  const handleNextDetailPage = useCallback(() => {
    setDetailOffset(prev => (prev + detailLimit < detailTotal ? prev + detailLimit : prev));
  }, [detailLimit, detailTotal]);

  const handleStoreSnapshot = useCallback(async () => {
    if (!selectedKey) {
      setSnapshotStatus({ kind: "error", message: "Select a symbol before storing." });
      return;
    }
    setSnapshotStatus({ kind: "loading", message: "Storing cached snapshot..." });
    try {
      const resp = await fetch(`/download/expired-contracts/?instrument_key=${encodeURIComponent(selectedKey)}`);
      const payload = (await resp.json()) as StorageResponse;
      if (!resp.ok) {
        throw new Error(payload?.status || "Snapshot request failed.");
      }
      setSnapshotStatus({
        kind: "success",
        message: `Stored ${payload.rows} rows. Parquet: ${payload.parquet_path}`
      });
    } catch (err) {
      setSnapshotStatus({ kind: "error", message: err instanceof Error ? err.message : "Request failed." });
    }
  }, [selectedKey]);

  const handleStoreOhlc = useCallback(async () => {
    if (!ohlcUnderlyingKey || !fromDate || !toDate) {
      setOhlcStatus({ kind: "error", message: "Pick an underlying and fill from/to dates." });
      return;
    }
    setOhlcStatus({ kind: "loading", message: "Fetching candles and storing..." });
    setOhlcProgress(null);
    const params = new URLSearchParams({
      underlying_key: ohlcUnderlyingKey,
      interval,
      from_date: fromDate,
      to_date: toDate,
      include_spot: "true"
    });
    try {
      const resp = await fetch(`/download/expired-ohlcv?${params.toString()}`);
      const payload = (await resp.json()) as JobStartResponse;
      if (!resp.ok) {
        throw new Error(payload?.status || "OHLC request failed.");
      }
      setOhlcJobId(payload.job_id);
      setOhlcStatus({ kind: "loading", message: "Job started. Fetching candles..." });
    } catch (err) {
      setOhlcStatus({ kind: "error", message: err instanceof Error ? err.message : "Request failed." });
    }
  }, [fromDate, interval, ohlcUnderlyingKey, toDate]);

  useEffect(() => {
    if (!ohlcJobId) {
      return;
    }
    let stopped = false;
    const poll = async () => {
      try {
        const resp = await fetch(`/api/ohlc-job/${ohlcJobId}`);
        const payload = (await resp.json()) as OhlcJobStatus;
        if (!resp.ok) {
          throw new Error(payload?.message || "Failed to read progress.");
        }
        if (stopped) {
          return;
        }
        setOhlcProgress(payload);
        if (payload.status === "completed") {
          setOhlcStatus({
            kind: "success",
            message: `Stored ${payload.stored_rows} rows. Failed: ${payload.failed_instruments}. Skipped: ${payload.skipped_instruments ?? 0}.`
          });
          setOhlcJobId("");
          return;
        }
        if (payload.status === "error") {
          setOhlcStatus({ kind: "error", message: payload.message || "Job failed." });
          setOhlcJobId("");
        }
      } catch (err) {
        if (!stopped) {
          setOhlcStatus({ kind: "error", message: err instanceof Error ? err.message : "Progress check failed." });
          setOhlcJobId("");
        }
      }
    };
    poll();
    const timer = window.setInterval(poll, 1000);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [ohlcJobId]);

  const statusTone = (status: StatusState) => {
    if (status.kind === "success") {
      return "border-primary/30 bg-primary/10 text-primary";
    }
    if (status.kind === "error") {
      return "border-destructive/30 bg-destructive/10 text-destructive";
    }
    if (status.kind === "loading") {
      return "border-border bg-muted text-muted-foreground";
    }
    return "border-border bg-background text-muted-foreground";
  };

  const progressPercent = ohlcProgress?.total
    ? Math.min(100, Math.round((ohlcProgress.completed / ohlcProgress.total) * 100))
    : 0;
  const hasRangesPrev = rangesOffset > 0;
  const hasRangesNext = rangesOffset + rangesLimit < rangesTotal;
  const rangesStart = rangesTotal === 0 ? 0 : rangesOffset + 1;
  const rangesEnd = Math.min(rangesOffset + rangesLimit, rangesTotal);
  const headerTitle = isRangesView
    ? "Stored OHLC Ranges"
    : isRangeDetailView
      ? "OHLC Range Detail"
      : "Expired Contracts Storage";
  const headerLinkHref = isRangeDetailView ? "/ranges" : isRangesView ? "/" : "/ranges";
  const headerLinkLabel = isRangeDetailView ? "Back to ranges" : isRangesView ? "Back to storage" : "Stored ranges";

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="border-b border-border bg-background">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-6 py-6">
          <p className="text-sm font-medium text-muted-foreground text-pretty">Upstox Expired Instruments</p>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h1 className="text-3xl font-semibold text-balance">{headerTitle}</h1>
            <a
              href={headerLinkHref}
              className="text-sm font-medium text-primary hover:underline"
            >
              {headerLinkLabel}
            </a>
          </div>
          <p className="text-sm text-muted-foreground text-pretty">
            Search F&amp;O stocks and NSE indices, store cached contracts, and persist expired OHLC data in DuckDB.
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-8 px-6 py-10">
        {isRangesView ? (
          <section className="rounded-xl border border-border bg-background p-6 shadow-sm">
            <div className="flex flex-col gap-4">
              <div className="space-y-1">
                <h2 className="text-xl font-semibold text-balance">Stored ranges</h2>
                <p className="text-sm text-muted-foreground text-pretty">
                  Filter by underlying or contract key to inspect stored OHLC ranges.
                </p>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-2 text-sm font-medium">
                  Underlying search
                  <input
                    aria-label="Underlying search"
                    className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    value={rangeUnderlyingQuery}
                    onChange={event => {
                      setRangeUnderlyingQuery(event.target.value);
                      if (event.target.value.trim().length === 0) {
                        setRangeUnderlyingKey("");
                      }
                    }}
                    onFocus={() => setShowRangeResults(true)}
                    onBlur={() => window.setTimeout(() => setShowRangeResults(false), 120)}
                    placeholder="Search underlying (e.g. NIFTY, RELIANCE)"
                  />
                  <div className="relative">
                    {showRangeResults && rangeUnderlyingQuery.trim().length > 0 && (
                      <div className="absolute z-10 mt-2 w-full rounded-md border border-border bg-background shadow-sm">
                        {rangeUnderlyingOptions.length === 0 ? (
                          <div className="px-3 py-2 text-sm text-muted-foreground">No matches</div>
                        ) : (
                          <ul className="max-h-56 overflow-auto">
                            {rangeUnderlyingOptions.map(option => (
                              <li key={option.instrument_key}>
                                <button
                                  type="button"
                                  className="w-full px-3 py-2 text-left text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                  onMouseDown={event => event.preventDefault()}
                                  onClick={() => handleSelectRangeUnderlying(option)}
                                >
                                  {option.name || option.symbol || option.trading_symbol}
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}
                  </div>
                </label>
                <label className="space-y-2 text-sm font-medium">
                  Contract key filter
                  <input
                    aria-label="Contract key filter"
                    className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    value={rangeContractQuery}
                    onChange={event => {
                      const value = event.target.value;
                      setRangeContractQuery(value);
                      if (value.trim().length > 0) {
                        setRangeUnderlyingKey("");
                        setRangeUnderlyingQuery("");
                      }
                    }}
                    placeholder="NSE_FO|12345|30-12-2025"
                  />
                </label>
              </div>
              {rangeUnderlyingKey && (
                <div className="rounded-md border border-border bg-muted px-4 py-2 text-sm text-muted-foreground">
                  Showing ranges for underlying:{" "}
                  <span className="font-medium text-foreground">
                    {selectedRangeUnderlying?.name || rangeUnderlyingKey}
                  </span>
                </div>
              )}
              {indexStatus.kind === "error" && (
                <div className={cn("rounded-md border px-4 py-2 text-sm", statusTone(indexStatus))}>
                  {indexStatus.message}
                </div>
              )}
            <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
              <div>
                Showing{" "}
                <span className="font-medium text-foreground">
                  {rangesStart}-{rangesEnd}
                </span>{" "}
                of{" "}
                <span className="font-medium text-foreground">
                  {rangesTotal}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="rounded-md border border-border px-3 py-1 text-xs font-medium text-foreground disabled:opacity-50"
                  onClick={() => setRangesOffset(prev => Math.max(0, prev - rangesLimit))}
                  disabled={!hasRangesPrev}
                >
                  Prev
                </button>
                <button
                  type="button"
                  className="rounded-md border border-border px-3 py-1 text-xs font-medium text-foreground disabled:opacity-50"
                  onClick={() => setRangesOffset(prev => (hasRangesNext ? prev + rangesLimit : prev))}
                  disabled={!hasRangesNext}
                >
                  Next
                </button>
              </div>
            </div>
            <div className="overflow-auto rounded-md border border-border">
              <table className="w-full text-left text-sm">
                <thead className="bg-muted text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2">Underlying</th>
                      <th className="px-3 py-2">Instrument</th>
                      <th className="px-3 py-2">Option Type</th>
                      <th className="px-3 py-2">Strike</th>
                      <th className="px-3 py-2">Interval</th>
                      <th className="px-3 py-2">From</th>
                      <th className="px-3 py-2">To</th>
                      <th className="px-3 py-2">Rows</th>
                      <th className="px-3 py-2">Updated</th>
                      <th className="px-3 py-2">View</th>
                    </tr>
                    <tr className="bg-background text-[11px] font-normal text-muted-foreground">
                      <th className="px-3 py-2">
                        <input
                          aria-label="Filter underlying"
                          className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          value={filterUnderlying}
                          onChange={event => setFilterUnderlying(event.target.value)}
                          placeholder="Filter"
                        />
                      </th>
                      <th className="px-3 py-2">
                        <input
                          aria-label="Filter instrument"
                          className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          value={filterInstrument}
                          onChange={event => setFilterInstrument(event.target.value)}
                          placeholder="Filter"
                        />
                      </th>
                      <th className="px-3 py-2">
                        <select
                          aria-label="Filter option type"
                          className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          value={filterOptionType}
                          onChange={event => setFilterOptionType(event.target.value)}
                        >
                          <option value="all">All</option>
                          <option value="CE">CE</option>
                          <option value="PE">PE</option>
                          <option value="FUT">FUT</option>
                          <option value="SPOT">SPOT</option>
                        </select>
                      </th>
                      <th className="px-3 py-2">
                        <input
                          aria-label="Filter strike"
                          className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          value={filterStrike}
                          onChange={event => setFilterStrike(event.target.value)}
                          placeholder="Filter"
                        />
                      </th>
                      <th className="px-3 py-2">
                        <select
                          aria-label="Filter interval"
                          className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          value={filterInterval}
                          onChange={event => setFilterInterval(event.target.value)}
                        >
                          <option value="all">All</option>
                          <option value="1minute">1 minute</option>
                          <option value="5minute">5 minute</option>
                          <option value="15minute">15 minute</option>
                          <option value="30minute">30 minute</option>
                          <option value="60minute">60 minute</option>
                          <option value="day">Day</option>
                        </select>
                      </th>
                      <th className="px-3 py-2">
                        <input
                          aria-label="Filter from date"
                          className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          type="date"
                          value={filterFromDate}
                          onChange={event => setFilterFromDate(event.target.value)}
                        />
                      </th>
                      <th className="px-3 py-2">
                        <input
                          aria-label="Filter to date"
                          className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          type="date"
                          value={filterToDate}
                          onChange={event => setFilterToDate(event.target.value)}
                        />
                      </th>
                      <th className="px-3 py-2">
                        <input
                          aria-label="Filter minimum rows"
                          className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          value={filterMinRows}
                          onChange={event => setFilterMinRows(event.target.value)}
                          placeholder="Min"
                          inputMode="numeric"
                        />
                      </th>
                      <th className="px-3 py-2">
                        <input
                          aria-label="Filter updated after"
                          className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          type="date"
                          value={filterUpdatedAfter}
                          onChange={event => setFilterUpdatedAfter(event.target.value)}
                        />
                      </th>
                      <th className="px-3 py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {indexRows.length === 0 ? (
                      <tr>
                        <td colSpan={10} className="px-3 py-6 text-center text-muted-foreground">
                          {indexStatus.kind === "loading" ? "Loading..." : "No ranges found."}
                        </td>
                      </tr>
                    ) : (
                      indexRows.map((row, idx) => {
                        const rowHref = `/range?instrument_key=${encodeURIComponent(
                          row.instrument_key
                        )}&interval=${encodeURIComponent(row.interval)}&from_date=${encodeURIComponent(
                          row.from_date
                        )}&to_date=${encodeURIComponent(row.to_date)}`;
                        return (
                          <tr key={`${row.instrument_key}-${idx}`} className="border-t border-border">
                            <td className="px-3 py-2">
                              <a className="block hover:underline" href={rowHref}>
                                {row.underlying_key || "—"}
                              </a>
                            </td>
                            <td className="px-3 py-2 font-medium">
                              <a className="block hover:underline" href={rowHref}>
                                {row.instrument_key}
                              </a>
                            </td>
                            <td className="px-3 py-2">
                              <a className="block hover:underline" href={rowHref}>
                                {row.option_type ?? "—"}
                              </a>
                            </td>
                            <td className="px-3 py-2 tabular-nums">
                              <a className="block hover:underline" href={rowHref}>
                                {row.strike_price ?? "—"}
                              </a>
                            </td>
                            <td className="px-3 py-2">
                              <a className="block hover:underline" href={rowHref}>
                                {row.interval}
                              </a>
                            </td>
                            <td className="px-3 py-2 tabular-nums">
                              <a className="block hover:underline" href={rowHref}>
                                {row.from_date}
                              </a>
                            </td>
                            <td className="px-3 py-2 tabular-nums">
                              <a className="block hover:underline" href={rowHref}>
                                {row.to_date}
                              </a>
                            </td>
                            <td className="px-3 py-2 tabular-nums">
                              <a className="block hover:underline" href={rowHref}>
                                {row.rows}
                              </a>
                            </td>
                          <td className="px-3 py-2 tabular-nums">
                            <a className="block hover:underline" href={rowHref}>
                              {row.updated_at}
                            </a>
                          </td>
                          <td className="px-3 py-2">
                            <a className="text-sm font-medium text-primary hover:underline" href={rowHref}>
                              View
                            </a>
                          </td>
                        </tr>
                      );
                    })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        ) : isRangeDetailView ? (
        <section className="rounded-xl border border-border bg-background p-6 shadow-sm">
          <div className="flex flex-col gap-4">
            <div className="space-y-1">
              <h2 className="text-xl font-semibold text-balance">Range detail</h2>
              <p className="text-sm text-muted-foreground text-pretty">
                Review stored OHLC rows for the selected instrument and range.
              </p>
            </div>

            <div className="rounded-md border border-border bg-muted px-4 py-3 text-sm text-muted-foreground">
              <div className="flex flex-wrap gap-4">
                <div>
                  Instrument:{" "}
                  <span className="font-medium text-foreground">{rangeDetailParams.instrumentKey || "—"}</span>
                </div>
                <div>
                  Interval:{" "}
                  <span className="font-medium text-foreground">{rangeDetailParams.interval || "—"}</span>
                </div>
                <div>
                  From:{" "}
                  <span className="font-medium text-foreground">{rangeDetailParams.fromDate || "—"}</span>
                </div>
                <div>
                  To:{" "}
                  <span className="font-medium text-foreground">{rangeDetailParams.toDate || "—"}</span>
                </div>
              </div>
            </div>


            <div className="rounded-md border border-border bg-background p-4">
              <div className="mb-3 text-sm font-medium text-muted-foreground">OHLC chart</div>
              <div className="h-[320px] w-full" ref={chartContainerRef} />
              {detailRows.length === 0 && (
                <div className="pt-3 text-sm text-muted-foreground">No candle data to plot yet.</div>
              )}
            </div>

            {detailStatus.kind === "error" && (
              <div className={cn("rounded-md border px-4 py-2 text-sm", statusTone(detailStatus))}>
                {detailStatus.message}{" "}
                <a className="font-medium text-primary hover:underline" href="/ranges">
                  Back to ranges
                </a>
              </div>
            )}

            <div className="overflow-auto rounded-md border border-border">
              <table className="w-full text-left text-sm tabular-nums">
                <thead className="bg-muted text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">Timestamp</th>
                    <th className="px-3 py-2">Open</th>
                    <th className="px-3 py-2">High</th>
                    <th className="px-3 py-2">Low</th>
                    <th className="px-3 py-2">Close</th>
                    <th className="px-3 py-2">Volume</th>
                  </tr>
                </thead>
                <tbody>
                  {detailRows.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">
                        {detailStatus.kind === "loading" ? (
                          "Loading..."
                        ) : (
                          <>
                            No rows found.{" "}
                            <a className="font-medium text-primary hover:underline" href="/ranges">
                              Back to ranges
                            </a>
                          </>
                        )}
                      </td>
                    </tr>
                  ) : (
                    detailRows.map((row, idx) => (
                      <tr key={`${row.ts}-${idx}`} className="border-t border-border">
                        <td className="px-3 py-2">{row.ts}</td>
                        <td className="px-3 py-2">{row.open}</td>
                        <td className="px-3 py-2">{row.high}</td>
                        <td className="px-3 py-2">{row.low}</td>
                        <td className="px-3 py-2">{row.close}</td>
                        <td className="px-3 py-2">{row.volume}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="text-sm text-muted-foreground tabular-nums">
                {detailTotal > 0
                  ? `Showing ${detailOffset + 1}-${Math.min(detailOffset + detailRows.length, detailTotal)} of ${detailTotal}`
                  : "No rows to display yet."}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="h-9 rounded-md border border-border bg-background px-4 text-sm font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                  onClick={handlePrevDetailPage}
                  disabled={detailOffset === 0}
                >
                  Previous
                </button>
                <button
                  type="button"
                  className="h-9 rounded-md border border-border bg-background px-4 text-sm font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                  onClick={handleNextDetailPage}
                  disabled={detailOffset + detailLimit >= detailTotal}
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        </section>
        ) : (
        <section className="rounded-xl border border-border bg-background p-6 shadow-sm">
          <div className="flex flex-col gap-4">
            <div className="space-y-1">
              <h2 className="text-xl font-semibold text-balance">Store cached snapshot</h2>
              <p className="text-sm text-muted-foreground text-pretty">
                Search by symbol or name from token master. Results cover F&O stocks and NSE indices only.
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-2 text-sm font-medium">
                Symbol search
                <input
                  aria-label="Search by symbol"
                  className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  value={query}
                  onChange={handleQueryChange}
                  onFocus={() => setShowSnapshotResults(true)}
                  onBlur={() => window.setTimeout(() => setShowSnapshotResults(false), 120)}
                  placeholder="Try TCS, RELIANCE, BANKNIFTY"
                />
                <div className="relative">
                  {showSnapshotResults && query.trim().length > 0 && (
                    <div className="absolute z-10 mt-2 w-full rounded-md border border-border bg-background shadow-sm">
                      {options.length === 0 ? (
                        <div className="px-3 py-2 text-sm text-muted-foreground">No matches</div>
                      ) : (
                        <ul className="max-h-56 overflow-auto">
                          {options.map(option => (
                            <li key={option.instrument_key}>
                              <button
                                type="button"
                                className="w-full px-3 py-2 text-left text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                onMouseDown={event => event.preventDefault()}
                                onClick={() => handleSelectOption(option)}
                              >
                                {option.name || option.symbol || option.trading_symbol}
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </div>
              </label>
              <div className="space-y-2 text-sm font-medium">
                Selected instrument
                <div className="h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-muted-foreground">
                  {selectedOption?.name || selectedOption?.symbol || selectedOption?.trading_symbol || "None"}
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-border bg-muted p-4 text-sm text-muted-foreground text-pretty">
              {summary}
            </div>

            <div className="flex flex-col gap-3 md:flex-row md:items-center">
              <button
                type="button"
                className="h-11 rounded-md bg-primary px-6 text-sm font-semibold text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={handleStoreSnapshot}
              >
                Store contracts
              </button>
              {snapshotStatus.kind !== "idle" && (
                <div
                  className={cn("flex-1 rounded-md border px-4 py-2 text-sm text-pretty tabular-nums", statusTone(snapshotStatus))}
                  role={snapshotStatus.kind === "error" ? "alert" : "status"}
                >
                  {snapshotStatus.message}
                </div>
              )}
            </div>
          </div>
        </section>
        )}

        {!isRangesView && !isRangeDetailView && (
        <section className="rounded-xl border border-border bg-background p-6 shadow-sm">
          <div className="flex flex-col gap-4">
            <div className="space-y-1">
              <h2 className="text-xl font-semibold text-balance">Fetch expired OHLC candles</h2>
              <p className="text-sm text-muted-foreground text-pretty">
                Choose an underlying and date range to store CE, PE, FUT, and spot candles automatically.
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-2 text-sm font-medium">
                Underlying search
                <input
                  aria-label="Search underlying"
                  className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  value={ohlcQuery}
                  onChange={event => setOhlcQuery(event.target.value)}
                  onFocus={() => setShowOhlcResults(true)}
                  onBlur={() => window.setTimeout(() => setShowOhlcResults(false), 120)}
                  placeholder="Search by symbol or name"
                />
                <div className="relative">
                  {showOhlcResults && ohlcQuery.trim().length > 0 && (
                    <div className="absolute z-10 mt-2 w-full rounded-md border border-border bg-background shadow-sm">
                      {ohlcUnderlyings.length === 0 ? (
                        <div className="px-3 py-2 text-sm text-muted-foreground">No matches</div>
                      ) : (
                        <ul className="max-h-56 overflow-auto">
                          {ohlcUnderlyings.map(option => (
                            <li key={option.instrument_key}>
                              <button
                                type="button"
                                className="w-full px-3 py-2 text-left text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                onMouseDown={event => event.preventDefault()}
                                onClick={() => handleSelectUnderlying(option)}
                              >
                                {option.name || option.symbol || option.trading_symbol}
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </div>
              </label>
              <div className="space-y-2 text-sm font-medium">
                Selected underlying
                <div className="h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-muted-foreground">
                  {selectedUnderlying?.name || selectedUnderlying?.symbol || selectedUnderlying?.trading_symbol || "None"}
                </div>
              </div>
              <label className="space-y-2 text-sm font-medium">
                Interval
                <select
                  aria-label="Interval"
                  className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  value={interval}
                  onChange={event => setInterval(event.target.value)}
                >
                  <option value="1minute">1 minute</option>
                  <option value="5minute">5 minute</option>
                  <option value="15minute">15 minute</option>
                  <option value="30minute">30 minute</option>
                  <option value="60minute">60 minute</option>
                  <option value="day">Day</option>
                </select>
              </label>
              <label className="space-y-2 text-sm font-medium">
                From date
                <input
                  aria-label="From date"
                  className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  type="date"
                  value={fromDate}
                  onChange={event => setFromDate(event.target.value)}
                  placeholder="2026-03-01"
                />
              </label>
              <label className="space-y-2 text-sm font-medium">
                To date
                <input
                  aria-label="To date"
                  className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  type="date"
                  value={toDate}
                  onChange={event => setToDate(event.target.value)}
                  placeholder="2026-03-10"
                />
              </label>
            </div>

            <div className="flex flex-col gap-3 md:flex-row md:items-center">
              <button
                type="button"
                className="h-11 rounded-md bg-primary px-6 text-sm font-semibold text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={handleStoreOhlc}
              >
                Store OHLC
              </button>
              {ohlcStatus.kind === "loading" && ohlcProgress && (
                <div className="flex-1 space-y-2">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>
                      {ohlcProgress.message || "Fetching candles..."}
                    </span>
                    <span>
                      {ohlcProgress.completed}/{ohlcProgress.total}
                    </span>
                  </div>
                  <div
                    className="h-2 w-full rounded-full bg-muted"
                    role="progressbar"
                    aria-valuenow={progressPercent}
                    aria-valuemin={0}
                    aria-valuemax={100}
                  >
                    <div
                      className="h-2 rounded-full bg-primary transition-all"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                </div>
              )}
              {ohlcStatus.kind !== "idle" && (
                <div
                  className={cn("flex-1 rounded-md border px-4 py-2 text-sm text-pretty tabular-nums", statusTone(ohlcStatus))}
                  role={ohlcStatus.kind === "error" ? "alert" : "status"}
                >
                  {ohlcStatus.message}
                </div>
              )}
            </div>

            {ohlcProgress?.failure_samples && ohlcProgress.failure_samples.length > 0 && (
              <div className="rounded-md border border-border bg-muted p-4 text-xs text-muted-foreground">
                <div className="text-sm font-medium text-foreground">Recent failures</div>
                <ul className="mt-2 space-y-1">
                  {ohlcProgress.failure_samples.map(sample => (
                    <li key={`${sample.instrument_key}-${sample.detail}`} className="break-words">
                      <span className="font-medium text-foreground">{sample.instrument_key}</span>
                      <span className="text-muted-foreground"> — {sample.detail}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </section>
        )}
      </main>
    </div>
  );
}
