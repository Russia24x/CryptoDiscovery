import { NextResponse } from "next/server";
import { scannerJson } from "@/lib/scanner-client";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const sortBy = searchParams.get("sort_by") || "tvl";
    const limit = searchParams.get("limit") || "50";
    const data = await scannerJson(
      `/market/top-defi?sort_by=${encodeURIComponent(sortBy)}&limit=${encodeURIComponent(limit)}`,
    );
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json(
      { error: "Failed to fetch DeFi protocols", detail: e instanceof Error ? e.message : "unknown" },
      { status: 502 },
    );
  }
}
