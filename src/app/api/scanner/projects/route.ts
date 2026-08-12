import { NextRequest, NextResponse } from "next/server";
import { scannerFetch } from "@/lib/scanner-client";

export async function GET(req: NextRequest) {
  const limit = req.nextUrl.searchParams.get("limit") || "50";
  const res = await scannerFetch(`/projects?limit=${limit}`);
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
