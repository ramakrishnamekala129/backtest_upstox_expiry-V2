import { NextResponse } from "next/server";
import { buildAstroPayload } from "@/lib/astro/service";

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const date = url.searchParams.get("date")?.trim() ?? "";
  const time = url.searchParams.get("time")?.trim() ?? "";
  const symbol = url.searchParams.get("symbol")?.trim() ?? "NIFTY";
  const referencePriceRaw = url.searchParams.get("referencePrice")?.trim() ?? "";

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return badRequest("date must use YYYY-MM-DD");
  }
  if (!/^\d{2}:\d{2}$/.test(time)) {
    return badRequest("time must use HH:mm");
  }

  const referencePrice = Number(referencePriceRaw);
  if (!Number.isFinite(referencePrice)) {
    return badRequest("referencePrice must be numeric");
  }

  try {
    const payload = await buildAstroPayload({
      date,
      time,
      symbol,
      referencePrice
    });
    return NextResponse.json({ payload });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
