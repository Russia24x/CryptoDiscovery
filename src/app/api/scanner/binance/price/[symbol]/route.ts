import { NextResponse } from "next/server";
import { scannerJson } from "@/lib/scanner-client";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ symbol: string }> },
) {
  try {
    const { symbol } = await params;
    const data = await scannerJson(`/binance/price/${encodeURIComponent(symbol)}`);
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json(
      { error: "Failed to fetch Binance price", detail: e instanceof Error ? e.message : "unknown" },
      { status: 502 },
    );
  }
}
