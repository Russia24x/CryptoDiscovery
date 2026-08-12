import { NextRequest, NextResponse } from "next/server";
import { scannerFetch } from "@/lib/scanner-client";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const res = await scannerFetch("/scan", {
    method: "POST",
    body: JSON.stringify(body),
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}

export async function GET() {
  const res = await scannerFetch("/scans");
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
