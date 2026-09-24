import { NextRequest } from "next/server";
import { getDB, getUserId, json, fail, withUserCookie } from "@/lib/server";
import { SIZE, COOLDOWN_MS, PALETTE } from "@/lib/config";

export const dynamic = "force-dynamic";

function cleanName(raw: unknown): string {
  const s = typeof raw === "string" ? raw : "";
  const n = s.replace(/[^\p{L}\p{N} _.\-@]/gu, "").trim().slice(0, 20);
  return n || "anónimo";
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const x = Number(body.x), y = Number(body.y), c = Number(body.c);
    if (![x, y, c].every(Number.isInteger) || x < 0 || y < 0 || x >= SIZE || y >= SIZE || c < 0 || c >= PALETTE.length) {
      return json({ error: "Píxel o color inválido" }, 400);
    }
    const name = cleanName(body.name);
    let id = getUserId(req);
    const isNew = !id;
    if (!id) id = crypto.randomUUID();

    const db = await getDB();
    const now = Date.now();
    await db
      .prepare("INSERT OR IGNORE INTO users (id, name, last_paint, count) VALUES (?, ?, 0, 0)")
      .bind(id, name)
      .run();

    // Reserva atómica del turno: solo actualiza si ya pasó el cooldown.
    const claim = await db
      .prepare("UPDATE users SET last_paint = ?, count = count + 1, name = ? WHERE id = ? AND last_paint <= ?")
      .bind(now, name, id, now - COOLDOWN_MS)
      .run();

    if (!claim.meta.changes) {
      const u = await db.prepare("SELECT last_paint FROM users WHERE id = ?").bind(id).first<{ last_paint: number }>();
      const left = Math.max(0, (u?.last_paint ?? now) + COOLDOWN_MS - now);
      return json({ error: "Todavía no podés pintar", cooldownLeft: left }, 429);
    }

    const idx = y * SIZE + x;
    const [, ev] = await db.batch([
      db
        .prepare(
          "INSERT INTO pixels (idx, color, user_id, ts) VALUES (?, ?, ?, ?) ON CONFLICT(idx) DO UPDATE SET color = excluded.color, user_id = excluded.user_id, ts = excluded.ts"
        )
        .bind(idx, c, id, now),
      db
        .prepare("INSERT INTO events (idx, color, user_id, name, ts) VALUES (?, ?, ?, ?, ?) RETURNING id")
        .bind(idx, c, id, name, now),
    ]);
    const res = json({ ok: true, id: (ev.results[0] as { id: number }).id, cooldownLeft: COOLDOWN_MS });
    if (isNew) withUserCookie(res, id);
    return res;
  } catch (e) {
    return fail(e);
  }
}
