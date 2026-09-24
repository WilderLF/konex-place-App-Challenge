import { getDB, json, fail } from "@/lib/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const db = await getDB();
    const [totals, top] = await db.batch([
      db.prepare("SELECT COUNT(*) AS pixels, COUNT(DISTINCT user_id) AS painters FROM events"),
      db.prepare("SELECT name, count FROM users WHERE count > 0 ORDER BY count DESC LIMIT 5"),
    ]);
    return json({
      ...(totals.results[0] as { pixels: number; painters: number }),
      top: top.results,
    });
  } catch (e) {
    return fail(e);
  }
}
