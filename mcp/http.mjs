// ───────────────────────────────────────────────────────────────────────────────────────────────────────
// REMOTE MCP CONNECTOR — DEFERRED. This is the Claude.ai "custom connector" surface (https://<host>/mcp):
// a Streamable-HTTP MCP transport + OAuth so any Claude.ai / Cursor user can connect Hermoso by URL and sign in,
// exactly like Higgsfield's mcp.higgsfield.ai/mcp.
//
// It is written so the cloud step is a CONFIG FLIP, not a rewrite — but it is intentionally OFF and will REFUSE
// to mount until BOTH are true:
//   (1) HERMOSO_MCP_REMOTE=1, and
//   (2) a real token verifier is wired (verifyBearer) — i.e. Firebase Auth (or equivalent) is configured.
// Why it must stay off locally: a public money-spending endpoint cannot exist without authenticated identity
// (the no-anon-spend rule), there is no hosted origin yet, and per the rollout plan cloud is provisioned
// COLLABORATIVELY, never solo. Until then, use the local stdio server (mcp/hermoso-mcp.mjs) + the CLI + skills.
//
// When the cloud step happens, the remaining work is small and explicit (see ENABLE CHECKLIST at the bottom).
// ───────────────────────────────────────────────────────────────────────────────────────────────────────
import { randomUUID } from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { registerTools, MCP_INSTRUCTIONS, parseToolScope } from './tools.mjs';
import { mcpCtx } from './client.mjs';

// Mount the remote connector onto the Express app. No-op unless explicitly enabled + auth-backed.
// `verifyBearer(token) -> {userId, accountId, email} | null` MUST be supplied by the caller (the real auth seam).
export function mountRemoteMcp(app, { verifyBearer, publicBaseUrl } = {}) {
  if (process.env.HERMOSO_MCP_REMOTE !== '1') return false;             // gate 1: off by default
  if (typeof verifyBearer !== 'function') {                           // gate 2: refuse without real auth
    console.error('[mcp-remote] REFUSING to mount: no token verifier wired. A remote, money-spending MCP must authenticate every caller (no-anon-spend). Wire Firebase Auth → verifyBearer first.');
    return false;
  }
  const BASE = (publicBaseUrl || process.env.HERMOSO_PUBLIC_URL || '').replace(/\/+$/, '');

  // RFC 9728 protected-resource metadata — tells Claude.ai where to get a token. (Authorization-server metadata
  // is served by the auth provider itself, e.g. Firebase/your IdP.) Scopes match the AS metadata + minted token
  // (mcp/oauth.mjs): hermoso.research / hermoso.generate.
  app.get('/.well-known/oauth-protected-resource', (req, res) => res.json({
    resource: `${BASE}/mcp`,
    authorization_servers: [process.env.HERMOSO_OAUTH_ISSUER].filter(Boolean),
    scopes_supported: ['hermoso.research', 'hermoso.generate'],
    bearer_methods_supported: ['header'],
  }));

  // Per-session Streamable-HTTP transports. Each authenticated session gets its own McpServer with the same tools.
  //
  // ── A SESSION IS EXPENSIVE, AND THIS MAP IS WHY PROD OOM'd (2026-08-01) ───────────────────────────────────────
  // registerTools() builds 248 tool definitions with their zod schemas: **~36 MB of RETAINED heap per McpServer**
  // (measured, node --expose-gc, 25 instances). This map used to be unbounded and never expired — the only removal
  // was transport.onclose, which never fires for a client that simply goes away. Prod took 238 `initialize`
  // handshakes in 49 minutes (238 × 36 MB = ~8.6 GB) on a 4 GiB, maxScale=1 instance and died of
  // `FATAL ERROR: Reached heap limit` six times in that hour, every crash a full outage.
  //
  // The 400-on-a-session-miss below was the ACCELERANT: a client that cannot re-initialize opens a NEW session
  // instead of reusing its own, so the leak fed itself. Both are fixed here — bound + expire the map, and answer
  // the one status code that obliges a client to re-initialize.
  const SESSION_MAX = Math.max(2, Number(process.env.MCP_SESSION_MAX || 16));            // ~580 MB ceiling for MCP
  const SESSION_IDLE_MS = Math.max(1000, Number(process.env.MCP_SESSION_IDLE_MS || 30 * 60e3)); // 1s floor so the expiry is TESTABLE; a short TTL is merely wasteful now that eviction is recoverable
  const sessions = new Map(); // mcp-session-id -> { transport, server, user, lastSeen }  (insertion-ordered = LRU)
  const challenge = (res) => res.status(401).set('WWW-Authenticate', `Bearer resource_metadata="${BASE}/.well-known/oauth-protected-resource"`).json({ error: 'Authentication required' });

  // Tear a session down for real — dropping the map entry alone would leave the 36 MB McpServer reachable from
  // the transport's own callbacks. Deleting FIRST makes this re-entrant-safe: transport.close() fires onclose,
  // which calls back in here, and the second pass is a no-op.
  function dropSession(id, why) {
    const e = sessions.get(id);
    if (!e) return false;
    sessions.delete(id);
    try { e.transport.close(); } catch {}
    try { e.server.close(); } catch {}
    if (why) console.error(`[mcp-remote] session ${id} closed (${why}); ${sessions.size} live`);
    return true;
  }
  // Idle expiry + hard LRU cap. Evicting a LIVE session is safe now and only now: the evicted client's next call
  // gets the 404 that makes it start a fresh session, instead of the 400 that bricked it forever.
  function sweepSessions() {
    const now = Date.now();
    for (const [id, e] of sessions) if (now - e.lastSeen > SESSION_IDLE_MS) dropSession(id, 'idle');
    while (sessions.size > SESSION_MAX) dropSession(sessions.keys().next().value, 'over cap');
  }
  const sweeper = setInterval(sweepSessions, 60e3);
  sweeper.unref?.(); // never hold the process open for this

  // MCP spec 2025-06-18, Transports § Session Management: a server that no longer has a session MUST answer 404,
  // and on 404 the client MUST start a new session with a fresh InitializeRequest. 400 carries no such obligation,
  // so a 400 here is permanent death for that connection — which is exactly what every deploy used to do to every
  // hosted customer. -32001 "Session not found" is the SDK's own code for this case; we mint it ourselves because
  // the SDK's branch is unreachable when there is no initialized transport left to compare the id against.
  const sessionGone = (res) => res.status(404).json({ jsonrpc: '2.0', error: { code: -32001, message: 'Session not found' }, id: null });
  // The SDK's own answer for a non-initialize request that names no session at all. We reply BEFORE constructing
  // anything: building a 36 MB McpServer purely to have it reject the request is what turned a retry storm into
  // an OOM. Status and message are byte-identical to the SDK's, so no client sees a behaviour change.
  const needSession = (res) => res.status(400).json({ jsonrpc: '2.0', error: { code: -32000, message: 'Bad Request: Mcp-Session-Id header is required' }, id: null });
  const hasInitialize = (body) => (Array.isArray(body) ? body : [body]).some((m) => m && m.method === 'initialize');

  // ── PRE-AUTH DISCOVERY (registry crawlers + evaluating agents) ────────────────────────────────────────────────
  // A tokenless caller may run the ZERO-SPEND MCP handshake — initialize, notifications/initialized, ping, tools/list
  // — so a directory (registry.modelcontextprotocol.io) or an agent deciding whether to connect sees the REAL tool
  // catalog first. Everything that spends (tools/call) stays strictly bearer-gated below: no anonymous spend, ever.
  // Served from a fresh anonymous MCP server per request in the SDK's stateless mode (sessionIdGenerator undefined +
  // JSON responses). Per-request instances are the supported shape — a single shared stateless transport 500s on the
  // second standalone request (initialize and tools/list arrive as separate HTTP calls with no session between them).
  const PREAUTH_METHODS = new Set(['initialize', 'notifications/initialized', 'ping', 'tools/list',
    // Other zero-spend capability lists directory scanners (Smithery/Glama) probe anonymously. The only registered
    // resources are the ChatGPT Apps SDK ui:// widget templates (static HTML, zero spend) — so resources/read is
    // pre-auth too, letting ChatGPT/scanners fetch the templates. tools/call remains strictly bearer-gated.
    'resources/list', 'resources/read', 'resources/templates/list', 'prompts/list', 'triggers/list']);
  const isAllPreauth = (body) => {
    const arr = Array.isArray(body) ? body : [body];
    const methods = arr.map((m) => m && m.method).filter((v) => typeof v === 'string');
    return methods.length > 0 && methods.every((m) => PREAUTH_METHODS.has(m)); // a batch mixing in tools/call is NOT pre-auth
  };
  // `?tools=research,create` narrows the roster this connection advertises (see registerTools). Read here rather
  // than inside registerTools so BOTH the anonymous discovery handshake and a real session honour the same query,
  // and so an unknown group is refused at the door with the valid list instead of silently serving all 301.
  // The scope is fixed at initialize and stored on the session: tools/list must not change under a live client.
  function scopeFor(req, res) {
    const { groups, error } = parseToolScope(req.query?.tools ?? req.headers['x-hermoso-tools']);
    if (error) { res.status(400).json({ jsonrpc: '2.0', error: { code: -32602, message: error }, id: null }); return false; }
    return { groups };
  }

  async function serveAnonDiscovery(req, res, scope) {
    const server = new McpServer({ name: 'hermoso', version: '1.0.0' }, { instructions: MCP_INSTRUCTIONS });
    registerTools(server, { only: scope?.groups }); // metadata only — tools/list never invokes a handler, and tools/call can't reach here
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on('close', () => { try { transport.close(); server.close(); } catch {} });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  }

  app.all('/mcp', async (req, res) => {
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    const user = token ? await verifyBearer(token).catch(() => null) : null;
    if (!user) {
      // No valid bearer: allow ONLY the read-only discovery handshake (POST), fail CLOSED for everything else.
      if (req.method === 'POST' && isAllPreauth(req.body)) {
        const scope = scopeFor(req, res);
        if (scope === false) return; // unknown group — already answered 400
        return serveAnonDiscovery(req, res, scope).catch(() => { try { challenge(res); } catch {} });
      }
      return challenge(res);
    }

    const sid = req.headers['mcp-session-id'];
    let entry = sid ? sessions.get(sid) : null;

    if (!entry) {
      const init = req.method === 'POST' && hasInitialize(req.body);
      // A session id we do not have → 404, and WITHOUT allocating. This is the whole of D1b: 404 is the only status
      // that obliges a client to re-initialize, so a restart, a deploy or an LRU eviction becomes a reconnect
      // instead of a permanently bricked connector. It applies to every method — a stale id is stale for GET and
      // DELETE too. The one exception is an `initialize`, which IS a client starting over: strict in what we send,
      // liberal in what we accept, because the entire point of this fix is that nothing here bricks a client.
      if (sid && !init) return sessionGone(res);
      // Only an `initialize` may mint a session. Anything else naming no session at all is the SDK's own 400 —
      // answered here so we never pay 36 MB to build a server whose only job would be to reject the request.
      if (!init) return needSession(res);
      const scope = scopeFor(req, res);
      if (scope === false) return; // unknown group — already answered 400, and nothing was allocated
      sweepSessions(); // make room before allocating, so the cap is a ceiling and not a suggestion
      const server = new McpServer({ name: 'hermoso', version: '1.0.0' }, { instructions: MCP_INSTRUCTIONS });
      registerTools(server, { only: scope.groups }); // the SAME tools as stdio (minus any the caller scoped out) — and every /api call they make carries this user's token
      const transport = new StreamableHTTPServerTransport({
        // CSPRNG, per the spec's SHOULD for session ids (Math.random() is not one).
        sessionIdGenerator: () => 'sess_' + randomUUID().replace(/-/g, ''),
        onsessioninitialized: (id) => { entry.lastSeen = Date.now(); sessions.set(id, entry); sweepSessions(); },
      });
      transport.onclose = () => { if (transport.sessionId) dropSession(transport.sessionId, 'transport closed'); };
      entry = { transport, server, user, lastSeen: Date.now() };
      await server.connect(transport);
      // If the handshake never completes (client drops, initialize rejected), nothing is in the map and both
      // objects are otherwise reachable only from this request's still-open response — close them explicitly
      // rather than leaving 36 MB pinned by a dead socket.
      res.on('close', () => { if (!transport.sessionId || !sessions.has(transport.sessionId)) { try { transport.close(); } catch {} try { server.close(); } catch {} } });
    } else {
      // Touch = LRU. Re-inserting moves the key to the end of the Map's insertion order, so the cap evicts the
      // genuinely coldest session rather than the oldest-established one (which is often the most active).
      entry.lastSeen = Date.now();
      sessions.delete(sid); sessions.set(sid, entry);
    }
    // The caller's bearer rides into every /api call the tools make — spend bills THEIR account. `remote: true`
    // says what this store IS: a per-request tenant scope on a shared, multi-tenant process. client.mjs treats the
    // presence of this store as the signal to STOP falling back to the process's own HERMOSO_PROFILE / HERMOSO_OWNER,
    // which belong to whoever runs the box, not to whoever is calling.
    //
    // NOTE WHAT IS DELIBERATELY *NOT* HERE: a profile or an owner read off the request. There is nowhere honest to
    // read them FROM — a header on the MCP POST would be caller-supplied, and a shared workspace resolved from a
    // forgeable value is exactly the hole resolveWs exists to close. The workspace a hosted connector acts in is
    // pinned SERVER-SIDE on the agent key (use_brand → /api/keys/brand, membership-checked) and re-authorized by
    // resolveWs on every request, so it resolves identically here and over stdio without this transport naming it.
    await mcpCtx.run({ token, remote: true }, () => entry.transport.handleRequest(req, res, req.body));
  });

  console.error(`[mcp-remote] mounted at ${BASE || '(set HERMOSO_PUBLIC_URL)'}/mcp`);
  return true;
}

// ── ENABLE CHECKLIST (cloud step, collaborative) ──────────────────────────────────────────────────────────
//  1. Provision a hosted origin (Cloud Run) + Firebase Auth; set HERMOSO_PUBLIC_URL + HERMOSO_OAUTH_ISSUER.
//  2. Implement verifyBearer(token) via the Firebase auth adapter (adapters/auth/firebase.js) and pass it here.
//  3. Thread the authenticated user into mcp/client.mjs's outbound /api calls (AsyncLocalStorage) so reserve()/
//     gateSpend bill the right account — the server-side enforcement is already authoritative once req.user is real.
//  4. Set HERMOSO_MCP_REMOTE=1. Then in server.js: `import { mountRemoteMcp } from './mcp/http.mjs'; mountRemoteMcp(app, { verifyBearer, publicBaseUrl })`.
//  5. The published connector URL becomes `${HERMOSO_PUBLIC_URL}/mcp` — paste into Claude.ai → Settings → Connectors.
