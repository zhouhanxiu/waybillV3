/**
 * 调试端点 — 诊断登录问题
 * 访问后记得删除此文件
 */
import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { createHash } from "node:crypto";

export async function GET() {
  const result: any = {};

  try {
    // 1. 测试数据库连接
    const dbTest = await query("SELECT 1 AS ok");
    result.dbConnected = dbTest.length > 0;
  } catch (e: any) {
    result.dbConnected = false;
    result.dbError = e.message;
  }

  try {
    // 2. 查看所有用户
    const users = await query("SELECT id, name, display_name, roles, active FROM users");
    result.usersCount = users.length;
    result.users = (users as any[]).map((u) => ({
      name: u.name,
      display_name: u.display_name,
      roles: typeof u.roles === "string" ? u.roles : JSON.stringify(u.roles),
      active: u.active,
    }));
  } catch (e: any) {
    result.userQueryError = e.message;
  }

  try {
    // 3. 查看 admin 用户的密码哈希前缀
    const adminRows = await query("SELECT password_hash FROM users WHERE name = 'admin'");
    if (adminRows.length > 0) {
      const hash = (adminRows[0] as any).password_hash || "";
      result.adminHashPrefix = hash.substring(0, 20) + "...";
      result.adminHashLength = hash.length;
    } else {
      result.adminNotFound = true;
    }
  } catch (e: any) {
    result.adminQueryError = e.message;
  }

  // 4. 当前环境计算的 admin 密码哈希
  const salt = process.env.PASSWORD_SALT || "v3-salt";
  result.computedHash = createHash("sha256").update("admin" + salt).digest("hex");
  result.salt = salt;
  result.passwordUsed = "admin";

  // 5. 环境信息
  result.nodeEnv = process.env.NODE_ENV;
  result.hasDatabaseUrl = !!process.env.DATABASE_URL;

  return NextResponse.json(result);
}
