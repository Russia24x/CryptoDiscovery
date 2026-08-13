import { NextResponse } from "next/server";
import { scannerJson } from "@/lib/scanner-client";

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
