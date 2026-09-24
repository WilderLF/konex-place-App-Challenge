import { NextRequest } from "next/server";
import { getDB, json, fail } from "@/lib/server";

export const dynamic = "force-dynamic";

// Historial compacto para el timelapse: [idx, color] en orden, paginado.
export async function GET(req: NextRequest) {
  try {
    const after = Math.max(0, Number(req.nextUrl.searchParams.get("after")) || 0);
    const db = await getDB();
    const { results } = await db
      .prepare("SELECT id, idx, color FROM events WHERE id > ? ORDER BY id ASC LIMIT 5000")
      .bind(after)
      .all<{ id: number; idx: number; color: number }>();
    return json({
      events: results.map((r) => [r.idx, r.color]),
      nextAfter: results.length ? results[results.length - 1].id : null,
      done: results.length < 5000,
    });
  } catch (e) {
    return fail(e);
  }
}
