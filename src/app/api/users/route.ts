/**
 * 用户管理 API — 仅 admin 可操作
 */
import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { uid } from "@/lib/utils";
import { hashPassword, getSession } from "@/lib/auth";

// GET — 获取用户列表
export async function GET(req: NextRequest) {
  // 如果用户表为空，自动初始化默认用户（在权限检查前执行，确保首次部署后可用）
  let rows = await query("SELECT id, name, display_name, roles, active, created_at, updated_at FROM users ORDER BY created_at DESC");
  if (rows.length === 0) {
    try {
      const { seedDefaults } = await import("@/lib/engine/seed");
      await seedDefaults();
      rows = await query("SELECT id, name, display_name, roles, active, created_at, updated_at FROM users ORDER BY created_at DESC");
    } catch (e: any) {
      return NextResponse.json({ error: `初始化默认用户失败: ${e.message}` }, { status: 500 });
    }
  }

  const session = await getSession();
  if (!session || !session.roles.includes("admin")) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  const users = rows.map((r: any) => ({
    id: r.id,
    name: r.name,
    display_name: r.display_name || r.name,
    roles: typeof r.roles === "string" ? JSON.parse(r.roles) : r.roles,
    active: r.active,
    created_at: r.created_at,
    updated_at: r.updated_at,
  }));

  return NextResponse.json({ users });
}

// POST — 创建用户
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || !session.roles.includes("admin")) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  try {
    const { name, password, display_name, roles } = await req.json();
    if (!name || !password) {
      return NextResponse.json({ error: "用户名和密码不能为空" }, { status: 400 });
    }

    // 检查用户名是否已存在
    const existing = await query("SELECT id FROM users WHERE name = $1", [name]);
    if (existing.length > 0) {
      return NextResponse.json({ error: "用户名已存在" }, { status: 409 });
    }

    const id = uid("user");
    const passwordHash = await hashPassword(password);
    const userRoles = roles && roles.length > 0 ? roles : ["reporter"];

    await query(
      `INSERT INTO users (id, name, password_hash, display_name, roles, active) VALUES ($1,$2,$3,$4,$5,$6)`,
      [id, name, passwordHash, display_name || name, JSON.stringify(userRoles), true]
    );

    return NextResponse.json({ id, name, display_name: display_name || name, roles: userRoles });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// PUT — 更新用户
export async function PUT(req: NextRequest) {
  const session = await getSession();
  if (!session || !session.roles.includes("admin")) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  try {
    const { id, name, password, display_name, roles, active } = await req.json();
    if (!id) {
      return NextResponse.json({ error: "缺少用户ID" }, { status: 400 });
    }

    const updates: string[] = [];
    const params: any[] = [];
    let idx = 0;

    if (display_name !== undefined) {
      idx++; updates.push(`display_name = $${idx}`); params.push(display_name);
    }
    if (roles !== undefined) {
      idx++; updates.push(`roles = $${idx}`); params.push(JSON.stringify(roles));
    }
    if (active !== undefined) {
      idx++; updates.push(`active = $${idx}`); params.push(active);
    }
    if (password) {
      idx++; updates.push(`password_hash = $${idx}`); params.push(await hashPassword(password));
    }
    if (name) {
      idx++; updates.push(`name = $${idx}`); params.push(name);
    }

    if (updates.length === 0) {
      return NextResponse.json({ error: "无变更" }, { status: 400 });
    }

    idx++; updates.push(`updated_at = NOW()`);
    idx++; params.push(id);

    await query(`UPDATE users SET ${updates.join(", ")} WHERE id = $${idx}`, params);

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// DELETE — 删除用户 (?id=xxx)
export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (!session || !session.roles.includes("admin")) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "缺少用户ID" }, { status: 400 });

    // 不允许删除自己
    if (id === session.userId) {
      return NextResponse.json({ error: "不能删除自己" }, { status: 400 });
    }

    await query("DELETE FROM users WHERE id = $1", [id]);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
