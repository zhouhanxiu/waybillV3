import { NextResponse } from "next/server";
import { getV2BaseUrl } from "@/lib/v2-client";

export async function GET() {
  return NextResponse.json({
    v2_base_url: getV2BaseUrl(),
    env_v2_api_base_url: process.env.V2_API_BASE_URL || null,
    node_env: process.env.NODE_ENV || null,
  });
}
