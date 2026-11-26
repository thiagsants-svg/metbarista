/**
 * Not Nine Bar's usage counter, a Cloudflare Worker with a KV namespace bound
 * as COUNTS, served at https://count.not9bar.com.
 *
 *   POST /hit/d   a device opened the site today (the site sends it once a day)
 *   POST /hit/s   a Station connected to a machine today
 *   POST /hit/n   a browser opened the site for the first time (sent once ever)
 *   POST /hit/m   {"c":"3fa2"} a machine's short code (4 hex digits, sent once
 *                 per machine and browser; see machineCode in lib/usage.ts)
 *   GET  /totals  { machines, devices }: different machines (estimated) and browsers
 *   GET  /days?n=14   the last n days (UTC), newest first: [{ day, d, s }]
 *   GET  /summary     { today: {d, s}, week: {d, s}, web: {visits, pageViews} | null }
 *                     (web: Cloudflare Web Analytics, last 7 days, when configured)
 *
 * Anonymous: only the day's totals are kept (no IP, no device id). For
 * machines, only the set of short codes is kept, with no date, time or IP:
 * 65,536 possible codes, so a code can't be turned back into a serial. The day is
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

    // POST /hit/n: one more browser, ever
    if (url.pathname === "/hit/n" && request.method === "POST") {
      if (origin !== ALLOWED_ORIGIN) return json({ error: "not allowed" }, origin, 403);
      const value = Number((await env.COUNTS.get("n-total")) ?? 0) + 1;
      await env.COUNTS.put("n-total", String(value));
      return json({ value }, origin);
    }

    // POST /hit/m {"c":"3fa2"}: this machine's code joins the set (nothing else stored)
    if (url.pathname === "/hit/m" && request.method === "POST") {
      if (origin !== ALLOWED_ORIGIN) return json({ error: "not allowed" }, origin, 403);
      const body = await request.json().catch(() => null);
      const code = typeof body?.c === "string" ? body.c.toLowerCase() : "";
      if (!/^[0-9a-f]{4}$/.test(code)) return json({ error: "bad code" }, origin, 400);
      if (!(await env.COUNTS.get(`m-${code}`))) await env.COUNTS.put(`m-${code}`, "1");
      return json({ ok: true }, origin);
    }

    // GET /totals: different machines (corrected for shared codes) and browsers
    if (url.pathname === "/totals" && request.method === "GET") {
      let codes = 0, cursor;
      do {
        const page = await env.COUNTS.list({ prefix: "m-", cursor });
        codes += page.keys.length;
        cursor = page.list_complete ? undefined : page.cursor;
      } while (cursor);
      // Linear counting: two machines may share a code, so a few more than the codes seen
      const M = 65536;
      const machines = codes >= M ? codes : Math.round(-M * Math.log(1 - codes / M));
      const devices = Number((await env.COUNTS.get("n-total")) ?? 0);
      return json({ machines, devices }, origin);
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

    // GET /summary: today and the last 7 days, plus Web Analytics when configured
    if (url.pathname === "/summary" && request.method === "GET") {
      const cache = caches.default;
      const cacheKey = new Request(`${url.origin}/summary`);
      const cached = await cache.match(cacheKey);
      if (cached) {
        const body = await cached.text();
        return new Response(body, { headers: { "Content-Type": "application/json", ...cors(origin) } });
      }
      const now = Date.now();
      const week = Array.from({ length: 7 }, (_, i) => new Date(now - i * 86_400_000).toISOString().slice(0, 10));
      const counts = await Promise.all(week.map(async (day) => ({
        d: Number((await env.COUNTS.get(`d-${day}`)) ?? 0),
        s: Number((await env.COUNTS.get(`s-${day}`)) ?? 0),
      })));
      const summary = {
        today: counts[0],
        week: counts.reduce((t, c) => ({ d: t.d + c.d, s: t.s + c.s }), { d: 0, s: 0 }),
        web: await webAnalytics(env, now).catch(() => null),
      };
      const body = JSON.stringify(summary);
      // Ten minutes: keeps Cloudflare's analytics API calls low
      await cache.put(cacheKey, new Response(body, { headers: { "Cache-Control": "max-age=600" } }));
      return new Response(body, { headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...cors(origin) } });
    }

    return json({ error: "not found" }, origin, 404);
  },
};

/**
 * Visits and page views of the last 7 days from Cloudflare Web Analytics. Needs
 * three settings on this Worker: CF_API_TOKEN (secret; a token with "Account
 * Analytics: Read"), CF_ACCOUNT_ID and CF_SITE_TAG. Without them: null.
 */
async function webAnalytics(env, now) {
  if (!env.CF_API_TOKEN || !env.CF_ACCOUNT_ID || !env.CF_SITE_TAG) return null;
  const query = `query ($account: String!, $site: String!, $from: Time!, $to: Time!) {
    viewer { accounts(filter: { accountTag: $account }) {
      rumPageloadEventsAdaptiveGroups(limit: 1, filter: { AND: [{ datetime_geq: $from, datetime_leq: $to }, { siteTag: $site }] }) {
        count
        sum { visits }
      }
    } }
  }`;
  const res = await fetch("https://api.cloudflare.com/client/v4/graphql", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.CF_API_TOKEN}` },
    body: JSON.stringify({
      query,
      variables: {
        account: env.CF_ACCOUNT_ID,
        site: env.CF_SITE_TAG,
        from: new Date(now - 7 * 86_400_000).toISOString(),
        to: new Date(now).toISOString(),
      },
    }),
  });
  const data = await res.json();
  const g = data?.data?.viewer?.accounts?.[0]?.rumPageloadEventsAdaptiveGroups?.[0];
  if (!g) return data?.errors ? null : { visits: 0, pageViews: 0 };
  return { visits: g.sum?.visits ?? 0, pageViews: g.count ?? 0 };
}
