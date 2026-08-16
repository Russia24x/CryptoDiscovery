import { NextResponse } from "next/server";
import { scannerJson } from "@/lib/scanner-client";

/**
 * GET /api/scanner/settings
 * Returns current settings (API keys masked, news sources full).
 */
export async function GET() {
  try {
    const data = await scannerJson("/settings", { method: "GET" });
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json(
      { error: "Failed to fetch settings", detail: e instanceof Error ? e.message : "unknown" },
      { status: 502 },
    );
  }
}
