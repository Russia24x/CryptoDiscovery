import { NextResponse } from "next/server";
import { scannerJson } from "@/lib/scanner-client";

export async function GET() {
  try {
    const data = await scannerJson("/cmc/categories", { method: "GET", timeoutMs: 20000 });
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json(
      { error: "CMC categories fetch failed", detail: e instanceof Error ? e.message : "unknown" },
      { status: 502 },
    );
  }
}
