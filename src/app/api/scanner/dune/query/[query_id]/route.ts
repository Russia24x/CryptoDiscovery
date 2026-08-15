import { NextRequest, NextResponse } from "next/server";
import { scannerJson } from "@/lib/scanner-client";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ query_id: string }> },
) {
  const { query_id } = await params;
  const limit = req.nextUrl.searchParams.get("limit") || "100";
  try {
    const data = await scannerJson(
      `/dune/query/${encodeURIComponent(query_id)}?limit=${encodeURIComponent(limit)}`,
      { method: "GET", timeoutMs: 20000 },
    );
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json(
      { error: "Dune query failed", detail: e instanceof Error ? e.message : "unknown" },
      { status: 502 },
    );
  }
}
