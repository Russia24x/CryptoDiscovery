import { NextResponse } from "next/server";
import { scannerJson } from "@/lib/scanner-client";

export async function GET() {
  try {
    const data = await scannerJson("/market/sector-rotation");
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json(
      { error: "Failed to fetch sector rotation", detail: e instanceof Error ? e.message : "unknown" },
      { status: 502 },
    );
  }
}
