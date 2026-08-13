import { NextRequest, NextResponse } from "next/server";
import { scannerJson } from "@/lib/scanner-client";

// Single-coin analysis takes longer than the default 30s (it fetches
// CoinGecko detail + DeFiLlama + CMC keyless in sequence). Use 90s.
const ANALYZE_TIMEOUT_MS = 90000;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const data = await scannerJson("/analyze", {
      method: "POST",
      body: JSON.stringify(body),
      timeoutMs: ANALYZE_TIMEOUT_MS,
    });
    return NextResponse.json(data);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown";
    const isTimeout = msg.toLowerCase().includes("abort") || msg.toLowerCase().includes("timeout");
    return NextResponse.json(
      {
        error: isTimeout ? "Analysis timed out — upstream API may be rate-limited. Try again." : "Analysis failed",
        detail: msg,
      },
      { status: isTimeout ? 504 : 502 },
    );
  }
}
