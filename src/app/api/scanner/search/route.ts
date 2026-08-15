import { NextRequest, NextResponse } from "next/server";
import { scannerJson } from "@/lib/scanner-client";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q") || "";
  try {
    const data = await scannerJson(`/search?q=${encodeURIComponent(q)}`, {
      method: "GET",
    });
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json(
      { error: "Search failed", detail: e instanceof Error ? e.message : "unknown" },
      { status: 502 },
    );
  }
}
