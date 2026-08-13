import { NextRequest, NextResponse } from "next/server";
import { scannerJson } from "@/lib/scanner-client";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const data = await scannerJson("/scan", {
      method: "POST",
      body: JSON.stringify(body),
    });
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json(
      { error: "Failed to start scan", detail: e instanceof Error ? e.message : "unknown" },
      { status: 502 },
    );
  }
}

export async function GET() {
  try {
    const data = await scannerJson("/scans");
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json(
      { error: "Failed to fetch scans", detail: e instanceof Error ? e.message : "unknown" },
      { status: 502 },
    );
  }
}
