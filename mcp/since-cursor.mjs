// ONLY WHAT IS NEW SINCE LAST TIME, ON EVERY POLLED LIST (2026-11-24, docs/research/power-users-2026-11-24.md).
//
// An agent that polls list_threads_replies every twelve seconds wants one thing from each call: what arrived since the
// last one. Every polled list (Threads replies and mentions, the inbox, TikTok / Meta / YouTube comments, Instagram collab
// invites, WhatsApp conversations, X mentions) now answers with a `sinceCursor`, and takes it back as `since`: the answer
// is then only the rows that are new, plus the next cursor. The cursor is STATELESS (nothing is stored per caller): it
// carries the newest time seen and short hashes of the rows seen near it, so rows that arrive out of order inside a
// window are still caught once, and a conversation whose last message moved counts as new again.
//
// ONE implementation, used by the server's belt (so REST callers get it on the same routes) and by the MCP twins (so
// list_inbox, which merges many routes client-side, filters its merged list the same way). Byte-identical twins:
// mcp/since-cursor.mjs and cli/mcp/since-cursor.mjs. Pure. Run by tools/agent-watch-check.mjs.
import crypto from 'node:crypto';

export const SINCE_WINDOW_MS = 15 * 60_000;   // rows this close to the newest time seen are remembered by id
export const SINCE_KEYS_MAX = 300;            // and at most this many of them
const PREFIX = 'sc1.';

const TIME_FIELDS = ['created_time', 'created_at', 'createdAt', 'timestamp', 'createTime', 'create_time', 'publishedAt', 'postedAt', 'sentAt', 'at', 'time', 'date'];
// A row that is a CONVERSATION (one row standing for many messages) is new again when its newest message moves, so its
// identity includes that time. A comment's time never moves, so including it changes nothing.
const MOVING_FIELDS = ['lastAt', 'last_at', 'updatedAt', 'updated_time', 'updateTime', 'lastMessageAt'];
const ID_FIELDS = ['id', 'commentId', 'comment_id', 'commentUrn', 'messageId', 'mid', 'mediaId', 'media_id', 'reviewId', 'uri', 'cid', 'conversationId', 'name', 'tweet_id'];

function ms(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number' && Number.isFinite(v)) return v < 1e12 ? v * 1000 : v;
  const s = String(v).trim();
  if (/^\d{9,13}$/.test(s)) { const n = Number(s); return n < 1e12 ? n * 1000 : n; }
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : null;
}
/** The time a row happened, or null when the platform gives none (an Instagram collab invite carries no time). */
export function rowTime(row) {
  if (!row || typeof row !== 'object') return null;
  for (const f of [...MOVING_FIELDS, ...TIME_FIELDS]) { const t = ms(row[f]); if (t != null) return t; }
  return null;
}
/** The row's identity: its id, plus the time its conversation last moved when it is a conversation. */
export function rowKey(row) {
  if (!row || typeof row !== 'object') return '';
  let id = '';
  for (const f of ID_FIELDS) { const v = row[f]; if (v != null && typeof v !== 'object' && String(v).trim()) { id = String(v).trim(); break; } }
  if (!id) { try { id = JSON.stringify(row).slice(0, 400); } catch { return ''; } }
  let moved = '';
  for (const f of MOVING_FIELDS) { const t = ms(row[f]); if (t != null) { moved = `@${t}`; break; } }
  return crypto.createHash('sha256').update(id + moved).digest('hex').slice(0, 10);
}
export function encodeSince({ t = 0, k = [] } = {}) {
  return PREFIX + Buffer.from(JSON.stringify({ t: Math.max(0, Math.floor(Number(t) || 0)), k: (k || []).slice(-SINCE_KEYS_MAX) })).toString('base64url');
}
/** → { ok, t, k } ; an empty cursor is ok (= everything is new); anything we did not issue is not. */
export function decodeSince(c) {
  const s = String(c ?? '').trim();
  if (!s) return { ok: true, t: null, k: [] };
  if (!s.startsWith(PREFIX)) return { ok: false, t: null, k: [] };
  try {
    const o = JSON.parse(Buffer.from(s.slice(PREFIX.length), 'base64url').toString('utf8'));
    const k = Array.isArray(o?.k) ? o.k.filter((x) => typeof x === 'string' && /^[0-9a-f]{10}$/.test(x)) : [];
    return { ok: Number.isFinite(Number(o?.t)), t: Number(o?.t) || 0, k };
  } catch { return { ok: false, t: null, k: [] }; }
}
/**
 * Filter `rows` to the ones that are new after `since`, and mint the cursor for next time.
 * → { rows (new ones, same order as given), cursor, total (rows read), fresh (rows kept), valid }
 * With no `since` every row is returned and only the cursor is added. An invalid `since` returns every row with
 * valid:false, so a caller holding a bad cursor is told and still sees its data (never an empty "nothing new").
 */
export function applySince(rows, since, { now = Date.now(), windowMs = SINCE_WINDOW_MS } = {}) {
  const list = Array.isArray(rows) ? rows : [];
  const c = decodeSince(since);
  const keyed = list.map((r) => ({ r, key: rowKey(r), t: rowTime(r) }));
  const seen = new Set(c.k);
  const asked = c.ok && c.t != null;
  const fresh = !asked ? keyed : keyed.filter((x) => x.key && !seen.has(x.key) && (x.t == null || x.t > c.t - windowMs));
  // THE NEXT CURSOR: the newest time ever seen (never moves backwards, a quiet page keeps the old mark) and the ids of
  // every row near it, or with no time at all (those can only be told apart by id).
  const newest = Math.max(asked ? c.t : 0, ...keyed.map((x) => x.t || 0));
  const near = keyed.filter((x) => x.key && (x.t == null || x.t > newest - windowMs)).sort((a, b) => (a.t ?? Infinity) - (b.t ?? Infinity)).map((x) => x.key);
  const carried = asked ? c.k.filter((k) => !near.includes(k) && keyed.some((x) => x.key === k && x.t == null)) : [];
  const cursor = encodeSince({ t: newest || (asked ? c.t : 0) || now - windowMs, k: [...new Set([...carried, ...near])] });
  return { rows: fresh.map((x) => x.r), cursor, total: list.length, fresh: fresh.length, valid: !since || c.ok };
}
/** The one line a tool prints under its list, so an agent learns the cursor exists the first time it polls. */
export function sinceLine(r, asked) {
  if (!r) return '';
  if (asked && !r.valid) return `⚠ That \`since\` was not a cursor Hermoso issued, so every item is shown. Next time pass since: "${r.cursor}"`;
  return asked ? `${r.fresh} new since your cursor (of ${r.total} read). Next: since: "${r.cursor}"` : `Polling? Pass since: "${r.cursor}" next time for only what is new, or call whats_new (one call, every channel, no platform read).`;
}
