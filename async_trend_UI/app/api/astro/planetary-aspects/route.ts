import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";

type AspectRow = Record<string, string | number>;

const UI_ASPECTS: Record<string, number> = {
  "(0°)": 0,
  "(22.5°)": 22.5,
  "(30°)": 30,
  "(36°)": 36,
  "(45°)": 45,
  "(60°)": 60,
  "(72°)": 72,
  "(90°)": 90,
  "(120°)": 120,
  "(135°)": 135,
  "(144°)": 144,
  "(150°)": 150,
  "(180°)": 180
};

const FAST_FACTORS = new Set(["Moon", "Ascendant"]);
let CACHE_ROWS: AspectRow[] | null = null;

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

async function loadAspectRows(): Promise<AspectRow[]> {
  if (CACHE_ROWS) return CACHE_ROWS;
  const filePath = path.join(process.cwd(), "data", "astro", "aspect_cache_rows.json");
  const raw = await readFile(filePath, "utf-8");
  const parsed = JSON.parse(raw) as AspectRow[];
  CACHE_ROWS = Array.isArray(parsed) ? parsed : [];
  return CACHE_ROWS;
}

function parseAspectSelection(raw: string | null): string[] {
  if (!raw?.trim()) return Object.keys(UI_ASPECTS);
  const values = raw
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  if (!values.length) return Object.keys(UI_ASPECTS);
  return values
    .map((value) => (/^\(/.test(value) ? value : `(${value}°)`))
    .filter((value) => value in UI_ASPECTS);
}

function parsePlanetFilter(raw: string | null): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function classifyFinalSignal(rows: AspectRow[]): AspectRow[] {
  const bullish = new Set([30, 36, 60, 72, 120, 144, 330, 324, 300, 288, 240, 216]);
  const depends = new Set([150, 180, 210]);
  const bearish = new Set([22.5, 45, 90, 135, 337.5, 315, 270, 225]);
  const flip: Record<string, string> = {
    bullish: "bearish",
    bearish: "bullish",
    depends: "depends",
    unknown: "unknown"
  };

  return rows.map((row) => {
    const p1Motion = String(row["Planet1-Motion"] ?? "");
    const p2Motion = String(row["Planet2-Motion"] ?? "");
    const p1Retro = p1Motion.toLowerCase().includes("retrograde");
    const p2Retro = p2Motion.toLowerCase().includes("retrograde");
    const oneRetro = (p1Retro ? 1 : 0) ^ (p2Retro ? 1 : 0);
    const angle = Math.round((Number(row["Abs angle"] ?? 0) % 360) * 2) / 2;

    let angleSignal = "unknown";
    if (depends.has(angle)) angleSignal = "depends";
    else if (bullish.has(angle)) angleSignal = "bullish";
    else if (bearish.has(angle)) angleSignal = "bearish";

    const finalSignal = oneRetro ? (flip[angleSignal] ?? angleSignal) : angleSignal;
    return {
      ...row,
      FinalSignal: finalSignal
    };
  });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const startDate = url.searchParams.get("startDate")?.trim() ?? "";
  const endDate = url.searchParams.get("endDate")?.trim() ?? "";
  const moonMode = (url.searchParams.get("moonMode")?.trim() ?? "Exclude Moon + Ascendant").toLowerCase();
  const p1 = parsePlanetFilter(url.searchParams.get("planet1"));
  const p2 = parsePlanetFilter(url.searchParams.get("planet2"));
  const selectedAspects = parseAspectSelection(url.searchParams.get("aspects"));
  const orb = Math.max(Number(url.searchParams.get("orb") ?? "1"), 0.1);
  const maxRows = Math.min(Math.max(Number(url.searchParams.get("maxRows") ?? "50000"), 100), 100000);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) return badRequest("startDate must use YYYY-MM-DD");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(endDate)) return badRequest("endDate must use YYYY-MM-DD");
  if (endDate < startDate) return badRequest("Invalid date range");

  const daySpan = Math.floor((new Date(`${endDate}T00:00:00+05:30`).getTime() - new Date(`${startDate}T00:00:00+05:30`).getTime()) / 86400000) + 1;
  if (daySpan > 45) return badRequest("Range too large. Please keep it within 45 days.");

  let df = (await loadAspectRows()).filter((row) => {
    const key = String(row.date_key ?? "");
    return key >= startDate && key <= endDate;
  });

  if (moonMode.includes("only moon") || moonMode === "only_moon") {
    df = df.filter((row) => row.Planet1 === "Moon" || row.Planet2 === "Moon");
  } else if (moonMode.includes("only ascendant") || moonMode === "only_ascendant") {
    df = df.filter((row) => row.Planet1 === "Ascendant" || row.Planet2 === "Ascendant");
  } else if (moonMode.includes("moon + ascendant") || moonMode === "moon_ascendant") {
    df = df.filter((row) => FAST_FACTORS.has(String(row.Planet1)) || FAST_FACTORS.has(String(row.Planet2)));
  } else if (moonMode.includes("exclude moon + ascendant") || moonMode === "exclude_moon_ascendant") {
    df = df.filter((row) => !FAST_FACTORS.has(String(row.Planet1)) && !FAST_FACTORS.has(String(row.Planet2)));
  } else if (moonMode.includes("exclude moon") || moonMode === "exclude_moon") {
    df = df.filter((row) => row.Planet1 !== "Moon" && row.Planet2 !== "Moon");
  } else if (moonMode.includes("exclude ascendant") || moonMode === "exclude_ascendant") {
    df = df.filter((row) => row.Planet1 !== "Ascendant" && row.Planet2 !== "Ascendant");
  }

  if (p1.length && p2.length) {
    const s1 = new Set(p1);
    const s2 = new Set(p2);
    df = df.filter(
      (row) =>
        (s1.has(String(row.Planet1)) && s2.has(String(row.Planet2))) ||
        (s1.has(String(row.Planet2)) && s2.has(String(row.Planet1)))
    );
  } else if (p1.length) {
    const s1 = new Set(p1);
    df = df.filter((row) => s1.has(String(row.Planet1)) || s1.has(String(row.Planet2)));
  } else if (p2.length) {
    const s2 = new Set(p2);
    df = df.filter((row) => s2.has(String(row.Planet1)) || s2.has(String(row.Planet2)));
  }

  const selectedAspectValues = selectedAspects.map((key) => UI_ASPECTS[key]).filter((value): value is number => Number.isFinite(value));
  if (selectedAspectValues.length) {
    df = df.filter((row) => selectedAspectValues.some((target) => {
      const absAngle = Number(row["Abs angle"] ?? 0);
      return absAngle >= target - orb && absAngle <= target + orb;
    }));
  }

  const withSignal = classifyFinalSignal(df);
  const totalRows = withSignal.length;
  const truncated = totalRows > maxRows;
  const finalRows = truncated ? withSignal.slice(0, maxRows) : withSignal;

  const detailedRows = finalRows.map((row) => ({
    date_key: row.date_key,
    time: row.Time,
    DT: `${row.date_key} ${row.Time}`,
    Planet1: row.Planet1,
    Planet2: row.Planet2,
    Angle: row.Angle,
    "Planet1-Motion": row["Planet1-Motion"],
    "Planet2-Motion": row["Planet2-Motion"],
    "Planet1-FullDeg": Number(Number(row["Planet1-FullDeg"] ?? 0).toFixed(6)),
    "Planet2-FullDeg": Number(Number(row["Planet2-FullDeg"] ?? 0).toFixed(6)),
    "Planet1-Sign": row["Planet1-Sign"],
    "Planet2-Sign": row["Planet2-Sign"],
    Pair: row.Pair,
    FinalSignal: row.FinalSignal
  }));

  const rows = detailedRows.map((row) => ({
    DT: row.DT,
    Planet1: row.Planet1,
    Planet2: row.Planet2,
    Angle: row.Angle,
    FinalSignal: row.FinalSignal,
    "Planet1-Motion": row["Planet1-Motion"],
    "Planet2-Motion": row["Planet2-Motion"],
    "Planet1-FullDeg": Number(Number(row["Planet1-FullDeg"]).toFixed(2)),
    "Planet2-FullDeg": Number(Number(row["Planet2-FullDeg"]).toFixed(2)),
    "Planet1-Sign": row["Planet1-Sign"],
    "Planet2-Sign": row["Planet2-Sign"]
  }));

  return NextResponse.json({
    payload: {
      range: { startDate, endDate, daySpan },
      filters: {
        moonMode,
        planet1: p1,
        planet2: p2,
        selectedAspects,
        orb
      },
      totalRows,
      truncated,
      rows,
      detailedRows
    }
  });
}

