import { readFile } from "node:fs/promises";
import path from "node:path";
import type { AstroPriceLookup, AstroTableRow } from "@/lib/types";

type CsvRow = Record<string, number | null>;

const CSV_SEARCH_PATHS = [
  path.join(process.cwd(), "data", "astro"),
  path.join(process.cwd(), "..")
];

function parseNumeric(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

async function readCsvRows(fileName: string): Promise<CsvRow[]> {
  const candidates = CSV_SEARCH_PATHS.map((base) => path.join(base, fileName));
  let raw = "";
  for (const candidate of candidates) {
    try {
      raw = await readFile(candidate, "utf-8");
      break;
    } catch {
      continue;
    }
  }

  if (!raw) {
    throw new Error(`Missing astro CSV: ${fileName}`);
  }

  const [headerLine, ...lines] = raw.split(/\r?\n/).filter(Boolean);
  const headers = headerLine.split(",").map((column) => column.trim());
  return lines.map((line) => {
    const parts = line.split(",");
    return headers.reduce<CsvRow>((row, header, index) => {
      row[header] = parseNumeric(parts[index] ?? "");
      return row;
    }, {});
  });
}

function distanceForRow(row: CsvRow, target: number): { score: number; matchedColumn: string } {
  let bestScore = Number.POSITIVE_INFINITY;
  let matchedColumn = "";
  for (const [column, value] of Object.entries(row)) {
    if (column === "Index" || column.startsWith("__")) continue;
    if (typeof value !== "number" || Number.isNaN(value)) continue;
    const score = Math.abs(value - target);
    if (score < bestScore) {
      bestScore = score;
      matchedColumn = column;
    }
  }
  return { score: bestScore, matchedColumn };
}

function convertRow(row: CsvRow): AstroTableRow {
  return Object.fromEntries(
    Object.entries(row)
      .filter(([key]) => !key.startsWith("__"))
      .map(([key, value]) => [key, value])
  );
}

export async function findNearestPriceRows(fileName: string, target: number): Promise<AstroPriceLookup> {
  const rows = await readCsvRows(fileName);
  let bestIndex = 0;
  let bestScore = Number.POSITIVE_INFINITY;
  let matchedColumn = "";

  rows.forEach((row, index) => {
    const distance = distanceForRow(row, target);
    if (distance.score < bestScore) {
      bestScore = distance.score;
      bestIndex = index;
      matchedColumn = distance.matchedColumn;
    }
  });

  const slice = rows.slice(Math.max(0, bestIndex - 2), Math.min(rows.length, bestIndex + 3)).map(convertRow);
  return {
    source: fileName,
    matchedColumn,
    rows: slice
  };
}
