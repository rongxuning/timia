import { NextResponse } from "next/server";

import { buildApiUsageIndex } from "@/lib/scan-web-api-usage";

const CACHE_TTL_MS = 30_000;
let cached: { at: number; payload: Record<string, unknown> } | null = null;

/** 仅在客户端打开页面时由前端 fetch 触发，不在 RSC 渲染路径中执行 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const force = url.searchParams.get("force") === "1";
  const now = Date.now();

  if (!force && cached && now - cached.at < CACHE_TTL_MS) {
    return NextResponse.json(cached.payload);
  }

  const usage = buildApiUsageIndex();
  const payload = Object.fromEntries(usage);
  cached = { at: now, payload };
  return NextResponse.json(payload);
}
