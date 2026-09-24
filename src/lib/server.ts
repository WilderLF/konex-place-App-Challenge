import { getCloudflareContext } from "@opennextjs/cloudflare";
import { NextRequest, NextResponse } from "next/server";

export async function getDB(): Promise<D1Database> {
  const { env } = await getCloudflareContext({ async: true });
  const db = (env as unknown as { DB?: D1Database }).DB;
  if (!db) throw new Error("La base de datos DB no está conectada");
  return db;
}

export const COOKIE = "kp_id";

export function getUserId(req: NextRequest): string | null {
  const v = req.cookies.get(COOKIE)?.value;
  return v && /^[a-f0-9-]{36}$/.test(v) ? v : null;
}

export function withUserCookie(res: NextResponse, id: string) {
  res.cookies.set(COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}

export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

export function fail(e: unknown) {
  const msg = e instanceof Error ? e.message : "Error inesperado";
  return NextResponse.json({ error: msg }, { status: 500 });
}
