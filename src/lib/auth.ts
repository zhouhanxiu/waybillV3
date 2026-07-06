/**
 * 认证模块 — 零依赖会话管理（纯 base64 token + httpOnly cookie）
 * 部署不需要额外安装任何依赖
 */

import { cookies } from "next/headers";

const SESSION_COOKIE = "v3_session";
const COOKIE_MAX_AGE = 8 * 3600; // 8小时

export type SessionPayload = {
  userId: string;
  username: string;
  displayName: string;
  roles: string[];
  exp: number;
};

// ──── 密码工具 ──────────────────────────────────────────────────────

/** 简单 SHA-256 哈希（使用 Node.js 内置 crypto） */
export async function hashPassword(password: string): Promise<string> {
  const { createHash } = await import("node:crypto");
  const salt = process.env.PASSWORD_SALT || "v3-salt";
  return createHash("sha256").update(password + salt).digest("hex");
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  const computed = await hashPassword(password);
  return computed === hash;
}

// ──── 简易 Token ────────────────────────────────────────────────────

function encodeSession(payload: Omit<SessionPayload, "exp">): string {
  const data = { ...payload, exp: Date.now() + COOKIE_MAX_AGE * 1000 };
  return Buffer.from(JSON.stringify(data)).toString("base64url");
}

function decodeSession(token: string): SessionPayload | null {
  try {
    const data = JSON.parse(Buffer.from(token, "base64url").toString("utf-8"));
    if (!data.userId || !data.username || !data.roles || !data.exp) return null;
    if (Date.now() > data.exp) return null; // 过期
    return {
      userId: data.userId,
      username: data.username,
      displayName: data.displayName || data.username,
      roles: data.roles,
      exp: data.exp,
    } as SessionPayload;
  } catch {
    return null;
  }
}

// ──── 会话管理 ──────────────────────────────────────────────────────

export async function createSession(userId: string, username: string, displayName: string, roles: string[]): Promise<string> {
  return encodeSession({ userId, username, displayName, roles });
}

export async function verifySession(token: string): Promise<SessionPayload | null> {
  return decodeSession(token);
}

export async function setSessionCookie(token: string) {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: COOKIE_MAX_AGE,
    path: "/",
  });
}

export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return decodeSession(token);
}

export async function clearSession() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}

/** 要求登录，否则抛出 */
export async function requireAuth(): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) throw new Error("UNAUTHORIZED");
  return session;
}

/** 要求特定角色 */
export async function requireRole(...roles: string[]): Promise<SessionPayload> {
  const session = await requireAuth();
  const hasRole = roles.some((r) => session.roles.includes(r));
  if (!hasRole) throw new Error("FORBIDDEN");
  return session;
}
