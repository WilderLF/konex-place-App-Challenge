import { NextRequest } from "next/server";
import { getDB, json, fail } from "@/lib/server";

export const dynamic = "force-dynamic";

// Quién pintó un píxel y cuántas veces cambió.
export async function GET(req: NextRequest) {
  try {
    const idx = Number(req.nextUrl.searchParams.get("i"));
    if (!Number.isInteger(idx)) return json({ error: "Índice inválido" }, 400);
    const db = await getDB();
    const [last, total] = await db.batch([
      db.prepare("SELECT name, color, ts FROM events WHERE idx = ? ORDER BY id DESC LIMIT 1").bind(idx),
      db.prepare("SELECT COUNT(*) AS n FROM events WHERE idx = ?").bind(idx),
    ]);
    return json({
      last: last.results[0] ?? null,
      changes: (total.results[0] as { n: number }).n,
    });
  } catch (e) {
    return fail(e);
  }
}
