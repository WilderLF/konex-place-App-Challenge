import { NextRequest } from "next/server";
import { getDB, json, fail } from "@/lib/server";

export const dynamic = "force-dynamic";

// Cambios desde el último id conocido + cuánta gente pintó en los últimos 5 min.
export async function GET(req: NextRequest) {
  try {
    const after = Math.max(0, Number(req.nextUrl.searchParams.get("after")) || 0);
    const db = await getDB();
    const since = Date.now() - 5 * 60_000;
    const [ev, active] = await db.batch([
      db
        .prepare("SELECT id, idx, color, name, ts FROM events WHERE id > ? ORDER BY id ASC LIMIT 1000")
        .bind(after),
      db.prepare("SELECT COUNT(DISTINCT user_id) AS n FROM events WHERE ts > ?").bind(since),
    ]);
    return json({
      events: ev.results,
      active: (active.results[0] as { n: number }).n,
    });
  } catch (e) {
    return fail(e);
  }
}
