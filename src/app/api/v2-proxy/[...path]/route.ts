/**
 * V2 代理 — 测试页面通过此代理访问 V2 接口，避免跨域问题
 */
import { getV2BaseUrl } from "@/lib/v2-client";
import { NextRequest, NextResponse } from "next/server";

const V2_API_KEY = "v3-internal-key";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  return proxyToV2(request, "GET", await params);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  return proxyToV2(request, "POST", await params);
}

async function proxyToV2(
  request: NextRequest,
  method: string,
  { path }: { path: string[] }
) {
  const start = Date.now();
  try {
    const pathStr = "/" + path.join("/");
    const searchParams = request.nextUrl.search;
    const v2Url = `${getV2BaseUrl()}${pathStr}${searchParams}`;

    const body = method === "POST" ? await request.text().catch(() => "") : undefined;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 25_000);

    // 转发客户端发送的请求头，不自动添加 auth
    const forwardHeaders: Record<string, string> = {
      "Content-Type": "application/json",
    };
    const clientAuth = request.headers.get("authorization");
    if (clientAuth) forwardHeaders["Authorization"] = clientAuth;
    const clientReqId = request.headers.get("x-request-id");
    if (clientReqId) forwardHeaders["X-Request-ID"] = clientReqId;

    const res = await fetch(v2Url, {
      method,
      headers: forwardHeaders,
      body: body || undefined,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const text = await res.text();
    const ms = Date.now() - start;

    let json: any;
    try { json = JSON.parse(text); } catch { json = null; }

    return NextResponse.json(
      { ok: res.ok, status: res.status, body: json ?? text, ms, proxied: true },
      { status: res.ok ? 200 : res.status }
    );
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, status: 0, body: { error: err.message }, ms: Date.now() - start, proxied: true },
      { status: 502 }
    );
  }
}
