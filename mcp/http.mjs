// ───────────────────────────────────────────────────────────────────────────────────────────────────────
// REMOTE MCP CONNECTOR — DEFERRED. This is the Claude.ai "custom connector" surface (https://<host>/mcp):
// a Streamable-HTTP MCP transport + OAuth so any Claude.ai / Cursor user can connect Hermoso by URL and sign in.
//
// It is written so the cloud step is a CONFIG FLIP, not a rewrite — but it is intentionally OFF and will REFUSE
// to mount until BOTH are true:
//   (1) HEIST_MCP_REMOTE=1, and
//   (2) a real token verifier is wired (verifyBearer) — i.e. Firebase Auth (or equivalent) is configured.
// Why it must stay off locally: a public money-spending endpoint cannot exist without authenticated identity
// (the no-anon-spend rule), there is no hosted origin yet, and per the rollout plan cloud is provisioned
// COLLABORATIVELY, never solo. Until then, use the local stdio server (mcp/heist-mcp.mjs) + the CLI + skills.
//
// When the cloud step happens, the remaining work is small and explicit (see ENABLE CHECKLIST at the bottom).
// ───────────────────────────────────────────────────────────────────────────────────────────────────────
import { randomUUID } from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { registerTools, MCP_INSTRUCTIONS, parseToolScope } from './tools.mjs';
import { mcpCtx, connectedProviders } from './client.mjs';

// Mount the remote connector onto the Express app. No-op unless explicitly enabled + auth-backed.
// `verifyBearer(token) -> {userId, accountId, email} | null` MUST be supplied by the caller (the real auth seam).
export function mountRemoteMcp(app, { verifyBearer, publicBaseUrl } = {}) {
  if (process.env.HEIST_MCP_REMOTE !== '1') return false;             // gate 1: off by default
  if (typeof verifyBearer !== 'function') {                           // gate 2: refuse without real auth
    console.error('[mcp-remote] REFUSING to mount: no token verifier wired. A remote, money-spending MCP must authenticate every caller (no-anon-spend). Wire Firebase Auth → verifyBearer first.');
    return false;
  }
  const BASE = (publicBaseUrl || process.env.HEIST_PUBLIC_URL || '').replace(/\/+$/, '');

  // RFC 9728 protected-resource metadata — tells Claude.ai where to get a token. (Authorization-server metadata
  // is served by the auth provider itself, e.g. Firebase/your IdP.) Scopes match the AS metadata + minted token
  // (mcp/oauth.mjs): hermoso.research / hermoso.generate.
  // ── SERVED AT BOTH URL FORMS, FROM ONE HANDLER (2026-08-20) ──────────────────────────────────────────────────
  // The resource identifier is `${BASE}/mcp`, which HAS a path component — so RFC 9728 §3.1 derives its metadata
  // URL by INSERTING the well-known suffix before that path ("any terminating slash (/) following the host
  // component MUST be removed before inserting /.well-known/ and the well-known URI path suffix between the host
  // component and the path"), i.e. /.well-known/oauth-protected-resource/mcp. We served only the ROOT form, and
  // that was not a cosmetic gap — it was a DEAD END for any client that does not use our WWW-Authenticate hint,
  // because RFC 9728 §3.3 applies a DIFFERENT validation rule depending on how the client arrived:
  //   • via the `resource_metadata` hint → `resource` MUST equal the URL used to reach the resource server
  //     (`${BASE}/mcp`). Our document satisfies this, which is why Claude connects today.
  //   • by CONSTRUCTING the well-known URL → `resource` MUST equal the identifier the suffix was inserted into.
  //     From the ROOT form that identifier is `${BASE}` (no /mcp) while our document says `${BASE}/mcp`, and the
  //     rule is "the data contained in the response MUST NOT be used". So a hint-less client had nowhere to land:
  //     the suffixed URL 404'd, and the root URL it fell back to failed validation.
  // Serving BOTH is explicitly sanctioned — the MCP spec's fallback order is suffixed-then-root ("Serve metadata
  // at a well-known URI … either: At the path of the server's MCP endpoint … or At the root"). ONE handler, never
  // a second copy of the document: two copies drift, and a stale one is worse than a 404.
  //
  // DELIBERATELY ASYMMETRIC with /.well-known/oauth-authorization-server (mcp/oauth.mjs), which is NOT aliased:
  // its `issuer` is BASE with NO path component, so RFC 8414 §3.1 puts its metadata at the root URL, and §3.3
  // would force a client to REJECT the identical document served under a /mcp suffix (it would have constructed
  // that URL from issuer identifier `${BASE}/mcp`, which is not what the document says). The 404 there is
  // CORRECT and is what lets a probing client fall through cleanly. Alias it only if `issuer` ever grows a path.
  const MCP_PATH = '/mcp';                            // the resource's path component — app.all(MCP_PATH) below
  const protectedResourceMetadata = (req, res) => res.json({
    resource: `${BASE}${MCP_PATH}`,
    authorization_servers: [process.env.HEIST_OAUTH_ISSUER].filter(Boolean),
    scopes_supported: ['hermoso.research', 'hermoso.generate'],
    bearer_methods_supported: ['header'],
  });
  app.get('/.well-known/oauth-protected-resource', protectedResourceMetadata);
  app.get(`/.well-known/oauth-protected-resource${MCP_PATH}`, protectedResourceMetadata);

  // Per-session Streamable-HTTP transports. Each authenticated session gets its own McpServer with the same tools.
  //
  // ── A SESSION WAS EXPENSIVE, AND THIS MAP IS WHY PROD OOM'd (2026-08-01, again 2026-08-24) ───────────────────
  // registerTools() used to rebuild all 681 tool definitions with their zod schemas on EVERY `initialize`:
  // **114.36 MB of RETAINED heap per McpServer** (measured, node --expose-gc, 25 instances; 114.48 MB measured
  // again end-to-end through this very transport). The older note here said ~36 MB — true at the 248-tool roster
  // it was written against, and 3.2x stale by August. This map used to be unbounded and never expired — the only
  // removal was transport.onclose, which never fires for a client that simply goes away. Prod took 238
  // `initialize` handshakes in 49 minutes on a 4 GiB, maxScale=1 instance and died of
  // `FATAL ERROR: Reached heap limit` six times in that hour, every crash a full outage.
  //
  // THE CAP AND THE TTL WERE NEVER THE FIX, AND 2026-08-24 PROVED IT: they worked exactly as designed (peak
  // concurrent sessions measured at exactly SESSION_MAX) and prod still crashed four times in twelve hours,
  // because the cost is CHURN, not retention — one client opened ~175 sessions in 65 minutes. Worse, the cap was
  // FEEDING the churn: 157 of 258 session closures in a 3-day window were 'over cap', each one answering that
  // client's next call with a 404, which obliges it to re-initialize, which allocates another full roster and
  // evicts somebody else. A self-sustaining spiral. The durable fix is in mcp/tools.mjs: the tool definitions are
  // static per process, so they are built ONCE and replayed. A session now costs **3.06-3.19 MB** — 36x less —
  // and it is the per-`initialize` figure, not the per-live-session one, that decides whether this survives a
  // retry storm. See tools/mcp-tool-canon-check.mjs.
  //
  // The 400-on-a-session-miss below was the ACCELERANT: a client that cannot re-initialize opens a NEW session
  // instead of reusing its own, so the leak fed itself. Both are fixed here — bound + expire the map, and answer
  // the one status code that obliges a client to re-initialize.
  // 16 was sized against the old 114 MB session (~1.8 GB). At 3.1 MB it buys ~50 MB, so the cap is now far more
  // conservative than the heap requires — deliberately left alone here so the memory fix lands as ONE measurable
  // change; it is env-tunable with no deploy (`--update-env-vars MCP_SESSION_MAX=64` ≈ 200 MB) and raising it is
  // what finally stops the over-cap eviction churn described above.
  const SESSION_MAX = Math.max(2, Number(process.env.MCP_SESSION_MAX || 16));
  const SESSION_IDLE_MS = Math.max(1000, Number(process.env.MCP_SESSION_IDLE_MS || 30 * 60e3)); // 1s floor so the expiry is TESTABLE; a short TTL is merely wasteful now that eviction is recoverable
  const sessions = new Map(); // mcp-session-id -> { transport, server, user, lastSeen }  (insertion-ordered = LRU)
  const challenge = (res) => res.status(401).set('WWW-Authenticate', `Bearer resource_metadata="${BASE}/.well-known/oauth-protected-resource"`).json({ error: 'Authentication required' });

  // Tear a session down for real — dropping the map entry alone would leave the McpServer reachable from
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
  // The one place the host name is turned into a decision, so the anon and session paths cannot diverge.
  //
  // IT READS THE USER-AGENT TOO, AND THAT IS THE HALF THAT MAKES IT WORK (2026-08-24). `clientInfo` rides the
  // `initialize` params and NOTHING ELSE, so a body-only test can only see the host on that one request. The
  // anon discovery path is deliberately stateless (`sessionIdGenerator: undefined`, a fresh server per request),
  // so a `tools/list` arriving as its own POST carried no name and every widget-host decision there was FALSE —
  // and it silently stayed false, because the answer it produces is a full roster, which looks exactly like
  // success. Measured on prod: `hermoso_capabilities` still shipped its widget and `buy_credits` was still
  // offered to ChatGPT, i.e. the commerce withholding added in 2ba8e3a63 had never once applied.
  //
  // The UA is durable where clientInfo is not: Cloud Run's own request log shows ChatGPT sending
  // `openai-mcp/1.0.0` on EVERY /mcp request (38 of 38 over the sampled window), initialize and tools/list
  // alike. Read from the request rather than remembered, so a stateless path is covered by construction.
  // Still advisory and still presentation-only: it may not change auth, scope or spend. Same regex for both
  // fields so a host recognised one way is recognised the other.
  const WIDGET_HOST_RE = /openai|chatgpt/i;
  const isWidgetHost = (name, req) => WIDGET_HOST_RE.test(String(name || '')) || WIDGET_HOST_RE.test(String(req?.headers?.['user-agent'] || ''));
  // The client's own name, off the initialize params. Never trusted for anything but presentation.
  const clientInfoOf = (body) => {
    try {
      const msgs = Array.isArray(body) ? body : [body];
      for (const m of msgs) if (m && m.method === 'initialize') return String(m.params?.clientInfo?.name || '').slice(0, 64);
    } catch {}
    return '';
  };
  // WHAT GETS REMEMBERED ON THE SESSION, and it is NOT simply "the name, or the UA if there isn't one". Written
  // that way first and a check caught it: `clientInfoOf(req.body) || ua` never falls through, because a host
  // ALWAYS names itself — the SDK refuses an initialize with no clientInfo at all ("Server not initialized"). So
  // ChatGPT calling itself anything unremarkable would be remembered under that name, and `hostRendersWidgets()`
  // matches this string at CALL time to decide whether a render is handed over as a URL or inlined as base64. A
  // false negative there is how a 1.03MB inline block once made ChatGPT drop structuredContent entirely.
  //
  // So it prefers whichever field IDENTIFIES the host, exactly as isWidgetHost does, and falls back to the name
  // when neither does — a host that is not a widget host is still remembered by its own name, for the log.
  const rememberedClient = (req) => {
    const named = clientInfoOf(req.body);
    const ua = String(req.headers['user-agent'] || '').slice(0, 64);
    if (named && WIDGET_HOST_RE.test(named)) return named;
    if (WIDGET_HOST_RE.test(ua)) return ua;
    return named || ua;
  };
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
  // and so an unknown group is refused at the door with the valid list instead of silently serving every group.
  // ABSENT, the DEFAULT is every group except `ads` and `analytics` (OPT_IN_TOOL_GROUPS) — together ~254k of the
  // ~365k full roster, so an eagerly-loading client gets ~112k. `?tools=all` restores the full roster.
  // The scope fixed here is the STARTING roster, not a cage: `enable_tools` widens it mid-session and the SDK
  // notifies the client. That is deliberate — the old comment's "tools/list must not change under a live client"
  // was the right instinct for a scope the SERVER changes silently, and the wrong one for a change the CLIENT
  // asked for and is told about.
  function scopeFor(req, res) {
    const { groups, error } = parseToolScope(req.query?.tools ?? req.headers['x-hermoso-tools']);
    if (error) { res.status(400).json({ jsonrpc: '2.0', error: { code: -32602, message: error }, id: null }); return false; }
    return { groups };
  }

  async function serveAnonDiscovery(req, res, scope) {
    const server = new McpServer({ name: 'hermoso', version: '1.0.0' }, { instructions: MCP_INSTRUCTIONS });
    // `widgetHost` withholds the two commerce tools from ChatGPT (see registerTools). It is passed HERE as well
    // as on the session path because OpenAI's own tool scanner reads this anonymous discovery roster — gating
    // only the authenticated path would leave both tools listed in the submission.
    // NO `connectors` HERE, DELIBERATELY. There is no authorization on this request, so there is no workspace to
    // scope to and nothing honest to read — and a registry crawler or an agent deciding whether to connect MUST
    // see the real catalog, not a zero-connector one. registerTools treats an absent `connectors` exactly like a
    // failed read: full roster. Do not "fix" this by reading the workspace off the request; it is forgeable.
    registerTools(server, { only: scope?.groups, widgetHost: isWidgetHost(clientInfoOf(req.body), req) }); // metadata only — tools/list never invokes a handler, and tools/call can't reach here
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on('close', () => { try { transport.close(); server.close(); } catch {} });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  }

  app.all(MCP_PATH, async (req, res) => {
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
      // answered here so we never build a server whose only job would be to reject the request.
      if (!init) return needSession(res);
      const scope = scopeFor(req, res);
      if (scope === false) return; // unknown group — already answered 400, and nothing was allocated
      sweepSessions(); // make room before allocating, so the cap is a ceiling and not a suggestion
      // ── WHAT THIS CALLER CAN ACTUALLY USE (2026-08-26) ────────────────────────────────────────────────────────
      // One free store read, on the ONE request per session that mints the roster, so the tools we advertise are
      // the tools their workspace can call. A connector-bound tool for an unconnected provider can only answer
      // `401 {connector:'<p>'}`; carrying it costs the caller context every turn and pushes the roster further
      // past the 30-50 tool accuracy cliff. The MCP spec permits exactly this and nothing looser — the tool set
      // "MAY vary by the authorization presented on the request … since credentials are per-request input, not
      // connection state" (rev 2026-07-28, Tools ▸ Capabilities) — which is why it is keyed to the BEARER and not
      // to the connection or to a query parameter.
      //
      // INSIDE `mcpCtx.run`, because that store is what puts this caller's token on the outbound /api call. Read
      // it outside and it would go out unauthenticated, answer 401, and — correctly, by its own contract — fail
      // OPEN with the full roster, so the whole change would be silently inert. Never throws; see
      // connectedProviders() ([[failed-read-is-not-empty]]).
      const connectors = await mcpCtx.run({ token, remote: true, client: rememberedClient(req) }, () => connectedProviders());
      const server = new McpServer({ name: 'hermoso', version: '1.0.0' }, { instructions: MCP_INSTRUCTIONS });
      registerTools(server, { only: scope.groups, connectors, widgetHost: isWidgetHost(entry?.client || clientInfoOf(req.body), req) }); // the SAME tools as stdio (minus any the caller scoped out) — and every /api call they make carries this user's token
      const transport = new StreamableHTTPServerTransport({
        // CSPRNG, per the spec's SHOULD for session ids (Math.random() is not one).
        sessionIdGenerator: () => 'sess_' + randomUUID().replace(/-/g, ''),
        onsessioninitialized: (id) => { entry.lastSeen = Date.now(); sessions.set(id, entry); sweepSessions(); },
      });
      transport.onclose = () => { if (transport.sessionId) dropSession(transport.sessionId, 'transport closed'); };
      // WHO IS CALLING, captured at the ONE moment it is on the wire. `clientInfo` rides the `initialize`
      // request and nothing afterwards, so it has to be remembered on the session or it is gone by the first
      // tools/call. It is advisory only: it may not change auth, scope or spend — it decides PRESENTATION.
      entry = { transport, server, user, lastSeen: Date.now(), client: rememberedClient(req) };
      // LOG THE NAME. `hostRendersWidgets()` matches it with a regex, and a regex over a string no one has
      // ever read is a guess. One line per session (not per call) so a new host identifies itself once and
      // the predicate can be corrected from evidence instead of from a hunch.
      if (entry.client) console.error(`[mcp-remote] client: ${entry.client}`);
      await server.connect(transport);
      // If the handshake never completes (client drops, initialize rejected), nothing is in the map and both
      // objects are otherwise reachable only from this request's still-open response — close them explicitly
      // rather than leaving a session pinned by a dead socket.
      res.on('close', () => { if (!transport.sessionId || !sessions.has(transport.sessionId)) { try { transport.close(); } catch {} try { server.close(); } catch {} } });
    } else {
      // Touch = LRU. Re-inserting moves the key to the end of the Map's insertion order, so the cap evicts the
      // genuinely coldest session rather than the oldest-established one (which is often the most active).
      entry.lastSeen = Date.now();
      sessions.delete(sid); sessions.set(sid, entry);
    }
    // The caller's bearer rides into every /api call the tools make — spend bills THEIR account. `remote: true`
    // says what this store IS: a per-request tenant scope on a shared, multi-tenant process. client.mjs treats the
    // presence of this store as the signal to STOP falling back to the process's own HEIST_PROFILE / HEIST_OWNER,
    // which belong to whoever runs the box, not to whoever is calling.
    //
    // NOTE WHAT IS DELIBERATELY *NOT* HERE: a profile or an owner read off the request. There is nowhere honest to
    // read them FROM — a header on the MCP POST would be caller-supplied, and a shared workspace resolved from a
    // forgeable value is exactly the hole resolveWs exists to close. The workspace a hosted connector acts in is
    // pinned SERVER-SIDE on the agent key (use_brand → /api/keys/brand, membership-checked) and re-authorized by
    // resolveWs on every request, so it resolves identically here and over stdio without this transport naming it.
    await mcpCtx.run({ token, remote: true, client: entry.client || '' }, () => entry.transport.handleRequest(req, res, req.body));
  });

  console.error(`[mcp-remote] mounted at ${BASE || '(set HEIST_PUBLIC_URL)'}/mcp`);
  return true;
}

// ── ENABLE CHECKLIST (cloud step, collaborative) ──────────────────────────────────────────────────────────
//  1. Provision a hosted origin (Cloud Run) + Firebase Auth; set HEIST_PUBLIC_URL + HEIST_OAUTH_ISSUER.
//  2. Implement verifyBearer(token) via the Firebase auth adapter (adapters/auth/firebase.js) and pass it here.
//  3. Thread the authenticated user into mcp/client.mjs's outbound /api calls (AsyncLocalStorage) so reserve()/
//     gateSpend bill the right account — the server-side enforcement is already authoritative once req.user is real.
//  4. Set HEIST_MCP_REMOTE=1. Then in server.js: `import { mountRemoteMcp } from './mcp/http.mjs'; mountRemoteMcp(app, { verifyBearer, publicBaseUrl })`.
//  5. The published connector URL becomes `${HEIST_PUBLIC_URL}/mcp` — paste into Claude.ai → Settings → Connectors.
