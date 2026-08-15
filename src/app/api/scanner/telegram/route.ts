import { NextRequest, NextResponse } from "next/server";
import { scannerJson } from "@/lib/scanner-client";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const channel = sp.get("channel") || "Mastersharkcrypto";
  const limit = sp.get("limit") || "20";
  try {
    const data = await scannerJson(
      `/telegram?channel=${encodeURIComponent(channel)}&limit=${encodeURIComponent(limit)}`,
      { method: "GET", timeoutMs: 20000 },
    );
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json(
      { error: "Telegram fetch failed", detail: e instanceof Error ? e.message : "unknown" },
      { status: 502 },
    );
  }
}
