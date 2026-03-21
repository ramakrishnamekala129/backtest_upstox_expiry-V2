import { unstable_cache } from "next/cache";
import type { AstroPayload, AstroSectionError, AstroTableRow } from "@/lib/types";
import { buildAstroCore } from "@/lib/astro/calculations";
import { findNearestPriceRows } from "@/lib/astro/data";
import {
  buildFetchHeaders,
  hasLikelyHtmlDocument,
  parseAstroCards,
  parseIndraYogaTable,
  parsePlanetGochar,
  parsePlanetRetrograde,
  parseYogaRows,
  selectMonth
} from "@/lib/astro/parsers";

const TRANSIT_URLS = {
  sun: "https://www.drikpanchang.com/planet/transit/surya-transit-date-time.html",
  chandra: "https://www.drikpanchang.com/planet/transit/chandra-transit-date-time.html",
  mangal: "https://www.drikpanchang.com/planet/transit/mangal-transit-date-time.html",
  budha: "https://www.drikpanchang.com/planet/transit/budha-transit-date-time.html",
  guru: "https://www.drikpanchang.com/planet/transit/guru-transit-date-time.html",
  shukra: "https://www.drikpanchang.com/planet/transit/shukra-transit-date-time.html",
  shani: "https://www.drikpanchang.com/planet/transit/shani-transit-date-time.html",
  rahu: "https://www.drikpanchang.com/planet/transit/rahu-transit-date-time.html",
  ketu: "https://www.drikpanchang.com/planet/transit/ketu-transit-date-time.html"
} as const;

const RETROGRADE_URLS = {
  mangal: "https://www.drikpanchang.com/planet/retrograde/mangal-retrograde-date-time.html",
  budha: "https://www.drikpanchang.com/planet/retrograde/budha-retrograde-date-time.html",
  guru: "https://www.drikpanchang.com/planet/retrograde/guru-retrograde-date-time.html",
  shukra: "https://www.drikpanchang.com/planet/retrograde/shukra-retrograde-date-time.html",
  shani: "https://www.drikpanchang.com/planet/retrograde/shani-retrograde-date-time.html"
} as const;

const ASTA_URLS = {
  chandra: "https://www.drikpanchang.com/planet/asta/chandra-asta-date-time.html?time-format=12hour",
  mangal: "https://www.drikpanchang.com/planet/asta/mangal-asta-date-time.html",
  budha: "https://www.drikpanchang.com/planet/asta/budha-asta-date-time.html",
  guru: "https://www.drikpanchang.com/planet/asta/guru-asta-date-time.html",
  shukra: "https://www.drikpanchang.com/planet/asta/shukra-asta-date-time.html",
  shani: "https://www.drikpanchang.com/planet/asta/shani-asta-date-time.html"
} as const;

const YOGA_URLS = {
  indra: "https://www.drikpanchang.com/panchang/yoga/daily/indra-yoga-date-time.html",
  shula: "https://www.drikpanchang.com/panchang/yoga/daily/shula-yoga-date-time.html",
  dwipushkar: "https://www.drikpanchang.com/yoga/dwipushkar-yoga-date-time.html",
  tripushkar: "https://www.drikpanchang.com/yoga/tripushkar-yoga-date-time.html",
  gurupushya: "https://www.drikpanchang.com/yoga/gurupushya-yoga-date-time.html",
  ravipushya: "https://www.drikpanchang.com/yoga/ravipushya-yoga-date-time.html"
} as const;

async function fetchHtml(url: string, year: number): Promise<string> {
  const response = await fetch(`${url}?year=${year}`, {
    headers: buildFetchHeaders(),
    next: { revalidate: 60 * 60 * 12 }
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText}`);
  }
  const html = await response.text();
  if (!hasLikelyHtmlDocument(html)) {
    throw new Error("Unexpected HTML response");
  }
  return html;
}

async function loadYearlyEvents(year: number) {
  const errors: AstroSectionError[] = [];
  const monthData = {
    transit: [] as AstroTableRow[],
    yoga: [] as AstroTableRow[],
    retrograde: [] as AstroTableRow[],
    asta: [] as AstroTableRow[]
  };

  await Promise.all(
    Object.entries(TRANSIT_URLS).map(async ([planet, url]) => {
      try {
        const html = await fetchHtml(url, year);
        monthData.transit.push(
          ...parsePlanetGochar(html).map((row) => ({
            Planet: planet,
            ...row
          }))
        );
      } catch (error) {
        errors.push({ section: `transit:${planet}`, message: error instanceof Error ? error.message : "Transit fetch failed" });
      }
    })
  );

  await Promise.all(
    Object.entries(RETROGRADE_URLS).map(async ([planet, url]) => {
      try {
        const html = await fetchHtml(url, year);
        monthData.retrograde.push(
          ...parsePlanetRetrograde(html).map((row) => ({
            Planet: planet,
            ...row
          }))
        );
      } catch (error) {
        errors.push({
          section: `retrograde:${planet}`,
          message: error instanceof Error ? error.message : "Retrograde fetch failed"
        });
      }
    })
  );

  await Promise.all(
    Object.entries(ASTA_URLS).map(async ([planet, url]) => {
      try {
        const html = await fetchHtml(url, year);
        monthData.asta.push(
          ...parsePlanetRetrograde(html).map((row) => ({
            Planet: planet,
            ...row
          }))
        );
      } catch (error) {
        errors.push({ section: `asta:${planet}`, message: error instanceof Error ? error.message : "Asta fetch failed" });
      }
    })
  );

  const yogaRows: AstroTableRow[][] = [];
  await Promise.all(
    Object.entries(YOGA_URLS).map(async ([key, url]) => {
      try {
        const html = await fetchHtml(url, year);
        yogaRows.push(
          key === "indra" || key === "shula"
            ? parseIndraYogaTable(html).map((row) => ({ Type: key, ...row }))
            : parseAstroCards(html).map((row) => ({ Type: key, ...row }))
        );
      } catch (error) {
        errors.push({ section: `yoga:${key}`, message: error instanceof Error ? error.message : "Yoga fetch failed" });
      }
    })
  );

  monthData.yoga = parseYogaRows(yogaRows);
  return { monthData, errors };
}

function cachedYearlyEvents(year: number) {
  return unstable_cache(async () => loadYearlyEvents(year), [`astro-year-${year}`], {
    revalidate: 60 * 60 * 12
  })();
}

export async function buildAstroPayload(input: {
  date: string;
  time: string;
  symbol: string;
  referencePrice: number;
}): Promise<AstroPayload> {
  const core = buildAstroCore(input);
  const year = Number(input.date.slice(0, 4));
  const monthLabel = new Intl.DateTimeFormat("en-US", {
    month: "long",
    timeZone: "Asia/Kolkata"
  }).format(new Date(`${input.date}T00:00:00+05:30`));

  const [nearestPriceRow, yearly] = await Promise.all([
    findNearestPriceRows(core.csvLookupHint.file, input.referencePrice),
    cachedYearlyEvents(year)
  ]);

  const errors = [...yearly.errors] as AstroSectionError[];
  const filteredTransit = selectMonth(yearly.monthData.transit, monthLabel, year);
  const filteredYoga = selectMonth(yearly.monthData.yoga, monthLabel, year);
  const filteredRetrograde = selectMonth(yearly.monthData.retrograde, monthLabel, year);
  const filteredAsta = selectMonth(yearly.monthData.asta, monthLabel, year);

  const bestBuy = nearestPriceRow.rows
    .flatMap((row) => Object.entries(row))
    .filter(([key, value]) => key.startsWith("Buy") && typeof value === "number")
    .map(([, value]) => value as number)
    .sort((left, right) => left - right)[0];
  const bestSell = nearestPriceRow.rows
    .flatMap((row) => Object.entries(row))
    .filter(([key, value]) => key.startsWith("Sell") && typeof value === "number")
    .map(([, value]) => value as number)
    .sort((left, right) => right - left)[0];

  return {
    snapshot: core.snapshot,
    moonShift: {
      ...core.moonShift,
      "CSV Group": core.csvLookupHint.group,
      "Safe Buy Below": bestBuy ?? null,
      "Safe Sell Above": bestSell ?? null
    },
    currentPadas: core.currentPadas,
    nextPadas: core.nextPadas,
    nearestPriceRow,
    levels: core.levels,
    horaTimings: core.horaTimings,
    aspectMatrix: core.aspectMatrix,
    planetaryLevels: core.planetaryLevels,
    monthlyEvents: {
      transit: filteredTransit,
      yoga: filteredYoga,
      retrograde: filteredRetrograde,
      asta: filteredAsta
    },
    positions: core.positions,
    aspects: core.aspects,
    filteredAspects: core.filteredAspects,
    errors
  };
}
