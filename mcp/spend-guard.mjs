// ── A PAID TOOL CALL: PRICE IT FIRST, BUY IT ONCE (2026-11-11) ─────────────────────────────────────────────────────
//
// Three controls on every tool that spends (owner-approved 2026-11-11, after reading how the best agent surfaces do it):
//   get_cost: true          the exact price, with nothing run and nothing billed;
//   expected_credits: N     "run it at the price I was quoted": the server re-prices and REFUSES (unbilled) if it moved;
//   idempotency_key: "…"    chosen once and repeated unchanged on a retry: the same key never buys the call twice.
// Plus `context` on every tool: the user's goal in one short sentence, for analytics only.
//
// WHICH TOOLS: the ones that spend credits, derived from the same classification find_tools prints (tool-cost.mjs:
// the `create` and `research` groups run a model or Ad Spy research), minus SPEND_EXEMPT, the few tools filed in those
// groups that spend nothing. X's per-call tools are left out on purpose: post_to_x already has its own 24h
// idempotencyKey and a free dryRun that prices the exact post. tools/spend-guard-check.mjs derives the set from the
// registry and the handlers' own code, and fails on a paying tool that lacks the controls.
//
// HOW A PRICE IS MADE: the tool's OWN handler runs with quote mode on (client.mjs sends x-hermoso-quote: 1 on every
// request; server.js answers each spending point with what it would cost and stops it there). So the price is the run's
// own pricing, never a second table that could drift. Nothing is queued, held or charged.
//
// No `get_cost`, no `expected_credits` and no `idempotency_key` ⇒ the tool runs exactly as it always has.
//
// BYTE-TWINNED with cli/mcp/spend-guard.mjs (tools/mcp-parity.mjs sweeps every shared file). PURE apart from the
// injected `post`, and no lib/ import, because the CLI ships rooted at cli/.

import { createHash } from 'node:crypto';
import { toolCostClass } from './tool-cost.mjs';

// Filed in `create` / `research` but spend nothing: lookups, saved presets, Library and Gallery bookkeeping.
export const SPEND_EXEMPT = Object.freeze([
  'list_video_presets', 'save_video_preset', 'update_video_preset', 'delete_video_preset',
  'delete_library_item', 'submit_to_gallery', 'list_gallery_submissions', 'withdraw_from_gallery',
  'list_winning_ads', 'set_product_image', 'collect_post_metrics',
]);
export const SPEND_CONTROL_ARGS = Object.freeze(['idempotency_key', 'get_cost', 'expected_credits']);

/** Does this tool spend credits (and so take get_cost / expected_credits / idempotency_key)? */
export function spendTool(name, group) {
  const n = String(name || '');
  if (SPEND_EXEMPT.includes(n)) return false;
  const c = toolCostClass(n, group, null);
  return c === 'model' || c === 'research';
}

// The parameter texts. Short on purpose: they ride every paying tool's schema.
export const SPEND_ARG_TEXT = Object.freeze({
  get_cost: 'true: return the price only; nothing runs or bills',
  expected_credits: 'the get_cost price; refused unbilled if the live price differs',
  idempotency_key: 'chosen once, resent unchanged on retries: the same key never buys twice',
});
export const CONTEXT_ARG_TEXT = "optional: the user's underlying goal in one short sentence, for analytics only (no names, contact details or URLs)";

export const TOOL_IDEM_KEY_MAX = 128;
export function validKey(k) {
  if (typeof k !== 'string') return null;
  const s = k.trim();
  return s && s.length <= TOOL_IDEM_KEY_MAX && !/[\u0000-\u001f\u007f]/.test(s) ? s : null;
}

function stableJson(v) {
  if (Array.isArray(v)) return '[' + v.map(stableJson).join(',') + ']';
  if (v && typeof v === 'object') return '{' + Object.keys(v).sort().filter((k) => v[k] !== undefined).map((k) => JSON.stringify(k) + ':' + stableJson(v[k])).join(',') + '}';
  return JSON.stringify(v === undefined ? null : v);
}
/** The arguments a key is bound to: everything except the call controls and `context`, order-free. */
export function argsHash(tool, args) {
  const a = {};
  for (const [k, v] of Object.entries(args && typeof args === 'object' ? args : {})) if (!SPEND_CONTROL_ARGS.includes(k) && k !== 'context') a[k] = v;
  return createHash('sha256').update(String(tool || '') + '\n' + stableJson(a)).digest('hex').slice(0, 40);
}
/** The root of the job idempotency keys a keyed call's submits carry (server shape /^[A-Za-z0-9._:-]{8,120}$/; client.mjs appends .1, .2…). */
export function jobKeyRoot(toolKey, tool = '') {
  return `ti.${createHash('sha256').update(String(tool) + '\n' + String(toolKey)).digest('hex').slice(0, 24)}`;
}

/** Pull the call controls off the arguments. `clean` is what the handler sees, so none of them ever reaches a body. */
export function takeSpendMeta(args) {
  const a = args && typeof args === 'object' ? { ...args } : {};
  const getCost = a.get_cost === true;
  const expected = a.expected_credits == null || a.expected_credits === '' ? null : Number(a.expected_credits);
  const rawKey = a.idempotency_key;
  for (const k of SPEND_CONTROL_ARGS) delete a[k];
  return { clean: a, getCost, expected: Number.isFinite(expected) ? expected : (expected === null ? null : NaN), key: rawKey == null || rawKey === '' ? null : validKey(rawKey), badKey: rawKey != null && rawKey !== '' && !validKey(rawKey) };
}

// ── the agent's `context`, redacted on THIS side before it leaves (lib/agent-context.mjs is the server's copy) ──
export const AGENT_CONTEXT_MAX = 200;
export function redactContext(s) {
  if (typeof s !== 'string') return '';
  let t = s.replace(/[\u0000-\u001f\u007f]+/g, ' ');
  t = t.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email]');
  t = t.replace(/\b(?:https?:\/\/|www\.)\S+/gi, '[url]');
  t = t.replace(/\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|net|org|io|ai|co|app|dev|shop|store|us|uk|ca|de|fr|es|it|nl|au|me|xyz)\b\S*/gi, '[url]');
  t = t.replace(/(^|\s)@[A-Za-z0-9_.]{2,}/g, '$1[handle]');
  t = t.replace(/\+?\d[\d\s().-]{6,}\d/g, '[number]');
  t = t.replace(/\s+/g, ' ').trim();
  return t.length > AGENT_CONTEXT_MAX ? t.slice(0, AGENT_CONTEXT_MAX - 1).trimEnd() + '…' : t;
}
// A header value is Latin-1 at the transport: anything else is percent-encoded (the server reads the decoded text).
export const contextHeaderValue = (t) => { try { return encodeURIComponent(t).slice(0, 900); } catch { return ''; } };

// ── the price ──
const round1 = (n) => Math.round(n * 10) / 10;
/** One price out of the legs a quote run collected. credits is null when any leg is billed at its actual cost. */
export function quoteFromLegs(legs) {
  const L = (Array.isArray(legs) ? legs : []).filter(Boolean);
  const refused = L.find((l) => l.refused);
  if (refused && !L.some((l) => l.credits > 0)) return { credits: null, legs: L, refused: String(refused.refused) };
  const unpriced = L.filter((l) => !(Number(l.credits) > 0));
  const sum = L.reduce((t, l) => t + (Number(l.priceCredits) > 0 ? Number(l.priceCredits) : Number(l.credits) > 0 ? Number(l.credits) : 0), 0);
  const hold = L.reduce((t, l) => t + (Number(l.credits) > 0 ? Number(l.credits) : 0), 0);
  if (!L.length) return { credits: 0, legs: L, free: true };
  return { credits: unpriced.length ? null : round1(sum), ...(hold > sum + 1e-9 && !unpriced.length ? { holdCredits: round1(hold) } : {}), ...(L.some((l) => l.basis === 'estimate') ? { estimate: true } : {}), legs: L, ...(unpriced.length ? { unpriced: unpriced.map((l) => l.label || 'a step') } : {}) };
}
const legLine = (l) => `${l.label || 'a step'}: ${Number(l.priceCredits) > 0 ? `${l.priceCredits}` : Number(l.credits) > 0 ? `${l.credits}` : 'its actual cost'}`;
export function quoteText(tool, q) {
  if (q.refused) return `NO PRICE (nothing ran, nothing was charged): ${tool} would not start: ${q.refused}`;
  if (q.free) return `PRICE (nothing ran, nothing was charged): ${tool} with these arguments spends no credits.`;
  if (q.credits == null) {
    const known = q.legs.filter((l) => Number(l.credits) > 0);
    return `NO FIXED PRICE (nothing ran, nothing was charged): ${tool} is billed at the actual cost of ${q.unpriced.join(' and ')}, which is not known before it runs.${known.length ? ` The priced part is ${known.map(legLine).join(', ')} credits.` : ''} expected_credits cannot bind this call; run it without it.`;
  }
  return `PRICE (nothing ran, nothing was charged): ${tool} costs ${q.estimate ? 'about ' : ''}${q.credits} credits${q.holdCredits ? ` (it sets aside up to ${q.holdCredits} while it runs; the final charge is its actual cost)` : q.estimate ? ' (its own entry estimate; the final charge is the actual cost of the run)' : ''}.${q.legs.length > 1 ? ` Steps: ${q.legs.map(legLine).join('; ')}.` : ''} To run it at this price, call again without get_cost, with expected_credits: ${q.credits} and an idempotency_key.`;
}
export function expectedMismatchText(tool, expected, q) {
  if (q.credits == null) return `Refused, nothing ran and nothing was charged: expected_credits was ${expected}, but ${tool} has no fixed price here (${q.refused || `billed at the actual cost of ${(q.unpriced || []).join(' and ') || 'its model steps'}`}). Run it without expected_credits, or ask the user first.`;
  return `Refused, nothing ran and nothing was charged: the live price of ${tool} is ${q.credits} credits, not the ${expected} you expected. Tell the user the new price; if they agree, call again with expected_credits: ${q.credits}.`;
}
export const priceMatches = (expected, q) => q && q.credits != null && Math.abs(Number(expected) - Number(q.credits)) < 0.05;
