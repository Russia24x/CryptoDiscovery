import { NextResponse } from "next/server";
import { scannerJson } from "@/lib/scanner-client";

export async function GET() {
  try {
    const data = await scannerJson("/correlation", { method: "GET", timeoutMs: 60000 });
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json(
      { error: "Correlation analysis failed", detail: e instanceof Error ? e.message : "unknown" },
      { status: 502 },
    );
  }
}
