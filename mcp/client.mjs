// Tiny fetch wrapper around the Hermoso HTTP API, shared by the MCP server (mcp/tools.mjs) and the CLI (bin/hermoso.mjs).
// LOCAL today: no auth needed — the server's local auth adapter resolves the fixed dev account, so requireAuth/
// gateSpend pass. Set HERMOSO_TOKEN (a Bearer) and the SAME calls become authoritative — no
// changes here. We attach the x-heist-plan / x-heist-user headers (legacy wire names the server still reads) the browser also sends, purely for parity;
// the server treats them as non-authoritative (identity comes from the verified token / local dev user).
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { AsyncLocalStorage } from 'node:async_hooks';

// Remote-connector identity: mcp/http.mjs wraps each request in mcpCtx.run({ token }) so every /api call a tool
// makes carries THAT caller's bearer (bills their account). stdio keeps using the env token — ctx is simply unset.
export const mcpCtx = new AsyncLocalStorage();

// ENV NAMES (2026-09-01): HERMOSO_* is the documented prefix (README, `claude mcp add … -e HERMOSO_TOKEN=…`); HEIST_* is the
// pre-rebrand name still honoured as a fallback. Measured before this fix: a stdio server started with ONLY HERMOSO_TOKEN and
// HERMOSO_API_BASE fell back to localhost:3000 and could not reach Hermoso — the documented setup did not authenticate.
// The published package defaults to the hosted API; a self-hoster sets HERMOSO_API_BASE.
export const API_BASE = ((process.env.HERMOSO_API_BASE ?? process.env.HEIST_API_BASE) || 'https://app.hermoso.ai').replace(/\/+$/, '');
const TOKEN = (process.env.HERMOSO_TOKEN ?? process.env.HEIST_TOKEN) || '';
// PINNED profile, or '' when the caller hasn't pinned one. This MUST stay unset by default: the server resolves
// an API key's profile as  header  >  key.keyProfileId  >  'default'  (adapters/auth/middleware.js), so a client
// that ALWAYS sends the header permanently masks the brand `use_brand` saved against the key. Live 2026-07-27:
// use_brand reported "Now acting on Hermoso", and every connector tool still answered for the default brand —
// so Meta/Google Ads/YouTube/OneDrive all looked disconnected over MCP while being connected in the web app.
export const PROFILE = (process.env.HERMOSO_PROFILE ?? process.env.HEIST_PROFILE) || '';
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
export const OWNER = (process.env.HERMOSO_OWNER ?? process.env.HEIST_OWNER) || '';
// THE PIN IS MUTABLE, AND IT OUTLIVES THE PROCESS (2026-09-09). `PROFILE` above is read ONCE at import from the env the
// CLI exported out of ~/.hermoso/config.json. use_brand re-pinned the KEY server-side and then every later request in
// the same process (and every later CLI invocation) kept sending the stale saved profile as x-heist-user — which the
// server ranks ABOVE the key's pin — so "Now acting on Blume" was printed while /api/workspace still answered the
// Hermoso brand, and the next connector write landed on the wrong brand (live 2026-09-09: a live Stripe key was
// overwritten by a test key). So: the pin lives here, headers() reads it, and on stdio/CLI it is written back to the
// CLI config so the next invocation starts on the same brand. Hosted (mcpCtx) never touches any of this.
let _pin = null; // { profile, owner } once use_brand pinned this process; null = whatever the env said at import
export const pinnedProfile = () => (_pin ? _pin.profile : (PROFILE === 'default' ? '' : PROFILE));
export const pinnedOwner = () => (_pin ? _pin.owner : OWNER);
const cliConfigFile = () => path.join(os.homedir(), '.hermoso', 'config.json');
export async function setPinnedProfile(profile, owner = '') {
  const prof = !profile || profile === 'default' ? '' : String(profile);
  if (mcpCtx.getStore()) return; // hosted: the pin lives on the api_keys row, resolved per request; nothing in-process to update
  _pin = { profile: prof, owner: owner ? String(owner) : '' };
  // Best-effort write-back to the CLI's own config, only when that file exists (a stdio server launched from an IDE
  // has none, and must not create one). A failed write never fails the switch: the server-side pin already took.
  try {
    const f = cliConfigFile(); const cfg = JSON.parse(await readFile(f, 'utf8'));
    if (!cfg || typeof cfg !== 'object') return;
    cfg.profile = prof; if (_pin.owner) cfg.owner = _pin.owner; else delete cfg.owner;
    await writeFile(f, JSON.stringify(cfg, null, 2), { mode: 0o600 });
  } catch { /* no CLI config here */ }
}
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
  // 'default' is the CLI's old placeholder, not a pin — sending it overrode use_brand on every call (2026-09-04).
  const prof = ctx ? (ctx.profile || '') : pinnedProfile(); // omit entirely when unpinned so the key's saved brand wins server-side
  const own = ctx ? (ctx.owner || '') : pinnedOwner(); // the wire name is x-hermoso-owner on BOTH twins — it is the server's header, not a brand
  const tool = toolCtx.getStore()?.tool || '';
  const h = { 'Content-Type': 'application/json', ...(prof ? { 'x-heist-user': prof } : {}), ...(own ? { 'x-hermoso-owner': own } : {}), ...(tool ? { 'x-hermoso-tool': tool } : {}), ...extra };
  // AN IN-PROCESS SELF-CALL IS NOT THE CUSTOMER DOING SOMETHING. Serving a hosted session makes this process call
  // its own API with the caller's bearer — to resolve their workspace and scope the roster — and that inner
  // request was stamping api_keys.last_used_at, so merely CONNECTING an MCP client marked the account active for
  // the day. Measured 2026-09-04: initialize + tools/list and no tool call moved "called" to the current minute.
  // The marker is set only when a ctx store exists, which is exactly the hosted case; stdio and the CLI have no
  // ctx and are REAL external callers whose requests must keep counting. Loopback was tried first and is not a
  // reliable discriminator here. Forgeable, and harmlessly so: the worst a caller achieves is under-reporting
  // their own activity, which is why this decides bookkeeping and nothing else.
  if (ctx) h['x-hermoso-inproc'] = '1';
  if (process.env.EDGE_SECRET) h['x-edge-auth'] = process.env.EDGE_SECRET; // belt: in-process self-calls satisfy the edge shield even if the loopback exemption ever changes
  // THE SAME RULE FOR THE BEARER (2026-09-23). This read `ctx?.token || TOKEN`, so a hosted request whose ctx carried
  // no token would have been sent with the SERVER process's own HERMOSO_TOKEN — an operator credential standing in for
  // a customer's missing one, the exact class lib/operator-credentials.mjs exists to end. A remote ctx carries its own
  // bearer or none; only stdio / the CLI, where the process IS the caller, reads the environment.
  const tok = ctx ? (ctx.token || '') : TOKEN;
  if (tok) h.Authorization = `Bearer ${tok}`;
  return h;
}

// NOT SIGNED IN, SAID AS HOW TO FIX IT (2026-09-25). A stdio server or CLI started with no key (a new user who skipped
// `auth login`, a directory's "try this server", an IDE config missing HERMOSO_TOKEN) got the server's bare
// "Sign in to continue." on every account tool, and `hermoso_credits` printed "Balance: undefined credits" because
// /api/credits answers an anonymous caller 200 with a null balance. Neither says what to DO. Only when the process
// itself holds no credential: a hosted request (mcpCtx) always carries its caller's bearer, and a localhost base
// needs no auth at all. A caller who DOES send a key and still gets a 401 has a bad or revoked key, which the
// server's own message already says.
export const SIGN_IN_HINT = 'Not signed in. Run `npx -y hermoso auth login` (it opens a browser), or set HERMOSO_TOKEN to an agent key (hmk_…) created at app.hermoso.ai on the MCP & CLI tab, under Terminal & API keys.';
export const signedOut = () => !mcpCtx.getStore() && !TOKEN && !/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/.test(API_BASE);
/** The 401 sentence a caller with no credential reads. PURE (the signed-out verdict is an argument) so a check runs it. */
export function signInMessage(status, body, msg, isSignedOut = signedOut()) {
  if (Number(status) !== 401 || body?.connector || !isSignedOut) return msg;
  return /^sign in to continue\.?$/i.test(String(msg || '').trim()) ? SIGN_IN_HINT : `${msg} ${SIGN_IN_HINT}`;
}

// unwrap the {data}|{error} envelope; throw a clean Error (with .status) on failure
async function unwrap(res) {
  let body = null;
  try { body = await res.json(); } catch {}
  if (!res.ok) {
    const msg = signInMessage(res.status, body, (body && (body.error || body.message)) || `HTTP ${res.status}`);
    // `_viaApi` MARKS AN ERROR THAT ALREADY REACHED THE SERVER, so route() has already recorded it in the error
    // ledger with the tool name off x-hermoso-tool. wrap() reports ONLY the errors that lack this marker — a local
    // throw, a schema rejection, a socket reset — which is what stops the twins double-counting every 4xx.
    // `connectUrl` rides a not-connected 401 with the brand already in it, so a hint never rebuilds the link.
    throw Object.assign(new Error(msg), { status: res.status, _viaApi: true, ...(body?.connector ? { connector: body.connector } : {}), ...(typeof body?.connectUrl === 'string' ? { connectUrl: body.connectUrl } : {}), ...(body?.meta?.videoChoice && typeof body.meta.videoChoice === 'object' ? { videoChoice: body.meta.videoChoice } : {}), ...(body?.metaAuthHold === true ? { metaAuthHold: true } : {}) }); // `videoChoice` rides a 402 for a video the caller expects and cannot afford (server videoChoiceFor) — wrap() spells its options out instead of a bare top-up line
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

/**
 * Report an AGENT DEAD END — the user's AI asked for something and could not reach it (no throw, no 4xx, so nothing
 * else records it). `kind` must be one of the server's DEAD_END_KINDS; the server allowlists it and decides which
 * side of the board it lands on. Same transport, same per-process cap and the same never-throw rule as above.
 */
export function reportDeadEnd(kind, tool, detail, inputs) {
  try {
    if (_reportedThisProcess++ > 200) return;
    fetch(`${API_BASE}/api/errors/report`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({
        op: String(tool || 'unknown').slice(0, 60),
        errorClass: 'DeadEnd',
        status: 0,
        message: String(detail || kind).slice(0, 300),
        deadEnd: String(kind || '').slice(0, 40),
        ...(inputs && typeof inputs === 'object' ? { inputs } : {}),
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
  const res = await fetchRead(`${API_BASE}${p}${qs}`, { headers: headers() });
  return unwrap(res);
}

// ── A TRANSPORT FAILURE IS NOT A DEFECT, AND IT MUST NOT READ LIKE ONE (2026-08-31) ────────────────────────────
// Every tool here reaches the app over HTTP, so a network blip between this process and the app surfaces as node's
// bare `TypeError: fetch failed` — no status, no message anyone can act on. Two of those paged us in one afternoon
// (`list_connectors` 2m after a deploy, `list_meta_posts` 1.6h into a settled revision), and the error ledger is
// right to classify a raw TypeError as ours: it cannot tell a genuine bug from a dropped connection.
//
// RETRYING A READ IS SAFE. RETRYING A WRITE IS NOT, and that asymmetry is the whole design: when a POST dies at the
// transport layer we do not know whether the server processed it, so a retry is how one scheduled post becomes two.
// That is the same rule publishOnce already enforces one layer up — a timeout is neither success nor failure — so
// GET (and only GET) gets one more attempt, and a write says plainly that it may or may not have landed.
// THE THREE UPLOAD/PUT PATHS BYPASSED ALL OF THIS UNTIL 2026-09-01, and a real user found it: `upload_file` over
// the hosted connector answered a bare `TypeError: fetch failed` (fp 3d7f69f6-1fc), which the ledger correctly
// files as OURS because a raw runtime error is indistinguishable from a genuine bug. They are WRITES, so they take
// `fetchWrite` — no retry (a repeated upload is a duplicate file) and the honest "it may or may not have landed"
// sentence instead of a stack-trace word the caller cannot act on.
const TRANSPORT_RE = /fetch failed|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|socket hang up|network|terminated/i;
const isTransport = (e) => !!e && e.name === 'TypeError' && TRANSPORT_RE.test(String(e.message || '') + ' ' + String(e.cause?.code || e.cause?.message || ''));

async function fetchRead(url, init) {
  try { return await fetch(url, init); }
  catch (e) {
    if (!isTransport(e)) throw e;
    await new Promise((r) => setTimeout(r, 400));
    try { return await fetch(url, init); }
    catch (e2) {
      if (!isTransport(e2)) throw e2;
      throw Object.assign(new Error('Could not reach Hermoso just now — the request never got a response, so nothing was read. This is a connection problem, not a rejected request; try again.'), { _transport: true, _viaApi: true });
    }
  }
}

async function fetchWrite(url, init) {
  try { return await fetch(url, init); }
  catch (e) {
    if (!isTransport(e)) throw e;
    // NOT RETRIED, DELIBERATELY. The request may already have been processed; sending it again is how a duplicate
    // is made. The caller is told the honest thing — that the outcome is unknown — so it can CHECK rather than repeat.
    throw Object.assign(new Error(`Could not reach Hermoso while sending that ${init?.method || 'request'} — the connection dropped before any answer came back, so it MAY OR MAY NOT have been applied. Check whether it took effect before sending it again; retrying blindly can duplicate it.`), { _transport: true, _viaApi: true });
  }
}

export async function apiPost(p, body = {}) {
  const res = await fetchWrite(`${API_BASE}${p}`, { method: 'POST', headers: headers(), body: JSON.stringify(body) });
  return unwrap(res);
}

// PATCH — a PARTIAL update, and the distinction is load-bearing on the schedule routes: an omitted key means
// "leave that field exactly as it was", so sending a whole object where a patch was meant would blank the fields
// the caller never mentioned. Only ever send the keys that are actually changing.
export async function apiPatch(p, body = {}) {
  const res = await fetchWrite(`${API_BASE}${p}`, { method: 'PATCH', headers: headers(), body: JSON.stringify(body) });
  return unwrap(res);
}

export async function apiDelete(p) {
  const res = await fetchWrite(`${API_BASE}${p}`, { method: 'DELETE', headers: headers() });
  return unwrap(res);
}

export async function apiPut(p, body = {}) {
  const res = await fetchWrite(`${API_BASE}${p}`, { method: 'PUT', headers: headers(), body: JSON.stringify(body) });
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
// caller and the process are different tenants: HEIST_PROFILE names whatever workspace the SERVER's env happens to
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
    catch { _suffixMemo = pinnedProfile(); }
  }
  return _suffixMemo;
}
// use_brand / create_brand re-pin the key SERVER-SIDE, so the memo must not outlive the switch.
export function forgetWorkspaceScope() {
  _suffixMemo = null;
  const ctx = mcpCtx.getStore();
  if (ctx) delete ctx._storeSuffix;
}
// ── WHICH PROVIDERS THIS WORKSPACE HAS ACTUALLY CONNECTED (2026-08-26) ───────────────────────────────────────────
// Read ONCE per session, at `initialize`, and handed to registerTools so the roster it advertises carries only
// tools the caller can actually use — see mcp/roster-scope.mjs for the law and applyToolGates for the seam.
//
// `/api/connectors/providers` and NOT `/api/connectors`: the full route does a live-token label backfill and a
// per-provider scope-drift read, i.e. outbound provider calls, and this sits on the handshake every client makes.
// The lean route answers from the store alone and resolves the workspace exactly the way the Studio's own
// connector read does (brand-shared from the owner's scope + personal from the caller's).
//
// NEVER THROWS, AND THAT IS THE WHOLE CONTRACT. A read that fails for any reason — an older server with no such
// route, a store blip, no bearer at all — returns `readOk:false`, which makes toolHeldBackByConnectors answer
// false for every tool and ships the FULL roster. A failed read must never be able to remove a paying customer's
// tools ([[failed-read-is-not-empty]]); the cost of being wrong in this direction is a slightly larger roster.
//
// DELIBERATELY NOT MEMOIZED. It is one call per session; caching it would be the one way a user who connects an
// account and reconnects their client still does not see the tools, and on the hosted twin a module-level cache
// would be a cross-tenant leak besides.
export async function connectedProviders() {
  try {
    const r = await apiGet('/api/connectors/providers');
    const list = Array.isArray(r?.providers) ? r.providers : null;
    if (!list) return { connected: new Set(), readOk: false }; // a shape we do not recognise is a failed read
    const offered = Array.isArray(r?.offered) ? new Set(r.offered.filter((p) => typeof p === 'string' && p)) : null; // null = server predates the field → fail open
    const gated = r?.gated && typeof r.gated === 'object' ? r.gated : {};
    // connectLink: the app deep link for THIS brand with a {provider} slot, so a tool held back for a missing
    // connection can hand the user the one-click link instead of only naming the Connectors page.
    const connectLink = typeof r?.connectLink === 'string' && r.connectLink.includes('{provider}') ? r.connectLink : '';
    return { connected: new Set(list.filter((p) => typeof p === 'string' && p)), readOk: true, offered, gated, connectLink };
  } catch { return { connected: new Set(), readOk: false }; }
}
// Upload raw file BYTES to /api/upload (150MB, persists → returns {url,kind,bytes}). Overrides the JSON content-type so
// the server reads the raw body. Lets an agent post ARBITRARY user files (not just Hermoso renders).
// A FILE BIGGER THAN ONE REQUEST GOES UP IN PARTS (2026-09-22). The hosted server sits behind Google's front door,
// which refuses any request body over 32 MiB before Hermoso sees it (measured: 30MB reached the app, 40MB was a
// 413). So above UPLOAD_SINGLE_MAX the bytes go through an upload ticket in parts, each a PUT with ?offset=&total=,
// and the last part answers the same {url, kind, bytes} a single POST does. The ticket carries the credential, so
// the part PUTs need no auth header. A 409 answers with `received`, which is where the next part starts.
const UPLOAD_SINGLE_MAX = 24 * 1024 * 1024, UPLOAD_PART = 8 * 1024 * 1024;
export async function apiUpload(p, buf, { contentType = 'application/octet-stream', fileName = '' } = {}) {
  if (buf && buf.length > UPLOAD_SINGLE_MAX && p === '/api/upload') return apiUploadInParts(buf, { contentType, fileName });
  const h = headers({ 'Content-Type': contentType });
  if (fileName) h['x-file-name'] = encodeURIComponent(fileName);
  const res = await fetchWrite(`${API_BASE}${p}`, { method: 'POST', headers: h, body: buf });
  return unwrap(res);
}
export async function apiUploadInParts(buf, { contentType = 'application/octet-stream', fileName = '' } = {}) {
  const t = await apiPost('/api/upload/ticket', {});
  if (!t || !t.uploadUrl) throw new Error('Hermoso did not hand back an upload link — try again.');
  let path0; try { path0 = new URL(t.uploadUrl).pathname; } catch { path0 = String(t.uploadUrl); }
  const part = Math.min(UPLOAD_PART, Number(t.partMaxBytes) || UPLOAD_PART);
  const total = buf.length; let offset = 0, last = null;
  while (offset < total) {
    const end = Math.min(total, offset + part);
    const h = { 'Content-Type': contentType }; if (fileName) h['x-file-name'] = encodeURIComponent(fileName);
    let res, body, tries = 0;
    for (;;) {
      // A part IS safe to resend, unlike the writes fetchWrite refuses to retry: the server acknowledges a part it
      // already holds (`duplicate`) and never appends it twice, so a transport drop here is retried.
      try { res = await fetchWrite(`${API_BASE}${path0}?offset=${offset}&total=${total}`, { method: 'PUT', headers: h, body: buf.subarray(offset, end) }); body = await res.json().catch(() => ({})); if (res.status < 500) break; }
      catch (e) { if (!e?._transport || ++tries >= 4) throw e; await new Promise((r) => setTimeout(r, 800 * tries)); continue; }
      if (++tries >= 4) break;
      await new Promise((r) => setTimeout(r, 800 * tries));
    }
    if (res.status === 409 && Number.isFinite(body.received)) { offset = body.received; continue; }
    if (!res.ok) throw Object.assign(new Error((body && body.error) || `HTTP ${res.status}`), { status: res.status, _viaApi: true });
    // A server that predates parts ingests the first part AS the file and answers a url with no `received` — never
    // report that truncated file as the upload.
    if (!Number.isFinite(body.received)) throw new Error('This Hermoso server does not take uploads in parts yet, so a file this large cannot be sent to it — pass a public `url` instead.');
    last = body; offset = body.received;
  }
  if (!last || !last.url) throw new Error('The upload finished without a file URL — try again.');
  return last;
}
// Ingest by URL: the SERVER fetches the bytes (SSRF-guarded on every redirect hop) so nothing has to cross this
// transport. Deliberately no body — /api/upload treats "a body AND a url" as an error rather than picking one.
export async function apiUploadUrl(p, url, { fileName = '' } = {}) {
  const h = headers({});
  delete h['Content-Type']; // a body-less POST must not claim one; the server sniffs the FETCHED bytes
  if (fileName) h['x-file-name'] = encodeURIComponent(fileName);
  const res = await fetchWrite(`${API_BASE}${p}?url=${encodeURIComponent(url)}`, { method: 'POST', headers: h });
  return unwrap(res);
}

// /api/explore/chat streams Server-Sent-Events; collect to the terminal `done` payload {reply, results, actions}.
export async function apiSSE(p, body = {}) {
  const res = await fetchWrite(`${API_BASE}${p}`, { method: 'POST', headers: headers({ Accept: 'text/event-stream' }), body: JSON.stringify(body) });
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

// HOW LONG A RENDER TOOL HOLDS ITS CALLER, in ms. `cap` is the transport's own maximum (45s hosted, 10min local) and
// stays the answer for anything that is not a usable number — absent, negative, NaN — so a garbled ask can never
// lengthen a wait or turn into "forever". 0 means "do not wait at all". PURE, so a check runs it.
export function jobWaitMs(requested, cap) {
  if (requested === undefined || requested === null || requested === '') return cap;
  const n = Number(requested);
  if (!Number.isFinite(n) || n < 0) return cap;
  return Math.min(cap, Math.floor(n));
}

// A 404 IN THE SECONDS AFTER A SUBMIT IS NOT "NO SUCH JOB" (journey QA 2026-09-25). edit_video queued a render on the
// revision a deploy was retiring; the poll 3s later reached the new revision, which had never heard of it, and the tool
// answered "Error: No such job" about a real render that held credits. The server now reads through to the durable job
// mirror before a 404 (lib/job-readthrough.mjs), and this is the client half: inside a short grace from the submit a
// 404 (and a 502/503/504, which is what a rollover looks like from outside) is retried; past it a 404 is final and is
// said in words, never as the bare route error. PURE, so tools/job-readthrough-check.mjs runs it.
export const JOB_MISS_GRACE_MS = 30_000;
export function pollMissVerdict(status, { startedAt, now = Date.now(), deadline = Infinity, graceMs = JOB_MISS_GRACE_MS } = {}) {
  const st = Number(status);
  if (st === 404) return (now - startedAt < graceMs && now < deadline) ? 'retry' : 'final';
  if ((st === 502 || st === 503 || st === 504) && now < deadline) return 'retry';
  return 'throw';
}
export function jobMissMessage(id) {
  return `Hermoso has no record of job ${id} on this workspace, after checking the live queue and the durable job store for ${Math.round(JOB_MISS_GRACE_MS / 1000)}s. `
    + 'If it was just submitted, the server that took it was replaced before it wrote the job down, so it cannot be followed from here. A render lost that way is not charged: the credits held for it are released automatically. '
    + 'Call list_jobs to see this workspace\'s recent jobs. Do not re-run the render on the strength of this message alone.';
}
export async function pollJob(id, { intervalMs = 3000, timeoutMs = 10 * 60 * 1000, onTick, getJobFn = getJob } = {}) {
  const startedAt = Date.now();
  const deadline = startedAt + timeoutMs;
  for (;;) {
    let job;
    try { job = await getJobFn(id); }
    catch (e) {
      const v = pollMissVerdict(e?.status, { startedAt, now: Date.now(), deadline });
      if (v === 'final') throw Object.assign(new Error(jobMissMessage(id)), { status: 404, _viaApi: true, _jobMissing: true });
      if (v === 'throw') throw e;
      await new Promise(r => setTimeout(r, Math.min(intervalMs, Math.max(50, deadline - Date.now()))));
      if (Date.now() > deadline) throw Object.assign(new Error('Render timed out — check `hermoso jobs get ' + id + '`'), { jobId: id });
      continue;
    }
    onTick?.(job);
    if (job.status === 'done') return { job, result: jobResult(job) };
    // A FAILED JOB HAS ALREADY BEEN RECORDED BY THE SERVER (2026-09-21). The job runner files the worker's real error in
    // the ledger under the job's own type, with its status and markers. A bare Error here carried neither, so the tool
    // wrapper took it for a failure that never reached the server and reported it a SECOND time with status 0: two
    // make_template_ad refusals (a 400 the server had classed as the caller's config) sat on the admin board as
    // "could not tell". `_viaApi` is the marker that says the server has seen it. It deliberately carries NO `jobId`:
    // the tool layer reads a jobId on an error as "timed out, still rendering", which a failed job is not.
    if (job.status === 'error') throw Object.assign(new Error(job.error || 'Render failed'), { _viaApi: true, ...(job.errorMeta?.videoChoice && typeof job.errorMeta.videoChoice === 'object' ? { videoChoice: job.errorMeta.videoChoice, status: 402 } : {}) }); // a queued video the balance could not cover refuses at the reserve with its options (errorMeta.videoChoice) — carry them so wrap() spells the choice
    if (Date.now() > deadline) throw Object.assign(new Error('Render timed out — check `hermoso jobs get ' + id + '`'), { jobId: id });
    // NEVER SLEEP PAST THE DEADLINE. A 3s interval made every wait 3s-granular: a caller who asked for 1s was held 3s,
    // and one who asked for 29s was held 30s, which is the whole 30-second step budget the ask exists to stay inside.
    // The defaults (45s, 10min) are whole multiples of the interval, so they poll exactly as they always have.
    await new Promise(r => setTimeout(r, Math.min(intervalMs, Math.max(50, deadline - Date.now()))));
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

export const authState = () => ({ apiBase: API_BASE, hasToken: !!TOKEN, profile: pinnedProfile(), owner: pinnedOwner() });
