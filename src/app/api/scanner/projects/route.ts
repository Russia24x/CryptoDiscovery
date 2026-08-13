import { NextRequest, NextResponse } from "next/server";
import { scannerJson } from "@/lib/scanner-client";

export async function GET(req: NextRequest) {
  try {
    const limit = req.nextUrl.searchParams.get("limit") || "50";
    const data = await scannerJson(`/projects?limit=${limit}`);
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json(
      { error: "Failed to fetch projects", detail: e instanceof Error ? e.message : "unknown" },
      { status: 502 },
    );
  }
}
