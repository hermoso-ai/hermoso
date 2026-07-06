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
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { registerTools } from './tools.mjs';

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
  // is served by the auth provider itself, e.g. Firebase/your IdP.)
  app.get('/.well-known/oauth-protected-resource', (req, res) => res.json({
    resource: `${BASE}/mcp`,
    authorization_servers: [process.env.HERMOSO_OAUTH_ISSUER].filter(Boolean),
    scopes_supported: ['hermoso.generate', 'hermoso.research'],
    bearer_methods_supported: ['header'],
  }));

  // Per-session Streamable-HTTP transports. Each authenticated session gets its own McpServer with the same tools.
  const sessions = new Map(); // mcp-session-id -> { transport, server }
  const challenge = (res) => res.status(401).set('WWW-Authenticate', `Bearer resource_metadata="${BASE}/.well-known/oauth-protected-resource"`).json({ error: 'Authentication required' });

  app.all('/mcp', async (req, res) => {
    // EVERY call must carry a valid bearer — fail CLOSED (Claude.ai has historically made tokenless probe calls).
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    const user = token ? await verifyBearer(token).catch(() => null) : null;
    if (!user) return challenge(res);

    const sid = req.headers['mcp-session-id'];
    let entry = sid && sessions.get(sid);
    if (!entry) {
      const server = new McpServer({ name: 'hermoso-mcp', version: '1.0.0' });
      registerTools(server); // the SAME tools as stdio — but here every /api call they make carries this user's token
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => 'sess_' + Math.random().toString(36).slice(2),
        onsessioninitialized: (id) => sessions.set(id, entry),
      });
      transport.onclose = () => { if (transport.sessionId) sessions.delete(transport.sessionId); };
      entry = { transport, server, user };
      await server.connect(transport);
    }
    // NOTE: the user's identity must flow into the tools' /api calls (so spend bills the right account). The clean
    // way is an AsyncLocalStorage carrying {token|userId} that mcp/client.mjs reads — wire that in the cloud step.
    await entry.transport.handleRequest(req, res, req.body);
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
