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
// The same facts as data (2026-10-27, customer ask: the note was only in the text). Rides the parsed args beside the
// sentence; a refused call carries it under REFUSED so the handler wrapper answers without running the tool.
export const UNKNOWN_ARGS_DETAIL_SYM = Symbol.for('hermoso.unknownArgsDetail');
export const UNKNOWN_ARGS_REFUSED_SYM = Symbol.for('hermoso.unknownArgsRefused');
/** [{name, didYouMean}] — didYouMean is a key THIS tool declares, or null. The structured twin of unknownArgsNote. */
export function unknownArgsDetail(unknown = [], declared = []) {
  return unknown.map((k) => ({ name: k, didYouMean: didYouMean(k, declared) || null }));
}

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

// META ARGUMENTS (2026-11-11, spend-guard.mjs): accepted on EVERY tool without being in its schema, never "unknown".
// `context` is the user's goal in one sentence, for analytics only; declared once (on call_tool) instead of on 1,200
// schemas, so it costs the roster nothing. The guard lifts it onto the parsed arguments under CONTEXT_SYM, because the
// SDK's own parse strips any key the schema does not declare.
export const META_ARGS = Object.freeze(['context']);
export const CONTEXT_SYM = Symbol.for('hermoso.agentContext');
/** The keys of `args` the schema does not declare (host `_` metadata and META_ARGS excluded). [] when there are none or none can be judged. */
export function unknownArgs(declared, args) {
  if (!Array.isArray(declared) || !args || typeof args !== 'object' || Array.isArray(args)) return [];
  const known = new Set(declared);
  return Object.keys(args).filter((k) => !known.has(k) && !k.startsWith('_') && !META_ARGS.includes(k));
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
  if (/id$/i.test(k) && k.length > 2 && declared.includes('id') && !declared.some((d) => /id$/i.test(d) && d !== 'id')) return 'id'; // jobId / job_id for a tool whose only id is `id`
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

// ── A COMMON MISNAME IS RENAMED, NOT DROPPED (2026-11-16, agent-friction sweep of 14 days of `[mcp-unknown-arg]`) ──────
// Measured on production: `call_tool` was sent `arguments` (the MCP protocol's own name for a tool's arguments) instead
// of `args` 30 times, and every one of those calls ran the inner tool with NO arguments at all; `upload_file` was sent
// `filename` 24 times instead of `name`. Neither is a typo the did-you-mean can see (edit distance 5 and 4), so the call
// ran without it. A rename is applied only when it is unambiguous: the misname is not itself declared, the real name is
// declared, and the caller did not send the real name too. Anything else stays an unknown argument, named back as before.
export const ARG_RENAMES = Object.freeze({
  call_tool: Object.freeze({ arguments: 'args', params: 'args', parameters: 'args', input: 'args' }),
  upload_file: Object.freeze({ filename: 'name', fileName: 'name', file_name: 'name' }),
});
/** The renames a call needs: [{from, to}]. PURE. `declared` is the tool's declared keys (null = accepts anything). */
export function argRenames(tool, declared, args) {
  const map = ARG_RENAMES[String(tool || '')];
  if (!map || !Array.isArray(declared) || !args || typeof args !== 'object' || Array.isArray(args)) return [];
  const out = [];
  for (const [from, to] of Object.entries(map)) {
    if (!Object.prototype.hasOwnProperty.call(args, from) || declared.includes(from) || !declared.includes(to)) continue;
    if (Object.prototype.hasOwnProperty.call(args, to) || out.some((r) => r.to === to)) continue; // the real name was sent too, or a second misname for it: ambiguous, left alone
    out.push({ from, to });
  }
  return out;
}
/** A copy of `args` with the renames applied. PURE. */
export function applyArgRenames(args, renames = []) {
  if (!renames.length) return args;
  const c = { ...args };
  for (const { from, to } of renames) { c[to] = c[from]; delete c[from]; }
  return c;
}
export const RENAMED_ARGS_SYM = Symbol.for('hermoso.renamedArgs');
/** The one line a renamed call's answer starts with, so the agent learns the real name. */
export function renamedArgsNote(tool, renames = []) {
  if (!renames.length) return '';
  return `Read ${renames.map((r) => `\`${r.from}\` as \`${r.to}\``).join(', ')} (${tool || 'this tool'} names ${renames.length > 1 ? 'them' : 'it'} that way).`;
}

// ── A BRAND NAMED ON ANY TOOL CALL SCOPES THAT CALL (2026-11-16, same sweep) ─────────────────────────────────────────
// Agents running several brands named the brand on tools that never declared it: list_library {brandId} ×4,
// list_connector_accounts {brand} ×4, list_connectors {brand} ×3, upload_file {brand} ×8, get_brand {brandId},
// list_published_posts {brand_id}, meta_insights / list_meta_pages / generate_voice {brand} — ~27 calls in 10 sessions.
// Each ran WITHOUT it, so the answer (or the upload) belonged to the connection's PINNED brand, not the one asked for.
// The per-call brand already exists (mcp/client.mjs brandScope → `?brandId=`, read by the server's brandRefOf belt, which
// resolves it, refuses a name that matches no brand or two, and enforces a brand key's scope), but only on the tools
// that declare it. So `brand` / `brandId` / `brand_id` is a META argument on every tool that declares none of the
// three: lifted onto the parsed args under CALL_BRAND_SYM and honoured by wrap(). It is NOT added to any schema (the
// roster stays the same size). Not on Apple Ads tools: `brandId` is Apple's word there and their routes never read ours.
// A tool that declares `brand` as a PROFILE (its description points at list_brands) also takes `brandId` / `brand_id`
// as that `brand`; a tool whose `brand` means something else (a product's brand attribute) is left alone.
export const BRAND_ARG_KEYS = Object.freeze(['brand', 'brandId', 'brand_id']);
export const CALL_BRAND_SYM = Symbol.for('hermoso.callBrand');
const _brandVal = (v) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 120) : '');
/**
 * What to do with a brand named on this call. PURE.
 *   { brand, drop: [keys] } — a META brand: run the call in that brand, and the keys are not unknown arguments;
 *   { renames: [{from, to:'brand'}] } — the tool's own profile `brand`, sent under another spelling;
 *   null — nothing to do (no brand named, an ambiguous pair, or a tool where the word is not ours).
 * `profileBrand` says whether the tool's declared `brand` is a profile (true) or something else (false).
 */
export function callBrandPlan(tool, declared, args, { profileBrand = false } = {}) {
  if (!Array.isArray(declared) || !args || typeof args !== 'object' || Array.isArray(args)) return null;
  if (/apple_ads/.test(String(tool || ''))) return null;
  const sent = BRAND_ARG_KEYS.filter((k) => Object.prototype.hasOwnProperty.call(args, k) && !declared.includes(k));
  if (!sent.length) return null;
  const vals = [...new Set(sent.map((k) => _brandVal(args[k])).filter(Boolean))];
  if (vals.length !== 1) return null; // none usable, or two different brands named: left as unknown arguments, never guessed between
  if (!BRAND_ARG_KEYS.some((k) => declared.includes(k))) return { brand: vals[0], drop: sent };
  if (declared.includes('brand') && profileBrand && !Object.prototype.hasOwnProperty.call(args, 'brand') && sent.length === 1) return { renames: [{ from: sent[0], to: 'brand' }] };
  return null;
}
/** Whether a declared `brand` argument is the PROFILE brand: its description points at list_brands. */
export function brandArgIsProfile(schema) {
  try {
    const shape = schema && typeof schema === 'object' ? (typeof schema.safeParse === 'function' ? (schema.shape || schema._def?.shape?.() || schema._zod?.def?.shape) : schema) : null;
    const f = shape && shape.brand;
    const d = f && (f.description || f._def?.description || f._zod?.def?.description || (typeof f.meta === 'function' ? f.meta()?.description : ''));
    return /list_brands/.test(String(d || ''));
  } catch { return false; }
}
