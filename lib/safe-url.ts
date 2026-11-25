/**
 * Values that come from profiles (the machine, shared files) and end up in a URL
 * or a style: only accepted when they stay what they claim to be.
 */

/**
 * An image path from a profile, as a URL on the machine itself. A path that
 * would point elsewhere (".evil.example/p.png" glued after the IP) gives null.
 */
export function machineImageUrl(base: string, path: string | null | undefined): string | null {
  if (!path || !base) return null;
  try {
    const url = new URL(path.startsWith("/") ? path : `/${path}`, base);
    return url.origin === new URL(base).origin ? url.href : null;
  } catch {
    return null;
  }
}

/** A CSS color written as #rgb, #rgba, #rrggbb or #rrggbbaa; anything else gives null */
export function safeColor(c: string | null | undefined): string | null {
  return c && /^#[0-9a-f]{3,8}$/i.test(c.trim()) ? c.trim() : null;
}
