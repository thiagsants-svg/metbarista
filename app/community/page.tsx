"use client";

import { useEffect, useState } from "react";
import { ChevronDown, ExternalLink, MessageSquare, Coffee, GitBranch, Wrench, BookOpen, HelpCircle, Loader2, RefreshCw, Radio, Zap } from "lucide-react";
import { useStationTheme } from "@/lib/station/use-theme";
import { APP_NAME, REPO_URL, UPSTREAM } from "@/lib/brand";
import { CHANNELS, latestChangelog, latestPerChannel, markCompanyUpdateSeen, type BuildChangelog, type Channel } from "@/lib/firmware";

const DISCORD_INVITE = "https://discord.gg/w48ha2h3";
const PROXY = "https://metbarista-feed-proxy.metbarista.workers.dev/?url=";

// ─── Atom feed fetcher ────────────────────────────────────────────────────────

interface FeedItem {
  title: string;
  date: string;
  link: string;
  snippet: string;
}

async function fetchFeed(url: string): Promise<FeedItem[]> {
  const res = await fetch(PROXY + encodeURIComponent(url));
  const text = await res.text();
  const parser = new DOMParser();
  const doc = parser.parseFromString(text, "application/xml");
  const entries = Array.from(doc.querySelectorAll("entry")).slice(0, 5);

  // de-dupe by title (Shopify duplicates each entry)
  const seen = new Set<string>();
  const items: FeedItem[] = [];

  for (const e of entries) {
    const title = e.querySelector("title")?.textContent?.trim() ?? "";
    if (seen.has(title)) continue;
    seen.add(title);

    const link = e.querySelector("link")?.getAttribute("href") ?? "";
    const updated = e.querySelector("published")?.textContent?.trim() || e.querySelector("updated")?.textContent?.trim() || "";
    // Firmware titles carry their own date, "2026M1063-Stable (January 14, 2026)": the post can be weeks later
    const inTitle = /\(([A-Z][a-z]+ \d{1,2}, \d{4})\)/.exec(title)?.[1];
    const when = inTitle && !Number.isNaN(Date.parse(inTitle)) ? inTitle : updated;
    const raw = e.querySelector("content")?.textContent ?? "";
    // strip <style> blocks and HTML tags
    const stripped = raw
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    // "&amp;" and friends back to their characters (a textarea decodes without running anything)
    const box = document.createElement("textarea");
    box.innerHTML = stripped;
    const text = box.value;

    items.push({
      title,
      date: when ? new Date(when).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "",
      link,
      snippet: text.slice(0, 130),
    });
  }
  return items;
}

// ─── Feed section component ────────────────────────────────────────────────────

/** The newest firmware of each channel, from Meticulous's GitHub (the changelog below can lag) */
/** The machine's parts, as the changelog names them */
const COMPONENT: Record<string, string> = {
  backend: "Machine software", dial: "Dial", "web-app": "Web app", firmware: "Motor board", linux: "Linux",
  watcher: "Watcher", "plotter-ui": "Plotter", "crash-reporter": "Crash reporter", "meticulous-machine": "Build and updates",
  uboot: "Boot loader",
};

/** One channel: its newest version, and on a tap what changed in it */
function ChannelChangelog({ channel, version }: { channel: Channel; version: string }) {
  const [open, setOpen] = useState(false);
  const [log, setLog] = useState<BuildChangelog | null | "loading" | "failed">(null);
  function toggle() {
    const next = !open;
    setOpen(next);
    if (next && log === null) {
      setLog("loading");
      latestChangelog(channel).then((l) => setLog(l ?? "failed")).catch(() => setLog("failed"));
    }
  }
  const count = log && typeof log === "object" ? log.groups.reduce((n, g) => n + g.items.length, 0) : null;
  return (
    <div className="rounded-xl border border-[var(--ink)]/15 bg-[var(--ink)]/[0.04]">
      <button type="button" onClick={toggle} aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left">
        <span className="text-sm font-semibold capitalize text-[var(--ink)]">{channel}</span>
        <span className="flex items-center gap-2 font-mono text-sm tabular-nums text-[var(--ink)]/85">
          {version}
          <ChevronDown className={`h-4 w-4 text-[var(--ink)]/50 transition-transform ${open ? "rotate-180" : ""}`} />
        </span>
      </button>
      {open && (
        <div className="border-t border-[var(--ink)]/10 px-4 py-3 text-sm">
          {log === "loading" || log === null ? (
            <Loader2 className="mx-auto h-4 w-4 animate-spin text-[var(--ink)]/60" />
          ) : log === "failed" ? (
            <p className="text-[var(--ink)]/60">Couldn&apos;t read the changes from GitHub.</p>
          ) : (
            <>
              <p className="text-xs text-[var(--ink)]/60">
                {log.version} · built {log.date} · {count} changes ·{" "}
                <a href={`https://github.com/MeticulousHome/meticulous-machine/tree/${channel}/${version}`} target="_blank" rel="noopener noreferrer"
                  className="underline underline-offset-2">on GitHub</a>
              </p>
              {log.version !== version && (
                <p className="mt-1 text-xs text-[var(--ink)]/60">The newest changelog published is for {log.version}.</p>
              )}
              {log.groups.map((g) => (
                <div key={g.component} className="mt-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-[var(--ink)]/70">{COMPONENT[g.component] ?? g.component}</p>
                  <ul className="mt-1 space-y-1">
                    {g.items.map((it, k) => (
                      <li key={k} className="flex gap-2 text-[var(--ink)]/85">
                        <span className={`mt-0.5 shrink-0 rounded px-1.5 text-xs font-bold uppercase ${it.kind === "feat" ? "bg-[var(--good)]/15 text-[var(--good)]" : "bg-[var(--ink)]/10 text-[var(--ink)]/70"}`}>
                          {it.kind === "feat" ? "new" : it.kind === "perf" ? "faster" : "fix"}
                        </span>
                        <span className="min-w-0">{it.scope && <span className="text-[var(--ink)]/55">{it.scope}: </span>}{it.text}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function LatestFirmware() {
  const [latest, setLatest] = useState<Record<Channel, string | null> | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => { latestPerChannel().then(setLatest).catch(() => setFailed(true)); }, []);
  const found = latest && CHANNELS.some((c) => latest[c]);
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Zap className="h-4 w-4" style={{ color: "var(--accent)" }} />
        <h2 className="text-sm font-semibold text-[var(--ink)]/85">Firmware</h2>
      </div>
      {!latest && !failed ? (
        <div className="flex justify-center py-6"><Loader2 className="h-4 w-4 animate-spin text-[var(--ink)]/60" /></div>
      ) : !found ? (
        <p className="rounded-xl border border-[var(--ink)]/15 bg-[var(--ink)]/[0.04] px-4 py-3 text-xs text-[var(--ink)]/60 text-center">
          Couldn&apos;t read the newest firmware from GitHub.
        </p>
      ) : (
        <>
          {CHANNELS.filter((c) => latest![c]).map((c) => <ChannelChangelog key={c} channel={c} version={latest![c]!} />)}
          <p className="text-xs text-[var(--ink)]/60">
            The newest build of each channel, from Meticulous&apos;s GitHub: tap one to see what changed (new features and fixes, as the developers wrote them). Each machine gets it over a few days.
          </p>
        </>
      )}
    </div>
  );
}

function FeedSection({ label, url, icon: Icon, color, onItems }: {
  label: string; url: string;
  icon: React.ElementType; color: string;
  /** The items, once loaded */
  onItems?: (items: FeedItem[]) => void;
}) {
  const [items, setItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  function load() {
    setLoading(true);
    setError(false);
    fetchFeed(url)
      .then((list) => { setItems(list); onItems?.(list); })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }

  // Loads the feed once; load() sets its own loading state
  // eslint-disable-next-line react-hooks/exhaustive-deps, react-hooks/set-state-in-effect
  useEffect(() => { load(); }, []);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4" style={{ color }} />
          <h2 className="text-sm font-semibold text-[var(--ink)]/85">{label}</h2>
        </div>
        <button onClick={load} className="text-[var(--ink)]/60 hover:text-[var(--ink)] transition-colors">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {loading && (
        <div className="flex items-center gap-2 py-6 justify-center">
          <Loader2 className="h-4 w-4 animate-spin text-[var(--ink)]/60" />
        </div>
      )}

      {error && !loading && (
        <div className="rounded-xl border border-[var(--ink)]/15 bg-[var(--ink)]/[0.04] px-4 py-3 text-xs text-[var(--ink)]/60 text-center">
          Couldn&apos;t load feed — <button onClick={load} className="underline hover:text-[var(--ink)]">retry</button>
        </div>
      )}

      {!loading && !error && (
        <div className="space-y-1.5">
          {items.map((item) => (
            <a key={item.link} href={item.link} target="_blank" rel="noopener noreferrer"
              className="group flex flex-col gap-1 rounded-xl border border-[var(--ink)]/15 bg-[var(--ink)]/[0.04] px-4 py-3.5 hover:border-[var(--ink)]/30 hover:bg-[var(--ink)]/[0.07] transition-all">
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-medium text-[var(--ink)]/85 group-hover:text-[var(--ink)] transition-colors leading-snug">
                  {item.title}
                </p>
                <div className="flex items-center gap-1.5 shrink-0">
                  {item.date && <span className="text-xs text-[var(--ink)]/60 font-mono">{item.date}</span>}
                  <ExternalLink className="h-3 w-3 text-[var(--ink)]/60 group-hover:text-[var(--accent)] transition-colors" />
                </div>
              </div>
              {item.snippet && (
                <p className="text-xs text-[var(--ink)]/60 leading-relaxed line-clamp-2">{item.snippet}…</p>
              )}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Static resource links ────────────────────────────────────────────────────

const RESOURCES = [
  { icon: Coffee,   label: UPSTREAM.name,             href: UPSTREAM.siteUrl,                                           desc: `The open control center for Meticulous by ${UPSTREAM.author}: ${APP_NAME} is built on it` },
  { icon: GitBranch, label: `${APP_NAME} on GitHub`, href: REPO_URL,                                                    desc: "This app's source code" },
  { icon: BookOpen, label: "Quick Start Guide",      href: "https://meticuloushome.com/pages/quick-start-guide",      desc: "Unboxing, WiFi setup, first shot" },
  { icon: Wrench,   label: "Maintenance & Repairs",  href: "https://meticuloushome.com/pages/maintenance-and-repairs", desc: "Cleaning schedule, piston removal, deep clean" },
  { icon: HelpCircle, label: "FAQ",                  href: "https://meticuloushome.com/pages/faq",                    desc: "Shipping, warranty, common questions" },
  { icon: Coffee,   label: "metprofiles.link",        href: "https://metprofiles.link",                                desc: "Community espresso profiles" },
  { icon: GitBranch, label: "GitHub (MeticulousHome)", href: "https://github.com/MeticulousHome",                     desc: "Firmware, API, open source code" },
  { icon: Radio,    label: "MeticAI",                 href: "https://github.com/hessius/MeticAI",                     desc: "AI profile generator from bag photos" },
];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CommunityPage() {
  const { style } = useStationTheme();
  return (
    <div style={style} className="bg-[var(--paper)] text-[var(--ink)]">
      <div className="pt-1 space-y-8">

        {/* Live feeds — 2 col on lg */}
        <div>
          <p className="mb-4 text-sm text-[var(--ink)]/70">Meticulous news: firmware from Meticulous&apos;s GitHub, company updates from meticuloushome.com</p>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="space-y-3">
              {/* Firmware from GitHub only: the changelog feed lagged months behind */}
              <LatestFirmware />
            </div>
            <FeedSection
              label="Company Updates"
              onItems={(list) => { if (list[0]) markCompanyUpdateSeen(list[0].title); }}
              url="https://meticuloushome.com/blogs/updates.atom"
              icon={Radio}
              color="#60a5fa"
            />
          </div>
        </div>

        {/* Resources grid */}
        <div>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-[var(--ink)]/70">Resources</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {RESOURCES.map(({ icon: Icon, label, href, desc }) => (
              <a key={label} href={href} target="_blank" rel="noopener noreferrer"
                className="group flex items-start gap-3 rounded-xl border border-[var(--ink)]/15 bg-[var(--ink)]/[0.04] px-4 py-3.5 hover:border-[var(--ink)]/30 hover:bg-[var(--ink)]/[0.07] transition-all">
                <div className="h-8 w-8 rounded-lg bg-[var(--ink)]/[0.06] flex items-center justify-center shrink-0 mt-0.5">
                  <Icon className="h-4 w-4 text-[var(--ink)]/60 group-hover:text-[var(--accent)] transition-colors" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[var(--ink)]/85 group-hover:text-[var(--accent)] transition-colors">{label}</p>
                  <p className="text-xs text-[var(--ink)]/60 mt-0.5">{desc}</p>
                </div>
                <ExternalLink className="h-3.5 w-3.5 text-[var(--ink)]/60 group-hover:text-[var(--accent)] shrink-0 mt-0.5 transition-colors" />
              </a>
            ))}
          </div>
        </div>

        {/* Discord card */}
        <div className="rounded-2xl border border-[var(--ink)]/15 bg-[var(--ink)]/[0.04] overflow-hidden">
          <div className="h-[3px] bg-[#5865F2]" />
          <div className="p-6 flex flex-col sm:flex-row items-start sm:items-center gap-5">
            <div className="h-12 w-12 rounded-2xl bg-[#5865F2]/15 flex items-center justify-center shrink-0">
              <MessageSquare className="h-5 w-5 text-[#5865F2]" />
            </div>
            <div className="flex-1">
              <h2 className="text-base font-semibold text-[var(--ink)]">Meticulous Discord</h2>
              <p className="text-sm text-[var(--ink)]/70 mt-0.5">The unofficial community server — dial-in tips, profile sharing, firmware discussion.</p>
            </div>
            <a href={DISCORD_INVITE} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-xl bg-[#5865F2] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#6875f5] transition-all shrink-0">
              <ExternalLink className="h-3.5 w-3.5" /> Join
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
