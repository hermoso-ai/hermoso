// Tiny fetch wrapper around the Hermoso HTTP API, shared by the MCP server (mcp/tools.mjs) and the CLI (bin/hermoso.mjs).
// LOCAL today: no auth needed — the server's local auth adapter resolves the fixed dev account, so requireAuth/
// gateSpend pass. When real auth lands, set HERMOSO_TOKEN (a Bearer) and the SAME calls become authoritative — no
// changes here. We attach the x-hermoso-plan / x-hermoso-user fallbacks the browser also sends, purely for parity;
// the server treats them as non-authoritative (identity comes from the verified token / local dev user).
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { AsyncLocalStorage } from 'node:async_hooks';

// Remote-connector identity: mcp/http.mjs wraps each request in mcpCtx.run({ token }) so every /api call a tool
// makes carries THAT caller's bearer (bills their account). stdio keeps using the env token — ctx is simply unset.
export const mcpCtx = new AsyncLocalStorage();

export const API_BASE = (process.env.HERMOSO_API_BASE || 'https://app.hermoso.ai').replace(/\/+$/, '');
const TOKEN = process.env.HERMOSO_TOKEN || '';
// PINNED profile, or '' when unpinned. MUST stay unset by default: the server resolves an API key's profile as
// header > key.keyProfileId > 'default' (adapters/auth/middleware.js), so always sending the header permanently
// masks the brand `use_brand` saved against the key — connectors on any non-default brand then look disconnected.
export const PROFILE = process.env.HERMOSO_PROFILE || '';
// SHARED TEAM WORKSPACE: the OWNING account. The web client sends this as x-hermoso-owner from PROFILE_OWNER
// (public/app.js ctxHeaders) whenever the active brand belongs to someone else's account; the MCP twins never did,
// so a member driving Hermoso headlessly resolved every brand-scoped read against their OWN empty account —
// resolveWs's `if (owner && owner !== own)` branch simply never ran and it fell through to the own-account path.
// Symptom (live 2026-07-31): 0 connectors over MCP on a workspace showing 10 in the browser, with NO error.
// SAFE TO SEND: the server RE-AUTHORIZES it against profile_members on every request (adapters/auth/middleware.js
// resolveWs), so a forged or stale value is 403'd, never trusted. Like the profile header it must stay UNSET by
// default — sending an owner for your own account would make resolveWs take the shared branch against yourself.
// PAIR IT WITH THE PROFILE UUID, not the slug: profile_members keys on profiles.id, so a client_slug is the one
// thing isMember() cannot match and it 403s. list_brands names both values for every workspace you can enter.
export const OWNER = process.env.HERMOSO_OWNER || '';
// The env-var prefix THIS build reads. tools.mjs is byte-identical across the two twins, so it cannot
// hardcode either name when it tells a user which variables to set — it asks its own client.
export const ENV_PREFIX = 'HERMOSO';

// WHICH TOOL IS RUNNING. The error ledger groups on the OP, and a path alone cannot name the tool: `plan_ad`,
// `render_ad` and `make_template_ad` all fail through POST /api/create, so without this every MCP defect would be
// filed under one row called "POST /api/create" and be unfixable. wrap() sets it around each tool call; headers()
// stamps it on every /api request that call makes, so route() records the tool NAME and nothing has to be reported
// twice. Deliberately a per-call AsyncLocalStorage and not a module variable — concurrent tool calls interleave.
export const toolCtx = new AsyncLocalStorage();

function headers(extra = {}) {
  const ctx = mcpCtx.getStore();
  // A HOSTED-CONNECTOR request (mcp/http.mjs) is a DIFFERENT TENANT from the process serving it, so its ctx is the
  // ONLY scope it may carry: falling through to this process's HERMOSO_PROFILE / HERMOSO_OWNER would scope one
  // customer's tool call to whatever workspace the SERVER's environment happens to name — a cross-tenant leak that
  // is invisible because it succeeds. stdio/CLI keeps the env fallback: there the process and the caller are the
  // same person. Presence of the ctx store IS "remote" (see isRemote below).
  const prof = ctx ? (ctx.profile || '') : PROFILE; // omitted when unpinned so the key's saved brand wins server-side
  const own = ctx ? (ctx.owner || '') : OWNER; // the wire name is x-hermoso-owner on BOTH twins — it is the server's header, not a brand
  const tool = toolCtx.getStore()?.tool || '';
  const h = { 'Content-Type': 'application/json', ...(prof ? { 'x-hermoso-user': prof } : {}), ...(own ? { 'x-hermoso-owner': own } : {}), ...(tool ? { 'x-hermoso-tool': tool } : {}), ...extra };
  const tok = ctx?.token || TOKEN;
  if (tok) h.Authorization = `Bearer ${tok}`;
  return h;
}

// unwrap the {data}|{error} envelope; throw a clean Error (with .status) on failure
async function unwrap(res) {
  let body = null;
  try { body = await res.json(); } catch {}
  if (!res.ok) {
    const msg = (body && (body.error || body.message)) || `HTTP ${res.status}`;
    // `_viaApi` MARKS AN ERROR THAT ALREADY REACHED THE SERVER, so route() has already recorded it in the error
    // ledger with the tool name off x-hermoso-tool. wrap() reports ONLY the errors that lack this marker — a local
    // throw, a schema rejection, a socket reset — which is what stops the twins double-counting every 4xx.
    throw Object.assign(new Error(msg), { status: res.status, _viaApi: true, ...(body?.connector ? { connector: body.connector } : {}) });
  }
  return body && Object.prototype.hasOwnProperty.call(body, 'data') ? body.data : body;
}

/**
 * Report an error that never reached our API. Fire-and-forget, bounded, and it can NEVER throw or recurse: it uses
 * plain fetch (not apiPost, whose own failure would report itself forever) and swallows everything.
 */
let _reportedThisProcess = 0;
export function reportToolError(tool, err) {
  try {
    if (_reportedThisProcess++ > 200) return; // a client stuck in a retry loop must not become the traffic
    const e = err && typeof err === 'object' ? err : {};
    fetch(`${API_BASE}/api/errors/report`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({
        op: String(tool || 'unknown').slice(0, 60),
        errorClass: String(e.name || 'Error').slice(0, 40),
        status: Number(e.status) || 0,
        message: String(e.message || e).slice(0, 300),
        ...(e.connector ? { connector: String(e.connector).slice(0, 32) } : {}),
      }),
    }).catch(() => {});
  } catch { /* an instrument never breaks the thing it measures */ }
}

export async function apiGet(p, query) {
  // URLSearchParams stringifies undefined/null as the LITERAL "undefined"/"null" — so an omitted optional param
  // arrives as a truthy string and silently changes server behaviour. Live 2026-07-27: list_google_ads_campaigns
  // sent since=undefined&until=undefined, the server saw two truthy values, took the BETWEEN branch, and its
  // digit-strip reduced them to '' → GAQL "segments.date BETWEEN '' and ''". Drop empties before building the qs.
  const clean = query && Object.fromEntries(Object.entries(query).filter(([, v]) => v !== undefined && v !== null && v !== ''));
  const qs = clean && Object.keys(clean).length ? '?' + new URLSearchParams(clean).toString() : '';
  const res = await fetch(`${API_BASE}${p}${qs}`, { headers: headers() });
  return unwrap(res);
}

export async function apiPost(p, body = {}) {
  const res = await fetch(`${API_BASE}${p}`, { method: 'POST', headers: headers(), body: JSON.stringify(body) });
  return unwrap(res);
}

// PATCH — a PARTIAL update, and the distinction is load-bearing on the schedule routes: an omitted key means
// "leave that field exactly as it was", so sending a whole object where a patch was meant would blank the fields
// the caller never mentioned. Only ever send the keys that are actually changing.
export async function apiPatch(p, body = {}) {
  const res = await fetch(`${API_BASE}${p}`, { method: 'PATCH', headers: headers(), body: JSON.stringify(body) });
  return unwrap(res);
}

export async function apiDelete(p) {
  const res = await fetch(`${API_BASE}${p}`, { method: 'DELETE', headers: headers() });
  return unwrap(res);
}

export async function apiPut(p, body = {}) {
  const res = await fetch(`${API_BASE}${p}`, { method: 'PUT', headers: headers(), body: JSON.stringify(body) });
  return unwrap(res);
}

// A hosted-connector call (via mcp/http.mjs) has an mcpCtx store; local stdio/CLI does not. Used to REFUSE local-path
// file reads on the hosted connector (it runs on the SERVER host, not the user's machine — an LFI/exfil vector).
export const isRemote = () => !!mcpCtx.getStore();

// DOES THIS HOST RENDER OUR WIDGETS ITSELF?
// ChatGPT (the Apps SDK) draws every finished render in `ui://widget/ad-result.html`, hydrated from
// `structuredContent`. For that host the inline base64 image block in `content` is not just redundant, it is
// actively harmful: a finished 1:1 render is ~1 MB of base64, and a result that size arrived in ChatGPT with an
// EMPTY toolOutput — the card drew its "No media in this result yet" empty state while the model narrated success
// from the text block. Measured 2026-08-23: structuredContent, outputSchema, the tools/list binding and the widget
// itself were each verified correct in isolation, and the oversized `content` was the only thing left.
// Claude has no widget, so it KEEPS the inline block — that is the only reason it renders an image in chat at all.
// Advisory and fail-open: an unrecognised or absent client behaves exactly as before.
const WIDGET_HOSTS = /openai|chatgpt/i;
export const hostRendersWidgets = () => WIDGET_HOSTS.test(mcpCtx.getStore()?.client || '');

// ── WHICH WORKSPACE'S STORE KEYS THIS CALL WRITES ──────────────────────────────────────────────────────────────
// The suffix synced store keys carry (`` = the bare/anchor keys, `<clientSlug>` = a sub-brand). It comes from the
// SERVER (`GET /api/workspace` → resolveWs), never from this process's environment, because on the hosted twin the
// caller and the process are different tenants: HERMOSO_PROFILE names whatever workspace the SERVER's env happens to
// mention, which for a hosted connector is nothing at all. That is how `use_brand "Client X"` kept reading and
// WRITING the anchor brand (live 2026-08-01), and how draft_brand's save overwrote the default brand's profile.
let _suffixMemo = null; // stdio/CLI only: one process = one caller, so a module-level memo is honest here
async function fetchStoreSuffix() {
  const w = await apiGet('/api/workspace'); // throws on failure — see storeSuffix()
  if (!w || typeof w.storeSuffix !== 'string') throw new Error('Could not resolve this workspace.');
  return w.storeSuffix;
}
export async function storeSuffix() {
  const ctx = mcpCtx.getStore();
  if (ctx) {
    // HOSTED: memoize on the PER-REQUEST ctx object only. A module-level cache here would serve one customer's
    // workspace suffix to the next caller on the same process — a silent cross-tenant write.
    if (ctx._storeSuffix === undefined) ctx._storeSuffix = await fetchStoreSuffix();
    return ctx._storeSuffix;
  }
  if (_suffixMemo === null) {
    // stdio/CLI: the env pin is a REAL local authority (the process and the caller are the same person), so it is
    // the fallback when an older server has no /api/workspace. A hosted call has no such fallback and must throw:
    // guessing `bare` on a failed read is how the anchor brand gets overwritten, and a FAILED READ IS NOT EMPTY.
    try { _suffixMemo = await fetchStoreSuffix(); }
    catch { _suffixMemo = PROFILE && PROFILE !== 'default' ? PROFILE : ''; }
  }
  return _suffixMemo;
}
// use_brand / create_brand re-pin the key SERVER-SIDE, so the memo must not outlive the switch.
export function forgetWorkspaceScope() {
  _suffixMemo = null;
  const ctx = mcpCtx.getStore();
  if (ctx) delete ctx._storeSuffix;
}
// Upload raw file BYTES to /api/upload (150MB, persists → returns {url,kind,bytes}). Overrides the JSON content-type so
// the server reads the raw body. Lets an agent post ARBITRARY user files (not just Hermoso renders).
export async function apiUpload(p, buf, { contentType = 'application/octet-stream', fileName = '' } = {}) {
  const h = headers({ 'Content-Type': contentType });
  if (fileName) h['x-file-name'] = encodeURIComponent(fileName);
  const res = await fetch(`${API_BASE}${p}`, { method: 'POST', headers: h, body: buf });
  return unwrap(res);
}
// Ingest by URL: the SERVER fetches the bytes (SSRF-guarded on every redirect hop) so nothing has to cross this
// transport. Deliberately no body — /api/upload treats "a body AND a url" as an error rather than picking one.
export async function apiUploadUrl(p, url, { fileName = '' } = {}) {
  const h = headers({});
  delete h['Content-Type']; // a body-less POST must not claim one; the server sniffs the FETCHED bytes
  if (fileName) h['x-file-name'] = encodeURIComponent(fileName);
  const res = await fetch(`${API_BASE}${p}?url=${encodeURIComponent(url)}`, { method: 'POST', headers: h });
  return unwrap(res);
}

// /api/explore/chat streams Server-Sent-Events; collect to the terminal `done` payload {reply, results, actions}.
export async function apiSSE(p, body = {}) {
  const res = await fetch(`${API_BASE}${p}`, { method: 'POST', headers: headers({ Accept: 'text/event-stream' }), body: JSON.stringify(body) });
  if (!res.ok) { let e; try { e = (await res.json()).error; } catch {} throw Object.assign(new Error(e || `HTTP ${res.status}`), { status: res.status }); }
  const reader = res.body.getReader(); const dec = new TextDecoder();
  let buf = '', done = null, error = null; const progress = [];
  for (;;) {
    const { value, done: fin } = await reader.read(); if (fin) break;
    buf += dec.decode(value, { stream: true });
    const frames = buf.split('\n\n'); buf = frames.pop() || '';
    for (const f of frames) {
      const em = /event:\s*(.+)/.exec(f), dm = /data:\s*([\s\S]+)/.exec(f);
      if (!em || !dm) continue;
      let d; try { d = JSON.parse(dm[1]); } catch { continue; }
      const ev = em[1].trim();
      if (ev === 'progress') progress.push(d.label);
      else if (ev === 'done') done = d;
      else if (ev === 'error') error = d.error;
    }
  }
  if (error) throw new Error(error);
  if (!done) throw new Error('Stream closed before a response');
  return { ...done, progress };
}

// Submit a render to the job queue and (optionally) poll it to completion. Returns the UNWRAPPED worker result
// (the {image|video, model} object) on success — the job's `result` is itself a {data} envelope, so we peel it.
export async function submitJob(type, input, { label = '' } = {}) {
  return apiPost('/api/jobs', { type, input, label }); // → publicJob {id, status, ...}
}
export async function getJob(id) { return apiGet(`/api/jobs/${encodeURIComponent(id)}`); } // → publicJob
export function jobResult(job) { const r = job?.result; return r && Object.prototype.hasOwnProperty.call(r, 'data') ? r.data : r; }

export async function pollJob(id, { intervalMs = 3000, timeoutMs = 10 * 60 * 1000, onTick } = {}) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const job = await getJob(id);
    onTick?.(job);
    if (job.status === 'done') return { job, result: jobResult(job) };
    if (job.status === 'error') throw new Error(job.error || 'Render failed');
    if (Date.now() > deadline) throw Object.assign(new Error('Render timed out — check `hermoso jobs get ' + id + '`'), { jobId: id });
    await new Promise(r => setTimeout(r, intervalMs));
  }
}

// ── A REFERENCE THAT IS NOT A URL IS A LOCAL PATH, AND ON THE HOSTED CONNECTOR THERE IS NO SUCH THING ──────────
// ChatGPT renders an image in its OWN sandbox and hands that path straight to generate_video. We opened it and
// leaked `ENOENT: no such file or directory, open 'sandbox:/mnt/data/…'`, a Node filesystem error sitting where an
// instruction belongs (reproduced on the live hosted connector 2026-08-24). `upload_file` has answered this
// correctly since it was written; this says the same thing at the ONE seam every render tool with a file-ish input
// already passes through (generate_image refImages, make_thumbnail faceImages + logo, generate_video refImage,
// generate_avatar image), so a render tool added tomorrow inherits the refusal instead of having to remember it.
// TWO DISTINCT REASONS, deliberately not collapsed into one:
//   • A NON-FILE URI SCHEME (sandbox:, file:, blob:, gs:, s3:) is never a readable path on ANY surface, so it is
//     refused on stdio too. `sandbox:/mnt/data/x.png` does not fail because we are hosted; it fails because that
//     string was never a path.
//   • A BARE PATH while hosted names the caller's disk, which we cannot see. Refusing is not merely the politer
//     answer: hosted MCP tool code runs INSIDE our own container, so readFile() there reads OUR filesystem, and a
//     path that happened to exist would be base64'd into a data: URI and shipped to a video model.
// A Windows drive letter (`C:\\shots\\hero.png`) looks exactly like a one-character scheme, so a scheme needs two or
// more characters to count. That path must still open on stdio.
const REF_SCHEME_NOTE = {
  sandbox: 'That is a path inside your own sandbox, which only your process can read.',
  file: 'A file:// URL is not something I can open.',
  blob: 'A blob: URL only exists inside the browser tab that created it.',
};
// VERIFIED ON THE LIVE HOSTED CONNECTOR 2026-08-24 rather than assumed: upload_file with `dataUri` returned a real
// assets.hermoso.ai URL, and upload_file with `path` refused with its own message. So "call upload_file first" on
// its own would walk the caller into the same wall. The SOURCE is the part that has to be named.
const REF_WAYS_OUT = 'Send the bytes instead of a path. Pass the image as a `data:` URI (data:image/png;base64,…), or put it at a public https URL and pass that. Both work here. If you want a reusable Hermoso URL first, call upload_file with `dataUri` or `url` (its `path` source is refused on the hosted connector for this same reason).';

// PURE, so tools/local-ref-refusal-check.mjs runs the real decision instead of reading it.
export function localRefVerdict(src, { remote = false } = {}) {
  const s = String(src ?? '').trim();
  if (!s) return { action: 'skip' };
  if (/^(https?:|data:)/i.test(s)) return { action: 'pass', value: s };
  const m = /^([a-z][a-z0-9+.-]+):/i.exec(s);
  if (m) return { action: 'refuse', reason: 'scheme', scheme: m[1].toLowerCase() };
  if (remote) return { action: 'refuse', reason: 'hosted' };
  return { action: 'read' };
}

export function localRefMessage(src, verdict, { remote = false } = {}) {
  const s = String(src ?? '').trim().slice(0, 120);
  const head = verdict.reason === 'scheme'
    ? `\`${s}\` is a ${verdict.scheme}: URI, not a file I can open.${REF_SCHEME_NOTE[verdict.scheme] ? ` ${REF_SCHEME_NOTE[verdict.scheme]}` : ''}`
    : `\`${s}\` is a local file path, and on the hosted connector I cannot see your disk.`;
  const tail = verdict.reason === 'scheme' && !remote ? ' If you meant a file on this machine, pass its real filesystem path.' : '';
  return `${head} Nothing was rendered and nothing was charged.\n\n${REF_WAYS_OUT}${tail}`;
}

// `status: 400` is what files this as `user` on the error board. /api/errors/report rebuilds the error from
// ALLOWLISTED fields and deliberately will not read a `_userInput` marker off an untrusted reporter (a caller could
// otherwise file its own crash under "the user's fault"), so the status is the honest channel: 400 is in the
// ledger's AUTHORED_USER_STATUSES. `_userInput` is set too, for the in-process classifier, and it is the accurate
// marker of the two here since this is a bad ARGUMENT rather than a capability we decline to offer.
const refRefusal = (msg) => Object.assign(new Error(msg), { status: 400, _userInput: true });

// Read a local image path → data URI (so --ref local files force Nano-Banana compositing); pass http(s) and data
// URLs through; refuse anything we cannot open, with the way out named.
export async function toRef(srcOrPath) {
  const remote = isRemote();
  const v = localRefVerdict(srcOrPath, { remote });
  if (v.action === 'skip') return null;
  if (v.action === 'pass') return v.value;
  if (v.action === 'refuse') throw refRefusal(localRefMessage(srcOrPath, v, { remote }));
  let buf;
  // Even on stdio a raw ENOENT is a filesystem error where an instruction belongs.
  try { buf = await readFile(srcOrPath); }
  catch (e) { throw refRefusal(`I couldn't open \`${String(srcOrPath).trim().slice(0, 120)}\` (${e?.code || 'the read failed'}). Nothing was rendered and nothing was charged.\n\nCheck the path is right, or send the bytes instead: ${REF_WAYS_OUT}`); }
  const ext = path.extname(srcOrPath).toLowerCase().replace('.', '');
  const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : ext === 'gif' ? 'image/gif' : 'image/jpeg';
  return `data:${mime};base64,${buf.toString('base64')}`;
}

export const authState = () => ({ apiBase: API_BASE, hasToken: !!TOKEN, profile: PROFILE, owner: OWNER });
