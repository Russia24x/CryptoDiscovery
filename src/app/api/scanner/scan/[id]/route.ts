import { NextResponse } from "next/server";
import { scannerJson } from "@/lib/scanner-client";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const data = await scannerJson(`/scan/${id}`);
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json(
      { error: "Failed to fetch scan", detail: e instanceof Error ? e.message : "unknown" },
      { status: 502 },
    );
  }
}
