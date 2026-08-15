import { NextRequest, NextResponse } from "next/server";
import { scannerJson } from "@/lib/scanner-client";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const limit = sp.get("limit") || "40";
  const category = sp.get("category") || "";
  const qs = `limit=${encodeURIComponent(limit)}${category ? `&category=${encodeURIComponent(category)}` : ""}`;
  try {
    const data = await scannerJson(`/news/fa?${qs}`, { method: "GET", timeoutMs: 30000 });
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json(
      { error: "Persian news fetch failed", detail: e instanceof Error ? e.message : "unknown" },
      { status: 502 },
    );
  }
}
