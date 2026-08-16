import { NextResponse } from "next/server";
import { scannerJson } from "@/lib/scanner-client";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const sortBy = searchParams.get("sort_by") || "market_cap";
    const limit = searchParams.get("limit") || "50";
    const data = await scannerJson(
      `/market/top-coins?sort_by=${encodeURIComponent(sortBy)}&limit=${encodeURIComponent(limit)}`,
    );
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json(
      { error: "Failed to fetch top coins", detail: e instanceof Error ? e.message : "unknown" },
      { status: 502 },
    );
  }
}
