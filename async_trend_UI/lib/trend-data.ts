import { readFile } from "node:fs/promises";
import path from "node:path";
import type { TrendPayload } from "@/lib/types";

function isTrendPayload(value: unknown): value is TrendPayload {
  if (!value || typeof value !== "object") return false;
  const payload = value as TrendPayload;
  return (
    Array.isArray(payload.trend_dates) &&
    Array.isArray(payload.dates_wise_single) &&
    Array.isArray(payload.dates_wise_summary) &&
    payload.dates_wise_table !== null &&
    typeof payload.dates_wise_table === "object"
  );
}

function unwrapTrendPayload(value: unknown): TrendPayload | null {
  if (isTrendPayload(value)) return value;
  if (value && typeof value === "object" && "payload" in value) {
    const candidate = (value as { payload?: unknown }).payload;
    if (isTrendPayload(candidate)) return candidate;
  }
  return null;
}

export async function loadTrendPayload(): Promise<{ source: string; payload: TrendPayload }> {
  const failures: string[] = [];
  const remoteUrl = process.env.TREND_DATA_URL?.trim();
  if (remoteUrl) {
    try {
      const res = await fetch(remoteUrl, { cache: "no-store" });
      if (!res.ok) {
        failures.push(`TREND_DATA_URL HTTP ${res.status} ${res.statusText}`);
      } else {
        const data = (await res.json()) as unknown;
        const payload = unwrapTrendPayload(data);
        if (payload) {
          return { source: "TREND_DATA_URL", payload };
        }
        failures.push("TREND_DATA_URL returned invalid trend payload shape");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown fetch error";
      failures.push(`TREND_DATA_URL fetch failed: ${message}`);
    }
  }

  const envPath = process.env.TREND_JSON_PATH?.trim();
  const candidatePaths = [
    envPath
      ? path.isAbsolute(envPath)
        ? envPath
        : path.join(process.cwd(), envPath)
      : null,
    path.join(process.cwd(), "public", "trend_tables.json")
  ].filter((value): value is string => Boolean(value));

  for (const resolvedPath of candidatePaths) {
    try {
      const raw = await readFile(resolvedPath, "utf-8");
      const data = JSON.parse(raw) as unknown;
      const payload = unwrapTrendPayload(data);
      if (!payload) {
        failures.push(`Invalid trend payload at ${resolvedPath}`);
        continue;
      }
      return { source: resolvedPath, payload };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown file error";
      failures.push(`${resolvedPath}: ${message}`);
    }
  }

  throw new Error(
    `Unable to load trend data. ${failures.join(" | ")}. Configure TREND_DATA_URL or TREND_JSON_PATH, or provide public/trend_tables.json.`
  );
}
