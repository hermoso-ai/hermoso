// ONE RECORD PER TOOL CALL, SUCCESSFUL OR NOT (2026-11-18, the server half is lib/tool-usage.mjs).
//
// Called from `wrap()` in tools.mjs, the one seam every tool returns through, beside the health sample. It records the
// tool's NAME, whether it ended in an error, and the credits the call was charged. Never its arguments or its answer.
//
// TWO WAYS OUT, decided by where this code is running:
//   • INSIDE THE HERMOSO SERVER (the hosted /mcp transport and /v1/tools run the handlers in process, under mcpCtx): the
//     server installed a sink, and the call goes straight to it with the session's account and client. No request.
//   • ON THE CALLER'S MACHINE (the stdio twin, `hermoso call`): calls are summed in memory and sent as one small POST to
//     /api/agent/tool-usage every 15 seconds, after 25 calls, or when the process is about to exit, with the AI app's own
//     clientInfo name. HERMOSO_USAGE=off turns it off. It never blocks, retries or changes a tool's answer.
// Byte-identical on both twins (cli/mcp/tool-usage.mjs).
import { mcpCtx, toolCtx, brandScope, apiPost } from './client.mjs';

const SINK = Symbol.for('hermoso.toolUsageSink');
/** The server installs its recorder here (in process only). */
export function setToolUsageSink(fn) { globalThis[SINK] = typeof fn === 'function' ? fn : null; }

// The stdio server this process registered its tools on, so a flush can name the AI app it is serving (its initialize).
let _localServer = null;
export function noteLocalServer(server) { if (server && typeof server === 'object') _localServer = server; }
const localClient = () => { try { return String(_localServer?.server?.getClientVersion?.()?.name || '').slice(0, 64); } catch { return ''; } };

const NAME_RE = /^[a-z][a-z0-9_]{0,63}$/;
const FLUSH_MS = 15_000, FLUSH_AT = 25, DISTINCT_MAX = 400;
let _buf = new Map(), _n = 0, _timer = null, _hooked = false, _inflight = null;

/** Never throws. */
export function recordToolUsage(tool, { ok = true, credits = 0 } = {}) {
  try {
    const name = String(tool || '');
    if (!NAME_RE.test(name)) return;
    const cr = Number(credits) > 0 ? Math.round(Number(credits) * 10) / 10 : 0;
    const ctx = mcpCtx.getStore();
    const sink = globalThis[SINK];
    // In the server: the sink, or nothing (a call with no session cannot be attributed, and must never post to itself).
    if (ctx || sink) {
      if (ctx && typeof sink === 'function') sink({ tool: name, ok: !!ok, credits: cr, accountId: ctx.accountId || null, client: String(ctx.client || ''), ua: String(ctx.ua || ''), surface: ctx.surface || 'hosted', src: String(ctx.src || '') });
      return;
    }
    if (String(process.env.HERMOSO_USAGE || '').toLowerCase() === 'off') return;
    const k = `${name}|${ok ? 1 : 0}`;
    let e = _buf.get(k);
    if (!e) { if (_buf.size >= DISTINCT_MAX) return; e = { tool: name, calls: 0, errors: 0, credits: 0 }; _buf.set(k, e); }
    e.calls++; if (!ok) e.errors++; e.credits = Math.round((e.credits + cr) * 10) / 10; _n++;
    if (!_hooked) { _hooked = true; try { process.on('beforeExit', () => { if (_buf.size) flushToolUsage(); }); } catch {} }
    if (_n >= FLUSH_AT) flushToolUsage();
    else if (!_timer) { _timer = setTimeout(() => { _timer = null; flushToolUsage(); }, FLUSH_MS); if (typeof _timer.unref === 'function') _timer.unref(); }
  } catch {}
}

/** Sends what is buffered. Outside every tool's context, so the POST is never filed under a tool or a brand. */
export function flushToolUsage() {
  if (_inflight || !_buf.size) return _inflight || Promise.resolve();
  const calls = [..._buf.values()];
  _buf = new Map(); _n = 0;
  if (_timer) { clearTimeout(_timer); _timer = null; }
  const send = () => apiPost('/api/agent/tool-usage', { client: localClient(), calls });
  _inflight = Promise.resolve().then(() => toolCtx.exit(() => brandScope.exit(send))).catch(() => {}).finally(() => { _inflight = null; });
  return _inflight;
}

/** Test seam. */
export function _toolUsageBuffered() { return [..._buf.values()].map((e) => ({ ...e })); }
