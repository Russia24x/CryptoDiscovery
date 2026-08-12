import { NextResponse } from "next/server";
import { scannerFetch } from "@/lib/scanner-client";

export async function GET() {
  const res = await scannerFetch("/scans");
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
