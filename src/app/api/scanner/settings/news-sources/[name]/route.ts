import { NextResponse } from "next/server";
import { scannerFetch } from "@/lib/scanner-client";

/**
 * DELETE /api/scanner/settings/news-sources/{name}
 * Removes a news source by name (case-insensitive).
 */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  try {
    const { name } = await params;
    const res = await scannerFetch(`/settings/news-sources/${encodeURIComponent(name)}`, {
      method: "DELETE",
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return NextResponse.json(
        { error: "Failed to delete news source", detail: data?.detail ?? `HTTP ${res.status}` },
        { status: res.status },
      );
    }
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json(
      { error: "Failed to delete news source", detail: e instanceof Error ? e.message : "unknown" },
      { status: 502 },
    );
  }
}
