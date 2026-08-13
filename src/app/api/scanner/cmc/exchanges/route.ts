import { NextRequest, NextResponse } from "next/server";
import { scannerJson } from "@/lib/scanner-client";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const limit = sp.get("limit") || "50";
  try {
    const data = await scannerJson(
      `/cmc/exchanges?limit=${encodeURIComponent(limit)}`,
      { method: "GET", timeoutMs: 20000 },
    );
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json(
      { error: "CMC exchanges fetch failed", detail: e instanceof Error ? e.message : "unknown" },
      { status: 502 },
    );
  }
}
