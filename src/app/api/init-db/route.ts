/**
 * 数据库初始化 API — 每次访问都会检查并补齐缺失的表和种子数据
 */
import { NextResponse } from "next/server";
import { initDb, query } from "@/lib/db";
import { seedDefaults } from "@/lib/engine/seed";

export async function GET() {
  try {
    await initDb();

    // 检查用户表是否为空，若为空则重新执行种子脚本
    const countRes = (await query("SELECT COUNT(*)::int AS cnt FROM users")) as any[];
    const userCount = countRes[0]?.cnt ?? 0;

    if (Number(userCount) === 0) {
      await seedDefaults();
      return NextResponse.json({ status: "ok", seeded: true, users: 6 });
    }

    return NextResponse.json({ status: "ok", seeded: false, users: Number(userCount) });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
