import { NextRequest, NextResponse } from "next/server";
import { scannerFetch } from "@/lib/scanner-client";

/**
 * POST /api/scanner/settings/test-api-key/{key_name}
 * Optional body: { key_value?: string } — overrides stored value (test before save)
 * Returns: { valid: boolean, message: string, status_code: number|null }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ key_name: string }> },
) {
  try {
    const { key_name } = await params;
    const body = await req.json().catch(() => ({}));
    const res = await scannerFetch(`/settings/test-api-key/${encodeURIComponent(key_name)}`, {
      method: "POST",
      body: JSON.stringify(body ?? {}),
      timeoutMs: 20000, // upstream API test can be slow
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return NextResponse.json(
        { error: "Failed to test API key", detail: data?.detail ?? `HTTP ${res.status}` },
        { status: res.status },
      );
    }
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json(
      { error: "Failed to test API key", detail: e instanceof Error ? e.message : "unknown" },
      { status: 502 },
    );
  }
}
