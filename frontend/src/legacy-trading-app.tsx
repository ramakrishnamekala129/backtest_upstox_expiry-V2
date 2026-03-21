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
  status: "running" | "paused" | "completed" | "error" | "stopped";
  control_state?: "running" | "paused" | "stopped";
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

interface OhlcLogResponse {
  lines: string[];
}

interface ActiveOhlcJobState {
  jobId: string;
  currentIndex: number;
  nextIndex: number;
  totalTargets: number;
  targetLabel: string;
  targets: InstrumentOption[];
  interval: string;
  fromDate: string;
  toDate: string;
  includeSpot: boolean;
  includeFutures: boolean;
  includeOptions: boolean;
  completedSelections: number;
  storedRows: number;
  failedInstruments: number;
  skippedInstruments: number;
  failures: string[];
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

interface ToastItem {
  id: string;
  tone: "success" | "error" | "info";
  message: string;
}

type TerminalFilter = "all" | "errors" | "success" | "info";

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

interface InstrumentMenuGroup {
  label: string;
  options: InstrumentOption[];
}

interface SnapshotSelectionOption {
  label: string;
  value: string;
  kind: "scope" | "item";
  section: "complete" | "sector" | "item-stock" | "item-index";
}

const SECTOR_GROUP_DEFS: Array<{ label: string; symbols: string[] }> = [
  {
    label: "Banking & Financials",
    symbols: [
      "360ONE", "ABCAPITAL", "ANGELONE", "AUBANK", "AXISBANK", "BAJAJFINSV", "BAJFINANCE", "BANDHANBNK",
      "BANKBARODA", "BANKINDIA", "BSE", "CAMS", "CANBK", "CDSL", "CHOLAFIN", "FEDERALBNK", "HDFCAMC",
      "HDFCBANK", "HDFCLIFE", "ICICIBANK", "ICICIGI", "ICICIPRULI", "IDFCFIRSTB", "IEX", "INDUSINDBK",
      "JIOFIN", "KOTAKBANK", "LICHSGFIN", "M&MFIN", "MANAPPURAM", "MCX", "MUTHOOTFIN", "PFC", "PNB",
      "POLICYBZR", "RECLTD", "SBICARD", "SBILIFE", "SBIN", "SHRIRAMFIN", "UNIONBANK"
    ]
  },
  {
    label: "IT & Digital",
    symbols: [
      "COFORGE", "HCLTECH", "INFY", "LTIM", "LTTS", "MPHASIS", "NAUKRI", "OFSS", "PERSISTENT", "TCS", "TECHM", "WIPRO"
    ]
  },
  {
    label: "Energy & Utilities",
    symbols: [
      "ADANIENSOL", "ADANIGREEN", "BPCL", "COALINDIA", "GAIL", "HINDPETRO", "IOC", "JSWENERGY", "NTPC", "ONGC",
      "OIL", "POWERGRID", "RELIANCE", "TATAPOWER", "TORNTPOWER"
    ]
  },
  {
    label: "Auto & Mobility",
    symbols: [
      "ASHOKLEY", "BAJAJ-AUTO", "BHARATFORG", "BOSCHLTD", "EICHERMOT", "EXIDEIND", "HEROMOTOCO", "M&M",
      "MARUTI", "MOTHERSON", "SONACOMS", "TATAMOTORS", "TVSMOTOR"
    ]
  },
  {
    label: "Pharma & Healthcare",
    symbols: [
      "ALKEM", "APOLLOHOSP", "AUROPHARMA", "BIOCON", "CIPLA", "DIVISLAB", "DRREDDY", "FORTIS", "GLENMARK",
      "LALPATHLAB", "LUPIN", "MAXHEALTH", "MANKIND", "NATCOPHARM", "SUNPHARMA", "SYNGENE", "TORNTPHARM", "ZYDUSLIFE"
    ]
  },
  {
    label: "Metals, Cement & Materials",
    symbols: [
      "APLAPOLLO", "AMBUJACEM", "DALBHARAT", "GRASIM", "HINDALCO", "HINDZINC", "JINDALSTEL", "JSWSTEEL",
      "NMDC", "SAIL", "SHREECEM", "TATASTEEL", "ULTRACEMCO", "VEDL"
    ]
  },
  {
    label: "Consumer, Retail & Durables",
    symbols: [
      "ASIANPAINT", "BLUESTARCO", "BRITANNIA", "COLPAL", "CROMPTON", "DABUR", "DMART", "ETERNAL", "GODREJCP",
      "HAVELLS", "HINDUNILVR", "ITC", "NESTLEIND", "TITAN", "TRENT", "UNITDSPR", "VBL"
    ]
  },
  {
    label: "Industrials, Infra & Logistics",
    symbols: [
      "ABB", "ADANIENT", "ADANIPORTS", "BDL", "BEL", "BHEL", "CGPOWER", "CONCOR", "CUMMINSIND", "DELHIVERY",
      "DIXON", "DLF", "GMRAIRPORT", "HAL", "IRCTC", "KEI", "LT", "POLYCAB", "RVNL", "SIEMENS", "VOLTAS"
    ]
  },
  {
    label: "Telecom & Media",
    symbols: ["BHARTIARTL", "IDEA", "INDUSTOWER", "SUNTV"]
  }
];

const SYMBOL_TO_GROUP = new Map(
  SECTOR_GROUP_DEFS.flatMap(group => group.symbols.map(symbol => [symbol, group.label] as const))
);

const getInstrumentLabel = (option: InstrumentOption) => {
  const primary = option.symbol || option.trading_symbol || option.name || option.instrument_key;
  const secondary = option.name && option.name !== primary ? option.name : option.trading_symbol && option.trading_symbol !== primary ? option.trading_symbol : "";
  return secondary ? `${primary} - ${secondary}` : primary;
};

const getInstrumentMenuGroup = (option: InstrumentOption) => {
  if (option.segment === "NSE_INDEX") {
    return "F&O Indices";
  }
  const symbol = option.symbol || option.trading_symbol || option.name;
  return SYMBOL_TO_GROUP.get(symbol) ?? "Other F&O Stocks";
};

const buildInstrumentMenuGroups = (options: InstrumentOption[]): InstrumentMenuGroup[] => {
  const buckets = new Map<string, InstrumentOption[]>();
  for (const option of options) {
    const label = getInstrumentMenuGroup(option);
    const existing = buckets.get(label) ?? [];
    existing.push(option);
    buckets.set(label, existing);
  }
  return [
    ...SECTOR_GROUP_DEFS.map(group => group.label),
    "Other F&O Stocks",
    "F&O Indices"
  ]
    .map(label => ({
      label,
      options: (buckets.get(label) ?? []).sort((left, right) => getInstrumentLabel(left).localeCompare(getInstrumentLabel(right)))
    }))
    .filter(group => group.options.length > 0);
};

const SNAPSHOT_SCOPE_PREFIX = "__scope__:";
const UI_STATE_STORAGE_KEY = "expired-contracts-ui-state-v1";
const ACTIVE_OHLC_JOB_STORAGE_KEY = "expired-contracts-active-ohlc-job-v1";
const THEME_STORAGE_KEY = "expired-contracts-theme-v1";

function DashboardCard({
  title,
  eyebrow,
  description,
  collapsed,
  onToggle,
  theme,
  actions,
  children
}: {
  title: string;
  eyebrow: string;
  description: string;
  collapsed: boolean;
  onToggle: () => void;
  theme: "dark" | "light";
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  const isDark = theme === "dark";
  return (
    <section className={cn(
      "group relative overflow-hidden rounded-[28px] backdrop-blur-xl",
      isDark
        ? "border border-white/10 bg-white/6 shadow-[0_24px_80px_rgba(4,10,28,0.45)]"
        : "border border-slate-200/90 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(241,245,249,0.96))] shadow-[0_24px_80px_rgba(148,163,184,0.18)]"
    )}>
      <div className={cn(
        "absolute inset-0 opacity-90",
        isDark
          ? "bg-[radial-gradient(circle_at_top_left,rgba(99,102,241,0.18),transparent_28%),radial-gradient(circle_at_top_right,rgba(34,211,238,0.12),transparent_24%)]"
          : "bg-[radial-gradient(circle_at_top_left,rgba(99,102,241,0.1),transparent_28%),radial-gradient(circle_at_top_right,rgba(34,211,238,0.08),transparent_24%)]"
      )} />
      <div className="relative">
        <button
          type="button"
          className={cn(
            "flex w-full items-start justify-between gap-4 px-6 py-6 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            isDark ? "hover:bg-white/5" : "hover:bg-slate-100/70"
          )}
          onClick={onToggle}
          aria-expanded={!collapsed}
        >
          <div className="space-y-2">
            <div className={cn("text-[11px] font-semibold uppercase tracking-[0.28em]", isDark ? "text-cyan-300/80" : "text-cyan-700/80")}>{eyebrow}</div>
            <div className="flex items-center gap-3">
              <h2 className={cn("text-xl font-semibold", isDark ? "text-white" : "text-slate-950")}>{title}</h2>
              <span className={cn(
                "rounded-full px-2.5 py-1 text-[11px] font-medium",
                isDark ? "border border-white/10 bg-white/8 text-slate-300" : "border border-slate-200 bg-slate-100 text-slate-600"
              )}>
                {collapsed ? "Collapsed" : "Live"}
              </span>
            </div>
            <p className={cn("max-w-2xl text-sm leading-6", isDark ? "text-slate-300" : "text-slate-600")}>{description}</p>
          </div>
          <div className="flex items-center gap-3">
            {actions}
            <span className={cn(
              "rounded-full px-3 py-2 text-xs font-medium",
              isDark ? "border border-white/10 bg-slate-950/50 text-slate-300" : "border border-slate-200 bg-slate-100 text-slate-600"
            )}>
              {collapsed ? "Expand" : "Collapse"}
            </span>
          </div>
        </button>
        {!collapsed && <div className="px-6 pb-6">{children}</div>}
      </div>
    </section>
  );
}

function MetricCard({
  label,
  value,
  tone,
  detail,
  theme
}: {
  label: string;
  value: string;
  tone?: "primary" | "success" | "danger" | "neutral";
  detail: string;
  theme: "dark" | "light";
}) {
  const isDark = theme === "dark";
  const toneClass = tone === "success"
    ? isDark
      ? "from-emerald-400/20 to-emerald-500/5 text-emerald-300"
      : "from-emerald-100 to-white text-emerald-800"
    : tone === "danger"
      ? isDark
        ? "from-rose-400/20 to-rose-500/5 text-rose-300"
        : "from-rose-100 to-white text-rose-800"
      : tone === "primary"
        ? isDark
          ? "from-indigo-400/20 to-cyan-400/5 text-cyan-200"
          : "from-indigo-100 to-cyan-50 text-indigo-900"
        : isDark
          ? "from-white/10 to-white/5 text-slate-200"
          : "from-slate-100 to-white text-slate-800";
  return (
    <div className={cn(
      "rounded-2xl bg-gradient-to-br p-4",
      toneClass,
      isDark ? "border border-white/10" : "border border-slate-200/80 shadow-[0_8px_32px_rgba(148,163,184,0.12)]"
    )}>
      <div className={cn("text-[11px] font-semibold uppercase tracking-[0.24em]", isDark ? "text-slate-400" : "text-slate-500")}>{label}</div>
      <div className={cn("mt-3 text-2xl font-semibold tabular-nums", isDark ? "text-white" : "text-slate-950")}>{value}</div>
      <div className={cn("mt-1 text-xs", isDark ? "text-slate-400" : "text-slate-500")}>{detail}</div>
    </div>
  );
}

function classifyLogLine(line: string): "error" | "success" | "info" {
  const normalized = line.toUpperCase();
  if (normalized.includes("ERROR") || normalized.includes("HTTP_401") || normalized.includes("HTTP_429") || normalized.includes("INVALID TOKEN")) {
    return "error";
  }
  if (normalized.includes("SUCCESS") || normalized.includes("COMPLETED") || normalized.includes("STORED")) {
    return "success";
  }
  return "info";
}

function formatCompactCount(value: number) {
  return new Intl.NumberFormat("en-IN", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

const buildSnapshotSelectionOptions = (groups: InstrumentMenuGroup[]): SnapshotSelectionOption[] => {
  const stockCount = groups
    .filter(group => group.label !== "F&O Indices")
    .reduce((total, group) => total + group.options.length, 0);
  const indexCount = groups.find(group => group.label === "F&O Indices")?.options.length ?? 0;
  const totalCount = stockCount + indexCount;
  const options: SnapshotSelectionOption[] = [
    {
      label: `COMPLETE F&O UNIVERSE (${totalCount})`,
      value: `${SNAPSHOT_SCOPE_PREFIX}all`,
      kind: "scope",
      section: "complete"
    },
    {
      label: `F&O STOCKS COMPLETE (${stockCount})`,
      value: `${SNAPSHOT_SCOPE_PREFIX}stocks`,
      kind: "scope",
      section: "complete"
    }
  ];
  if (indexCount > 0) {
    options.push({
      label: `F&O INDICES COMPLETE (${indexCount})`,
      value: `${SNAPSHOT_SCOPE_PREFIX}indices`,
      kind: "scope",
      section: "complete"
    });
  }
  for (const group of groups) {
    options.push({
      label: `SECTOR COMPLETE: ${group.label.toUpperCase()} (${group.options.length})`,
      value: `${SNAPSHOT_SCOPE_PREFIX}group:${group.label}`,
      kind: "scope",
      section: "sector"
    });
    for (const option of group.options) {
      const isIndex = group.label === "F&O Indices";
      options.push({
        label: `  ${isIndex ? "INDEX" : "STOCK"}: ${getInstrumentLabel(option)}`,
        value: option.instrument_key,
        kind: "item",
        section: isIndex ? "item-index" : "item-stock"
      });
    }
  }
  return options;
};

const getSectorScopeValue = (label: string) => `${SNAPSHOT_SCOPE_PREFIX}group:${label}`;

const describeSnapshotSelection = (selection: string, targets: InstrumentOption[]) => {
  if (!selection || targets.length === 0) {
    return { title: "No selection", detail: "Choose one stock or a complete sector/F&O group to store.", tone: "muted" };
  }
  if (!selection.startsWith(SNAPSHOT_SCOPE_PREFIX)) {
    return {
      title: "Single stock",
      detail: getInstrumentLabel(targets[0]),
      tone: "normal"
    };
  }
  const scope = selection.slice(SNAPSHOT_SCOPE_PREFIX.length);
  if (scope === "all") {
    return { title: "Complete F&O universe", detail: `${targets.length} instruments selected`, tone: "highlight" };
  }
  if (scope === "stocks") {
    return { title: "F&O stocks complete", detail: `${targets.length} stocks selected`, tone: "highlight" };
  }
  if (scope === "indices") {
    return { title: "F&O indices complete", detail: `${targets.length} indices selected`, tone: "highlight" };
  }
  if (scope.startsWith("group:")) {
    return {
      title: "Sector complete",
      detail: `${scope.slice("group:".length)} (${targets.length} stocks)`,
      tone: "highlight"
    };
  }
  return { title: "Selection", detail: `${targets.length} instruments selected`, tone: "normal" };
};

const resolveSnapshotTargets = (selection: string, groups: InstrumentMenuGroup[]): InstrumentOption[] => {
  if (!selection) {
    return [];
  }
  if (!selection.startsWith(SNAPSHOT_SCOPE_PREFIX)) {
    for (const group of groups) {
      const match = group.options.find(option => option.instrument_key === selection);
      if (match) {
        return [match];
      }
    }
    return [];
  }
  const scope = selection.slice(SNAPSHOT_SCOPE_PREFIX.length);
  if (scope === "all") {
    return groups.flatMap(group => group.options);
  }
  if (scope === "stocks") {
    return groups.filter(group => group.label !== "F&O Indices").flatMap(group => group.options);
  }
  if (scope === "indices") {
    return groups.filter(group => group.label === "F&O Indices").flatMap(group => group.options);
  }
  if (scope.startsWith("group:")) {
    const label = scope.slice("group:".length);
    return groups.find(group => group.label === label)?.options ?? [];
  }
  return [];
};

const saveActiveOhlcJob = (value: ActiveOhlcJobState | null) => {
  if (!value) {
    window.localStorage.removeItem(ACTIVE_OHLC_JOB_STORAGE_KEY);
    return;
  }
  window.localStorage.setItem(ACTIVE_OHLC_JOB_STORAGE_KEY, JSON.stringify(value));
};

const buildOhlcBatchMessage = (
  completedSelections: number,
  totalTargets: number,
  storedRows: number,
  failedInstruments: number,
  skippedInstruments: number,
  failures: string[]
) => {
  if (completedSelections === 0) {
    return failures.length > 0
      ? `OHLC failed for ${failures.slice(0, 5).join(", ")}${failures.length > 5 ? "..." : ""}`
      : "OHLC request failed.";
  }
  if (failures.length > 0) {
    return `Stored ${storedRows} rows for ${completedSelections}/${totalTargets} selections. Failed jobs: ${failures.length}. Instrument failures: ${failedInstruments}. Skipped: ${skippedInstruments}.`;
  }
  return `Stored ${storedRows} rows for ${completedSelections} selection(s). Instrument failures: ${failedInstruments}. Skipped: ${skippedInstruments}.`;
};

const isFatalOhlcAuthError = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  const normalized = message.toUpperCase();
  return normalized.includes("INVALID TOKEN") || normalized.includes("UDAPI100050") || normalized.includes("TOKEN EXPIRED");
};

export function LegacyTradingApp() {
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
  const [theme, setTheme] = useState<"dark" | "light">(() => {
    const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
    return saved === "light" ? "light" : "dark";
  });
  const [isSnapshotCollapsed, setIsSnapshotCollapsed] = useState(false);
  const [isOhlcCollapsed, setIsOhlcCollapsed] = useState(false);
  const [terminalFilter, setTerminalFilter] = useState<TerminalFilter>("all");
  const [terminalAutoscroll, setTerminalAutoscroll] = useState(true);
  const [terminalRefreshTick, setTerminalRefreshTick] = useState(0);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [toastItems, setToastItems] = useState<ToastItem[]>([]);
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<InstrumentOption[]>([]);
  const [snapshotSelection, setSnapshotSelection] = useState("");
  const [instrumentCache, setInstrumentCache] = useState<InstrumentOption[]>([]);
  const [cacheReady, setCacheReady] = useState(false);
  const [showSnapshotResults, setShowSnapshotResults] = useState(false);
  const [snapshotStatus, setSnapshotStatus] = useState<StatusState>(DEFAULT_STATUS);
  const [ohlcStatus, setOhlcStatus] = useState<StatusState>(DEFAULT_STATUS);
  const [ohlcProgress, setOhlcProgress] = useState<OhlcJobStatus | null>(null);
  const [ohlcControlState, setOhlcControlState] = useState<"idle" | "running" | "paused" | "stopping">("idle");
  const [ohlcLogLines, setOhlcLogLines] = useState<string[]>([]);
  const [activeOhlcJob, setActiveOhlcJob] = useState<ActiveOhlcJobState | null>(null);
  const [recoveringOhlcJob, setRecoveringOhlcJob] = useState(false);

  const [ohlcQuery, setOhlcQuery] = useState("");
  const [ohlcUnderlyings, setOhlcUnderlyings] = useState<InstrumentOption[]>([]);
  const [ohlcSelection, setOhlcSelection] = useState("");
  const [showOhlcResults, setShowOhlcResults] = useState(false);
  const [interval, setInterval] = useState("5minute");
  const [fromDate, setFromDate] = useState(defaultFromDate);
  const [toDate, setToDate] = useState(defaultToDate);
  const [includeSpot, setIncludeSpot] = useState(true);
  const [includeFutures, setIncludeFutures] = useState(true);
  const [includeOptions, setIncludeOptions] = useState(true);
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
  const snapshotMenuRef = useRef<HTMLDivElement | null>(null);
  const ohlcMenuRef = useRef<HTMLDivElement | null>(null);
  const ohlcLogContainerRef = useRef<HTMLDivElement | null>(null);
  const [chartReady, setChartReady] = useState(false);
  const [snapshotMenuOpen, setSnapshotMenuOpen] = useState(false);
  const [expandedSectorLabels, setExpandedSectorLabels] = useState<string[]>([]);
  const [indicesExpanded, setIndicesExpanded] = useState(false);
  const [ohlcMenuOpen, setOhlcMenuOpen] = useState(false);
  const [expandedOhlcSectorLabels, setExpandedOhlcSectorLabels] = useState<string[]>([]);
  const [ohlcIndicesExpanded, setOhlcIndicesExpanded] = useState(false);
  const ohlcStopRequestedRef = useRef(false);
  const ohlcPauseRequestedRef = useRef(false);
  const ohlcCurrentJobIdRef = useRef("");
  const ohlcLogStickToBottomRef = useRef(true);
  const ohlcRecoveryStartedRef = useRef(false);

  const instrumentMenuGroups = useMemo(() => buildInstrumentMenuGroups(instrumentCache), [instrumentCache]);
  const snapshotSelectionOptions = useMemo(
    () => buildSnapshotSelectionOptions(instrumentMenuGroups),
    [instrumentMenuGroups]
  );
  const completeSnapshotOptions = useMemo(
    () => snapshotSelectionOptions.filter(option => option.section === "complete"),
    [snapshotSelectionOptions]
  );
  const indexSnapshotOptions = useMemo(
    () => snapshotSelectionOptions.filter(option => option.section === "item-index"),
    [snapshotSelectionOptions]
  );
  const stockSectorGroups = useMemo(
    () => instrumentMenuGroups.filter(group => group.label !== "F&O Indices"),
    [instrumentMenuGroups]
  );
  const snapshotTargets = useMemo(
    () => resolveSnapshotTargets(snapshotSelection, instrumentMenuGroups),
    [snapshotSelection, instrumentMenuGroups]
  );
  const ohlcTargets = useMemo(
    () => resolveSnapshotTargets(ohlcSelection, instrumentMenuGroups),
    [ohlcSelection, instrumentMenuGroups]
  );
  const snapshotSelectionMeta = useMemo(
    () => describeSnapshotSelection(snapshotSelection, snapshotTargets),
    [snapshotSelection, snapshotTargets]
  );
  const ohlcSelectionMeta = useMemo(
    () => describeSnapshotSelection(ohlcSelection, ohlcTargets),
    [ohlcSelection, ohlcTargets]
  );
  const selectedOption = useMemo(
    () => (snapshotTargets.length === 1 ? snapshotTargets[0] : null),
    [snapshotTargets]
  );
  const selectedUnderlying = useMemo(
    () => (ohlcTargets.length === 1 ? ohlcTargets[0] : null),
    [ohlcTargets]
  );
  const selectedRangeUnderlying = useMemo(
    () => instrumentCache.find(option => option.instrument_key === rangeUnderlyingKey),
    [instrumentCache, rangeUnderlyingKey]
  );

  const summary = useMemo(() => {
    if (snapshotTargets.length === 0) {
      return "Select one instrument, one sector, all F&O stocks, all indices, or the complete F&O universe.";
    }
    if (snapshotTargets.length === 1 && selectedOption) {
      return `Ready to store cached contracts for ${getInstrumentLabel(selectedOption)}.`;
    }
    return `Ready to store cached contracts for ${snapshotTargets.length} selected instruments.`;
  }, [selectedOption, snapshotTargets]);

  const filteredSnapshotSectors = useMemo(() => {
    const normalized = query.trim().toUpperCase();
    if (!normalized) {
      return stockSectorGroups;
    }
    return stockSectorGroups
      .map(group => ({
        ...group,
        options: group.options.filter(option => {
          const hay = `${option.symbol} ${option.name} ${option.trading_symbol} ${option.instrument_key}`.toUpperCase();
          return hay.includes(normalized) || group.label.toUpperCase().includes(normalized);
        })
      }))
      .filter(group => group.options.length > 0 || group.label.toUpperCase().includes(normalized));
  }, [query, stockSectorGroups]);

  const filteredOhlcSectors = useMemo(() => {
    const normalized = ohlcQuery.trim().toUpperCase();
    if (!normalized) {
      return stockSectorGroups;
    }
    return stockSectorGroups
      .map(group => ({
        ...group,
        options: group.options.filter(option => {
          const hay = `${option.symbol} ${option.name} ${option.trading_symbol} ${option.instrument_key}`.toUpperCase();
          return hay.includes(normalized) || group.label.toUpperCase().includes(normalized);
        })
      }))
      .filter(group => group.options.length > 0 || group.label.toUpperCase().includes(normalized));
  }, [ohlcQuery, stockSectorGroups]);

  const filteredIndexSnapshotOptions = useMemo(() => {
    const normalized = query.trim().toUpperCase();
    if (!normalized) {
      return indexSnapshotOptions;
    }
    return indexSnapshotOptions.filter(option => option.label.toUpperCase().includes(normalized));
  }, [indexSnapshotOptions, query]);

  const filteredIndexOhlcOptions = useMemo(() => {
    const normalized = ohlcQuery.trim().toUpperCase();
    if (!normalized) {
      return indexSnapshotOptions;
    }
    return indexSnapshotOptions.filter(option => option.label.toUpperCase().includes(normalized));
  }, [indexSnapshotOptions, ohlcQuery]);

  const filteredOhlcLogLines = useMemo(() => {
    if (terminalFilter === "all") {
      return ohlcLogLines;
    }
    return ohlcLogLines.filter(line => {
      const tone = classifyLogLine(line);
      if (terminalFilter === "errors") {
        return tone === "error";
      }
      if (terminalFilter === "success") {
        return tone === "success";
      }
      return tone === "info";
    });
  }, [ohlcLogLines, terminalFilter]);

  const connectionStatus = ohlcControlState === "running"
    ? "Fetching"
    : ohlcControlState === "paused"
      ? "Paused"
      : cacheReady
        ? "Connected"
        : "Syncing";
  const isDark = theme === "dark";
  const formLabelClass = cn("space-y-2 text-sm font-medium", isDark ? "text-slate-200" : "text-slate-700");
  const inputClass = cn(
    "h-12 w-full rounded-2xl px-4 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
    isDark
      ? "border border-white/10 bg-slate-950/55 text-white placeholder:text-slate-500"
      : "border border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 shadow-sm"
  );
  const quickPanelClass = cn(
    "rounded-2xl p-2",
    isDark ? "border border-white/10 bg-slate-950/45" : "border border-slate-200 bg-white/90 shadow-sm"
  );
  const quickPanelHeadingClass = cn(
    "mb-2 px-2 text-[11px] font-semibold uppercase tracking-[0.22em]",
    isDark ? "text-slate-400" : "text-slate-500"
  );
  const quickPanelItemClass = cn(
    "rounded-xl px-3 py-2 text-left text-sm transition",
    isDark ? "text-slate-200 hover:bg-white/8" : "text-slate-700 hover:bg-slate-100"
  );
  const selectorButtonClass = cn(
    "flex min-h-14 w-full items-center justify-between rounded-[22px] px-4 py-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
    isDark ? "border border-white/10 bg-slate-950/55 hover:bg-white/5" : "border border-slate-200 bg-white shadow-sm hover:bg-slate-50"
  );
  const selectorTitleClass = cn("truncate text-sm font-semibold", isDark ? "text-white" : "text-slate-950");
  const selectorDetailClass = cn("truncate text-xs", isDark ? "text-slate-400" : "text-slate-500");
  const selectorBadgeClass = cn(
    "ml-4 rounded-full px-3 py-1 text-[11px] font-medium",
    isDark ? "border border-white/10 bg-white/5 text-slate-300" : "border border-slate-200 bg-slate-100 text-slate-600"
  );
  const menuPopoverClass = cn(
    "absolute z-20 mt-3 max-h-[34rem] w-full overflow-hidden rounded-[24px] backdrop-blur-2xl",
    isDark
      ? "border border-white/10 bg-slate-950/95 shadow-[0_24px_80px_rgba(0,0,0,0.45)]"
      : "border border-slate-200 bg-white/95 shadow-[0_24px_80px_rgba(148,163,184,0.22)]"
  );
  const menuSectionHeadingClass = cn(
    "px-1 text-[11px] font-semibold uppercase tracking-[0.24em]",
    isDark ? "text-slate-400" : "text-slate-500"
  );
  const getMenuOptionClass = (selected: boolean) => cn(
    "rounded-2xl border px-4 py-3 text-left text-sm transition",
    selected
      ? isDark
        ? "border-cyan-400/40 bg-cyan-400/10 text-white"
        : "border-cyan-300 bg-cyan-50 text-slate-950"
      : isDark
        ? "border-white/10 bg-white/5 text-slate-200 hover:bg-white/10"
        : "border-slate-200 bg-white text-slate-700 hover:bg-slate-100"
  );
  const getMenuGroupClass = () => cn(
    "rounded-[22px]",
    isDark ? "border border-white/10 bg-white/5" : "border border-slate-200 bg-slate-50/80"
  );
  const getMenuGroupHeaderClass = () => cn(
    "flex items-center gap-2 px-3 py-3",
    isDark ? "border-b border-white/10" : "border-b border-slate-200"
  );
  const getMenuGroupToggleClass = () => cn(
    "flex flex-1 items-center justify-between rounded-xl px-2 py-1 text-left text-sm font-medium transition",
    isDark ? "text-white hover:bg-white/8" : "text-slate-900 hover:bg-slate-100"
  );
  const getMenuGroupActionClass = (selected: boolean) => cn(
    "rounded-xl border px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em]",
    selected
      ? isDark
        ? "border-cyan-400/40 bg-cyan-400/10 text-cyan-200"
        : "border-cyan-300 bg-cyan-50 text-cyan-700"
      : isDark
        ? "border-white/10 bg-slate-950/60 text-slate-200 hover:bg-white/10"
        : "border-slate-200 bg-white text-slate-600 hover:bg-slate-100"
  );
  const getMenuLeafClass = (selected: boolean) => cn(
    "w-full rounded-xl px-3 py-2 text-left text-sm transition",
    selected
      ? isDark
        ? "bg-cyan-400/10 text-white"
        : "bg-cyan-50 text-slate-950"
      : isDark
        ? "text-slate-200 hover:bg-white/8"
        : "text-slate-700 hover:bg-slate-100"
  );
  const softInfoPanelClass = cn(
    "rounded-[24px] p-5",
    isDark ? "border border-cyan-400/20 bg-cyan-400/8" : "border border-cyan-200/80 bg-[linear-gradient(180deg,rgba(236,254,255,0.96),rgba(248,250,252,0.98))] shadow-sm"
  );
  const primaryGhostButtonClass = cn(
    "inline-flex h-12 items-center justify-center rounded-2xl px-5 text-sm font-semibold transition",
    isDark ? "border border-white/10 bg-white/5 text-slate-200 hover:bg-white/10" : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 shadow-sm"
  );
  const neutralSurfaceClass = cn(
    "rounded-[24px] p-5",
    isDark ? "border border-white/10 bg-slate-950/50" : "border border-slate-200/90 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.96))] shadow-sm"
  );
  const terminalPanelClass = cn(
    "rounded-[28px] shadow-[0_24px_80px_rgba(0,0,0,0.45)]",
    isDark ? "border border-white/10 bg-slate-950/80 text-slate-100" : "border border-slate-200 bg-white/95 text-slate-900 shadow-[0_24px_80px_rgba(148,163,184,0.18)]"
  );
  const terminalHeaderBorderClass = isDark ? "border-b border-white/10" : "border-b border-slate-200";
  const terminalFilterButton = (active: boolean) => cn(
    "rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] transition",
    active
      ? isDark
        ? "border-cyan-400/40 bg-cyan-400/10 text-cyan-200"
        : "border-cyan-300 bg-cyan-50 text-cyan-700"
      : isDark
        ? "border-white/10 bg-white/5 text-slate-400 hover:bg-white/10"
        : "border-slate-200 bg-white text-slate-500 hover:bg-slate-100"
  );
  const secondaryActionClass = cn(
    "inline-flex h-12 items-center justify-center rounded-2xl px-5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50",
    isDark ? "border border-white/10 bg-white/5 text-slate-200 hover:bg-white/10" : "border border-slate-300 bg-slate-100 text-slate-800 shadow-sm hover:bg-slate-200"
  );
  const dangerActionClass = cn(
    "inline-flex h-12 items-center justify-center rounded-2xl border px-5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50",
    isDark ? "border-rose-400/30 bg-rose-500/10 text-rose-200 hover:bg-rose-500/20" : "border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
  );
  const segmentedSurfaceClass = cn(
    "grid gap-2 rounded-[22px] p-2",
    isDark ? "border border-white/10 bg-slate-950/55" : "border border-slate-200 bg-white shadow-sm"
  );
  const segmentedButtonClass = (active: boolean) =>
    cn(
      "rounded-2xl px-3 py-2 text-sm font-semibold transition",
      active
        ? "bg-gradient-to-r from-indigo-500 to-cyan-400 text-white shadow-[0_10px_24px_rgba(59,130,246,0.25)]"
        : isDark
          ? "bg-white/5 text-slate-300 hover:bg-white/10"
          : "bg-slate-200 text-slate-700 hover:bg-slate-300"
    );
  const toggleChipClass = (active: boolean) =>
    cn(
      "rounded-2xl border px-4 py-3 text-left text-sm font-semibold transition",
      active
        ? isDark
          ? "border-cyan-400/40 bg-cyan-400/10 text-cyan-100"
          : "border-cyan-300 bg-cyan-100 text-cyan-900"
        : isDark
          ? "border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"
          : "border-slate-300 bg-slate-100 text-slate-700 hover:bg-slate-200"
    );
  const subtleBadgeClass = cn(
    "rounded-full border px-3 py-1 text-xs font-semibold",
    isDark ? "border-white/10 bg-white/5 text-slate-300" : "border-slate-300 bg-slate-100 text-slate-700"
  );
  const modalOverlayClass = cn(
    "fixed inset-0 z-40 flex items-start justify-center px-6 py-24 backdrop-blur-md",
    isDark ? "bg-slate-950/70" : "bg-slate-900/10"
  );
  const modalPanelClass = cn(
    "w-full max-w-2xl rounded-[28px] shadow-[0_24px_80px_rgba(0,0,0,0.18)]",
    isDark ? "border border-white/10 bg-slate-950/95" : "border border-slate-200 bg-white/95"
  );
  const modalRowClass = cn(
    "flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left transition",
    isDark ? "border-white/10 bg-white/5 hover:bg-white/10" : "border-slate-200 bg-slate-50 hover:bg-white"
  );
  const modalCloseClass = cn(
    "rounded-2xl border px-4 py-2 text-sm font-semibold transition",
    isDark ? "border-white/10 bg-white/5 text-slate-200 hover:bg-white/10" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-100"
  );

  useEffect(() => {
    document.documentElement.classList.toggle("theme-light", theme === "light");
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  useEffect(() => {
    const raw = window.localStorage.getItem(UI_STATE_STORAGE_KEY);
    if (!raw) {
      return;
    }
    try {
      const saved = JSON.parse(raw) as Partial<{
        snapshotSelection: string;
        ohlcSelection: string;
        interval: string;
        fromDate: string;
        toDate: string;
        includeSpot: boolean;
        includeFutures: boolean;
        includeOptions: boolean;
        theme: "dark" | "light";
      }>;
      if (typeof saved.snapshotSelection === "string") {
        setSnapshotSelection(saved.snapshotSelection);
      }
      if (typeof saved.ohlcSelection === "string") {
        setOhlcSelection(saved.ohlcSelection);
      }
      if (typeof saved.interval === "string") {
        setInterval(saved.interval);
      }
      if (typeof saved.fromDate === "string") {
        setFromDate(saved.fromDate);
      }
      if (typeof saved.toDate === "string") {
        setToDate(saved.toDate);
      }
      if (typeof saved.includeSpot === "boolean") {
        setIncludeSpot(saved.includeSpot);
      }
      if (typeof saved.includeFutures === "boolean") {
        setIncludeFutures(saved.includeFutures);
      }
      if (typeof saved.includeOptions === "boolean") {
        setIncludeOptions(saved.includeOptions);
      }
      if (saved.theme === "light" || saved.theme === "dark") {
        setTheme(saved.theme);
      }
    } catch {
      window.localStorage.removeItem(UI_STATE_STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    const raw = window.localStorage.getItem(ACTIVE_OHLC_JOB_STORAGE_KEY);
    if (!raw) {
      return;
    }
    try {
      const saved = JSON.parse(raw) as ActiveOhlcJobState;
      if (!saved.jobId || !Array.isArray(saved.targets) || saved.targets.length === 0) {
        window.localStorage.removeItem(ACTIVE_OHLC_JOB_STORAGE_KEY);
        return;
      }
      setActiveOhlcJob(saved);
      setRecoveringOhlcJob(true);
      ohlcRecoveryStartedRef.current = false;
      ohlcCurrentJobIdRef.current = saved.jobId;
      setOhlcControlState("running");
      setOhlcStatus({
        kind: "loading",
        message: `Recovered running job ${saved.currentIndex}/${saved.totalTargets}: ${saved.targetLabel}`
      });
    } catch {
      window.localStorage.removeItem(ACTIVE_OHLC_JOB_STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(
      UI_STATE_STORAGE_KEY,
      JSON.stringify({
        snapshotSelection,
        ohlcSelection,
        interval,
        fromDate,
        toDate,
        includeSpot,
        includeFutures,
        includeOptions,
        theme
      })
    );
  }, [snapshotSelection, ohlcSelection, interval, fromDate, toDate, includeSpot, includeFutures, includeOptions, theme]);

  useEffect(() => {
    saveActiveOhlcJob(activeOhlcJob);
  }, [activeOhlcJob]);

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
    if (!snapshotMenuOpen) {
      return;
    }
    const handlePointerDown = (event: MouseEvent) => {
      if (!snapshotMenuRef.current?.contains(event.target as Node)) {
        setSnapshotMenuOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSnapshotMenuOpen(false);
      }
    };
    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [snapshotMenuOpen]);

  useEffect(() => {
    if (!ohlcMenuOpen) {
      return;
    }
    const handlePointerDown = (event: MouseEvent) => {
      if (!ohlcMenuRef.current?.contains(event.target as Node)) {
        setOhlcMenuOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOhlcMenuOpen(false);
      }
    };
    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [ohlcMenuOpen]);

  useEffect(() => {
    const container = ohlcLogContainerRef.current;
    if (!container) {
      return;
    }
    if (terminalAutoscroll && ohlcLogStickToBottomRef.current) {
      container.scrollTop = container.scrollHeight;
    }
  }, [ohlcLogLines, terminalAutoscroll]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandPaletteOpen(prev => !prev);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    const statusGroups = [
      { key: `snapshot-${snapshotStatus.kind}-${snapshotStatus.message}`, status: snapshotStatus },
      { key: `ohlc-${ohlcStatus.kind}-${ohlcStatus.message}`, status: ohlcStatus }
    ];
    for (const group of statusGroups) {
      if (group.status.kind === "idle" || !group.status.message) {
        continue;
      }
      setToastItems(current => {
        if (current.some(item => item.id === group.key)) {
          return current;
        }
        return [
          ...current,
          {
            id: group.key,
            tone: group.status.kind === "error" ? "error" : group.status.kind === "success" ? "success" : "info",
            message: group.status.message
          }
        ].slice(-4);
      });
    }
  }, [ohlcStatus, snapshotStatus]);

  useEffect(() => {
    if (toastItems.length === 0) {
      return;
    }
    const timer = window.setTimeout(() => {
      setToastItems(current => current.slice(1));
    }, 4200);
    return () => window.clearTimeout(timer);
  }, [toastItems]);

  useEffect(() => {
    if (isRangesView || isRangeDetailView) {
      return;
    }
    let stopped = false;
    const loadLogs = async () => {
      try {
        const resp = await fetch("/api/ohlc-log?limit=120");
        const payload = (await resp.json()) as OhlcLogResponse;
        if (!resp.ok || stopped) {
          return;
        }
        setOhlcLogLines(payload.lines ?? []);
      } catch {
        if (!stopped) {
          setOhlcLogLines([]);
        }
      }
    };
    loadLogs();
    const timer = window.setInterval(loadLogs, 3000);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [isRangesView, isRangeDetailView, terminalRefreshTick]);

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
          textColor: theme === "dark" ? "#dbe7ff" : "#0f172a"
        },
        grid: {
          vertLines: { color: theme === "dark" ? "rgba(148, 163, 184, 0.12)" : "#e2e8f0" },
          horzLines: { color: theme === "dark" ? "rgba(148, 163, 184, 0.12)" : "#e2e8f0" }
        },
        rightPriceScale: {
          borderColor: theme === "dark" ? "rgba(148, 163, 184, 0.18)" : "#e2e8f0"
        },
        timeScale: {
          borderColor: theme === "dark" ? "rgba(148, 163, 184, 0.18)" : "#e2e8f0",
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
  }, [isRangeDetailView, theme]);

  useEffect(() => {
    if (!chartRef.current) {
      return;
    }
    chartRef.current.applyOptions({
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: theme === "dark" ? "#dbe7ff" : "#0f172a"
      },
      grid: {
        vertLines: { color: theme === "dark" ? "rgba(148, 163, 184, 0.12)" : "#e2e8f0" },
        horzLines: { color: theme === "dark" ? "rgba(148, 163, 184, 0.12)" : "#e2e8f0" }
      },
      rightPriceScale: {
        borderColor: theme === "dark" ? "rgba(148, 163, 184, 0.18)" : "#e2e8f0"
      },
      timeScale: {
        borderColor: theme === "dark" ? "rgba(148, 163, 184, 0.18)" : "#e2e8f0"
      }
    });
  }, [theme]);

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
      } else {
        setOhlcUnderlyings(filtered);
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
    setQuery(option.name || option.symbol || option.trading_symbol);
    setSnapshotSelection(option.instrument_key);
    setShowSnapshotResults(false);
  }, []);

  const handleSelectUnderlying = useCallback((option: InstrumentOption) => {
    setOhlcQuery(option.name || option.symbol || option.trading_symbol);
    setOhlcSelection(option.instrument_key);
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

  const handleSelectSnapshotSelection = useCallback((value: string) => {
    setSnapshotSelection(value);
    setSnapshotMenuOpen(false);
  }, []);

  const handleToggleSnapshotMenu = useCallback(() => {
    setSnapshotMenuOpen(prev => !prev);
  }, []);

  const handleToggleSector = useCallback((label: string) => {
    setExpandedSectorLabels(prev =>
      prev.includes(label) ? prev.filter(item => item !== label) : [...prev, label]
    );
  }, []);

  const handleToggleIndices = useCallback(() => {
    setIndicesExpanded(prev => !prev);
  }, []);

  const handleSelectOhlcSelection = useCallback((value: string) => {
    setOhlcSelection(value);
    setOhlcMenuOpen(false);
  }, []);

  const handleToggleOhlcMenu = useCallback(() => {
    setOhlcMenuOpen(prev => !prev);
  }, []);

  const handleToggleOhlcSector = useCallback((label: string) => {
    setExpandedOhlcSectorLabels(prev =>
      prev.includes(label) ? prev.filter(item => item !== label) : [...prev, label]
    );
  }, []);

  const handleToggleOhlcIndices = useCallback(() => {
    setOhlcIndicesExpanded(prev => !prev);
  }, []);

  const clearActiveOhlcBatch = useCallback(() => {
    ohlcCurrentJobIdRef.current = "";
    setActiveOhlcJob(null);
    setRecoveringOhlcJob(false);
    ohlcRecoveryStartedRef.current = false;
  }, []);

  const sendOhlcControl = useCallback(async (action: "pause" | "resume" | "stop") => {
    const jobId = ohlcCurrentJobIdRef.current;
    if (!jobId) {
      return;
    }
    await fetch(`/api/ohlc-job/${jobId}/control?action=${action}`, { method: "POST" });
  }, []);

  const waitForOhlcJob = useCallback(async (
    jobId: string,
    target: InstrumentOption,
    currentIndex: number,
    totalTargets: number
  ): Promise<OhlcJobStatus> => {
    for (;;) {
      const resp = await fetch(`/api/ohlc-job/${jobId}`);
      const payload = (await resp.json()) as OhlcJobStatus;
      if (!resp.ok) {
        throw new Error(payload?.message || "Failed to read progress.");
      }
      setOhlcProgress(payload);
      setOhlcControlState(payload.status === "paused" ? "paused" : ohlcPauseRequestedRef.current ? "paused" : "running");
      setOhlcStatus({
        kind: "loading",
        message: `Running ${currentIndex}/${totalTargets}: ${getInstrumentLabel(target)}`
      });
      if (payload.status === "completed") {
        return payload;
      }
      if (payload.status === "stopped") {
        throw new Error(payload.message || "Job stopped.");
      }
      if (payload.status === "error") {
        throw new Error(payload.message || `OHLC job failed for ${getInstrumentLabel(target)}.`);
      }
      await new Promise(resolve => window.setTimeout(resolve, 1000));
    }
  }, []);

  const runOhlcBatch = useCallback(async (initialBatch: ActiveOhlcJobState, resumeCurrentJob: boolean) => {
    let batch = initialBatch;
    let completedSelections = initialBatch.completedSelections;
    let storedRows = initialBatch.storedRows;
    let failedInstruments = initialBatch.failedInstruments;
    let skippedInstruments = initialBatch.skippedInstruments;
    const failures = [...initialBatch.failures];

    const updateBatchState = (updates: Partial<ActiveOhlcJobState>) => {
      batch = { ...batch, ...updates };
      setActiveOhlcJob(batch);
    };

    setOhlcProgress(null);
    setOhlcControlState("running");
    setOhlcStatus({
      kind: "loading",
      message: `Fetching candles for ${batch.totalTargets} selected underlying(s)...`
    });

    if (resumeCurrentJob && batch.jobId) {
      const currentTarget = batch.targets[batch.currentIndex - 1];
      if (!currentTarget) {
        clearActiveOhlcBatch();
        setOhlcControlState("idle");
        setOhlcStatus({ kind: "error", message: "Recovered batch state is invalid." });
        return;
      }
      ohlcCurrentJobIdRef.current = batch.jobId;
      try {
        const finalJob = await waitForOhlcJob(batch.jobId, currentTarget, batch.currentIndex, batch.totalTargets);
        completedSelections += 1;
        storedRows += finalJob.stored_rows ?? 0;
        failedInstruments += finalJob.failed_instruments ?? 0;
        skippedInstruments += finalJob.skipped_instruments ?? 0;
        updateBatchState({
          jobId: "",
          completedSelections,
          storedRows,
          failedInstruments,
          skippedInstruments
        });
      } catch (err) {
        if (ohlcStopRequestedRef.current) {
          clearActiveOhlcBatch();
          setOhlcProgress(null);
          setOhlcControlState("idle");
          setOhlcStatus({
            kind: "error",
            message: `Stopped after ${completedSelections}/${batch.totalTargets} selection(s). Stored rows so far: ${storedRows}.`
          });
          return;
        }
        if (isFatalOhlcAuthError(err)) {
          setOhlcProgress(null);
          setOhlcControlState("idle");
          clearActiveOhlcBatch();
          setOhlcStatus({
            kind: "error",
            message: "Stopped OHLC batch because the Upstox token is invalid or expired."
          });
          return;
        }
        failures.push(getInstrumentLabel(currentTarget));
        updateBatchState({ jobId: "", failures: [...failures] });
      } finally {
        ohlcCurrentJobIdRef.current = "";
      }
    }

    for (let index = batch.nextIndex; index < batch.targets.length; index += 1) {
      const target = batch.targets[index];
      while (ohlcPauseRequestedRef.current && !ohlcStopRequestedRef.current) {
        setOhlcStatus({
          kind: "loading",
          message: `Paused before ${index + 1}/${batch.totalTargets}: ${getInstrumentLabel(target)}`
        });
        await new Promise(resolve => window.setTimeout(resolve, 300));
      }
      if (ohlcStopRequestedRef.current) {
        break;
      }
      const params = new URLSearchParams({
        underlying_key: target.instrument_key,
        interval: batch.interval,
        from_date: batch.fromDate,
        to_date: batch.toDate,
        include_spot: String(batch.includeSpot),
        include_futures: String(batch.includeFutures),
        include_options: String(batch.includeOptions)
      });
      try {
        setOhlcStatus({
          kind: "loading",
          message: `Starting ${index + 1}/${batch.totalTargets}: ${getInstrumentLabel(target)}`
        });
        const resp = await fetch(`/download/expired-ohlcv?${params.toString()}`);
        const payload = (await resp.json()) as JobStartResponse;
        if (!resp.ok) {
          throw new Error(payload?.status || "OHLC request failed.");
        }
        ohlcCurrentJobIdRef.current = payload.job_id;
        updateBatchState({
          jobId: payload.job_id,
          currentIndex: index + 1,
          nextIndex: index + 1,
          targetLabel: getInstrumentLabel(target)
        });
        setRecoveringOhlcJob(false);
        const finalJob = await waitForOhlcJob(payload.job_id, target, index + 1, batch.totalTargets);
        completedSelections += 1;
        storedRows += finalJob.stored_rows ?? 0;
        failedInstruments += finalJob.failed_instruments ?? 0;
        skippedInstruments += finalJob.skipped_instruments ?? 0;
        updateBatchState({
          jobId: "",
          nextIndex: index + 1,
          completedSelections,
          storedRows,
          failedInstruments,
          skippedInstruments
        });
      } catch (err) {
        if (ohlcStopRequestedRef.current) {
          break;
        }
        if (isFatalOhlcAuthError(err)) {
          setOhlcProgress(null);
          setOhlcControlState("idle");
          clearActiveOhlcBatch();
          setOhlcStatus({
            kind: "error",
            message: "Stopped OHLC batch because the Upstox token is invalid or expired."
          });
          return;
        }
        failures.push(getInstrumentLabel(target));
        updateBatchState({
          jobId: "",
          nextIndex: index + 1,
          failures: [...failures]
        });
      } finally {
        ohlcCurrentJobIdRef.current = "";
      }
    }

    if (ohlcStopRequestedRef.current) {
      setOhlcProgress(null);
      setOhlcControlState("idle");
      clearActiveOhlcBatch();
      setOhlcStatus({
        kind: "error",
        message: `Stopped after ${completedSelections}/${batch.totalTargets} selection(s). Stored rows so far: ${storedRows}.`
      });
      return;
    }

    setOhlcProgress(null);
    setOhlcControlState("idle");
    clearActiveOhlcBatch();
    setOhlcStatus({
      kind: completedSelections === 0 ? "error" : "success",
      message: buildOhlcBatchMessage(
        completedSelections,
        batch.totalTargets,
        storedRows,
        failedInstruments,
        skippedInstruments,
        failures
      )
    });
  }, [clearActiveOhlcBatch, waitForOhlcJob]);

  useEffect(() => {
    if (!activeOhlcJob || !recoveringOhlcJob || ohlcRecoveryStartedRef.current) {
      return;
    }
    ohlcRecoveryStartedRef.current = true;
    ohlcStopRequestedRef.current = false;
    ohlcPauseRequestedRef.current = false;
    ohlcCurrentJobIdRef.current = activeOhlcJob.jobId;
    void runOhlcBatch(activeOhlcJob, true);
  }, [activeOhlcJob, recoveringOhlcJob, runOhlcBatch]);

  const handlePauseResumeOhlc = useCallback(async () => {
    if (ohlcControlState === "running") {
      ohlcPauseRequestedRef.current = true;
      setOhlcControlState("paused");
      await sendOhlcControl("pause");
      return;
    }
    if (ohlcControlState === "paused") {
      ohlcPauseRequestedRef.current = false;
      setOhlcControlState("running");
      await sendOhlcControl("resume");
    }
  }, [ohlcControlState, sendOhlcControl]);

  const handleStopOhlc = useCallback(async () => {
    ohlcStopRequestedRef.current = true;
    setOhlcControlState("stopping");
    await sendOhlcControl("stop");
  }, [sendOhlcControl]);

  const handleStoreSnapshot = useCallback(async () => {
    if (snapshotTargets.length === 0) {
      setSnapshotStatus({ kind: "error", message: "Select at least one stock or index before storing." });
      return;
    }
    let storedRows = 0;
    let completed = 0;
    const failures: string[] = [];
    setSnapshotStatus({
      kind: "loading",
      message: `Storing cached contracts for ${snapshotTargets.length} selected instrument(s)...`
    });
    for (const target of snapshotTargets) {
      setSnapshotStatus({
        kind: "loading",
        message: `Storing ${completed + 1}/${snapshotTargets.length}: ${getInstrumentLabel(target)}`
      });
      try {
        const resp = await fetch(`/download/expired-contracts/?instrument_key=${encodeURIComponent(target.instrument_key)}`);
        const payload = (await resp.json()) as StorageResponse;
        if (!resp.ok) {
          throw new Error(payload?.status || "Snapshot request failed.");
        }
        storedRows += payload.rows ?? 0;
        completed += 1;
      } catch (err) {
        failures.push(getInstrumentLabel(target));
      }
    }
    if (completed === 0) {
      setSnapshotStatus({
        kind: "error",
        message: failures.length > 0 ? `Failed for ${failures.join(", ")}.` : "Snapshot request failed."
      });
      return;
    }
    if (failures.length > 0) {
      setSnapshotStatus({
        kind: "success",
        message: `Stored ${storedRows} rows for ${completed}/${snapshotTargets.length} instruments. Failed: ${failures.slice(0, 5).join(", ")}${failures.length > 5 ? "..." : ""}`
      });
      return;
    }
    setSnapshotStatus({
      kind: "success",
      message: `Stored ${storedRows} rows for ${completed} instrument(s).`
    });
  }, [snapshotTargets]);

  const handleStoreOhlc = useCallback(async () => {
    if (ohlcTargets.length === 0 || !fromDate || !toDate) {
      setOhlcStatus({ kind: "error", message: "Pick one or more underlyings and fill from/to dates." });
      return;
    }
    if (!includeSpot && !includeFutures && !includeOptions) {
      setOhlcStatus({ kind: "error", message: "Select at least one fetch type: Stock, Futures, or Options." });
      return;
    }
    ohlcStopRequestedRef.current = false;
    ohlcPauseRequestedRef.current = false;
    ohlcCurrentJobIdRef.current = "";
    setRecoveringOhlcJob(false);
    ohlcRecoveryStartedRef.current = false;
    void runOhlcBatch(
      {
        jobId: "",
        currentIndex: 0,
        nextIndex: 0,
        totalTargets: ohlcTargets.length,
        targetLabel: "",
        targets: ohlcTargets,
        interval,
        fromDate,
        toDate,
        includeSpot,
        includeFutures,
        includeOptions,
        completedSelections: 0,
        storedRows: 0,
        failedInstruments: 0,
        skippedInstruments: 0,
        failures: []
      },
      false
    );
  }, [fromDate, includeFutures, includeOptions, includeSpot, interval, ohlcTargets, runOhlcBatch, toDate]);

  const commandActions = useMemo(
    () => [
      { id: "refresh", label: "Refresh backend terminal", hint: "Rerun log poll", handler: () => setTerminalRefreshTick(prev => prev + 1) },
      { id: "theme", label: theme === "dark" ? "Switch to light mode" : "Switch to dark mode", hint: "Toggle theme", handler: () => setTheme(prev => prev === "dark" ? "light" : "dark") },
      { id: "snapshot", label: isSnapshotCollapsed ? "Open snapshot card" : "Collapse snapshot card", hint: "Toggle storage module", handler: () => setIsSnapshotCollapsed(prev => !prev) },
      { id: "ohlc", label: isOhlcCollapsed ? "Open OHLC card" : "Collapse OHLC card", hint: "Toggle fetch module", handler: () => setIsOhlcCollapsed(prev => !prev) },
      { id: "start", label: "Start OHLC batch", hint: "Begin fetch", handler: () => handleStoreOhlc() }
    ],
    [handleStoreOhlc, isOhlcCollapsed, isSnapshotCollapsed, theme]
  );

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
    <div className="min-h-dvh bg-transparent text-foreground">
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute inset-x-0 top-0 h-[32rem] bg-[radial-gradient(circle_at_top,rgba(59,130,246,0.22),transparent_42%)]" />
        <div className="absolute inset-y-0 right-0 w-[28rem] bg-[radial-gradient(circle_at_center,rgba(34,211,238,0.12),transparent_46%)]" />
      </div>

      <header className={cn(
        "sticky top-0 z-30 backdrop-blur-xl",
        isDark ? "border-b border-white/10 bg-slate-950/70" : "border-b border-slate-200/80 bg-white/80"
      )}>
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-4">
          <div className="space-y-1">
            <div className={cn("text-[11px] font-semibold uppercase tracking-[0.3em]", isDark ? "text-cyan-300/80" : "text-cyan-700/80")}>Expired Contracts Manager</div>
            <div className="flex items-center gap-3">
              <h1 className={cn("text-xl font-semibold", isDark ? "text-white" : "text-slate-950")}>{headerTitle}</h1>
              <span className={cn(
                "inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold",
                connectionStatus === "Fetching"
                  ? "border-cyan-400/30 bg-cyan-400/10 text-cyan-200"
                  : connectionStatus === "Paused"
                    ? "border-amber-400/30 bg-amber-400/10 text-amber-200"
                    : "border-emerald-400/30 bg-emerald-400/10 text-emerald-200"
              )}>
                {connectionStatus}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <a
              href={headerLinkHref}
              className={cn(
                "hidden rounded-xl px-3 py-2 text-sm font-medium transition md:inline-flex",
                isDark ? "border border-white/10 bg-white/5 text-slate-200 hover:bg-white/10" : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-100"
              )}
            >
              {headerLinkLabel}
            </a>
            <button
              type="button"
              className={cn(
                "rounded-xl px-3 py-2 text-sm font-medium transition",
                isDark ? "border border-white/10 bg-white/5 text-slate-100 hover:bg-white/10" : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-100"
              )}
              onClick={() => setTerminalRefreshTick(prev => prev + 1)}
            >
              Refresh
            </button>
            <button
              type="button"
              className={cn(
                "rounded-xl px-3 py-2 text-sm font-medium transition",
                isDark ? "border border-white/10 bg-white/5 text-slate-100 hover:bg-white/10" : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-100"
              )}
              onClick={() => setTheme(prev => prev === "dark" ? "light" : "dark")}
            >
              {theme === "dark" ? "Light" : "Dark"}
            </button>
            <button
              type="button"
              className={cn(
                "rounded-xl px-3 py-2 text-sm font-medium transition",
                isDark ? "border border-white/10 bg-white/5 text-slate-100 hover:bg-white/10" : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-100"
              )}
              onClick={() => setSettingsOpen(prev => !prev)}
            >
              Settings
            </button>
          </div>
        </div>
      </header>

      <main className="relative mx-auto max-w-7xl space-y-8 px-6 py-8">
        {!isRangesView && !isRangeDetailView && (
          <>
            <section className={cn(
              "overflow-hidden rounded-[32px] p-8 backdrop-blur-xl",
              isDark
                ? "border border-white/10 bg-[linear-gradient(135deg,rgba(15,23,42,0.9),rgba(30,41,59,0.76))] shadow-[0_32px_120px_rgba(0,0,0,0.45)]"
                : "border border-slate-200/80 bg-[linear-gradient(135deg,rgba(255,255,255,0.94),rgba(239,246,255,0.96))] shadow-[0_32px_120px_rgba(148,163,184,0.20)]"
            )}>
              <div className="grid gap-8 lg:grid-cols-[1.35fr_0.9fr]">
                <div className="space-y-6">
                  <div className="space-y-3">
                    <div className={cn("text-[11px] font-semibold uppercase tracking-[0.3em]", isDark ? "text-cyan-300/80" : "text-cyan-700/80")}>Institutional Workflow</div>
                    <h2 className={cn("max-w-3xl text-4xl font-semibold leading-tight", isDark ? "text-white" : "text-slate-950")}>
                      Premium control surface for expired contracts, instrument storage, and historical OHLC recovery.
                    </h2>
                    <p className={cn("max-w-2xl text-sm leading-7", isDark ? "text-slate-300" : "text-slate-600")}>
                      Dark-first trading workspace with resilient batch recovery, grouped sector selection, live backend telemetry, and direct control over stock, futures, and options fetch scopes.
                    </p>
                  </div>

                  <div className="grid gap-4 md:grid-cols-3">
                    <MetricCard
                      label="Selected Scope"
                      value={snapshotTargets.length > 0 ? formatCompactCount(snapshotTargets.length) : "0"}
                      tone="primary"
                      theme={theme}
                      detail={snapshotSelectionMeta.title}
                    />
                    <MetricCard
                      label="Current Batch"
                      value={ohlcProgress ? `${ohlcProgress.completed}/${ohlcProgress.total}` : activeOhlcJob ? `${activeOhlcJob.currentIndex}/${activeOhlcJob.totalTargets}` : "Idle"}
                      tone={ohlcControlState === "running" ? "success" : "neutral"}
                      theme={theme}
                      detail={ohlcSelectionMeta.detail}
                    />
                    <MetricCard
                      label="Stored Rows"
                      value={formatCompactCount(activeOhlcJob?.storedRows ?? ohlcProgress?.stored_rows ?? 0)}
                      tone="neutral"
                      theme={theme}
                      detail="Recovered from live backend state"
                    />
                  </div>
                </div>

                <div className={cn(
                  "grid gap-4 rounded-[28px] p-5",
                  isDark ? "border border-white/10 bg-slate-950/45" : "border border-slate-200/80 bg-white/78"
                )}>
                  <div className="flex items-center justify-between">
                    <div>
                      <div className={cn("text-sm font-semibold", isDark ? "text-white" : "text-slate-950")}>Execution Radar</div>
                      <div className={cn("text-xs", isDark ? "text-slate-400" : "text-slate-500")}>Real-time operating summary</div>
                    </div>
                    <button
                      type="button"
                      className={cn(
                        "rounded-xl px-3 py-2 text-xs font-semibold uppercase tracking-[0.2em] transition",
                        isDark ? "border border-white/10 bg-white/5 text-slate-200 hover:bg-white/10" : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-100"
                      )}
                      onClick={() => setCommandPaletteOpen(true)}
                    >
                      Ctrl+K
                    </button>
                  </div>

                  <div className="space-y-3">
                    <div className={cn("flex items-center justify-between text-xs", isDark ? "text-slate-400" : "text-slate-500")}>
                      <span>Contract fetch progress</span>
                      <span className="tabular-nums">{progressPercent}%</span>
                    </div>
                    <div className={cn("h-2 overflow-hidden rounded-full", isDark ? "bg-white/8" : "bg-slate-200")}>
                      <div className="h-full rounded-full bg-gradient-to-r from-cyan-400 via-indigo-500 to-blue-500 transition-all duration-300" style={{ width: `${progressPercent}%` }} />
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <MetricCard label="Failed" value={String(ohlcProgress?.failed_instruments ?? activeOhlcJob?.failedInstruments ?? 0)} tone="danger" theme={theme} detail="Instrument-level failures" />
                      <MetricCard label="Skipped" value={String(ohlcProgress?.skipped_instruments ?? activeOhlcJob?.skippedInstruments ?? 0)} tone="neutral" theme={theme} detail="Cached / empty ranges" />
                      <MetricCard label="Mode" value={theme === "dark" ? "Dark" : "Light"} tone="primary" theme={theme} detail="Theme runtime toggle" />
                    </div>
                  </div>
                </div>
              </div>

              {settingsOpen && (
                <div className={cn(
                  "mt-6 grid gap-4 rounded-[24px] p-5 md:grid-cols-3",
                  isDark ? "border border-white/10 bg-slate-950/55" : "border border-slate-200/80 bg-white/82"
                )}>
                  <div>
                    <div className={cn("text-sm font-semibold", isDark ? "text-white" : "text-slate-950")}>Workspace mode</div>
                    <div className={cn("mt-1 text-xs", isDark ? "text-slate-400" : "text-slate-500")}>Dark-first glass terminal with optional light override.</div>
                  </div>
                  <button
                    type="button"
                    className={cn(
                      "rounded-2xl px-4 py-3 text-left text-sm transition",
                      isDark ? "border border-white/10 bg-white/5 text-slate-100 hover:bg-white/10" : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-100"
                    )}
                    onClick={() => setTerminalAutoscroll(prev => !prev)}
                  >
                    Terminal autoscroll: <span className="font-semibold">{terminalAutoscroll ? "On" : "Off"}</span>
                  </button>
                  <button
                    type="button"
                    className={cn(
                      "rounded-2xl px-4 py-3 text-left text-sm transition",
                      isDark ? "border border-white/10 bg-white/5 text-slate-100 hover:bg-white/10" : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-100"
                    )}
                    onClick={() => {
                      setToastItems([]);
                      setSettingsOpen(false);
                    }}
                  >
                    Clear local toasts
                  </button>
                </div>
              )}
            </section>
          </>
        )}
        {isRangesView ? (
          <DashboardCard
            eyebrow="Range Explorer"
            title="Stored Ranges"
            description="Inspect indexed OHLC ranges with fast filters, pagination, and direct drill-down into stored candles."
            collapsed={false}
            onToggle={() => undefined}
            theme={theme}
          >
            <div className="flex flex-col gap-4">
              <div className="space-y-1">
                <h2 className="text-xl font-semibold text-balance text-white">Stored ranges</h2>
                <p className="text-sm text-slate-300 text-pretty">
                  Filter by a single grouped menu or contract key to inspect stored OHLC ranges.
                </p>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <label className={formLabelClass}>
                  Underlying menu
                  <select
                    aria-label="Underlying menu"
                    className={inputClass}
                    value={rangeUnderlyingKey}
                    onChange={event => {
                      const value = event.target.value;
                      setRangeUnderlyingKey(value);
                      setRangeContractQuery("");
                    }}
                  >
                    <option value="">All sectors and F&amp;O groups</option>
                    {instrumentMenuGroups.map(group => (
                      <optgroup key={group.label} label={`${group.label} (${group.options.length})`}>
                        {group.options.map(option => (
                          <option key={option.instrument_key} value={option.instrument_key}>
                            {getInstrumentLabel(option)}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </label>
                <label className={formLabelClass}>
                  Contract key filter
                  <input
                    aria-label="Contract key filter"
                    className={inputClass}
                    value={rangeContractQuery}
                    onChange={event => {
                      const value = event.target.value;
                      setRangeContractQuery(value);
                      if (value.trim().length > 0) {
                        setRangeUnderlyingKey("");
                      }
                    }}
                    placeholder="NSE_FO|12345|30-12-2025"
                  />
                </label>
              </div>
              {rangeUnderlyingKey && (
                <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/8 px-4 py-3 text-sm text-slate-300">
                  Showing ranges for underlying:{" "}
                  <span className="font-medium text-white">
                    {selectedRangeUnderlying ? getInstrumentLabel(selectedRangeUnderlying) : rangeUnderlyingKey}
                  </span>
                </div>
              )}
              {indexStatus.kind === "error" && (
                <div className={cn("rounded-2xl border px-4 py-3 text-sm", statusTone(indexStatus))}>
                  {indexStatus.message}
                </div>
              )}
            <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-400">
              <div>
                Showing{" "}
                <span className="font-medium text-white">
                  {rangesStart}-{rangesEnd}
                </span>{" "}
                of{" "}
                <span className="font-medium text-white">
                  {rangesTotal}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-slate-100 transition hover:bg-white/10 disabled:opacity-50"
                  onClick={() => setRangesOffset(prev => Math.max(0, prev - rangesLimit))}
                  disabled={!hasRangesPrev}
                >
                  Prev
                </button>
                <button
                  type="button"
                  className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-slate-100 transition hover:bg-white/10 disabled:opacity-50"
                  onClick={() => setRangesOffset(prev => (hasRangesNext ? prev + rangesLimit : prev))}
                  disabled={!hasRangesNext}
                >
                  Next
                </button>
              </div>
            </div>
            <div className={cn("overflow-auto rounded-[24px]", neutralSurfaceClass)}>
              <table className="w-full text-left text-sm">
                <thead className="bg-white/5 text-xs uppercase text-slate-400">
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
                    <tr className="bg-transparent text-[11px] font-normal text-slate-500">
                      <th className="px-3 py-2">
                        <input
                          aria-label="Filter underlying"
                          className="h-9 w-full rounded-xl border border-white/10 bg-slate-950/70 px-3 text-xs text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          value={filterUnderlying}
                          onChange={event => setFilterUnderlying(event.target.value)}
                          placeholder="Filter"
                        />
                      </th>
                      <th className="px-3 py-2">
                        <input
                          aria-label="Filter instrument"
                          className="h-9 w-full rounded-xl border border-white/10 bg-slate-950/70 px-3 text-xs text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          value={filterInstrument}
                          onChange={event => setFilterInstrument(event.target.value)}
                          placeholder="Filter"
                        />
                      </th>
                      <th className="px-3 py-2">
                        <select
                          aria-label="Filter option type"
                          className="h-9 w-full rounded-xl border border-white/10 bg-slate-950/70 px-3 text-xs text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
                          className="h-9 w-full rounded-xl border border-white/10 bg-slate-950/70 px-3 text-xs text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          value={filterStrike}
                          onChange={event => setFilterStrike(event.target.value)}
                          placeholder="Filter"
                        />
                      </th>
                      <th className="px-3 py-2">
                        <select
                          aria-label="Filter interval"
                          className="h-9 w-full rounded-xl border border-white/10 bg-slate-950/70 px-3 text-xs text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
                          className="h-9 w-full rounded-xl border border-white/10 bg-slate-950/70 px-3 text-xs text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          type="date"
                          value={filterFromDate}
                          onChange={event => setFilterFromDate(event.target.value)}
                        />
                      </th>
                      <th className="px-3 py-2">
                        <input
                          aria-label="Filter to date"
                          className="h-9 w-full rounded-xl border border-white/10 bg-slate-950/70 px-3 text-xs text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          type="date"
                          value={filterToDate}
                          onChange={event => setFilterToDate(event.target.value)}
                        />
                      </th>
                      <th className="px-3 py-2">
                        <input
                          aria-label="Filter minimum rows"
                          className="h-9 w-full rounded-xl border border-white/10 bg-slate-950/70 px-3 text-xs text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          value={filterMinRows}
                          onChange={event => setFilterMinRows(event.target.value)}
                          placeholder="Min"
                          inputMode="numeric"
                        />
                      </th>
                      <th className="px-3 py-2">
                        <input
                          aria-label="Filter updated after"
                          className="h-9 w-full rounded-xl border border-white/10 bg-slate-950/70 px-3 text-xs text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
                        <td colSpan={10} className="px-3 py-8 text-center text-slate-500">
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
                          <tr key={`${row.instrument_key}-${idx}`} className="border-t border-white/10 text-slate-200">
                            <td className="px-3 py-2">
                              <a className="block hover:text-white hover:underline" href={rowHref}>
                                {row.underlying_key || "—"}
                              </a>
                            </td>
                            <td className="px-3 py-2 font-medium">
                              <a className="block hover:text-white hover:underline" href={rowHref}>
                                {row.instrument_key}
                              </a>
                            </td>
                            <td className="px-3 py-2">
                              <a className="block hover:text-white hover:underline" href={rowHref}>
                                {row.option_type ?? "—"}
                              </a>
                            </td>
                            <td className="px-3 py-2 tabular-nums">
                              <a className="block hover:text-white hover:underline" href={rowHref}>
                                {row.strike_price ?? "—"}
                              </a>
                            </td>
                            <td className="px-3 py-2">
                              <a className="block hover:text-white hover:underline" href={rowHref}>
                                {row.interval}
                              </a>
                            </td>
                            <td className="px-3 py-2 tabular-nums">
                              <a className="block hover:text-white hover:underline" href={rowHref}>
                                {row.from_date}
                              </a>
                            </td>
                            <td className="px-3 py-2 tabular-nums">
                              <a className="block hover:text-white hover:underline" href={rowHref}>
                                {row.to_date}
                              </a>
                            </td>
                            <td className="px-3 py-2 tabular-nums">
                              <a className="block hover:text-white hover:underline" href={rowHref}>
                                {row.rows}
                              </a>
                            </td>
                          <td className="px-3 py-2 tabular-nums">
                            <a className="block hover:text-white hover:underline" href={rowHref}>
                              {row.updated_at}
                            </a>
                          </td>
                          <td className="px-3 py-2">
                            <a className="text-sm font-medium text-cyan-300 hover:text-cyan-200 hover:underline" href={rowHref}>
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
          </DashboardCard>
        ) : isRangeDetailView ? (
        <DashboardCard
          eyebrow="Detail View"
          title="OHLC Range Detail"
          description="Review charted candles and raw OHLC rows for the selected stored contract range."
          collapsed={false}
          onToggle={() => undefined}
          theme={theme}
        >
          <div className="flex flex-col gap-4">
            <div className="space-y-1">
              <h2 className="text-xl font-semibold text-balance text-white">Range detail</h2>
              <p className="text-sm text-slate-300 text-pretty">
                Review stored OHLC rows for the selected instrument and range.
              </p>
            </div>

            <div className={cn("rounded-[24px] px-4 py-4 text-sm", isDark ? "border border-white/10 bg-slate-950/55 text-slate-300" : "border border-slate-200 bg-white/92 text-slate-600 shadow-sm")}>
              <div className="flex flex-wrap gap-4">
                <div>
                  Instrument:{" "}
                  <span className={cn("font-medium", isDark ? "text-white" : "text-slate-950")}>{rangeDetailParams.instrumentKey || "—"}</span>
                </div>
                <div>
                  Interval:{" "}
                  <span className={cn("font-medium", isDark ? "text-white" : "text-slate-950")}>{rangeDetailParams.interval || "—"}</span>
                </div>
                <div>
                  From:{" "}
                  <span className={cn("font-medium", isDark ? "text-white" : "text-slate-950")}>{rangeDetailParams.fromDate || "—"}</span>
                </div>
                <div>
                  To:{" "}
                  <span className={cn("font-medium", isDark ? "text-white" : "text-slate-950")}>{rangeDetailParams.toDate || "—"}</span>
                </div>
              </div>
            </div>


            <div className={cn("rounded-[24px] p-4", isDark ? "border border-white/10 bg-slate-950/55" : "border border-slate-200 bg-white/92 shadow-sm")}>
              <div className={cn("mb-3 text-sm font-medium", isDark ? "text-slate-300" : "text-slate-700")}>OHLC chart</div>
              <div className="h-[320px] w-full" ref={chartContainerRef} />
              {detailRows.length === 0 && (
                <div className={cn("pt-3 text-sm", isDark ? "text-slate-500" : "text-slate-500")}>No candle data to plot yet.</div>
              )}
            </div>

            {detailStatus.kind === "error" && (
              <div className={cn("rounded-2xl border px-4 py-3 text-sm", statusTone(detailStatus))}>
                {detailStatus.message}{" "}
                <a className="font-medium text-cyan-300 hover:underline" href="/ranges">
                  Back to ranges
                </a>
              </div>
            )}

            <div className={cn("overflow-auto rounded-[24px]", neutralSurfaceClass)}>
              <table className="w-full text-left text-sm tabular-nums">
                <thead className="bg-white/5 text-xs uppercase text-slate-400">
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
                      <td colSpan={6} className="px-3 py-8 text-center text-slate-500">
                        {detailStatus.kind === "loading" ? (
                          "Loading..."
                        ) : (
                          <>
                            No rows found.{" "}
                            <a className="font-medium text-cyan-300 hover:underline" href="/ranges">
                              Back to ranges
                            </a>
                          </>
                        )}
                      </td>
                    </tr>
                  ) : (
                    detailRows.map((row, idx) => (
                      <tr key={`${row.ts}-${idx}`} className="border-t border-white/10 text-slate-200">
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
              <div className="text-sm text-slate-400 tabular-nums">
                {detailTotal > 0
                  ? `Showing ${detailOffset + 1}-${Math.min(detailOffset + detailRows.length, detailTotal)} of ${detailTotal}`
                  : "No rows to display yet."}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="h-10 rounded-xl border border-white/10 bg-white/5 px-4 text-sm font-medium text-slate-100 transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                  onClick={handlePrevDetailPage}
                  disabled={detailOffset === 0}
                >
                  Previous
                </button>
                <button
                  type="button"
                  className="h-10 rounded-xl border border-white/10 bg-white/5 px-4 text-sm font-medium text-slate-100 transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                  onClick={handleNextDetailPage}
                  disabled={detailOffset + detailLimit >= detailTotal}
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        </DashboardCard>
        ) : (
          <DashboardCard
            eyebrow="Storage Module"
            title="Store Cached Snapshot"
            description="Queue a single instrument, sector-complete basket, all F&O stocks, all indices, or the full tradable universe into cached contract storage."
            collapsed={isSnapshotCollapsed}
            onToggle={() => setIsSnapshotCollapsed(prev => !prev)}
            theme={theme}
          >
            <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
              <div className="space-y-4">
                <label className={formLabelClass}>
                  Search scope
                  <input
                    aria-label="Search snapshot scope"
                    className={inputClass}
                    value={query}
                    onChange={handleQueryChange}
                    placeholder="Search sector, symbol, instrument key"
                  />
                </label>

                {query.trim().length > 0 && options.length > 0 && (
                  <div className={quickPanelClass}>
                    <div className={quickPanelHeadingClass}>Quick matches</div>
                    <div className="grid gap-1">
                      {options.slice(0, 6).map(option => (
                        <button
                          key={option.instrument_key}
                          type="button"
                          className={quickPanelItemClass}
                          onClick={() => handleSelectOption(option)}
                        >
                          {getInstrumentLabel(option)}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="relative" ref={snapshotMenuRef}>
                  <button
                    type="button"
                    aria-haspopup="dialog"
                    aria-expanded={snapshotMenuOpen}
                    className={selectorButtonClass}
                    onClick={handleToggleSnapshotMenu}
                  >
                    <div className="min-w-0">
                      <div className={selectorTitleClass}>{snapshotSelectionMeta.title}</div>
                      <div className={selectorDetailClass}>{snapshotSelectionMeta.detail}</div>
                    </div>
                    <span className={selectorBadgeClass}>
                      {snapshotMenuOpen ? "Hide Menu" : "Open Menu"}
                    </span>
                  </button>
                  {snapshotMenuOpen && (
                    <div className={menuPopoverClass}>
                      <div className="max-h-[34rem] space-y-4 overflow-auto p-4">
                        <div className="space-y-2">
                          <div className={menuSectionHeadingClass}>Complete Options</div>
                          <div className="grid gap-2">
                            {completeSnapshotOptions.map(option => (
                              <button
                                key={option.value}
                                type="button"
                                className={getMenuOptionClass(snapshotSelection === option.value)}
                                onClick={() => handleSelectSnapshotSelection(option.value)}
                              >
                                {option.label}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="space-y-3">
                          <div className={menuSectionHeadingClass}>Sector Complete Options</div>
                          {filteredSnapshotSectors.map(group => {
                            const isExpanded = expandedSectorLabels.includes(group.label);
                            const sectorValue = getSectorScopeValue(group.label);
                            return (
                              <div key={group.label} className={getMenuGroupClass()}>
                                <div className={getMenuGroupHeaderClass()}>
                                  <button
                                    type="button"
                                    className={getMenuGroupToggleClass()}
                                    onClick={() => handleToggleSector(group.label)}
                                  >
                                    <span>{group.label}</span>
                                    <span className="text-xs text-slate-400">{isExpanded ? "▲" : "▼"}</span>
                                  </button>
                                  <button
                                    type="button"
                                    className={cn(
                                      getMenuGroupActionClass(snapshotSelection === sectorValue)
                                    )}
                                    onClick={() => handleSelectSnapshotSelection(sectorValue)}
                                  >
                                    Sector Complete
                                  </button>
                                </div>
                                {isExpanded && (
                                  <div className="max-h-56 space-y-1 overflow-auto p-2">
                                    {group.options.map(option => (
                                      <button
                                        key={option.instrument_key}
                                        type="button"
                                          className={getMenuLeafClass(snapshotSelection === option.instrument_key)}
                                        onClick={() => handleSelectSnapshotSelection(option.instrument_key)}
                                      >
                                        {getInstrumentLabel(option)}
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>

                        <div className="space-y-3">
                          <div className={menuSectionHeadingClass}>F&O Indices</div>
                          <div className={getMenuGroupClass()}>
                            <div className={getMenuGroupHeaderClass()}>
                              <button
                                type="button"
                                className={getMenuGroupToggleClass()}
                                onClick={handleToggleIndices}
                              >
                                <span>Index basket</span>
                                <span className="text-xs text-slate-400">{indicesExpanded ? "▲" : "▼"}</span>
                              </button>
                              <button
                                type="button"
                                className={cn(
                                  getMenuGroupActionClass(snapshotSelection === `${SNAPSHOT_SCOPE_PREFIX}indices`)
                                )}
                                onClick={() => handleSelectSnapshotSelection(`${SNAPSHOT_SCOPE_PREFIX}indices`)}
                              >
                                Indices Complete
                              </button>
                            </div>
                            {indicesExpanded && (
                              <div className="max-h-56 space-y-1 overflow-auto p-2">
                                {filteredIndexSnapshotOptions.map(option => (
                                  <button
                                    key={option.value}
                                    type="button"
                                    className={getMenuLeafClass(snapshotSelection === option.value)}
                                    onClick={() => handleSelectSnapshotSelection(option.value)}
                                  >
                                    {option.label.trim()}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-4">
                <div className={softInfoPanelClass}>
                  <div className={cn("text-[11px] font-semibold uppercase tracking-[0.24em]", isDark ? "text-cyan-200" : "text-cyan-800")}>Selected Scope</div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <span className={cn("rounded-full border px-3 py-1 text-xs font-semibold", isDark ? "border-white/10 bg-white/8 text-white" : "border-slate-300 bg-white text-slate-900")}>
                      {snapshotSelectionMeta.title}
                    </span>
                    {snapshotTargets.length > 0 && (
                      <span className={cn("rounded-full border px-3 py-1 text-xs font-semibold", isDark ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-200" : "border-emerald-300 bg-emerald-50 text-emerald-800")}>
                        {snapshotTargets.length} instrument{snapshotTargets.length === 1 ? "" : "s"}
                      </span>
                    )}
                  </div>
                  <p className={cn("mt-3 text-sm leading-6", isDark ? "text-slate-300" : "text-slate-600")}>{summary}</p>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <MetricCard label="Mode" value={snapshotTargets.length > 1 ? "Batch" : snapshotTargets.length === 1 ? "Single" : "Waiting"} tone="primary" theme={theme} detail="Execution strategy" />
                  <MetricCard label="Universe" value={formatCompactCount(instrumentCache.length)} tone="neutral" theme={theme} detail="Cached instruments loaded" />
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    className="inline-flex h-12 items-center justify-center rounded-2xl bg-gradient-to-r from-indigo-500 via-blue-500 to-cyan-400 px-6 text-sm font-semibold text-white shadow-[0_14px_40px_rgba(59,130,246,0.35)] transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60"
                    onClick={handleStoreSnapshot}
                    disabled={snapshotStatus.kind === "loading"}
                  >
                    {snapshotStatus.kind === "loading" ? "Storing..." : "Store Contracts"}
                  </button>
                  <button
                    type="button"
                    className={primaryGhostButtonClass}
                    onClick={() => setSnapshotMenuOpen(prev => !prev)}
                  >
                    {snapshotMenuOpen ? "Close Selector" : "Open Selector"}
                  </button>
                </div>

                {snapshotStatus.kind !== "idle" && (
                  <div className={cn("rounded-2xl border px-4 py-3 text-sm leading-6 tabular-nums", statusTone(snapshotStatus))} role={snapshotStatus.kind === "error" ? "alert" : "status"}>
                    {snapshotStatus.message}
                  </div>
                )}
              </div>
            </div>
          </DashboardCard>
        )}

        {!isRangesView && !isRangeDetailView && (
        <DashboardCard
          eyebrow="Execution Module"
          title="Fetch OHLC Data"
          description="Run resilient multi-underlying historical fetches with live progress, pause and stop controls, and filtered backend telemetry."
          collapsed={isOhlcCollapsed}
          onToggle={() => setIsOhlcCollapsed(prev => !prev)}
          theme={theme}
        >
          <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
            <div className="space-y-5">
              <div className="grid gap-4 md:grid-cols-2">
                <label className={cn(formLabelClass, "md:col-span-2")}>
                  Search underlying
                  <input
                    aria-label="Search OHLC underlying"
                    className={inputClass}
                    value={ohlcQuery}
                    onChange={event => setOhlcQuery(event.target.value)}
                    placeholder="Search sector, symbol, instrument key"
                  />
                </label>
                {ohlcQuery.trim().length > 0 && ohlcUnderlyings.length > 0 && (
                  <div className={cn(quickPanelClass, "md:col-span-2")}>
                    <div className={quickPanelHeadingClass}>Quick matches</div>
                    <div className="grid gap-1">
                      {ohlcUnderlyings.slice(0, 6).map(option => (
                        <button
                          key={option.instrument_key}
                          type="button"
                          className={quickPanelItemClass}
                          onClick={() => handleSelectUnderlying(option)}
                        >
                          {getInstrumentLabel(option)}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              <label className={cn(formLabelClass, "md:col-span-2")}>
                Underlying menu
                <div className="relative" ref={ohlcMenuRef}>
                  <button
                    type="button"
                    aria-haspopup="dialog"
                    aria-expanded={ohlcMenuOpen}
                    className={selectorButtonClass}
                    onClick={handleToggleOhlcMenu}
                  >
                    <div className="min-w-0">
                      <div className={selectorTitleClass}>{ohlcSelectionMeta.title}</div>
                      <div className={selectorDetailClass}>{ohlcSelectionMeta.detail}</div>
                    </div>
                    <span className={selectorBadgeClass}>
                      {ohlcMenuOpen ? "Hide Menu" : "Open Menu"}
                    </span>
                  </button>
                  {ohlcMenuOpen && (
                    <div className={menuPopoverClass}>
                      <div className="max-h-[34rem] space-y-4 overflow-auto p-4">
                        <div className="space-y-2">
                          <div className={menuSectionHeadingClass}>Complete Options</div>
                          <div className="grid gap-2">
                            {completeSnapshotOptions.map(option => (
                              <button
                                key={option.value}
                                type="button"
                                className={getMenuOptionClass(ohlcSelection === option.value)}
                                onClick={() => handleSelectOhlcSelection(option.value)}
                              >
                                {option.label}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="space-y-3">
                          <div className={menuSectionHeadingClass}>Sector Complete Options</div>
                          <div className="space-y-2">
                            {filteredOhlcSectors.map(group => {
                              const isExpanded = expandedOhlcSectorLabels.includes(group.label);
                              const sectorValue = getSectorScopeValue(group.label);
                              return (
                                <div key={group.label} className={getMenuGroupClass()}>
                                  <div className={getMenuGroupHeaderClass()}>
                                    <button
                                      type="button"
                                      className={getMenuGroupToggleClass()}
                                      onClick={() => handleToggleOhlcSector(group.label)}
                                    >
                                      <span>{group.label}</span>
                                      <span className={cn("text-xs", isDark ? "text-slate-400" : "text-slate-500")}>{isExpanded ? "▲" : "▼"}</span>
                                    </button>
                                    <button
                                      type="button"
                                      className={getMenuGroupActionClass(ohlcSelection === sectorValue)}
                                      onClick={() => handleSelectOhlcSelection(sectorValue)}
                                    >
                                      Sector Complete
                                    </button>
                                  </div>
                                  {isExpanded && (
                                    <div className="max-h-56 space-y-1 overflow-auto p-2">
                                      {group.options.map(option => (
                                        <button
                                          key={option.instrument_key}
                                          type="button"
                                          className={getMenuLeafClass(ohlcSelection === option.instrument_key)}
                                          onClick={() => handleSelectOhlcSelection(option.instrument_key)}
                                        >
                                          {getInstrumentLabel(option)}
                                        </button>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        <div className="space-y-3">
                          <div className={menuSectionHeadingClass}>F&amp;O Indices</div>
                          <div className={getMenuGroupClass()}>
                            <div className={getMenuGroupHeaderClass()}>
                              <button
                                type="button"
                                className={getMenuGroupToggleClass()}
                                onClick={handleToggleOhlcIndices}
                              >
                                <span>Index basket</span>
                                <span className={cn("text-xs", isDark ? "text-slate-400" : "text-slate-500")}>{ohlcIndicesExpanded ? "▲" : "▼"}</span>
                              </button>
                              <button
                                type="button"
                                className={getMenuGroupActionClass(ohlcSelection === `${SNAPSHOT_SCOPE_PREFIX}indices`)}
                                onClick={() => handleSelectOhlcSelection(`${SNAPSHOT_SCOPE_PREFIX}indices`)}
                              >
                                Indices Complete
                              </button>
                            </div>
                            {ohlcIndicesExpanded && (
                              <div className="max-h-56 space-y-1 overflow-auto p-2">
                                {filteredIndexOhlcOptions.map(option => (
                                  <button
                                    key={option.value}
                                    type="button"
                                    className={getMenuLeafClass(ohlcSelection === option.value)}
                                    onClick={() => handleSelectOhlcSelection(option.value)}
                                  >
                                    {option.label.trim()}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </label>
              <div className={formLabelClass}>
                Selected underlying
                <div
                  className={cn(
                    "min-h-14 w-full rounded-[22px] border px-4 py-3 text-sm",
                    ohlcSelectionMeta.tone === "highlight"
                      ? isDark
                        ? "border-cyan-400/40 bg-cyan-400/10 text-white"
                        : "border-cyan-300 bg-cyan-50 text-cyan-700"
                      : isDark
                        ? "border-white/10 bg-slate-950/55 text-slate-400"
                        : "border-slate-200 bg-white text-slate-600 shadow-sm"
                  )}
                >
                  <div className={cn("font-medium", isDark ? "text-white" : "text-slate-950")}>{ohlcSelectionMeta.title}</div>
                  <div className="text-xs">{ohlcSelectionMeta.detail}</div>
                </div>
              </div>
              <label className={formLabelClass}>
                Interval
                <div className={cn(segmentedSurfaceClass, "grid-cols-3 md:grid-cols-6")}>
                  {[
                    ["1minute", "1m"],
                    ["5minute", "5m"],
                    ["15minute", "15m"],
                    ["30minute", "30m"],
                    ["60minute", "1h"],
                    ["day", "1D"]
                  ].map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      className={segmentedButtonClass(interval === value)}
                      onClick={() => setInterval(value)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </label>
              <label className={formLabelClass}>
                From date
                <input
                  aria-label="From date"
                  className={inputClass}
                  type="date"
                  value={fromDate}
                  onChange={event => setFromDate(event.target.value)}
                />
              </label>
              <label className={formLabelClass}>
                To date
                <input
                  aria-label="To date"
                  className={inputClass}
                  type="date"
                  value={toDate}
                  onChange={event => setToDate(event.target.value)}
                />
              </label>
              <div className={cn(formLabelClass, "md:col-span-2")}>
                Fetch selection
                <div className={cn(segmentedSurfaceClass, "gap-3 p-3 md:grid-cols-3")}>
                  {[
                    { key: "spot", label: "Stock", active: includeSpot, toggle: () => setIncludeSpot(prev => !prev) },
                    { key: "futures", label: "Futures", active: includeFutures, toggle: () => setIncludeFutures(prev => !prev) },
                    { key: "options", label: "Options", active: includeOptions, toggle: () => setIncludeOptions(prev => !prev) }
                  ].map(item => (
                    <button
                      key={item.key}
                      type="button"
                      className={toggleChipClass(item.active)}
                      onClick={item.toggle}
                      aria-pressed={item.active}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <MetricCard label="Selection" value={ohlcTargets.length > 1 ? `${ohlcTargets.length}` : ohlcTargets.length === 1 ? "1" : "0"} tone="primary" theme={theme} detail={ohlcSelectionMeta.title} />
              <MetricCard label="Control" value={ohlcControlState === "idle" ? "Standby" : ohlcControlState.toUpperCase()} tone={ohlcControlState === "running" ? "success" : ohlcControlState === "stopping" ? "danger" : "neutral"} theme={theme} detail="Batch controller" />
              <MetricCard label="Rows Stored" value={formatCompactCount(ohlcProgress?.stored_rows ?? activeOhlcJob?.storedRows ?? 0)} tone="neutral" theme={theme} detail="Live cumulative rows" />
            </div>

            <div className="flex flex-col gap-3 md:flex-row md:items-center">
              <button
                type="button"
                className="inline-flex h-12 items-center justify-center rounded-2xl bg-gradient-to-r from-indigo-500 via-blue-500 to-cyan-400 px-6 text-sm font-semibold text-white shadow-[0_14px_40px_rgba(59,130,246,0.35)] transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60"
                onClick={handleStoreOhlc}
                disabled={ohlcControlState !== "idle"}
              >
                {ohlcControlState === "idle" ? "Start Fetch" : "Running"}
              </button>
              <button
                type="button"
                className={secondaryActionClass}
                onClick={handlePauseResumeOhlc}
                disabled={ohlcControlState === "idle" || ohlcControlState === "stopping"}
              >
                {ohlcControlState === "paused" ? "Resume" : "Pause"}
              </button>
              <button
                type="button"
                className={dangerActionClass}
                onClick={handleStopOhlc}
                disabled={ohlcControlState === "idle" || ohlcControlState === "stopping"}
              >
                {ohlcControlState === "stopping" ? "Stopping..." : "Stop"}
              </button>
              {ohlcStatus.kind === "loading" && ohlcProgress && (
                <div className="flex-1 space-y-2">
                  <div className={cn("flex items-center justify-between text-xs", isDark ? "text-slate-400" : "text-slate-500")}>
                    <span>{ohlcProgress.message || "Fetching candles..."}</span>
                    <span>{ohlcProgress.completed}/{ohlcProgress.total}</span>
                  </div>
                  <div
                    className={cn("h-2 w-full rounded-full", isDark ? "bg-white/8" : "bg-slate-200")}
                    role="progressbar"
                    aria-valuenow={progressPercent}
                    aria-valuemin={0}
                    aria-valuemax={100}
                  >
                    <div
                      className="h-2 rounded-full bg-gradient-to-r from-cyan-400 via-indigo-500 to-blue-500 transition-all"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                </div>
              )}
              {ohlcStatus.kind !== "idle" && (
                <div
                  className={cn("flex-1 rounded-2xl border px-4 py-3 text-sm text-pretty tabular-nums", statusTone(ohlcStatus))}
                  role={ohlcStatus.kind === "error" ? "alert" : "status"}
                >
                  {ohlcStatus.message}
                </div>
              )}
            </div>

            {ohlcProgress?.failure_samples && ohlcProgress.failure_samples.length > 0 && (
              <div className="rounded-[24px] border border-rose-400/20 bg-rose-500/8 p-4 text-xs text-rose-100">
                <div className="text-sm font-semibold text-rose-100">Recent failures</div>
                <ul className="mt-2 space-y-1">
                  {ohlcProgress.failure_samples.map(sample => (
                    <li key={`${sample.instrument_key}-${sample.detail}`} className="break-words">
                      <span className="font-semibold">{sample.instrument_key}</span>
                      <span className="text-rose-100/70"> — {sample.detail}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            </div>
            <div className="space-y-5">
              <div className={neutralSurfaceClass}>
                <div className="flex items-center justify-between">
                  <div>
                    <div className={cn("text-[11px] font-semibold uppercase tracking-[0.24em]", isDark ? "text-cyan-300/80" : "text-cyan-700")}>Live Progress</div>
                    <div className={cn("mt-1 text-sm font-semibold", isDark ? "text-white" : "text-slate-950")}>{ohlcSelectionMeta.title}</div>
                  </div>
                  <span className={subtleBadgeClass}>
                    {ohlcProgress ? `${ohlcProgress.completed}/${ohlcProgress.total}` : activeOhlcJob ? `${activeOhlcJob.currentIndex}/${activeOhlcJob.totalTargets}` : "Idle"}
                  </span>
                </div>
                <div className="mt-4 space-y-2">
                  <div className={cn("flex items-center justify-between text-xs", isDark ? "text-slate-400" : "text-slate-500")}>
                    <span>{ohlcProgress?.message || "Awaiting batch start"}</span>
                    <span className="tabular-nums">{progressPercent}%</span>
                  </div>
                  <div className={cn("h-2 overflow-hidden rounded-full", isDark ? "bg-white/8" : "bg-slate-200")}>
                    <div className="h-full rounded-full bg-gradient-to-r from-cyan-400 via-indigo-500 to-blue-500 transition-all duration-300" style={{ width: `${progressPercent}%` }} />
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-3 gap-3">
                  <MetricCard label="Processed" value={String(ohlcProgress?.completed ?? activeOhlcJob?.completedSelections ?? 0)} tone="success" theme={theme} detail="Completed" />
                  <MetricCard label="Failed" value={String(ohlcProgress?.failed_instruments ?? activeOhlcJob?.failedInstruments ?? 0)} tone="danger" theme={theme} detail="Failures" />
                  <MetricCard label="Skipped" value={String(ohlcProgress?.skipped_instruments ?? activeOhlcJob?.skippedInstruments ?? 0)} tone="neutral" theme={theme} detail="Skipped" />
                </div>
              </div>

              <div className={terminalPanelClass}>
                <div className={cn("flex flex-wrap items-center justify-between gap-3 px-4 py-4", terminalHeaderBorderClass)}>
                  <div>
                    <div className={cn("text-sm font-semibold", isDark ? "text-white" : "text-slate-950")}>Backend terminal</div>
                    <div className={cn("text-xs", isDark ? "text-slate-400" : "text-slate-500")}>Live OHLC backend log output</div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {(["all", "errors", "success", "info"] as TerminalFilter[]).map(filter => (
                      <button
                        key={filter}
                        type="button"
                        className={terminalFilterButton(terminalFilter === filter)}
                        onClick={() => setTerminalFilter(filter)}
                      >
                        {filter}
                      </button>
                    ))}
                    <button
                      type="button"
                      className={terminalFilterButton(false)}
                      onClick={() => setTerminalAutoscroll(prev => !prev)}
                    >
                      Scroll {terminalAutoscroll ? "On" : "Off"}
                    </button>
                    <button
                      type="button"
                      className={terminalFilterButton(false)}
                      onClick={async () => {
                        await navigator.clipboard.writeText(filteredOhlcLogLines.join("\n"));
                      }}
                    >
                      Copy
                    </button>
                    <button
                      type="button"
                      className={terminalFilterButton(false)}
                      onClick={() => setOhlcLogLines([])}
                    >
                      Clear
                    </button>
                  </div>
                </div>
                <div
                  ref={ohlcLogContainerRef}
                  className="h-72 overflow-auto px-4 py-3 font-mono text-xs leading-6"
                  onScroll={event => {
                    const element = event.currentTarget;
                    const distanceFromBottom = element.scrollHeight - element.scrollTop - element.clientHeight;
                    ohlcLogStickToBottomRef.current = distanceFromBottom < 24;
                  }}
                >
                  {filteredOhlcLogLines.length === 0 ? (
                    <div className={cn("rounded-2xl border border-dashed px-4 py-6 text-center", isDark ? "border-white/10 bg-white/5 text-slate-500" : "border-slate-200 bg-slate-50 text-slate-500")}>
                      No backend log lines for the active filter.
                    </div>
                  ) : (
                    filteredOhlcLogLines.map((line, index) => {
                      const tone = classifyLogLine(line);
                      return (
                        <div
                          key={`${index}-${line}`}
                          className={cn(
                            "mb-1 rounded-xl border px-3 py-2 whitespace-pre-wrap break-words",
                            tone === "error"
                              ? isDark
                                ? "border-rose-400/20 bg-rose-500/8 text-rose-100"
                                : "border-rose-200 bg-rose-50 text-rose-800"
                              : tone === "success"
                                ? isDark
                                  ? "border-emerald-400/20 bg-emerald-500/8 text-emerald-100"
                                  : "border-emerald-200 bg-emerald-50 text-emerald-800"
                                : isDark
                                  ? "border-white/5 bg-white/[0.03] text-slate-200"
                                  : "border-slate-200 bg-slate-50 text-slate-700"
                          )}
                        >
                          {line}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          </div>
        </DashboardCard>
        )}

        {commandPaletteOpen && !isRangesView && !isRangeDetailView && (
          <div className={modalOverlayClass}>
            <div className={modalPanelClass}>
              <div className={cn("px-5 py-4", terminalHeaderBorderClass)}>
                <div className={cn("text-[11px] font-semibold uppercase tracking-[0.24em]", isDark ? "text-cyan-300/80" : "text-cyan-700")}>Command Palette</div>
                <div className={cn("mt-1 text-sm", isDark ? "text-slate-400" : "text-slate-500")}>Ctrl+K shortcuts for the trading workspace</div>
              </div>
              <div className="space-y-2 p-4">
                {commandActions.map(action => (
                  <button
                    key={action.id}
                    type="button"
                    className={modalRowClass}
                    onClick={() => {
                      action.handler();
                      setCommandPaletteOpen(false);
                    }}
                  >
                    <span>
                      <span className={cn("block text-sm font-semibold", isDark ? "text-white" : "text-slate-950")}>{action.label}</span>
                      <span className={cn("block text-xs", isDark ? "text-slate-400" : "text-slate-500")}>{action.hint}</span>
                    </span>
                    <span className={subtleBadgeClass}>
                      Run
                    </span>
                  </button>
                ))}
              </div>
              <div className={cn("px-5 py-4 text-right", isDark ? "border-t border-white/10" : "border-t border-slate-200")}>
                <button
                  type="button"
                  className={modalCloseClass}
                  onClick={() => setCommandPaletteOpen(false)}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {!isRangesView && !isRangeDetailView && toastItems.length > 0 && (
          <div className="pointer-events-none fixed bottom-6 right-6 z-50 flex w-full max-w-sm flex-col gap-3">
            {toastItems.map(item => (
              <div
                key={item.id}
                className={cn(
                  "rounded-2xl border px-4 py-3 shadow-[0_12px_40px_rgba(0,0,0,0.35)] backdrop-blur-xl",
                  item.tone === "error"
                    ? "border-rose-400/30 bg-rose-500/15 text-rose-50"
                    : item.tone === "success"
                      ? "border-emerald-400/30 bg-emerald-500/15 text-emerald-50"
                      : "border-cyan-400/30 bg-cyan-500/15 text-cyan-50"
                )}
                role="status"
                aria-live="polite"
              >
                <div className="text-[11px] font-semibold uppercase tracking-[0.2em] opacity-80">
                  {item.tone === "error" ? "Error" : item.tone === "success" ? "Success" : "Update"}
                </div>
                <div className="mt-1 text-sm leading-6">{item.message}</div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
