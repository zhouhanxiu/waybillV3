/**
 * 登录 / 登出 API
 */
import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { hashPassword, verifyPassword, createSession, setSessionCookie, clearSession, getSession } from "@/lib/auth";

// POST /api/auth/login
export async function POST(req: NextRequest) {
  try {
    const { username, password } = await req.json();
    if (!username || !password) {
      return NextResponse.json({ error: "用户名和密码不能为空" }, { status: 400 });
    }

    // 先查出所有活跃用户看看有没有匹配（避免 $1 参数绑定问题）
    const allActive = await query("SELECT * FROM users WHERE active = true");
    const user = (allActive as any[]).find(
      (u: any) => u.name === username
    );

    if (!user) {
      return NextResponse.json({
        error: `用户名或密码错误 (用户不存在: ${username}, 活跃用户数: ${allActive.length})`
      }, { status: 401 });
    }

    if (!user.password_hash) {
      // 没有密码哈希，尝试用默认哈希
      const defaultHash = await hashPassword("admin");
      await query("UPDATE users SET password_hash = $1 WHERE id = $2", [defaultHash, user.id]);
      user.password_hash = defaultHash;
    }

    const valid = await verifyPassword(password, user.password_hash);
    if (!valid) {
      const computed = await hashPassword(password);
      return NextResponse.json({
        error: `密码错误 (expected prefix: ${user.password_hash.substring(0, 8)}..., got: ${computed.substring(0, 8)}...)`
      }, { status: 401 });
    }

    const roles: string[] = typeof user.roles === "string" ? JSON.parse(user.roles) : (user.roles || []);
    const token = await createSession(user.id, user.name, user.display_name || user.name, roles);
    await setSessionCookie(token);

    return NextResponse.json({
      id: user.id,
      name: user.name,
      display_name: user.display_name || user.name,
      roles,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// DELETE /api/auth — 登出
export async function DELETE() {
  await clearSession();
  return NextResponse.json({ ok: true });
}

// GET /api/auth — 获取当前用户
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ user: null });
  }
  return NextResponse.json({
    user: {
      id: session.userId,
      name: session.username,
      display_name: session.displayName || session.username,
      roles: session.roles,
    },
  });
}
