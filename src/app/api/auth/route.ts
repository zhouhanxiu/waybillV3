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

    const rows = await query("SELECT * FROM users WHERE name = $1 AND active = true", [username]);
    if (rows.length === 0) {
      return NextResponse.json({ error: "用户名或密码错误" }, { status: 401 });
    }

    const user = rows[0] as any;
    const valid = await verifyPassword(password, user.password_hash);
    if (!valid) {
      return NextResponse.json({ error: "用户名或密码错误" }, { status: 401 });
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
