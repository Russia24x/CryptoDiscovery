import { NextResponse } from "next/server";
import { scannerJson } from "@/lib/scanner-client";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ geckoId: string }> },
) {
  try {
    const { geckoId } = await params;
    const { searchParams } = new URL(request.url);
    const days = searchParams.get("days") || "7";
    const data = await scannerJson(
      `/coingecko/ohlc/${encodeURIComponent(geckoId)}?days=${days}`,
    );
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json(
      { error: "Failed to fetch OHLC", detail: e instanceof Error ? e.message : "unknown" },
      { status: 502 },
    );
  }
}
