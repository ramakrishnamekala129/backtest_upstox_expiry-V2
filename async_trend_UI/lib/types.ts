export type GenericRow = Record<string, string | number | null>;

export type TrendPayload = {
  generated_at?: string;
  trend_dates: GenericRow[];
  dates_wise_single: GenericRow[];
  dates_wise_summary: GenericRow[];
  dates_wise_table: Record<string, GenericRow[]>;
};

export type TrendApiResponse = {
  source: string;
  payload: TrendPayload;
};

export type AstroSnapshot = {
  date: string;
  time: string;
  symbol: string;
  referencePrice: number;
  reviewWindow: string;
  weekday: string;
};

export type AstroSummaryValue = string | number | null;

export type AstroSummaryRow = Record<string, AstroSummaryValue>;

export type AstroTableRow = Record<string, string | number | boolean | null>;

export type AstroPriceLookup = {
  source: string;
  matchedColumn: string;
  rows: AstroTableRow[];
};

export type AstroSectionError = {
  section: string;
  message: string;
};

export type AstroMonthlyEvents = {
  transit: AstroTableRow[];
  yoga: AstroTableRow[];
  retrograde: AstroTableRow[];
  asta: AstroTableRow[];
};

export type AstroFilteredAspects = {
  all: AstroTableRow[];
  withoutMoon: AstroTableRow[];
  withMoon: AstroTableRow[];
  withoutAscendant: AstroTableRow[];
  withAscendant: AstroTableRow[];
  withMoonOrAscendant: AstroTableRow[];
  withoutMoonOrAscendant: AstroTableRow[];
};

export type AstroPayload = {
  snapshot: AstroSnapshot;
  moonShift: AstroSummaryRow;
  currentPadas: AstroTableRow[];
  nextPadas: AstroTableRow[];
  nearestPriceRow: AstroPriceLookup;
  levels: AstroTableRow[];
  horaTimings: AstroTableRow[];
  aspectMatrix: AstroTableRow[];
  planetaryLevels: AstroTableRow[];
  monthlyEvents: AstroMonthlyEvents;
  positions: AstroTableRow[];
  aspects: AstroTableRow[];
  filteredAspects: AstroFilteredAspects;
  errors: AstroSectionError[];
};

export type AstroApiResponse = {
  payload: AstroPayload;
};
