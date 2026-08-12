import { NextResponse } from "next/server";
import { scannerFetch } from "@/lib/scanner-client";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const res = await scannerFetch(`/project/${id}`);
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
