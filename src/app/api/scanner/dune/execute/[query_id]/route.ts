import { NextRequest, NextResponse } from "next/server";
import { scannerJson } from "@/lib/scanner-client";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ query_id: string }> },
) {
  const { query_id } = await params;
  try {
    const body = await req.json().catch(() => ({}));
    const data = await scannerJson(
      `/dune/execute/${encodeURIComponent(query_id)}`,
      {
        method: "POST",
        body: JSON.stringify(body.params || {}),
        timeoutMs: 30000,
      },
    );
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json(
      { error: "Dune execute failed", detail: e instanceof Error ? e.message : "unknown" },
      { status: 502 },
    );
  }
}
