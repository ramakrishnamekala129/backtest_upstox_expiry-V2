import { NextResponse } from "next/server";
import { loadTrendPayload } from "@/lib/trend-data";

export async function GET(request: Request) {
  try {
    const { source, payload } = await loadTrendPayload();
    const url = new URL(request.url);
    const date = url.searchParams.get("date")?.trim();

    if (date) {
      return NextResponse.json({
        source,
        date,
        rows: payload.dates_wise_table[date] ?? []
      });
    }

    return NextResponse.json({ source, payload });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
