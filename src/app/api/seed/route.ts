/**
 * 数据种子 API — 初始化默认规则和用户
 */
import { NextResponse } from "next/server";
import { seedDefaults } from "@/lib/engine/seed";

export async function GET() {
  try {
    const result = await seedDefaults();
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
