import { NextRequest } from "next/server";
import { getDB, getUserId, json, fail, withUserCookie } from "@/lib/server";
import { SIZE, COOLDOWN_MS } from "@/lib/config";

export const dynamic = "force-dynamic";

// Devuelve el lienzo completo como string hex (1 carácter por píxel) + último evento.
export async function GET(req: NextRequest) {
  try {
    const db = await getDB();
    const [pix, last] = await db.batch([
      db.prepare("SELECT idx, color FROM pixels"),
      db.prepare("SELECT COALESCE(MAX(id), 0) AS id FROM events"),
    ]);
    const cells = new Array(SIZE * SIZE).fill("0");
    for (const r of pix.results as { idx: number; color: number }[]) {
      cells[r.idx] = r.color.toString(16);
    }
    let id = getUserId(req);
    let cooldownLeft = 0;
    let name: string | null = null;
    let count = 0;
    if (id) {
      const u = await db
        .prepare("SELECT name, last_paint, count FROM users WHERE id = ?")
        .bind(id)
        .first<{ name: string; last_paint: number; count: number }>();
      if (u) {
        cooldownLeft = Math.max(0, u.last_paint + COOLDOWN_MS - Date.now());
        name = u.name;
        count = u.count;
      }
    }
    const res = json({
      size: SIZE,
      board: cells.join(""),
      lastId: (last.results[0] as { id: number }).id,
      cooldownLeft,
      cooldownMs: COOLDOWN_MS,
      me: { name, count },
    });
    if (!id) {
      id = crypto.randomUUID();
      withUserCookie(res, id);
    }
    return res;
  } catch (e) {
    return fail(e);
  }
}
