import { NextRequest, NextResponse } from "next/server";
import { scannerJson } from "@/lib/scanner-client";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ symbol: string }> },
) {
  const { symbol } = await params;
  try {
    const data = await scannerJson(
      `/score-history/${encodeURIComponent(symbol)}`,
      { method: "GET" },
    );
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json(
      { error: "Score history fetch failed", detail: e instanceof Error ? e.message : "unknown" },
      { status: 502 },
    );
  }
}
