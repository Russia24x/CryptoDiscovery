import { NextResponse } from "next/server";
import { scannerJson } from "@/lib/scanner-client";

export async function GET() {
  try {
    const data = await scannerJson("/health");
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json(
      { error: "Scanner service unavailable", detail: e instanceof Error ? e.message : "unknown" },
      { status: 503 },
    );
  }
}
