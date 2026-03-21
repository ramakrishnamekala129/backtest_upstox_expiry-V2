import { NextResponse } from "next/server";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { EclipticGeoMoon, MakeTime } from "astronomy-engine";
import * as swe from "@swisseph/node";

type ExplorerRow = {
  date_key: string;
  time: string;
  timezone: string;
  datetime_key: string;
  value: number;
  longitude: number;
};

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

function normalizeDegrees(value: number): number {
  const result = value % 360;
  return result < 0 ? result + 360 : result;
}

function toJulianDay(date: Date): number {
  return date.getTime() / 86400000 + 2440587.5;
}

function meanObliquityDeg(jd: number): number {
  const t = (jd - 2451545.0) / 36525;
  return (
    23.0 +
    26.0 / 60.0 +
    (21.448 - 46.815 * t - 0.00059 * t * t + 0.001813 * t * t * t) / 3600.0
  );
}

function gmstDeg(jd: number): number {
  const t = (jd - 2451545.0) / 36525;
  const gmst =
    280.46061837 +
    360.98564736629 * (jd - 2451545.0) +
    0.000387933 * t * t -
    (t * t * t) / 38710000.0;
  return normalizeDegrees(gmst);
}

function moonLongitudeApprox(date: Date): number {
  // High-precision tropical ecliptic Moon longitude (pure JS fallback for environments without Python/Swiss Ephemeris).
  const moon = EclipticGeoMoon(MakeTime(date));
  return normalizeDegrees(moon.lon);
}

function ascendantApprox(date: Date): number {
  const jd = toJulianDay(date);
  const latitude = 19.054999;
  const longitude = 72.8692035;
  const eps = (meanObliquityDeg(jd) * Math.PI) / 180;
  const lst = normalizeDegrees(gmstDeg(jd) + longitude);
  const theta = (lst * Math.PI) / 180;
  const phi = (latitude * Math.PI) / 180;

  const asc =
    (Math.atan2(Math.cos(theta), -(Math.sin(theta) * Math.cos(eps) + Math.tan(phi) * Math.sin(eps))) * 180) /
    Math.PI;
  return normalizeDegrees(asc);
}

function toIstParts(date: Date) {
  const ist = new Date(date.getTime() + IST_OFFSET_MS);
  const year = ist.getUTCFullYear();
  const month = String(ist.getUTCMonth() + 1).padStart(2, "0");
  const day = String(ist.getUTCDate()).padStart(2, "0");
  const hh = String(ist.getUTCHours()).padStart(2, "0");
  const mm = String(ist.getUTCMinutes()).padStart(2, "0");
  return { date_key: `${year}-${month}-${day}`, time: `${hh}:${mm}`, datetime_key: `${year}-${month}-${day} ${hh}:${mm}` };
}

function buildExplorerRow(date: Date, value: number): ExplorerRow {
  const ist = toIstParts(date);
  const longitude = Number(value.toFixed(4));
  return {
    date_key: ist.date_key,
    time: ist.time,
    timezone: "Asia/Kolkata",
    datetime_key: ist.datetime_key,
    value: longitude,
    longitude
  };
}

function generateNodeSwissRows(input: {
  startDate: string;
  endDate: string;
  includeMoon: boolean;
  includeAscendant: boolean;
}): { moon: ExplorerRow[]; ascendant: ExplorerRow[] } {
  const moon: ExplorerRow[] = [];
  const ascendant: ExplorerRow[] = [];
  let cursor = new Date(`${input.startDate}T00:00:00+05:30`);
  const end = new Date(`${input.endDate}T23:59:00+05:30`);
  while (cursor <= end) {
    const jdUt = swe.dateToJulianDay(cursor);
    if (input.includeMoon) {
      const moonPos = swe.calculatePosition(jdUt, swe.Planet.Moon);
      moon.push(buildExplorerRow(cursor, moonPos.longitude));
    }
    if (input.includeAscendant) {
      const houses = swe.calculateHouses(jdUt, 19.054999, 72.8692035);
      ascendant.push(buildExplorerRow(cursor, houses.ascendant));
    }
    cursor = new Date(cursor.getTime() + 60 * 1000);
  }
  return { moon, ascendant };
}

function generateApproxRows(input: {
  startDate: string;
  endDate: string;
  includeMoon: boolean;
  includeAscendant: boolean;
}): { moon: ExplorerRow[]; ascendant: ExplorerRow[] } {
  const moon: ExplorerRow[] = [];
  const ascendant: ExplorerRow[] = [];
  let cursor = new Date(`${input.startDate}T00:00:00+05:30`);
  const end = new Date(`${input.endDate}T23:59:00+05:30`);
  while (cursor <= end) {
    if (input.includeMoon) {
      moon.push(buildExplorerRow(cursor, moonLongitudeApprox(cursor)));
    }
    if (input.includeAscendant) {
      ascendant.push(buildExplorerRow(cursor, ascendantApprox(cursor)));
    }
    cursor = new Date(cursor.getTime() + 60 * 1000);
  }
  return { moon, ascendant };
}

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

function parseFlag(raw: string | null, fallback: boolean): boolean {
  if (raw === null) return fallback;
  const value = raw.trim().toLowerCase();
  if (value === "1" || value === "true" || value === "yes") return true;
  if (value === "0" || value === "false" || value === "no") return false;
  return fallback;
}

function parseNumber(raw: string | null, fallback: number): number {
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

function runPython(command: string, args: string[]): { moon: ExplorerRow[]; ascendant: ExplorerRow[] } | null {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    encoding: "utf-8",
    timeout: 240000,
    maxBuffer: 128 * 1024 * 1024
  });
  if (result.error || result.status !== 0) return null;
  const text = (result.stdout ?? "").trim();
  if (!text) return null;
  try {
    const parsed = JSON.parse(text) as { moon?: ExplorerRow[]; ascendant?: ExplorerRow[] };
    return {
      moon: Array.isArray(parsed.moon) ? parsed.moon : [],
      ascendant: Array.isArray(parsed.ascendant) ? parsed.ascendant : []
    };
  } catch {
    return null;
  }
}

function filterByTolerance(rows: ExplorerRow[], target: number, tolerance: number): ExplorerRow[] {
  return rows.filter((row) => Math.abs(Number(row.longitude) - target) <= tolerance);
}

function previewRows(rows: ExplorerRow[], limit: number): ExplorerRow[] {
  if (rows.length <= limit) return rows;
  return rows.slice(rows.length - limit);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const startDate = url.searchParams.get("startDate")?.trim() ?? "";
  const endDate = url.searchParams.get("endDate")?.trim() ?? "";
  const includeMoon = parseFlag(url.searchParams.get("includeMoon"), true);
  const includeAscendant = parseFlag(url.searchParams.get("includeAscendant"), true);
  const moonTarget = parseNumber(url.searchParams.get("moonTarget"), 0);
  const ascTarget = parseNumber(url.searchParams.get("ascTarget"), 0);
  const tolerance = Math.max(parseNumber(url.searchParams.get("tolerance"), 0.1), 0);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
    return badRequest("startDate must use YYYY-MM-DD");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
    return badRequest("endDate must use YYYY-MM-DD");
  }
  if (!includeMoon && !includeAscendant) {
    return badRequest("At least one of includeMoon/includeAscendant must be true");
  }

  const start = new Date(`${startDate}T00:00:00+05:30`);
  const end = new Date(`${endDate}T00:00:00+05:30`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
    return badRequest("Invalid date range");
  }

  const daySpan = Math.floor((end.getTime() - start.getTime()) / 86400000) + 1;
  if (daySpan > 45) {
    return badRequest("Range too large. Please keep it within 45 days.");
  }

  const scriptPath = path.join(process.cwd(), "lib", "astro", "moon_asc_range.py");
  const args = [scriptPath, startDate, endDate, includeMoon ? "1" : "0", includeAscendant ? "1" : "0"];

  let precisionMode: "node_swisseph" | "python_swisseph" | "js_fallback" = "js_fallback";
  let payload: { moon: ExplorerRow[]; ascendant: ExplorerRow[] } | null = null;
  try {
    payload = generateNodeSwissRows({ startDate, endDate, includeMoon, includeAscendant });
    precisionMode = "node_swisseph";
  } catch {
    payload = runPython("python", args);
    if (payload) {
      precisionMode = "python_swisseph";
    } else {
      payload = runPython("py", ["-3", ...args]);
      if (payload) {
        precisionMode = "python_swisseph";
      } else {
        payload = generateApproxRows({ startDate, endDate, includeMoon, includeAscendant });
      }
    }
  }

  const moonRows = includeMoon ? payload.moon : [];
  const ascRows = includeAscendant ? payload.ascendant : [];
  const moonFiltered = includeMoon ? filterByTolerance(moonRows, moonTarget, tolerance) : [];
  const ascFiltered = includeAscendant ? filterByTolerance(ascRows, ascTarget, tolerance) : [];

  return NextResponse.json({
    payload: {
      range: { startDate, endDate, daySpan },
      controls: {
        includeMoon,
        includeAscendant,
        moonTarget,
        ascTarget,
        tolerance,
        precisionMode
      },
      moon: {
        rawTotal: moonRows.length,
        rawRows: previewRows(moonRows, 2000),
        filteredTotal: moonFiltered.length,
        filteredRows: previewRows(moonFiltered, 2000)
      },
      ascendant: {
        rawTotal: ascRows.length,
        rawRows: previewRows(ascRows, 2000),
        filteredTotal: ascFiltered.length,
        filteredRows: previewRows(ascFiltered, 2000)
      }
    }
  });
}
