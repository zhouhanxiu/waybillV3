/**
 * 数据库初始化 API
 */
import { NextResponse } from "next/server";
import { initDb } from "@/lib/db";
import { seedDefaults } from "@/lib/engine/seed";

let initialized = false;

export async function GET() {
  if (initialized) {
    return NextResponse.json({ status: "ok" });
  }
  try {
    await initDb();
    await seedDefaults();
    initialized = true;
    return NextResponse.json({ status: "ok", seeded: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
