// ── SERVING MCP 2026-07-28 ON THE HOSTED /mcp, BESIDE THE LEGACY ERA (2026-11-26) ───────────────────────────────────
// SDK 1.32 implements only the initialize-based revisions. Rather than re-implement every tool, a modern request is
// answered by the SAME McpServer + registerTools roster a legacy session gets, driven through an in-process SDK client
// (InMemoryTransport): the tools, their handlers, their spend gates and the caller's bearer on every /api call are the
// legacy ones, byte for byte. This file only translates the envelope — stateless per-request `_meta`, `resultType`,
// header validation, ttlMs/cacheScope, server/discover — and adds the three 2026 extensions on top:
//   • Skills (io.modelcontextprotocol/skills): skills/list, skills/get, skill:// via resources/read (mcp/era-2026.mjs).
//   • Tasks (io.modelcontextprotocol/tasks): a render that outlives the call becomes a task over our own durable job.
//   • MRTR elicitation: a tool's own `needsConfirm` answer becomes an input_required form; the accepted retry IS confirm.
// The in-process server is kept per (bearer, scope, host) for a few idle minutes so a burst of stateless requests does
// not rebuild a roster each time. That is server-side caching, not a protocol session: nothing the client sends or
// receives depends on it, and any request can land on a fresh one.
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { registerTools, instructionsFor, widgetHostScope, withFirstRunLine, firstRunOffers, canonToolGroups } from './tools.mjs';
import { curatedTokenOf } from './directory-curated.mjs';
import { installAnswerStates } from './answer-states.mjs'; // a state that is an answer (not connected, credits, plan, confirm, platform rule) is not a failed tool
import { mcpCtx, connectedProviders, getJob, apiPost } from './client.mjs';
import * as E from './era-2026.mjs';
import { CONFIRM_ARG as DIR_CODE_ARG, CONFIRM_TTL_MS as DIR_CODE_TTL_MS, spendCode as spendDirCode } from './directory-confirm.mjs';

const Passthrough = z.object({}).passthrough();
const sha = (s) => createHash('sha256').update(String(s)).digest('hex');

export function serveModernFactory(deps) {
  const { PKG_VERSION, scopeFor, isWidgetHost, WIDGET_HOST_RE, extAsked, srcOf, connectEvent, firstRunFor, onSessionStart, onSessionEnd, onFirstCall, streams, wallMs } = deps;
  const ERA = E.eraConfig(process.env);
  const SERVER_INFO = { name: 'hermoso', title: 'Hermoso', version: PKG_VERSION };
  const CTX_MAX = Math.max(2, Number(process.env.MCP_MODERN_CTX_MAX || 32));
  const CTX_IDLE_MS = Math.max(1000, Number(process.env.MCP_MODERN_CTX_IDLE_MS || 10 * 60e3));
  // A busy context is still rebuilt this often, so the roster (which depends on the connections read when it was built)
  // can never go stale for longer than this. A legacy session has the same property only until the client reconnects.
  const CTX_MAX_AGE_MS = Math.max(1000, Number(process.env.MCP_MODERN_CTX_MAX_AGE_MS || 5 * 60e3));
  const ctxs = new Map(); // key → { p: Promise<entry>, entry?, lastSeen }
  const nonces = E.makeNonceLedger();
  // ── THE CURATED DIRECTORY GATE, ASKED AS AN MRTR FORM (2026-11-26) ──────────────────────────────────────────────────
  // On a curated directory connector (mcp/directory-confirm.mjs) a gated tool's first call only previews, and a LEGACY
  // client that declared elicitation is asked on a server→client form. The bridge below declares no
  // client capabilities, so through it that gate always fell back to preview + confirmationCode: a form-capable modern
  // client (Claude Code, measured on prod) lost the form the legacy era gives it. So a preview is turned into the same
  // MRTR form every other confirm gets here. The CODE NEVER LEAVES THE SERVER: it is held under the form's requestState
  // nonce, an accepted retry redeems it on the user's behalf, and a no or a dismissal spends it (the legacy branch issues
  // none), so the model can never step around the user's answer.
  const dirCodes = new Map(); // nonce → { code, text, action, destinations, exp }
  const holdDirCode = (nonce, v) => {
    const now = Date.now();
    for (const [k, x] of dirCodes) { if (x.exp <= now) dirCodes.delete(k); else break; }
    dirCodes.set(nonce, { ...v, exp: now + DIR_CODE_TTL_MS });
    while (dirCodes.size > 10_000) { const k = dirCodes.keys().next().value; const x = dirCodes.get(k); dirCodes.delete(k); try { spendDirCode(x.code); } catch {} }
  };
  const takeDirCode = (nonce) => { const x = dirCodes.get(nonce); if (!x) return null; dirCodes.delete(nonce); return x.exp > Date.now() ? x : null; };
  if (ERA.on) console.error(`[mcp-era] MCP 2026-07-28 serving is ON (mode ${ERA.mode}${ERA.hosts ? `, hosts ${ERA.hosts}` : ''})`);

  // Retiring a context takes it out of the map at once (new requests build a fresh one) and CLOSES it only when no request
  // is still running on it, so an eviction, the age limit or the cap can never cut a tool call that is mid-flight.
  const closeIfIdle = (e) => { if (e.retired && !e.inflight && !e.closed) { e.closed = true; try { e.inner.close(); } catch {} try { e.server.close(); } catch {} } };
  function drop(key, why) {
    const c = ctxs.get(key); if (!c) return; ctxs.delete(key);
    const e = c.entry; if (!e) return;
    if (typeof onSessionEnd === 'function') { try { onSessionEnd({ accountId: e.user?.accountId || null, userId: e.user?.userId || null, client: e.client || '', ua: e.ua || '', src: e.src || null, listed: !!e.listed, calls: e.calls || 0, ms: Date.now() - e.startedAt, why: `modern ${why}` }); } catch {} }
    e.retired = true; closeIfIdle(e);
  }
  function sweep() {
    const now = Date.now();
    for (const [k, c] of ctxs) if (now - c.lastSeen > CTX_IDLE_MS) drop(k, 'idle'); // the age limit is applied at lookup (ctxFor), never under a caller holding the entry
    while (ctxs.size > CTX_MAX) drop(ctxs.keys().next().value, 'over cap');
  }
  const sweeper = setInterval(sweep, 60e3); sweeper.unref?.();

  // The host as the legacy session remembers it (http.mjs rememberedClient), read off `_meta` clientInfo instead of
  // initialize — the field that identifies a widget host wins, else the name, else the UA. Presentation only.
  const rememberedOf = (req, name) => { const ua = String(req.headers['user-agent'] || '').slice(0, 64); if (name && WIDGET_HOST_RE.test(name)) return name; if (WIDGET_HOST_RE.test(ua)) return ua; return name || ua; };

  async function ctxFor(req, res, token, user, c) {
    const ci = E.clientInfoOfMeta(c.meta);
    const scope0 = scopeFor(req, res);
    if (scope0 === false) return null; // already answered 400 with the valid groups
    const host = isWidgetHost(ci.name, req);
    const chatgptFull = !!scope0?.full && host;
    const widgetHost = host && !chatgptFull;
    const scope = widgetHostScope(scope0, widgetHost);
    const client = rememberedOf(req, ci.name);
    const ua = String(req.headers['user-agent'] || '').slice(0, 120);
    const ext = extAsked(req, scope);
    const tokenHash = sha(token);
    const key = [tokenHash, JSON.stringify(scope), client, chatgptFull ? 'full' : '', ext ? 'ext' : ''].join('|');
    sweep();
    const hit = ctxs.get(key);
    if (hit && hit.entry && Date.now() - hit.entry.startedAt > CTX_MAX_AGE_MS) drop(key, 'age'); // rebuilt below; the old one closes when its last call ends
    else if (hit) { hit.lastSeen = Date.now(); ctxs.delete(key); ctxs.set(key, hit); return hit.p.then((e) => { e.inflight = (e.inflight || 0) + 1; return e; }); } // the caller's lease, released in serve()
    const slot = { lastSeen: Date.now(), entry: null, p: null };
    slot.p = (async () => {
      connectEvent(req, { step: 'mcp-use', ok: true, tokenHash });
      const connectors = await mcpCtx.run({ token, remote: true, client }, () => connectedProviders());
      const baseInstructions = instructionsFor(scope, { widgetHost });
      let firstRun = null;
      if (typeof firstRunFor === 'function' && user.accountId) {
        try { firstRun = await Promise.race([Promise.resolve(firstRunFor({ accountId: user.accountId, brandKey: user.brandKey === true })).catch(() => null), new Promise((r) => { const t = setTimeout(() => r(null), 1500); t.unref?.(); })]); } catch { firstRun = null; }
      }
      firstRun = firstRun && typeof firstRun === 'object' && firstRun.fresh === true ? { ...firstRun, offer: firstRunOffers(baseInstructions) } : null;
      const instructions = withFirstRunLine(baseInstructions, firstRun);
      const server = new McpServer({ name: 'hermoso', version: PKG_VERSION }, { instructions });
      registerTools(server, { only: scope.groups, lean: !!scope.lean, directory: scope.directory || false, app: scope.app || null, connectors, widgetHost, chatgptFull, hosted: true, ext, client, ua });
      if (!widgetHost) installAnswerStates(server); // not on ChatGPT, whose widgets render a non-error result as a finished card (see mcp/answer-states.mjs)
      const [a, b] = InMemoryTransport.createLinkedPair();
      // The bridge declares NO client capabilities: a modern client is never sent a server→client request, so no tool
      // can reach one through this bridge either (elicitation is MRTR here, below).
      const inner = new Client({ name: 'hermoso-era-2026-bridge', version: PKG_VERSION }, { capabilities: {} });
      await Promise.all([server.connect(a), inner.connect(b)]);
      const entry = { server, inner, user, client, ua, src: srcOf(req), scope, instructions, firstRun, chatgptFull, widgetHost, tokenHash, startedAt: Date.now(), listed: false, calls: 0, toolIndex: null, skills: null };
      slot.entry = entry;
      if (typeof onSessionStart === 'function') { try { onSessionStart({ accountId: user.accountId || null, userId: user.userId || null, client, ua, src: entry.src }); } catch {} }
      if (client) console.error(`[mcp-era] client: ${client} (2026-07-28)`);
      return entry;
    })();
    ctxs.set(key, slot);
    slot.p.catch(() => { if (ctxs.get(key) === slot) ctxs.delete(key); });
    return slot.p.then((e) => { e.inflight = (e.inflight || 0) + 1; return e; });
  }

  // One request to the in-process legacy server, in THIS caller's tenant scope (the same store fields the legacy session
  // puts on every request, http.mjs). McpError → { rpcError }.
  async function inner(e, req, token, method, params, { signal, timeout = 60_000, extraStore = {} } = {}) {
    const store = { token, remote: true, client: e.client || '', chatgptFull: !!e.chatgptFull, firstRun: e.firstRun || null, accountId: e.user?.accountId || null, ua: e.ua || '', src: e.src || '', clientIp: String(req.headers['cf-connecting-ip'] || String(req.headers['x-forwarded-for'] || '').split(',')[0] || req.socket?.remoteAddress || '').trim().slice(0, 64), ...extraStore };
    e.inflight = (e.inflight || 0) + 1;
    try {
      if (e.closed) return { rpcError: { code: E.ERR.INTERNAL, message: 'This server was just refreshed; send the request again.' } };
      return { result: await mcpCtx.run(store, () => e.inner.request({ method, ...(params ? { params } : {}) }, Passthrough, { signal, timeout, maxTotalTimeout: timeout })) };
    } catch (err) {
      if (err && typeof err.code === 'number') return { rpcError: { code: err.code === -32002 ? E.ERR.INVALID_PARAMS : err.code, message: String(err.message || 'error').replace(/^MCP error -?\d+: /, ''), ...(err.data !== undefined ? { data: err.data } : {}) } };
      if (signal?.aborted) return { aborted: true };
      return { rpcError: { code: E.ERR.INTERNAL, message: String(err?.message || err).slice(0, 300) } };
    } finally { e.inflight--; closeIfIdle(e); }
  }
  const store = (e, req, token, extra = {}) => ({ token, remote: true, client: e.client || '', chatgptFull: !!e.chatgptFull, firstRun: e.firstRun || null, accountId: e.user?.accountId || null, ua: e.ua || '', src: e.src || '', ...extra });

  async function toolIndex(e, req, token) {
    if (e.toolIndex) return e.toolIndex;
    const r = await inner(e, req, token, 'tools/list', {});
    const tools = Array.isArray(r.result?.tools) ? r.result.tools : [];
    e.toolIndex = new Map(tools.map((t) => [t.name, t]));
    return e.toolIndex;
  }
  // The skills this connection is served: its own curated set on a curated directory connection, and only skills whose
  // every Hermoso tool this connection can run (a cage runs what it lists; any other connection reaches the rest of the
  // roster through call_tool).
  async function skillsOf(e, req, token) {
    if (e.skills) return e.skills;
    const idx = await toolIndex(e, req, token);
    const known = new Set([...Object.keys(canonToolGroups() || {}), ...idx.keys()]);
    const callable = e.scope?.directory || !idx.has('call_tool') ? new Set(idx.keys()) : known;
    e.skills = E.skillsForConnection({ curatedToken: curatedTokenOf(e.scope?.directory), callable, known });
    return e.skills;
  }

  const handles = (req) => {
    if (!ERA.on || req.method !== 'POST') return false;
    const c = E.classifyModern(req);
    if (!c) return false;
    // ADMIT ONLY WITH THE HEADER (2026-11-27). A body that says 2026-07-28 in `_meta` but sends no MCP-Protocol-Version
    // header is not a request this path can serve: validateModernHeaders would answer 400 -32020, a MODERN error, and a
    // dual-era host that reads it stops falling back to initialize, so it stalls at connect (the connect canary caught
    // exactly this on claude-code the morning after the flip). Leave it to the legacy path, whose 400 is the fallback cue.
    if (!c.batch && !E.isModernVersion(c.headerVersion)) return false;
    return E.eraAllowed(ERA, req, c.batch ? '' : E.clientInfoOfMeta(c.meta).name);
  };

  async function serve(req, res, token, user) {
    const c = E.classifyModern(req);
    const trace = process.env.MCP_ERA_TRACE === '1';
    const send = (status, body) => {
      if (trace) console.error(`[mcp-era] ${c?.msg?.method || (c?.batch ? 'batch' : '?')}${c?.msg?.params?.name ? ' ' + String(c.msg.params.name).slice(0, 60) : ''} → ${status}${body?.error ? ` ${body.error.code}` : body?.result?.resultType ? ` ${body.result.resultType}` : ''}`);
      if (!res.headersSent && !res.writableEnded) res.status(status).json(body);
    };
    const fail = (id, err, status = 200) => send(status, { jsonrpc: '2.0', id: id ?? null, error: err });
    const done = (id, method, result, opts) => send(200, { jsonrpc: '2.0', id, result: E.modernResult(method, result, SERVER_INFO, opts) });
    try {
      if (c.batch) return fail(null, { code: E.ERR.INVALID_REQUEST, message: 'JSON-RPC batches are not part of MCP 2026-07-28: send one request per POST.' }, 400);
      const bad = E.validateModernHeaders(req, c);
      if (bad) return fail(c.msg.id, { code: bad.code, message: bad.message, ...(bad.data ? { data: bad.data } : {}) }, bad.status);
      const msg = c.msg; const id = msg.id; const method = msg.method; const p = msg.params && typeof msg.params === 'object' ? msg.params : {};
      if (id === undefined || id === null) return res.status(202).end(); // no client notification is defined over HTTP in this revision
      const caps = E.clientCapsOfMeta(c.meta);
      if (trace) console.error(`[mcp-era] ${method} declares ${JSON.stringify(caps).slice(0, 300)}`);
      const e = await ctxFor(req, res, token, user, c);
      if (!e) return;
      const ac = new AbortController();
      res.on('close', () => { if (!res.writableEnded) ac.abort(); }); // closing the response stream IS cancellation here
      const forward = async (m, params, opts = {}) => {
        const r = await inner(e, req, token, m, params, { signal: ac.signal, ...opts });
        if (r.aborted) return null;
        if (r.rpcError) { fail(id, r.rpcError, r.rpcError.code === E.ERR.METHOD_NOT_FOUND ? 404 : 200); return null; }
        return r.result;
      };
      const strip = (o) => { const x = { ...o }; delete x._meta; return x; };
      try { return await route(); } finally { e.inflight--; closeIfIdle(e); } // the lease ctxFor took
      async function route() { switch (method) {
        case 'server/discover': {
          const legacyCaps = e.inner.getServerCapabilities() || {};
          return done(id, method, { supportedVersions: [...E.SUPPORTED_VERSIONS], capabilities: E.modernCapabilities(legacyCaps), ...(e.instructions ? { instructions: e.instructions } : {}) });
        }
        case 'tools/list': {
          const r = await forward('tools/list', p.cursor ? { cursor: p.cursor } : {}); if (!r) return;
          e.listed = true;
          if (!e.toolIndex && !p.cursor) e.toolIndex = new Map((r.tools || []).map((t) => [t.name, t]));
          return done(id, method, r);
        }
        case 'tools/call': return toolsCall(e, req, res, token, user, id, p, caps, ac, fail, done);
        case 'resources/list': {
          const r = await forward('resources/list', p.cursor ? { cursor: p.cursor } : {}); if (!r) return;
          const rows = p.cursor ? [] : E.skillResourceRows(await skillsOf(e, req, token));
          return done(id, method, { ...r, resources: [...(r.resources || []), ...rows] });
        }
        case 'resources/read': {
          const uri = String(p.uri || '');
          if (uri.startsWith('skill://')) {
            const contents = E.readSkillFile(await skillsOf(e, req, token), uri);
            if (!contents) return fail(id, { code: E.ERR.INVALID_PARAMS, message: `Unknown resource: ${uri.slice(0, 200)}` });
            return done(id, method, { contents }, { cacheScope: 'public' });
          }
          const r = await forward('resources/read', { uri }); if (!r) return;
          return done(id, method, r);
        }
        case 'resources/templates/list': case 'prompts/list': {
          const r = await forward(method, p.cursor ? { cursor: p.cursor } : {}); if (!r) return;
          return done(id, method, r);
        }
        case 'prompts/get': case 'completion/complete': {
          const r = await forward(method, strip(p)); if (!r) return;
          return done(id, method, r);
        }
        case 'skills/list': {
          const skills = await skillsOf(e, req, token);
          return done(id, method, { skills: skills.map(E.skillEntry) });
        }
        case 'skills/get': {
          const uri = String(p.uri || '');
          const s = (await skillsOf(e, req, token)).find((x) => x.uri === uri);
          if (!s) return fail(id, { code: E.ERR.INVALID_PARAMS, message: `Unknown skill: ${uri.slice(0, 200)}` });
          return done(id, method, { skill: E.skillEntry(s) });
        }
        case 'tasks/get': return tasksGet(e, req, token, user, id, p, fail, done);
        case 'tasks/update': {
          if (!E.readTaskId(p.taskId, user)) return fail(id, { code: E.ERR.INVALID_PARAMS, message: 'Unknown task.' });
          return done(id, method, {}); // this server never puts a task in input_required, so no key is outstanding: ignored
        }
        case 'tasks/cancel': return tasksCancel(e, req, token, user, id, p, fail, done);
        case 'subscriptions/listen': return listen(req, res, id, p);
        default:
          return fail(id, { code: E.ERR.METHOD_NOT_FOUND, message: `Method not found: ${String(method).slice(0, 80)}` }, 404);
      } }
    } catch (err) {
      console.error('[mcp-era] request failed:', err?.message || err);
      return fail(c?.msg?.id, { code: E.ERR.INTERNAL, message: 'Internal error' });
    }
  }

  async function toolsCall(e, req, res, token, user, id, p, caps, ac, fail, done) {
    const name = String(p.name || '');
    const args = p.arguments && typeof p.arguments === 'object' && !Array.isArray(p.arguments) ? p.arguments : {};
    const wantsTasks = E.declaresTasks(caps);
    const canElicit = E.declaresFormElicitation(caps) && E.elicitableTool(name, args);
    // ── an MRTR retry: our own signed requestState + the answer to our own key ──
    let confirmed = false;
    let dirCode = null; // a curated directory preview's code, redeemed for the user on their accepted form
    if (p.requestState !== undefined || p.inputResponses !== undefined) {
      const v = E.checkConfirmState(p.requestState, { user, name, args });
      const ans = E.confirmAnswer(p.inputResponses);
      if (v.ok && ans && nonces.consume(v.nonce)) {
        const dir = takeDirCode(v.nonce);
        if (dir) {
          if (ans !== 'accepted') { spendDirCode(dir.code); return done(id, 'tools/call', E.dirNotDoneResult(dir, ans)); }
          dirCode = dir.code;
        } else {
          if (ans !== 'accepted') return done(id, 'tools/call', E.notConfirmedResult(name, ans));
          confirmed = true;
        }
      }
      // Anything else (tampered, expired, another account's, other arguments, or a replay of a yes already used) is
      // treated as a fresh call: it re-asks below, and never runs on the strength of the stale answer.
    }
    const callArgs = dirCode ? E.withDirCode(name, args, DIR_CODE_ARG, dirCode) : confirmed ? E.withConfirm(name, args) : args;
    const fwdMeta = {}; for (const [k, v] of Object.entries(p._meta || {})) if (!k.startsWith('io.modelcontextprotocol/')) fwdMeta[k] = v;
    e.calls = (e.calls || 0) + 1;
    if (e.calls === 1 && typeof onFirstCall === 'function' && e.user?.accountId) { try { onFirstCall({ accountId: e.user.accountId, userId: e.user.userId || null, client: e.client || '', ua: e.ua || '', src: e.src || null }); } catch {} }
    // waitMs 0 for a tasks client: a render answers with its job handle the moment it is queued (awaitRenderJob), the
    // same ask /v1's ?wait=0 and ChatGPT's "Render it" make. Queueing, spend gate, hold and settle are unchanged.
    const r = await inner(e, req, token, 'tools/call', { name, arguments: callArgs, ...(Object.keys(fwdMeta).length ? { _meta: fwdMeta } : {}) }, { signal: ac.signal, timeout: wallMs, extraStore: wantsTasks ? { waitMs: 0 } : {} });
    if (r.aborted) return;
    if (r.rpcError) return fail(id, r.rpcError, r.rpcError.code === E.ERR.METHOD_NOT_FOUND ? 404 : 200);
    const result = r.result;
    // ── a curated directory preview: the same form, with its code held here (never shown to the model or the host) ──
    // Not conditioned on `confirmed`: a yes whose code this process no longer holds (a restart) is asked again rather
    // than handing the model a code the user never approved.
    if (!dirCode && canElicit && E.isDirPreview(result)) {
      const state = E.mintConfirmState({ user, name, args });
      const nonce = E.confirmStateNonce(state);
      const sc = result.structuredContent.confirmation;
      const text = E.dirPreviewText(result, sc.code);
      holdDirCode(nonce, { code: sc.code, text, action: sc.action, destinations: sc.destinations });
      return done(id, 'tools/call', E.inputRequiredResult({ toolName: name, message: `Please confirm.\n\n${text}`, state }));
    }
    // ── a confirm-gated tool asked for a yes: ask the USER, in a form, in the tool's own words ──
    if (!confirmed && canElicit && E.needsConfirmOf(result) && !E.needsMoreThanAYes(result)) {
      const def = (await toolIndex(e, req, token)).get(name);
      const hasConfirm = name === 'call_tool' || !!def?.inputSchema?.properties?.confirm;
      if (hasConfirm) return done(id, 'tools/call', E.inputRequiredResult({ toolName: name, message: E.confirmMessageOf(result), state: E.mintConfirmState({ user, name, args }) }));
    }
    // ── a render still running: a task over its job, for a client that said it handles tasks ──
    {
      const ids = E.taskJobIdsFor(caps, result); // [] unless THIS request declared the tasks extension
      if (ids.length) {
        const now = Date.now();
        const rows = await mcpCtx.run(store(e, req, token), () => Promise.all(ids.map((j) => getJob(j).catch(() => null))));
        const live = ids.filter((j, i) => rows[i] && (rows[i].status === 'queued' || rows[i].status === 'running') && !(Number(rows[i].runAt) > now + 120_000));
        if (live.length) {
          const taskId = E.mintTaskId({ user, tool: name, jobIds: live, now });
          const liveRows = live.map((j) => rows[ids.indexOf(j)]);
          const st = E.taskStatusOf(liveRows);
          return done(id, 'tools/call', { resultType: 'task', ...E.taskObject({ taskId, createdAt: now, jobs: liveRows, status: 'working', message: `${name}: ${st.message.replace(/\.$/, '')} (job ${live.join(', ')}). The finished result arrives on tasks/get.` }) });
        }
      }
    }
    return done(id, 'tools/call', result);
  }

  async function tasksGet(e, req, token, user, id, p, fail, done) {
    const t = E.readTaskId(p.taskId, user);
    if (!t) return fail(id, { code: E.ERR.INVALID_PARAMS, message: 'Unknown task.' });
    // undefined = the read itself failed (stays working); null = the job is not on this account any more.
    const jobs = await mcpCtx.run(store(e, req, token), () => Promise.all(t.jobIds.map((j) => getJob(j).catch((err) => (Number(err?.status) === 404 ? null : undefined)))));
    const st = E.taskStatusOf(jobs);
    const base = E.taskObject({ taskId: p.taskId, createdAt: t.createdAt, jobs, status: st.status, message: st.message });
    if (st.status === 'failed') return done(id, 'tasks/get', { ...base, statusMessage: 'The render behind this task is no longer on this account.', error: { code: E.ERR.INTERNAL, message: `No record of job ${t.jobIds.join(', ')} on this workspace. Do not re-run it on the strength of this answer: list_jobs shows recent jobs.` } });
    if (st.status !== 'completed') return done(id, 'tasks/get', base);
    // COMPLETED: the result is what get_job delivers for that job — the resume path a hosted render already takes, so
    // the delivered sentence, poster, charge line and notes are the ones the tool itself would have printed.
    const parts = [];
    for (const j of t.jobIds) {
      const r = await inner(e, req, token, 'tools/call', { name: 'get_job', arguments: { id: j } }, { timeout: 60_000 });
      parts.push(r.result || { content: [{ type: 'text', text: `Could not read job ${j}: ${r.rpcError?.message || 'unknown error'}` }], isError: true });
    }
    const result = parts.length === 1 ? parts[0] : { content: parts.flatMap((x) => x.content || []), structuredContent: { jobs: parts.map((x) => x.structuredContent || null) }, ...(parts.some((x) => x.isError) ? { isError: true } : {}) };
    return done(id, 'tasks/get', { ...base, result: (({ resultType, ...rest }) => rest)(result) });
  }

  // CANCEL IS THE JOB'S OWN CANCEL (POST /v1/jobs/{id}/cancel → requestJobCancel): free while queued, and after the model
  // has been reached the render finishes, is charged once and lands in the Library. Nothing is refunded here, nothing is
  // re-run, and a second cancel is a no-op. Cooperative, as the extension says: the ack never promises `cancelled`.
  async function tasksCancel(e, req, token, user, id, p, fail, done) {
    const t = E.readTaskId(p.taskId, user);
    if (!t) return fail(id, { code: E.ERR.INVALID_PARAMS, message: 'Unknown task.' });
    await mcpCtx.run(store(e, req, token), () => Promise.all(t.jobIds.map((j) => apiPost(`/v1/jobs/${encodeURIComponent(j)}/cancel`, {}).catch(() => null))));
    return done(id, 'tasks/cancel', {});
  }

  // subscriptions/listen: acknowledged with the subset honoured — none, because this server pushes nothing in this era
  // (tools/list carries ttlMs; tasks are polled). The stream holds a slot like the legacy GET stream, under the same cap
  // and the same short life, and ends with the graceful result (also on drain).
  function listen(req, res, id, p) {
    if (!streams.canOpen()) { res.set('Retry-After', streams.draining() ? '1' : '30'); return res.status(503).json({ jsonrpc: '2.0', id, error: { code: E.ERR.INTERNAL, message: 'No notification stream is available right now; retry shortly. Requests are unaffected.' } }); }
    streams.open(); streams.track(res);
    res.status(200).set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no', Connection: 'keep-alive' });
    res.flushHeaders?.();
    const ev = (o) => { try { res.write(`event: message\ndata: ${JSON.stringify(o)}\n\n`); } catch {} };
    ev({ jsonrpc: '2.0', method: 'notifications/subscriptions/acknowledged', params: { _meta: { [E.META_SUB]: id }, notifications: {} } });
    let ended = false;
    const finish = () => { if (ended) return; ended = true; ev({ jsonrpc: '2.0', id, result: { resultType: 'complete', _meta: { [E.META_SUB]: id, [E.META_SERVER]: SERVER_INFO } } }); };
    res.__eraFinal = finish;
    const ka = setInterval(() => { try { res.write(':\n\n'); } catch {} }, 15_000); ka.unref?.();
    const life = setTimeout(() => { finish(); try { res.end(); } catch {} }, streams.lifeMs); life.unref?.();
    res.once('close', () => { clearInterval(ka); clearTimeout(life); streams.close(); streams.untrack(res); });
  }

  return { handles, serve, config: ERA, _ctxs: ctxs, _nonces: nonces };
}
