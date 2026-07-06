/**
 * 审批流配置 API
 */
import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { uid } from "@/lib/utils";
import { getSession } from "@/lib/auth";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const rows = await query("SELECT * FROM approval_flow_configs WHERE enabled = true ORDER BY created_at DESC");
  const configs = rows.map((r: any) => ({
    id: r.id,
    name: r.name,
    steps: typeof r.steps === "string" ? JSON.parse(r.steps) : r.steps,
    enabled: r.enabled,
    created_at: r.created_at,
    updated_at: r.updated_at,
  }));
  return NextResponse.json({ configs });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || !session.roles.includes("admin")) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  const { name, steps } = await req.json();
  if (!name || !steps || !Array.isArray(steps)) {
    return NextResponse.json({ error: "缺少名称或步骤" }, { status: 400 });
  }

  const id = uid("flow");
  await query(
    `INSERT INTO approval_flow_configs (id, name, steps) VALUES ($1,$2,$3)`,
    [id, name, JSON.stringify(steps)]
  );

  return NextResponse.json({ id, name, steps });
}

export async function PUT(req: NextRequest) {
  const session = await getSession();
  if (!session || !session.roles.includes("admin")) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  const { id, name, steps, enabled } = await req.json();
  if (!id) return NextResponse.json({ error: "缺少ID" }, { status: 400 });

  const updates: string[] = [];
  const params: any[] = [];
  let idx = 0;
  if (name) { idx++; updates.push(`name = $${idx}`); params.push(name); }
  if (steps) { idx++; updates.push(`steps = $${idx}`); params.push(JSON.stringify(steps)); }
  if (enabled !== undefined) { idx++; updates.push(`enabled = $${idx}`); params.push(enabled); }
  idx++; updates.push(`updated_at = NOW()`);
  idx++; params.push(id);

  await query(`UPDATE approval_flow_configs SET ${updates.join(", ")} WHERE id = $${idx}`, params);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (!session || !session.roles.includes("admin")) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "缺少ID" }, { status: 400 });

  await query("DELETE FROM approval_flow_configs WHERE id = $1", [id]);
  return NextResponse.json({ ok: true });
}
