// ── MCP 2026-07-28 ("modern", stateless) — the pure half of the dual-era hosted connector (2026-11-26) ──────────────
// mcp/http.mjs serves the legacy 2025-11-25 era through the SDK (initialize, Mcp-Session-Id, SSE). This file holds what
// the MODERN era needs on top of it and nothing that touches a socket, so tools/mcp-era-2026-check.mjs runs the real
// functions: the gate (off by default), request classification + header validation, the result envelope, the Skills
// extension catalog (io.modelcontextprotocol/skills), the Tasks extension state (io.modelcontextprotocol/tasks), and
// the MRTR confirmation form. Specs read 2026-11-26: modelcontextprotocol.io/specification/2026-07-28 (changelog,
// basic/versioning, basic/transports/streamable-http, basic/patterns/mrtr, client/elicitation, schema.ts) +
// github.com/modelcontextprotocol/ext-skills specification/beta/skills.mdx + ext-tasks specification/2026-07-28/tasks.md.
//
// THE ONE RULE: a legacy client is never affected. Nothing here runs unless MCP_ERA_2026 is set, the request is modern
// (per-request `_meta` / MCP-Protocol-Version 2026-07-28, no initialize), and it is authenticated. Off = byte-identical.
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const MODERN_VERSION = '2026-07-28';
export const MODERN_VERSIONS = Object.freeze([MODERN_VERSION]);
// What server/discover advertises: the modern revision, and the legacy one this endpoint still serves via initialize.
export const SUPPORTED_VERSIONS = Object.freeze([MODERN_VERSION, '2025-11-25']);
export const META_VERSION = 'io.modelcontextprotocol/protocolVersion';
export const META_CAPS = 'io.modelcontextprotocol/clientCapabilities';
export const META_CLIENT = 'io.modelcontextprotocol/clientInfo';
export const META_SERVER = 'io.modelcontextprotocol/serverInfo';
export const META_SUB = 'io.modelcontextprotocol/subscriptionId';
export const EXT_SKILLS = 'io.modelcontextprotocol/skills';
export const EXT_TASKS = 'io.modelcontextprotocol/tasks';
// Error codes (schema.ts 2026-07-28 — the renumbered ones, not the draft -32001/-32003/-32004).
export const ERR = Object.freeze({ HEADER_MISMATCH: -32020, MISSING_CAPABILITY: -32021, UNSUPPORTED_VERSION: -32022, METHOD_NOT_FOUND: -32601, INVALID_PARAMS: -32602, INVALID_REQUEST: -32600, INTERNAL: -32603 });

// ── THE GATE ─────────────────────────────────────────────────────────────────────────────────────────────────────────
// MCP_ERA_2026:
//   unset / 0 / off  → legacy only. server/discover keeps its deliberate legacy 400, so dual-era hosts fall back.
//   optin            → modern ONLY for a request that opts in: `?era=2026-07-28` on the URL or `X-Hermoso-Mcp-Era: 2026-07-28`.
//   hosts            → opt-ins, plus hosts whose user-agent or _meta clientInfo.name matches MCP_ERA_2026_HOSTS (a regex).
//   1 / on / all     → every modern request.
// `?era=legacy` (or the header set to `legacy`) opts ONE connection out in every mode: the kill switch a user can apply
// to their own connector URL without a deploy.
export function eraConfig(env = process.env) {
  const raw = String(env.MCP_ERA_2026 ?? '').trim().toLowerCase();
  const mode = ['1', 'on', 'all', 'true'].includes(raw) ? 'all' : raw === 'hosts' ? 'hosts' : raw === 'optin' ? 'optin' : 'off';
  let hosts = null;
  if (mode === 'hosts' && env.MCP_ERA_2026_HOSTS) { try { hosts = new RegExp(String(env.MCP_ERA_2026_HOSTS), 'i'); } catch { hosts = null; } }
  return { mode, on: mode !== 'off', hosts };
}
const eraAsk = (req) => String(req?.query?.era ?? req?.headers?.['x-hermoso-mcp-era'] ?? '').trim().toLowerCase();
export function eraAllowed(cfg, req, clientName = '') {
  if (!cfg || !cfg.on) return false;
  const ask = eraAsk(req);
  if (ask === 'legacy') return false;
  if (ask === MODERN_VERSION || ask === '2026') return true;
  if (cfg.mode === 'all') return true;
  if (cfg.mode === 'hosts' && cfg.hosts) return cfg.hosts.test(String(req?.headers?.['user-agent'] || '')) || cfg.hosts.test(String(clientName || ''));
  return false;
}

// ── CLASSIFYING A REQUEST ────────────────────────────────────────────────────────────────────────────────────────────
const metaOf = (msg) => (msg && msg.params && typeof msg.params === 'object' && msg.params._meta && typeof msg.params._meta === 'object' ? msg.params._meta : null);
const isModernVersion = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && v >= MODERN_VERSION;
// A request is MODERN when it says so — a modern version in MCP-Protocol-Version or in `_meta` — and is not an
// initialize (which selects legacy semantics by definition, versioning § Backward Compatibility). A legacy client sends
// MCP-Protocol-Version 2025-11-25 after its initialize, so it can never match. A batch is a legacy-only shape.
export function classifyModern(req) {
  const hv = String(req?.headers?.['mcp-protocol-version'] || '').trim();
  const body = req?.body;
  if (Array.isArray(body)) return isModernVersion(hv) ? { modern: true, batch: true } : null;
  if (!body || typeof body !== 'object' || typeof body.method !== 'string') return null;
  if (body.method === 'initialize') return null;
  const meta = metaOf(body);
  const mv = meta ? meta[META_VERSION] : undefined;
  if (!isModernVersion(hv) && !isModernVersion(mv)) return null;
  return { modern: true, batch: false, msg: body, meta: meta || {}, headerVersion: hv, metaVersion: typeof mv === 'string' ? mv : '' };
}
export function clientInfoOfMeta(meta) {
  const ci = meta && meta[META_CLIENT];
  return ci && typeof ci === 'object' ? { name: String(ci.name || '').slice(0, 64), version: String(ci.version || '').slice(0, 24) } : { name: '', version: '' };
}
export function clientCapsOfMeta(meta) {
  const c = meta && meta[META_CAPS];
  return c && typeof c === 'object' && !Array.isArray(c) ? c : {};
}
export const declaresTasks = (caps) => !!(caps && caps.extensions && typeof caps.extensions === 'object' && caps.extensions[EXT_TASKS] && typeof caps.extensions[EXT_TASKS] === 'object');
// Elicitation in FORM mode: `elicitation: {}` is form-only for backward compatibility (client/elicitation § Capabilities).
export const declaresFormElicitation = (caps) => {
  const e = caps && caps.elicitation;
  if (!e || typeof e !== 'object') return false;
  return Object.keys(e).length === 0 || !!(e.form && typeof e.form === 'object');
};

// The Base64 sentinel (streamable-http § Value Encoding): `=?base64?…?=`, case-sensitive markers.
export function decodeHeaderValue(v) {
  const s = String(v ?? '');
  const m = /^=\?base64\?([A-Za-z0-9+/=]*)\?=$/.exec(s);
  if (!m) return s;
  try { return Buffer.from(m[1], 'base64').toString('utf8'); } catch { return null; }
}
const NAME_SOURCE = { 'tools/call': 'name', 'prompts/get': 'name', 'resources/read': 'uri', 'tasks/get': 'taskId', 'tasks/update': 'taskId', 'tasks/cancel': 'taskId' };
// Server Validation: missing or mismatched MCP-Protocol-Version / Mcp-Method / Mcp-Name → 400 + -32020. Returns null
// when the headers agree with the body, else { status, code, message, data? }.
export function validateModernHeaders(req, c) {
  const msg = c.msg;
  const hv = c.headerVersion;
  if (!hv) return { status: 400, code: ERR.HEADER_MISMATCH, message: 'Header mismatch: the MCP-Protocol-Version header is required.' };
  if (!c.metaVersion) return { status: 400, code: ERR.HEADER_MISMATCH, message: `Header mismatch: MCP-Protocol-Version is '${hv}' but the request has no _meta["${META_VERSION}"].` };
  if (hv !== c.metaVersion) return { status: 400, code: ERR.HEADER_MISMATCH, message: `Header mismatch: MCP-Protocol-Version header value '${hv}' does not match body value '${c.metaVersion}'.` };
  if (!MODERN_VERSIONS.includes(c.metaVersion)) return { status: 400, code: ERR.UNSUPPORTED_VERSION, message: 'Unsupported protocol version', data: { supported: [...MODERN_VERSIONS], requested: c.metaVersion } };
  const isNotification = msg.id === undefined || msg.id === null;
  if (isNotification) return null; // header requirements for notification POSTs are not defined by this revision
  const hm = req.headers['mcp-method'];
  if (hm === undefined) return { status: 400, code: ERR.HEADER_MISMATCH, message: 'Header mismatch: the Mcp-Method header is required.' };
  if (String(hm) !== msg.method) return { status: 400, code: ERR.HEADER_MISMATCH, message: `Header mismatch: Mcp-Method header value '${String(hm).slice(0, 60)}' does not match body value '${msg.method.slice(0, 60)}'.` };
  const field = NAME_SOURCE[msg.method];
  if (field) {
    const body = msg.params && typeof msg.params[field] === 'string' ? msg.params[field] : null;
    const raw = req.headers['mcp-name'];
    if (raw === undefined) return { status: 400, code: ERR.HEADER_MISMATCH, message: `Header mismatch: the Mcp-Name header is required for ${msg.method}.` };
    const hn = decodeHeaderValue(raw);
    if (hn === null || body === null || hn !== body) return { status: 400, code: ERR.HEADER_MISMATCH, message: `Header mismatch: Mcp-Name header value does not match body value${body === null ? ` (params.${field} is missing)` : ''}.` };
  }
  return null;
}

// ── THE RESULT ENVELOPE ──────────────────────────────────────────────────────────────────────────────────────────────
// Every modern result carries `resultType`; list/read/discover results carry ttlMs + cacheScope (CacheableResult); and
// the server names itself in `_meta` (ResultMetaObject). A tool's own `_meta` (the ChatGPT widget keys) is kept.
export const CACHEABLE = new Set(['server/discover', 'tools/list', 'prompts/list', 'resources/list', 'resources/read', 'resources/templates/list', 'skills/list', 'skills/get']);
export const MODERN_TTL_MS = Object.freeze({ 'server/discover': 300_000, 'tools/list': 60_000, 'prompts/list': 300_000, 'resources/list': 300_000, 'resources/templates/list': 300_000, 'resources/read': 300_000, 'skills/list': 300_000, 'skills/get': 300_000 });
export function modernResult(method, result, serverInfo, { cacheScope = 'private', ttlMs } = {}) {
  const r = result && typeof result === 'object' && !Array.isArray(result) ? { ...result } : {};
  if (typeof r.resultType !== 'string') r.resultType = 'complete';
  if (CACHEABLE.has(method)) {
    if (!Number.isFinite(r.ttlMs)) r.ttlMs = Number.isFinite(ttlMs) ? ttlMs : (MODERN_TTL_MS[method] ?? 0);
    if (r.cacheScope !== 'public' && r.cacheScope !== 'private') r.cacheScope = cacheScope;
  }
  r._meta = { ...(r._meta && typeof r._meta === 'object' ? r._meta : {}), [META_SERVER]: serverInfo };
  return r;
}
// Capabilities for server/discover: what the legacy server negotiated, minus the parts this era removed or that we do
// not push here (logging is deprecated; list-change pushes ride subscriptions/listen, which acknowledges none).
export function modernCapabilities(legacyCaps = {}) {
  const c = {};
  if (legacyCaps.tools) c.tools = { listChanged: false };
  if (legacyCaps.resources) c.resources = {};
  if (legacyCaps.prompts) c.prompts = { listChanged: false };
  if (legacyCaps.completions) c.completions = {};
  c.resources ||= {}; // the Skills extension serves its files through resources/read, so resources is always declared
  c.extensions = { [EXT_SKILLS]: {}, [EXT_TASKS]: {} };
  return c;
}

// ── SIGNED STATE (requestState for MRTR, taskId for Tasks) ─────────────────────────────────────────────────────────────
// Both pass through the client, so both are attacker-controlled input (mrtr § Server Requirements 4): HMAC-protected,
// bound to the authenticated ACCOUNT (stable across an OAuth refresh, unlike the token), and checked on every use.
let _key = null;
function stateKey() {
  if (_key) return _key;
  const base = process.env.MCP_STATE_SECRET || process.env.HERMOSO_SESSION_SECRET || process.env.HEIST_SESSION_SECRET || '';
  // No secret configured: a per-process random key. State minted by this process is still verifiable by it; a restart
  // makes outstanding requestStates re-ask (never run) and taskIds unreadable (the job is still in get_job/list_jobs).
  _key = createHmac('sha256', base || randomBytes(32)).update('hermoso-mcp-era-2026-state').digest();
  return _key;
}
export function _resetStateKeyForTests() { _key = null; }
const b64u = (buf) => Buffer.from(buf).toString('base64url');
function sign(prefix, obj) {
  const body = b64u(JSON.stringify(obj));
  const sig = b64u(createHmac('sha256', stateKey()).update(prefix + '.' + body).digest()).slice(0, 32);
  return `${prefix}.${body}.${sig}`;
}
function verify(prefix, token) {
  const s = String(token || '');
  const parts = s.split('.');
  if (parts.length !== 3 || parts[0] !== prefix) return null;
  const want = b64u(createHmac('sha256', stateKey()).update(prefix + '.' + parts[1]).digest()).slice(0, 32);
  const a = Buffer.from(parts[2]); const b = Buffer.from(want);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try { return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')); } catch { return null; }
}
export const principalOf = (user) => createHash('sha256').update('acct:' + String(user?.accountId ?? '') + '|user:' + String(user?.userId ?? '')).digest('hex').slice(0, 24);
// Canonical JSON (sorted keys) so the args digest does not depend on key order.
function canon(v) {
  if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']';
  if (v && typeof v === 'object') return '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}';
  return JSON.stringify(v === undefined ? null : v);
}
export const argsDigest = (name, args) => createHash('sha256').update(String(name) + '\n' + canon(stripConfirm(name, args))).digest('hex').slice(0, 32);

// ── MRTR CONFIRMATION (elicitation, form mode) ─────────────────────────────────────────────────────────────────────
// A tool that answers `needsConfirm: true` has already said, in its own words, exactly what a yes would do (the same
// sentence the model relays today before calling again with confirm:true). For a client that declares form
// elicitation, that sentence becomes the form, and the retry's `accept` is the confirm. NOTHING ELSE CHANGES: the
// unconfirmed call is the tool's own free dry path, and the confirmed call is the same tool with confirm:true.
export const CONFIRM_KEY = 'hermoso_confirm';
export const CONFIRM_STATE_TTL_MS = 10 * 60_000;
// Form mode MUST NOT request sensitive information (client/elicitation § Security). Our forms ask one yes/no, and this
// is the guard that keeps it that way: a field whose name, title or description looks like a credential is refused,
// and so is any field that is not a boolean or an enum. A tool that takes a credential is never elicited at all.
const SECRET_FIELD_RE = /pass(word|code|phrase)?|secret|token|api[-_ ]?key|\bkey\b|credential|cvc|cvv|card[-_ ]?number|\bpin\b|otp|2fa|private/i;
export const SECRET_TOOL_RE = /^(connect_connector|set_connector_key|.*_(api_key|secret|token|password|credentials?))$/;
export function assertNoSecretFields(requestedSchema) {
  const props = requestedSchema && requestedSchema.properties && typeof requestedSchema.properties === 'object' ? requestedSchema.properties : {};
  for (const [k, def] of Object.entries(props)) {
    const t = def && def.type;
    if (!(t === 'boolean' || (t === 'string' && (Array.isArray(def.enum) || Array.isArray(def.oneOf))))) throw new Error(`elicitation form field "${k}" must be a boolean or an enum (form mode never collects free text here)`);
    if (SECRET_FIELD_RE.test(k) || SECRET_FIELD_RE.test(String(def.title || '')) || SECRET_FIELD_RE.test(String(def.description || ''))) throw new Error(`elicitation form field "${k}" looks like a credential; form mode MUST NOT request sensitive information`);
  }
  return true;
}
const MAX_MESSAGE = 6000;
export function confirmForm(toolName, message) {
  const requestedSchema = {
    type: 'object',
    properties: { confirm: { type: 'boolean', title: 'Yes, go ahead', description: 'Do exactly what is described above.', default: true } },
  };
  assertNoSecretFields(requestedSchema);
  const text = String(message || '').trim() || `Run ${toolName}?`;
  return { method: 'elicitation/create', params: { mode: 'form', message: text.length > MAX_MESSAGE ? text.slice(0, MAX_MESSAGE - 1) + '…' : text, requestedSchema } };
}
export function mintConfirmState({ user, name, args, now = Date.now() }) {
  return sign('rs1', { p: principalOf(user), m: 'tools/call', n: String(name), d: argsDigest(name, args), e: now + CONFIRM_STATE_TTL_MS, k: b64u(randomBytes(12)) });
}
// → { ok:true, nonce } or { ok:false, why }. Every check is one the spec's replay guidance names: integrity, principal,
// expiry, and the originating request (tool + digest of its arguments, confirm excluded).
export function checkConfirmState(state, { user, name, args, now = Date.now() }) {
  const s = verify('rs1', state);
  if (!s) return { ok: false, why: 'unverifiable' };
  if (s.p !== principalOf(user)) return { ok: false, why: 'principal' };
  if (!(Number(s.e) > now)) return { ok: false, why: 'expired' };
  if (s.m !== 'tools/call' || s.n !== String(name)) return { ok: false, why: 'request' };
  if (s.d !== argsDigest(name, args)) return { ok: false, why: 'arguments' };
  return { ok: true, nonce: String(s.k || '') };
}
// SINGLE USE. A requestState is a yes to ONE run: replaying the same accepted retry must re-ask, never run twice (the
// spec: digests bound the replay window but "do not by themselves guarantee single-use"). One process holds the set
// (maxScale=1); entries expire with the state they belong to.
export function makeNonceLedger({ max = 10_000 } = {}) {
  const used = new Map();
  return {
    consume(nonce, now = Date.now()) {
      for (const [k, exp] of used) { if (exp <= now) used.delete(k); else break; }
      if (!nonce || used.has(nonce)) return false;
      used.set(nonce, now + CONFIRM_STATE_TTL_MS);
      while (used.size > max) used.delete(used.keys().next().value);
      return true;
    },
    size: () => used.size,
  };
}
// A tool asks for a yes in one of two ways, both measured on the real roster: `needsConfirm: true` in its structured
// reply (≈110 tools), or only in its prose — delete_brand answers "…get an unambiguous yes, then call again with
// confirm:true." and nothing structured (live run 2026-11-26). Either is the tool's own request for the user's yes.
// The caller still requires the tool to TAKE a `confirm` parameter before it builds a form.
const PROSE_CONFIRM_RE = /\bcall (?:it |this |me )?again with confirm\s*:\s*true\b|\bthen call again with\b[^.\n]*\bconfirm\s*:\s*true\b/i;
export function needsConfirmOf(result) {
  if (!result || result.isError) return false;
  const sc = result.structuredContent;
  if (sc && typeof sc === 'object' && !Array.isArray(sc) && sc.needsConfirm === true) return true;
  return PROSE_CONFIRM_RE.test(resultText(result));
}
// A gate that also wants a value echoed back (confirmName, confirmRecipients, confirmActivations: "only after they say
// yes call again with confirm:true AND confirmRecipients set to that count") is deliberately stronger than a yes — the
// number or name proves the user read THIS inventory. A form's Accept cannot supply it, so those stay on today's path.
export const needsMoreThanAYes = (result) => /\bconfirm[A-Z][A-Za-z]+\b/.test(resultText(result) + ' ' + JSON.stringify(result?.structuredContent ?? ''));
export const resultText = (result) => (Array.isArray(result?.content) ? result.content.filter((c) => c && c.type === 'text').map((c) => String(c.text || '')).join('\n') : '');
// What the FORM says: the tool's own account of what a yes does, minus the sentences addressed to the model about how
// to confirm ("call again with confirm:true") — in a form the user's Accept IS that call. Nothing is added or reworded.
const MODEL_CONFIRM_SENTENCE_RE = /[^.!?\n]*\b(?:confirm\s*:\s*true|confirm=true|"confirm"\s*:\s*true|only on (?:a|their) yes|ask the user (?:first|before)|get (?:an explicit|the user'?s?) yes)\b[^.!?\n]*[.!?]?/gi;
export function confirmMessageOf(result) {
  const sc = result && result.structuredContent && typeof result.structuredContent === 'object' ? result.structuredContent : {};
  const src = [sc.summary, sc.note, resultText(result)].find((v) => typeof v === 'string' && v.trim()) || '';
  const out = src.replace(/^\s*⚠\s*/u, '').replace(MODEL_CONFIRM_SENTENCE_RE, '').replace(/[ \t]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  return out || src.trim();
}
// The confirmed call: the same arguments with confirm:true. Through the generic executor, the confirm belongs to the
// inner tool's own arguments.
export function withConfirm(name, args) {
  const a = args && typeof args === 'object' ? { ...args } : {};
  if (name === 'call_tool') { a.args = { ...(a.args && typeof a.args === 'object' ? a.args : {}), confirm: true }; return a; }
  a.confirm = true; return a;
}
export function stripConfirm(name, args) {
  const a = args && typeof args === 'object' ? { ...args } : {};
  if (name === 'call_tool' && a.args && typeof a.args === 'object') { const inner = { ...a.args }; delete inner.confirm; a.args = inner; return a; }
  delete a.confirm; return a;
}
const innerToolName = (name, args) => (name === 'call_tool' ? String(args?.name || '') : String(name || ''));
export const elicitableTool = (name, args) => !SECRET_TOOL_RE.test(innerToolName(name, args));
export function inputRequiredResult({ toolName, message, state }) {
  return { resultType: 'input_required', inputRequests: { [CONFIRM_KEY]: confirmForm(toolName, message) }, requestState: state };
}
// → 'accepted' | 'declined' | 'dismissed' | null (no answer to OUR key: treat as a fresh call). `cancel` is the user
// (or a host that cannot show a form at all — Claude Code `-p` answers every form that way, measured 2026-11-26)
// closing it without choosing, which is not a no.
export function confirmAnswer(inputResponses) {
  const r = inputResponses && typeof inputResponses === 'object' ? inputResponses[CONFIRM_KEY] : null;
  if (!r || typeof r !== 'object') return null;
  if (r.action === 'accept' && !(r.content && r.content.confirm === false)) return 'accepted';
  if (r.action === 'accept' || r.action === 'decline') return 'declined';
  if (r.action === 'cancel') return 'dismissed';
  return null;
}
// What the model reads when the form did not end in a yes. Nothing ran either way; a dismissal keeps the agent's own
// path open (the same confirm:true it would have used before this era), because the user may have said yes in chat.
export function notConfirmedResult(name, answer) {
  if (answer === 'dismissed') return { content: [{ type: 'text', text: `The confirmation form was closed without an answer (some hosts cannot show forms, for example a headless run), so ${name} did not run and nothing was changed or charged. If the user has already said yes to exactly this in the conversation, call ${name} again with confirm:true; otherwise ask them first.` }], structuredContent: { declined: false, dismissed: true, ran: false } };
  return { content: [{ type: 'text', text: `The user said no, so ${name} did not run. Nothing was changed and nothing was charged.` }], structuredContent: { declined: true, ran: false } };
}

// ── the curated directory gate (mcp/directory-confirm.mjs) through MRTR ──
// Its first call answers a preview: structuredContent.confirmation {status:'preview', code, action, destinations}. Only
// that status becomes a form; 'refused_new_preview' (a bad code was presented) stays on the code path, as in legacy.
export const isDirPreview = (result) => !!(result && !result.isError && result.structuredContent && result.structuredContent.confirmation
  && result.structuredContent.confirmation.status === 'preview' && typeof result.structuredContent.confirmation.code === 'string' && result.structuredContent.confirmation.code);
// The preview the user reads: everything the gate described, minus its "PREVIEW ONLY" head and its code tail (in a form
// the Accept IS the approval), and the code itself scrubbed from anywhere else it might appear.
export function dirPreviewText(result, code) {
  const paras = resultText(result).split(/\n{2,}/).filter((p) => !/^\s*PREVIEW ONLY\b/.test(p) && !/^\s*Confirmation code:/.test(p) && !/^\s*The confirmation form could not be shown\b/.test(p));
  const t = paras.join('\n\n').trim();
  return code ? t.split(String(code)).join('(code withheld)') : t;
}
export const confirmStateNonce = (state) => { const s = verify('rs1', state); return s ? String(s.k || '') : ''; };
export function withDirCode(name, args, arg, code) {
  const a = args && typeof args === 'object' ? { ...args } : {};
  if (name === 'call_tool') { a.args = { ...(a.args && typeof a.args === 'object' ? a.args : {}), [arg]: code }; return a; }
  a[arg] = code; return a;
}
// The legacy branch's own words for a form that did not end in a yes (directory-confirm.mjs makeConfirmGate).
export function dirNotDoneResult(dir, answer) {
  const how = answer === 'dismissed' ? 'cancelled' : 'declined';
  return {
    content: [{ type: 'text', text: `Not done: the user ${how} on the confirmation form. Nothing was published, sent or changed.\n\n${dir.text}` }],
    structuredContent: { confirmation: { status: 'declined', via: 'elicitation', action: dir.action, destinations: dir.destinations } },
  };
}

// ── TASKS ────────────────────────────────────────────────────────────────────────────────────────────────────────────
// A task IS one or more of our own durable render jobs (POST /api/jobs, the queue and its R2 mirror). The taskId carries
// the job ids, signed and bound to the account; the job's own record is the task's state, read through the caller's
// bearer on every tasks/get, so nothing about a task lives only in this process.
export const TASK_POLL_MS = 5000;
export const TASK_TTL_MS = 24 * 3600_000;
const JOB_ID_RE = /\bjob_[A-Za-z0-9]{6,40}\b/g;
// Which jobs a tool reply left RENDERING. The reply is the evidence, exactly as the model reads it today: a render tool
// that outlived its wait answers `stillRendering` + `jobId` (awaitRenderJob), or names the job and says get_job.
export function pendingJobIdsOf(result) {
  if (!result || result.isError) return [];
  const sc = result.structuredContent && typeof result.structuredContent === 'object' ? result.structuredContent : {};
  const ids = new Set();
  if (sc.stillRendering === true) {
    if (typeof sc.jobId === 'string') ids.add(sc.jobId);
    if (Array.isArray(sc.jobIds)) for (const j of sc.jobIds) if (typeof j === 'string') ids.add(j);
  }
  if (!ids.size) {
    const t = resultText(result);
    if (/\bget_job\b/.test(t) && /still rendering|rendering;|is rendering|queued as job/i.test(t)) for (const m of t.match(JOB_ID_RE) || []) ids.add(m);
  }
  return [...ids].filter((id) => /^job_[A-Za-z0-9]{6,40}$/.test(id)).slice(0, 8);
}
// THE ONE GATE for turning a reply into a task: only when THIS request's capabilities declare the extension
// ("MUST NOT return CreateTaskResult to a client that did not include the extension capability on its request,
// regardless of prior declarations"). Claude Code 2.1.332 declares it on discover/list and NOT on tools/call, so a
// per-session memory of "this client does tasks" would be exactly the defect the spec forbids.
export const taskJobIdsFor = (caps, result) => (declaresTasks(caps) ? pendingJobIdsOf(result) : []);
export function mintTaskId({ user, tool, jobIds, now = Date.now() }) {
  return sign('ht1', { p: principalOf(user), t: String(tool || ''), j: jobIds, c: now });
}
export function readTaskId(taskId, user) {
  const s = verify('ht1', taskId);
  if (!s || !Array.isArray(s.j) || !s.j.length) return null;
  if (s.p !== principalOf(user)) return null; // another account's handle reads as unknown, never as "not yours"
  return { tool: String(s.t || ''), jobIds: s.j.map(String), createdAt: Number(s.c) || Date.now() };
}
const iso = (ms) => new Date(Number(ms) || Date.now()).toISOString();
const CANCELLED_RE = /^Cancelled\b/i;
// Job rows (publicJob, or null when the read failed) → the task's status. A failed READ is not a failed task
// ([[failed-read-is-not-empty]]): it stays `working` and says so.
export function taskStatusOf(jobs) {
  if (jobs.some((j) => j === undefined)) return { status: 'working', message: 'The render could not be read just now; poll again.' };
  if (jobs.some((j) => j === null)) return { status: 'failed', missing: true };
  const live = jobs.filter((j) => j.status === 'queued' || j.status === 'running');
  if (live.length) {
    const p = Math.round(live.reduce((s, j) => s + (Number(j.progress) || 0), 0) / live.length);
    const stage = live.map((j) => j.stage).find(Boolean);
    return { status: 'working', message: `${live.some((j) => j.status === 'running') ? 'Rendering' : 'Queued'}${p ? ` (${p}%)` : ''}${stage ? `: ${String(stage).slice(0, 120)}` : ''}.` };
  }
  if (jobs.every((j) => j.status === 'error' && CANCELLED_RE.test(String(j.error || '')))) return { status: 'cancelled', message: String(jobs[0].error || 'Cancelled.') };
  return { status: 'completed', message: jobs.some((j) => j.status === 'error') ? 'Finished with an error.' : 'Done.' };
}
export function taskObject({ taskId, createdAt, jobs, status, message }) {
  const upd = Math.max(Number(createdAt) || 0, ...jobs.filter(Boolean).map((j) => Number(j.updatedAt) || 0));
  return { taskId, status, ...(message ? { statusMessage: message } : {}), createdAt: iso(createdAt), lastUpdatedAt: iso(upd || createdAt), ttlMs: TASK_TTL_MS, pollIntervalMs: TASK_POLL_MS };
}

// ── SKILLS OVER MCP ──────────────────────────────────────────────────────────────────────────────────────────────────
// The skills we already ship, served from the bytes on disk. WHICH SET: the Claude plugin's MCP-native skills
// (cli/directory-plugin/skills, which drive these very tools) plus every CLI skill that does not grant itself a shell.
// A skill whose frontmatter says `allowed-tools: Bash(hermoso …)` is a CLI skill — it tells the model to shell out to
// the `hermoso` binary, which a remote MCP host does not have — so it stays with the CLI and the plugin that install it
// locally. A curated directory connection gets exactly its own plugin's set (cli/directory-plugins/<x>/skills).
// Server layout: mcp/ beside cli/. Inside the npm package: mcp/ beside skills/ and directory-plugin/.
const HERE = path.dirname(fileURLToPath(import.meta.url));
function skillRoots() {
  const server = path.join(HERE, '..', 'cli');
  const base = existsSync(path.join(server, 'package.json')) ? server : path.join(HERE, '..');
  return { cli: path.join(base, 'skills'), plugin: path.join(base, 'directory-plugin', 'skills'), curated: path.join(base, 'directory-plugins') };
}
export const CURATED_SKILL_DIRS = Object.freeze({ 'directory-research': 'ad-research', 'directory-scheduler': 'social-scheduler', 'directory-reports': 'ads-reporting', 'directory-creators': 'creator-campaigns' });
const NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/; // Agent Skills naming: lowercase, digits, single hyphens
// SKILL.md frontmatter → a JSON object, VERBATIM. Only the YAML this repo's skills use is understood (plain, quoted and
// block scalars at the top level); anything else (a nested map, a list) makes the skill unservable rather than served
// with frontmatter that is not "identical in content" to the file (skills.mdx § Frontmatter).
export function parseFrontmatter(text) {
  const src = String(text || '').replace(/\r\n/g, '\n');
  if (!src.startsWith('---\n')) return null;
  const end = src.indexOf('\n---', 4);
  if (end < 0) return null;
  const lines = src.slice(4, end).split('\n');
  const fm = {};
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim() || /^\s*#/.test(line)) continue;
    const m = /^([A-Za-z0-9_-]+):(?:\s(.*))?$/.exec(line);
    if (!m) return null; // indented or unknown structure at the top level
    const key = m[1]; let v = (m[2] ?? '').trim();
    if (/^[>|][-+]?$/.test(v)) {
      const folded = v[0] === '>'; const chomp = v[1] || '';
      const block = [];
      while (i + 1 < lines.length && (/^\s+\S/.test(lines[i + 1]) || !lines[i + 1].trim())) block.push(lines[++i]);
      while (block.length && !block[block.length - 1].trim()) block.pop();
      const ind = Math.min(...block.filter((l) => l.trim()).map((l) => /^(\s*)/.exec(l)[1].length));
      const body = block.map((l) => (l.trim() ? l.slice(ind) : ''));
      let out = folded ? body.reduce((acc, l, idx) => (idx === 0 ? l : l === '' ? acc + '\n' : (body[idx - 1] === '' ? acc + l : acc + ' ' + l)), '') : body.join('\n');
      if (chomp !== '-') out += '\n';
      fm[key] = out;
    } else if (v === '') {
      return null; // a nested map or list: not represented faithfully here
    } else if (v.startsWith('"')) {
      if (!v.endsWith('"') || v.length < 2) return null;
      try { fm[key] = JSON.parse(v); } catch { return null; }
    } else if (v.startsWith("'")) {
      if (!v.endsWith("'") || v.length < 2) return null;
      fm[key] = v.slice(1, -1).replace(/''/g, "'");
    } else if (/^[[{&*!|>%@`]/.test(v)) {
      return null;
    } else {
      v = v.replace(/\s+#.*$/, '');
      fm[key] = v === 'true' ? true : v === 'false' ? false : (v === 'null' || v === '~') ? null : /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : v;
    }
  }
  return fm;
}
// Backticked identifiers that name a Hermoso tool (`list_connectors`); filtered against the known tool set by the caller.
export function toolRefsOf(text) {
  return [...new Set((String(text || '').match(/`([a-z][a-z0-9]*(?:_[a-z0-9]+)+)`/g) || []).map((s) => s.slice(1, -1)))];
}
function walkFiles(dir, rel = '') {
  const out = [];
  for (const ent of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (ent.name.startsWith('.')) continue;
    const p = path.join(dir, ent.name); const r = rel ? `${rel}/${ent.name}` : ent.name;
    if (ent.isDirectory()) out.push(...walkFiles(p, r)); else if (ent.isFile()) out.push({ abs: p, rel: r });
  }
  return out;
}
const MIME = { md: 'text/markdown', txt: 'text/plain', json: 'application/json', py: 'text/x-python', js: 'text/javascript', mjs: 'text/javascript', sh: 'text/x-shellscript', yaml: 'application/yaml', yml: 'application/yaml', csv: 'text/csv', html: 'text/html', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', svg: 'image/svg+xml' };
const mimeOf = (rel) => MIME[String(rel).split('.').pop().toLowerCase()] || 'application/octet-stream';
const TEXTUAL = /^(text\/|application\/(json|yaml)|image\/svg)/;
const SKILL_LIMIT_FILES = 512, SKILL_LIMIT_BYTES = 16 * 1024 * 1024;
// One skill directory → { name, uri, frontmatter, resources[], files Map(uri → {abs, mimeType, size, digest}), toolRefs, shell }
// or null when it is not a valid, servable Agent Skill. Digests and sizes are computed from the bytes served.
export function loadSkillDir(dir) {
  try {
    const name = path.basename(dir);
    if (!NAME_RE.test(name) || !existsSync(path.join(dir, 'SKILL.md'))) return null;
    const md = readFileSync(path.join(dir, 'SKILL.md'));
    const fm = parseFrontmatter(md.toString('utf8'));
    if (!fm || fm.name !== name || typeof fm.description !== 'string' || !fm.description.trim()) return null;
    const files = new Map(); const resources = []; let total = 0; let refsText = '';
    for (const f of walkFiles(dir)) {
      const bytes = readFileSync(f.abs);
      const uri = `skill://${name}/${f.rel}`;
      const digest = 'sha256:' + createHash('sha256').update(bytes).digest('hex');
      total += bytes.length;
      files.set(uri, { abs: f.abs, mimeType: mimeOf(f.rel), size: bytes.length, digest });
      resources.push({ uri, digest, size: bytes.length });
      if (/\.md$/i.test(f.rel)) refsText += '\n' + bytes.toString('utf8');
    }
    if (resources.length > SKILL_LIMIT_FILES || total > SKILL_LIMIT_BYTES) return null;
    const shell = /\bBash\b/.test(String(fm['allowed-tools'] || ''));
    return { name, uri: `skill://${name}/SKILL.md`, frontmatter: fm, resources, files, toolRefs: toolRefsOf(refsText), shell };
  } catch { return null; }
}
let _catalog = null;
// The whole catalog, read once per process (the files are part of the release).
export function skillCatalog({ roots = skillRoots(), fresh = false } = {}) {
  if (_catalog && !fresh) return _catalog;
  const load = (root) => { try { return readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => loadSkillDir(path.join(root, d.name))).filter(Boolean); } catch { return []; } };
  const general = new Map();
  for (const s of load(roots.plugin)) general.set(s.name, s);
  for (const s of load(roots.cli)) if (!s.shell && !general.has(s.name)) general.set(s.name, s);
  const curated = {};
  for (const [tok, dir] of Object.entries(CURATED_SKILL_DIRS)) curated[tok] = new Map(load(path.join(roots.curated, dir, 'skills')).map((s) => [s.name, s]));
  _catalog = { general, curated };
  return _catalog;
}
// The skills THIS connection is served. `curatedToken` picks a curated directory connection's own set; `callable` is
// the set of tool names this connection can actually run (listed, or reachable through call_tool) and `known` every
// Hermoso tool name — a skill that names a known tool this connection cannot run is not served here.
export function skillsForConnection({ curatedToken = null, callable, known, catalog = skillCatalog() }) {
  const pool = curatedToken && catalog.curated[curatedToken] ? catalog.curated[curatedToken] : catalog.general;
  const out = [];
  for (const s of pool.values()) {
    const refs = s.toolRefs.filter((t) => !known || known.has(t));
    if (callable && refs.some((t) => !callable.has(t))) continue;
    out.push(s);
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}
export const skillEntry = (s) => ({ uri: s.uri, frontmatter: s.frontmatter, resources: s.resources });
// resources/read for a skill file this connection is served → ReadResourceResult contents, or null (unknown → -32602).
export function readSkillFile(skills, uri) {
  for (const s of skills) {
    const f = s.files.get(uri);
    if (!f) continue;
    const bytes = readFileSync(f.abs);
    // Serve exactly the bytes the manifest describes; a file changed under us since the catalog was read is an error,
    // never a silent digest mismatch handed to a host that will (correctly) reject it.
    if (bytes.length !== f.size || 'sha256:' + createHash('sha256').update(bytes).digest('hex') !== f.digest) throw Object.assign(new Error('skill file changed since it was listed'), { code: ERR.INTERNAL });
    return TEXTUAL.test(f.mimeType) ? [{ uri, mimeType: f.mimeType, text: bytes.toString('utf8') }] : [{ uri, mimeType: f.mimeType, blob: bytes.toString('base64') }];
  }
  return null;
}
export const skillResourceRows = (skills) => skills.map((s) => ({ uri: s.uri, name: s.name, description: String(s.frontmatter.description || '').trim(), mimeType: 'text/markdown' }));
