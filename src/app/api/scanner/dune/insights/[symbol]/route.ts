import { NextRequest, NextResponse } from "next/server";
import { scannerJson } from "@/lib/scanner-client";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ symbol: string }> },
) {
  const { symbol } = await params;
  try {
    const data = await scannerJson(
      `/dune/insights/${encodeURIComponent(symbol)}`,
      { method: "GET", timeoutMs: 30000 },
    );
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json(
      { error: "Dune insights failed", detail: e instanceof Error ? e.message : "unknown" },
      { status: 502 },
    );
  }
}
