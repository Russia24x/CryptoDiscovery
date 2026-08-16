import { NextResponse } from "next/server";
import { scannerFetch } from "@/lib/scanner-client";

/**
 * DELETE /api/scanner/settings/api-keys/{key_name}
 * Removes an API key entry (clears value, disables).
 */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ key_name: string }> },
) {
  try {
    const { key_name } = await params;
    const res = await scannerFetch(`/settings/api-keys/${encodeURIComponent(key_name)}`, {
      method: "DELETE",
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return NextResponse.json(
        { error: "Failed to delete API key", detail: data?.detail ?? `HTTP ${res.status}` },
        { status: res.status },
      );
    }
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json(
      { error: "Failed to delete API key", detail: e instanceof Error ? e.message : "unknown" },
      { status: 502 },
    );
  }
}
