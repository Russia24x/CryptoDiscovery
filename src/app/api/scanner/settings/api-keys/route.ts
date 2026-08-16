import { NextRequest, NextResponse } from "next/server";
import { scannerFetch } from "@/lib/scanner-client";

/**
 * POST /api/scanner/settings/api-keys
 * Body: { key_name, key_value, enabled, key_type }
 * Adds or updates an API key entry. Returns masked value.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const res = await scannerFetch("/settings/api-keys", {
      method: "POST",
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return NextResponse.json(
        { error: "Failed to save API key", detail: data?.detail ?? `HTTP ${res.status}` },
        { status: res.status },
      );
    }
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json(
      { error: "Failed to save API key", detail: e instanceof Error ? e.message : "unknown" },
      { status: 502 },
    );
  }
}
