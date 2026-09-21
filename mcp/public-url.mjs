// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// THE ONE ABSOLUTISER — a served path becomes a URL the CALLER can open (2026-09-20)
// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
//
// WHAT WENT WRONG. A render that has not moved to the durable asset host is recorded as a served path
// (`/generated/…`), and every tool turned that into a link by prefixing `API_BASE`. `API_BASE` is the address the
// tool layer uses to CALL the app, and on the hosted transport and the `/v1` passthrough that is a loopback
// self-call (`http://127.0.0.1:<port>`) so a tool's own `/api` calls never leave the instance. Correct for
// calling; wrong for a link handed to somebody on the other side of the internet. `list_library` answered
// `http://127.0.0.1:8080/generated/…` to a REST caller on 2026-09-20, and it had its own hand-written copy of the
// prefixing, which is why fixing `abs()` alone would not have closed it.
//
// THE RULE. The base used to CALL the API and the origin used to LINK to an asset are two different facts:
//   • a LOCAL caller (stdio, the CLI) shares a machine with whatever `API_BASE` names, so that base is the right
//     link, loopback included (a self-hoster on localhost gets a localhost link, which is what they can open);
//   • a REMOTE caller (hosted MCP, `/v1`) can never reach a loopback or private address, so one is NEVER emitted:
//     a served path is joined to the PUBLIC origin, and an already-absolute URL that names an unroutable host has
//     its origin replaced. That second half is what makes this a guarantee rather than a fix for one call site: a
//     row stored with a loopback origin months ago is repaired on the way out too.
//
// PURE, NO IMPORTS. This file is a byte-twin of `cli/mcp/public-url.mjs` (every `.mjs` in both directories is),
// and `lib/public-api-v1-mount.mjs` imports it directly, so `/v1` and the tools cannot disagree about what a
// public link is. It deliberately does NOT live in `client.mjs`: that module reads the API base at import time,
// and importing it from the server before `HEIST_API_BASE` is set would pin every tool's self-call to the default.
// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════

/** Where a public link points when nothing better is configured. The app's own origin serves `/generated/…`. */
export const PUBLIC_ORIGIN_DEFAULT = 'https://app.hermoso.ai';

/**
 * TRUE for a hostname no caller outside this machine or network can reach: loopback, the unspecified address,
 * RFC 1918 private ranges, link-local (which includes the cloud metadata address), CGNAT, IPv6 loopback /
 * unique-local / link-local, and the conventional internal suffixes. An unparseable host counts as unroutable:
 * a link we cannot read is not one to hand out. PURE.
 */
export function isUnroutableHost(hostname) {
  let h = String(hostname ?? '').trim().toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  if (!h) return true;
  if (h.startsWith('::ffff:')) h = h.slice(7); // an IPv4-mapped IPv6 literal is judged as the IPv4 it carries
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal') || h.endsWith('.lan')) return true;
  if (h === '::' || h === '::1' || /^f[cd][0-9a-f]{2}:/.test(h) || /^fe[89ab][0-9a-f]:/.test(h)) return true;
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h);
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])];
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    return false;
  }
  // A bare single-label name ("app", "hermoso-internal") only resolves inside a private network.
  if (!h.includes('.') && !h.includes(':')) return true;
  return false;
}

/** A configured origin, or null when it is absent, unparseable, not http(s), or unroutable. PURE. */
function usableOrigin(candidate) {
  const s = String(candidate ?? '').trim();
  if (!s) return null;
  let u; try { u = new URL(s); } catch { return null; }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  if (isUnroutableHost(u.hostname)) return null;
  return u.origin;
}

/**
 * THE PUBLIC ORIGIN. Configured (`APP_PUBLIC_URL`, the name server.js reads, then the two older spellings),
 * never asserted by a caller, and never a request's Host header. A configured value that is itself unroutable is
 * IGNORED rather than honoured: this function's one job is that its answer can be opened from outside. PURE.
 */
export function publicOrigin(env = {}) {
  return usableOrigin(env?.APP_PUBLIC_URL) || usableOrigin(env?.APP_URL) || usableOrigin(env?.PUBLIC_BASE) || PUBLIC_ORIGIN_DEFAULT;
}

/**
 * Absolutise an asset reference for the caller who will open it.
 *
 * @param {string} u       a served path (`/generated/x.mp4`), or an already-absolute URL
 * @param {object} o
 * @param {string} o.base    the base the tool layer CALLS the API on (may be loopback)
 * @param {boolean} o.remote true when the caller is not on this machine (hosted MCP, `/v1`)
 * @param {object} o.env     where a configured public origin is read from
 *
 * Anything that is not a string, is empty, or is not http(s) / a served path (a `data:` URI, a bare id) is
 * returned untouched: this decides where a link points, never whether a value is a link. PURE.
 */
export function absolutizeAssetUrl(u, { base = '', remote = false, env = {} } = {}) {
  if (typeof u !== 'string' || !u) return u;
  const pub = publicOrigin(env);
  if (u.startsWith('/') && !u.startsWith('//')) {
    const b = String(base || '').replace(/\/+$/, '');
    let baseHost = null; try { baseHost = new URL(b).hostname; } catch { baseHost = null; }
    // No usable base at all is treated like an unroutable one: a bare path is not a link for anybody.
    const useBase = b && baseHost !== null && !(remote && isUnroutableHost(baseHost));
    return (useBase ? b : pub) + u;
  }
  if (!remote || !/^https?:\/\//i.test(u)) return u;
  let parsed; try { parsed = new URL(u); } catch { return u; }
  if (!isUnroutableHost(parsed.hostname)) return u;
  return pub + parsed.pathname + parsed.search + parsed.hash;
}
