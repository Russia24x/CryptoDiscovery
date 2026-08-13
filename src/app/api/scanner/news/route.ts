import { NextRequest, NextResponse } from "next/server";
import { scannerJson } from "@/lib/scanner-client";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const limit = sp.get("limit") || "40";
  const source = sp.get("source") || "";
  const qs = `limit=${encodeURIComponent(limit)}${source ? `&source=${encodeURIComponent(source)}` : ""}`;
  try {
    const data = await scannerJson(`/news?${qs}`, { method: "GET", timeoutMs: 30000 });
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json(
      { error: "News fetch failed", detail: e instanceof Error ? e.message : "unknown" },
      { status: 502 },
    );
  }
}
