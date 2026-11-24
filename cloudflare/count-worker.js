/**
 * Not Nine Bar's usage counter, a Cloudflare Worker with a KV namespace bound
 * as COUNTS, served at https://count.not9bar.com.
 *
 *   POST /hit/d   a device opened the site today (the site sends it once a day)
 *   POST /hit/s   a Station connected to a machine today
 *   GET  /days?n=14   the last n days (UTC), newest first: [{ day, d, s }]
 *
 * Anonymous: only the day's totals are kept (no IP, no device id). The day is
 * taken here (UTC), so a visitor can only add to today. Pasted into the
 * Cloudflare dashboard; see README.md.
 */

const ALLOWED_ORIGIN = "https://not9bar.com";

const today = () => new Date().toISOString().slice(0, 10);

function cors(origin) {
  return {
    "Access-Control-Allow-Origin": origin === ALLOWED_ORIGIN || /^http:\/\/localhost:\d+$/.test(origin ?? "") ? origin : ALLOWED_ORIGIN,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin",
  };
}

function json(body, origin, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...cors(origin) },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin");
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origin) });

    // POST /hit/d  or  /hit/s: today's total + 1
    const hit = /^\/hit\/(d|s)$/.exec(url.pathname);
    if (hit && request.method === "POST") {
      // Only the site counts (browsers send its Origin)
      if (origin !== ALLOWED_ORIGIN) return json({ error: "not allowed" }, origin, 403);
      const key = `${hit[1]}-${today()}`;
      const value = Number((await env.COUNTS.get(key)) ?? 0) + 1;
      // Kept for two years
      await env.COUNTS.put(key, String(value), { expirationTtl: 60 * 60 * 24 * 730 });
      return json({ value }, origin);
    }

    // GET /days?n=14: the last n days
    if (url.pathname === "/days" && request.method === "GET") {
      const n = Math.min(90, Math.max(1, Number(url.searchParams.get("n")) || 14));
      const now = Date.now();
      const days = Array.from({ length: n }, (_, i) => new Date(now - i * 86_400_000).toISOString().slice(0, 10));
      const out = await Promise.all(days.map(async (day) => ({
        day,
        d: Number((await env.COUNTS.get(`d-${day}`)) ?? 0),
        s: Number((await env.COUNTS.get(`s-${day}`)) ?? 0),
      })));
      return json(out, origin);
    }

    return json({ error: "not found" }, origin, 404);
  },
};
