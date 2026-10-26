// AN ARGUMENT A TOOL DOES NOT TAKE IS NEVER SILENTLY DROPPED (2026-10-26, customer report).
//
// meta_post_insights was called with `platform: 'instagram'` instead of `target`. The MCP SDK parses arguments with
// the tool's zod object, which STRIPS unknown keys, so the handler never saw `platform`, defaulted to Facebook and read
// Facebook metrics for an Instagram media — a confident wrong answer, with nothing saying an argument was ignored.
// The same strip happens on /v1 (z.object) and the Studio agent reads `input.<name>` and nothing else.
//
// ONE RULE FOR EVERY SURFACE, applied where each surface parses: an argument the schema does not declare is named
// back to the caller, with the declared argument it most likely meant (modes: argGuardMode). The default refuses only a
// probable typo/synonym of a real argument and otherwise runs the call with the note first in its answer, because hosts
// and agent frameworks were never measured for what they add to `arguments` (the advertised schemas already say
// additionalProperties:false, and call_tool has refused every undeclared key since 2026-09-30). Every unknown key is
// logged by NAME (never value) so the blast radius of full `reject` is measured from production before anyone flips it.
// Keys starting with `_` are host metadata (`_meta`, `_hermoso…`) and are never named.
//
// Byte-identical in mcp/ and cli/mcp/ (the CLI ships rooted at cli/), and imported by server.js for /v1 and the Studio.

export const UNKNOWN_ARGS_SYM = Symbol.for('hermoso.unknownArgs');

/**
 * 'typo' (default) | 'reject' | 'warn' | 'off' from the environment value. Anything unrecognised is `typo`:
 *   typo   — REFUSED when an unknown key is a likely misspelling or synonym of a declared one (the customer's
 *            `platform` for `target`: running without it gives a confidently wrong answer); otherwise the call runs
 *            and its answer starts with the note;
 *   reject — every unknown key refuses the call (what call_tool has done since 2026-09-30);
 *   warn   — never refuses, always notes; off — the old silent strip.
 */
export function argGuardMode(v = (typeof process !== 'undefined' ? process.env?.HERMOSO_UNKNOWN_ARGS : '')) {
  const s = String(v || '').trim().toLowerCase();
  return s === 'reject' || s === 'off' || s === 'warn' ? s : 'typo';
}
/** Whether this mode refuses this set of unknown keys. */
export function argGuardRefuses(mode, unknown = [], declared = []) {
  if (!unknown.length || mode === 'off' || mode === 'warn') return false;
  if (mode === 'reject') return true;
  return unknown.some((k) => !!didYouMean(k, declared));
}

/**
 * The argument names a schema declares, or null when it accepts any key (so nothing can be called unknown).
 * Accepts a zod raw shape ({name: zodType}), a zod object, or a JSON Schema object (the Studio's input_schema).
 */
export function declaredArgKeys(schema) {
  if (!schema || typeof schema !== 'object') return null;
  // JSON Schema (checked AFTER zod: a zod v4 object also carries `type: 'object'`)
  if (typeof schema.safeParse !== 'function' && (schema.type === 'object' || (schema.properties && typeof schema.properties === 'object'))) {
    if (schema.additionalProperties === true || (schema.additionalProperties && typeof schema.additionalProperties === 'object')) return null;
    return Object.keys(schema.properties || {});
  }
  // zod object
  if (typeof schema.safeParse === 'function') {
    const def = schema._zod?.def || schema._def || {};
    const shape = typeof schema.shape === 'object' ? schema.shape : (typeof def.shape === 'function' ? def.shape() : def.shape);
    if (!shape || typeof shape !== 'object') return null;
    const cat = def.catchall;
    const loose = (cat && (cat._zod?.def?.type || cat._def?.typeName) && !/never/i.test(String(cat._zod?.def?.type || cat._def?.typeName))) || def.unknownKeys === 'passthrough';
    return loose ? null : Object.keys(shape);
  }
  // raw shape: every value is a zod type
  const vals = Object.values(schema);
  if (vals.length && vals.every((v) => v && typeof v === 'object' && typeof v.safeParse === 'function')) return Object.keys(schema);
  if (!vals.length) return [];
  return null;
}

/** The keys of `args` the schema does not declare (host `_` metadata excluded). [] when there are none or none can be judged. */
export function unknownArgs(declared, args) {
  if (!Array.isArray(declared) || !args || typeof args !== 'object' || Array.isArray(args)) return [];
  const known = new Set(declared);
  return Object.keys(args).filter((k) => !known.has(k) && !k.startsWith('_'));
}

function lev(a, b) {
  a = a.toLowerCase(); b = b.toLowerCase();
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
// Words agents reach for that name the same idea under a different argument (the customer's case is the first row).
const ALIASES = {
  platform: ['target', 'platforms', 'channel', 'channels', 'network', 'source', 'sources'],
  network: ['platform', 'target', 'channel'],
  channel: ['channels', 'platform', 'target'],
  count: ['limit', 'max', 'n'], max: ['limit'], max_results: ['limit'], maxResults: ['limit'], page_size: ['limit'], pageSize: ['limit'],
  page: ['cursor'], next: ['cursor'], nextCursor: ['cursor'], after: ['cursor'],
  text: ['message', 'caption', 'body'], message: ['text', 'caption'], caption: ['message', 'text'],
  url: ['imageUrl', 'videoUrl', 'link', 'image', 'video'], image: ['imageUrl'], video: ['videoUrl'],
  id: ['postId', 'mediaId', 'commentId', 'videoId', 'conversationId'],
};
/** The declared argument `key` most likely meant, or ''. */
export function didYouMean(key, declared = []) {
  const k = String(key);
  const alias = (ALIASES[k] || []).find((a) => declared.includes(a));
  if (alias) return alias;
  const lower = declared.find((d) => d.toLowerCase() === k.toLowerCase() || d.toLowerCase().replace(/_/g, '') === k.toLowerCase().replace(/_/g, ''));
  if (lower) return lower;
  let best = '', bd = Infinity;
  for (const d of declared) { const x = lev(k, d); if (x < bd) { bd = x; best = d; } }
  return bd <= Math.max(2, Math.floor(k.length / 3)) ? best : '';
}

/** The one sentence every surface prints. `rejected` words it as a refusal; otherwise as a note on a call that ran. */
export function unknownArgsNote(tool, unknown = [], declared = [], { rejected = false } = {}) {
  if (!unknown.length) return '';
  const named = unknown.map((k) => { const m = didYouMean(k, declared); return `\`${k}\`${m ? ` (did you mean \`${m}\`?)` : ''}`; }).join(', ');
  const takes = declared.length ? ` ${tool || 'This tool'} takes: ${declared.join(', ')}.` : ` ${tool || 'This tool'} takes no arguments.`;
  return rejected
    ? `Unknown argument${unknown.length > 1 ? 's' : ''} ${named} for ${tool || 'this tool'} — nothing was run.${takes}`
    : `⚠ Ignored unknown argument${unknown.length > 1 ? 's' : ''} ${named}: ${tool || 'this tool'} does not take ${unknown.length > 1 ? 'them' : 'it'}, so the call ran WITHOUT ${unknown.length > 1 ? 'them' : 'it'}. Check the answer below still matches what you asked, or call again with the right name.${takes}`;
}
