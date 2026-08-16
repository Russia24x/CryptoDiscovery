import { NextRequest, NextResponse } from "next/server";
import { scannerFetch } from "@/lib/scanner-client";

/**
 * POST /api/scanner/settings/news-sources
 * Body: { name, url, source_type: "rss"|"telegram", enabled }
 * Adds or updates a news source.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const res = await scannerFetch("/settings/news-sources", {
      method: "POST",
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return NextResponse.json(
        { error: "Failed to save news source", detail: data?.detail ?? `HTTP ${res.status}` },
        { status: res.status },
      );
    }
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json(
      { error: "Failed to save news source", detail: e instanceof Error ? e.message : "unknown" },
      { status: 502 },
    );
  }
}
