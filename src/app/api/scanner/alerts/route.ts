import { NextRequest, NextResponse } from "next/server";
import { scannerJson } from "@/lib/scanner-client";

export async function GET(req: NextRequest) {
  const threshold = req.nextUrl.searchParams.get("threshold") || "10";
  try {
    const data = await scannerJson(`/alerts?threshold=${threshold}`, { method: "GET" });
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json(
      { error: "Alerts fetch failed", detail: e instanceof Error ? e.message : "unknown" },
      { status: 502 },
    );
  }
}
