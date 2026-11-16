// THE SAME "NOT FOUND", ASKED AGAIN AND AGAIN, IS ANSWERED HERE (2026-11-16, agent-friction sweep of the error ledger).
//
// Measured on production over 14 days: agents repeated calls that had just been answered "not found", with identical
// arguments, many times over. instagram_profile 299 refusals in 8 accounts (one account asked each of ~34 handles 8-15
// times), list_youtube_comments 61 in 3 accounts, get_job "No such job" 28 times in one, list_threads_replies 1,005 in
// one (the Threads route already stopped asking Threads itself). Each repeat is another vendor call against the user's
// own rate limits (Meta's business discovery, YouTube's quota) for an answer that cannot change while the arguments do
// not. The vendor's sentence already said so; agents in an unattended loop do not read it.
//
// So after TWO identical refusals that came back 404 from our API within TTL_MS, the next identical call is answered
// from memory, says so, and asks nothing upstream. Deliberately narrow:
//   - 404 only: "this id / handle / job does not exist here". Never a 401 (connecting fixes it), a 403 (an account
//     setting fixes it), a 429 (has its own wait), a 5xx (may pass), or a 400 (some are state, not arguments).
//   - the SAME caller, brand and arguments: a different id is a different question and is always asked.
//   - two strikes, not one, and a short TTL: an id the platform has only just created can read "not found" for a
//     moment, and a second try a little later is legitimate.
// Byte-identical in mcp/ and cli/mcp/ (the CLI ships rooted at cli/). PURE apart from the clock passed in.
import { createHash } from 'node:crypto';

export const REPEAT_REFUSAL_TTL_MS = 10 * 60_000;
export const REPEAT_REFUSAL_AFTER = 2; // identical 404s before the next one is answered here
const MAX_KEYS = 5000;

const stable = (v) => {
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}`;
  return JSON.stringify(v === undefined ? null : v);
};
/** The memo key for one call, or '' when it must never be memoised. Holds hashes only, never a token or an argument value. */
export function repeatRefusalKey({ who = '', brand = '', tool = '', args = {} } = {}) {
  if (!tool) return '';
  return createHash('sha256').update(`${createHash('sha256').update(String(who)).digest('hex')}|${brand}|${tool}|${stable(args && typeof args === 'object' ? args : {})}`).digest('hex').slice(0, 40);
}
/** Whether a thrown tool error is one this memo counts: a 404 that our own API answered. */
export function isMemoRefusal(e) {
  return !!e && Number(e.status) === 404 && e._viaApi === true;
}
export function makeRepeatMemo({ ttlMs = REPEAT_REFUSAL_TTL_MS, after = REPEAT_REFUSAL_AFTER, max = MAX_KEYS } = {}) {
  const m = new Map(); // key → { n, first, last, msg }
  const live = (e, now) => e && now - e.last <= ttlMs;
  return {
    /** The entry to answer from, when this call has already been refused `after` times; else null. */
    check(key, now = Date.now()) {
      if (!key) return null;
      const e = m.get(key);
      if (!e) return null;
      if (!live(e, now)) { m.delete(key); return null; }
      if (e.n < after) return null;
      e.n++; e.last = now; // an answered repeat keeps the memo alive while the loop lasts
      return { ...e };
    },
    record(key, msg, now = Date.now()) {
      if (!key) return;
      const e = m.get(key);
      if (e && live(e, now)) { e.n++; e.last = now; e.msg = String(msg || e.msg || ''); return; }
      if (m.size >= max) m.delete(m.keys().next().value);
      m.set(key, { n: 1, first: now, last: now, msg: String(msg || '') });
    },
    clear(key) { if (key) m.delete(key); },
    size: () => m.size,
  };
}
/** The sentence a memo answer starts with. */
export function repeatRefusalText(tool, entry) {
  const at = new Date(entry.first).toISOString().slice(11, 16);
  const last = String(entry.msg || '').replace(/^Error:\s*/, '');
  return `Not asked again: ${tool} answered this exact request "not found" ${entry.n - 1} times since ${at} UTC, and the same arguments get the same answer. Change the arguments (a different id, handle or job) instead of repeating the call.${last ? `\nThe answer was: ${last}` : ''}`;
}
