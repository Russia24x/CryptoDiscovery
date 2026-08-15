import { NextResponse } from "next/server";
import { scannerJson } from "@/lib/scanner-client";

// Market overview aggregates 6 upstream APIs; allow up to 60s.
const MARKET_TIMEOUT_MS = 60000;

export async function GET() {
  try {
    const data = await scannerJson("/market/overview", {
      method: "GET",
      timeoutMs: MARKET_TIMEOUT_MS,
    });
    return NextResponse.json(data);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown";
    const isTimeout = msg.toLowerCase().includes("abort") || msg.toLowerCase().includes("timeout");
    return NextResponse.json(
      {
        error: isTimeout ? "Market data is still loading — try again in a moment." : "Market overview failed",
        detail: msg,
      },
      { status: isTimeout ? 504 : 502 },
    );
  }
}
