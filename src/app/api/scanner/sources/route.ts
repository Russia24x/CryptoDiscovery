import { NextResponse } from "next/server";
import { scannerJson } from "@/lib/scanner-client";

export async function GET() {
  try {
    const data = await scannerJson("/sources", { method: "GET" });
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json(
      { error: "Sources status failed", detail: e instanceof Error ? e.message : "unknown" },
      { status: 502 },
    );
  }
}
