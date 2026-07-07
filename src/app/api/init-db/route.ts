/**
 * 数据库初始化 API — 每次访问都会检查并补齐缺失的表和种子数据
 */
import { NextResponse } from "next/server";
import { initDb, query } from "@/lib/db";
import { seedDefaults } from "@/lib/engine/seed";

export async function GET() {
  try {
    await initDb();

    // 始终执行种子脚本（seedDefaults 内部已有去重检查，幂等安全）
    const seedResult = await seedDefaults();
    const countRes = (await query("SELECT COUNT(*)::int AS cnt FROM users")) as any[];

    return NextResponse.json({ status: "ok", seeded: true, users: Number(countRes[0]?.cnt ?? 0) });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
