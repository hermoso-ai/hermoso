// A STATE THAT IS AN ANSWER IS NOT A FAILED TOOL (2026-11-27). Byte-identical on both twins (cli/mcp/answer-states.mjs).
//
// MCP's `isError` is for a tool whose EXECUTION failed: "Tool Execution Errors … contain actionable feedback that language
// models can use to self-correct and retry with adjusted parameters" (spec 2025-11-25, Tools ▸ Error Handling). Five of our
// refusals are not that. The tool ran exactly as it should and its answer is a fact about the account, with a next step that
// only the USER can take, so no retry with other parameters helps:
//   needs_connection    the account this needs is not connected (the connect link is in the text)
//   needs_credits       the balance does not cover it (the top-up is in the text)
//   needs_plan          the plan does not include it (the upgrade is in the text)
//   needs_confirmation  it waits for the user's yes (confirm:true after they agree)
//   not_eligible        the PLATFORM's own fixed rule excludes this account (e.g. Meta's 1,000-follower Threads lookup floor)
// Those come back as a normal result whose structuredContent says `status` and `nextStep`, and whose text opens with
// "Not done:" so no model can read it as success. Everything else stays isError, unchanged: a vendor failure, a 5xx, a
// timeout, a 429, our own bug, a render that failed after it started, a bad argument (the model CAN fix that one).
//
// Hosted, non-widget sessions only (mcp/http.mjs, mcp/era-2026-serve.mjs). The CLI keeps isError, because a shell agent reads
// the exit code (cli/bin/hermoso.mjs: a refused gate or a missing connector exits 1), and ChatGPT keeps it, because its
// widget templates render a non-error result as a finished card. Our own telemetry still counts these as refusals: wrap()
// records the outcome before this layer sees it, so nothing here changes what the error board and toolUsage measure.
import { normalizeObjectSchema, safeParseAsync } from '@modelcontextprotocol/sdk/server/zod-compat.js';

export const ANSWER_STATES = Object.freeze(['needs_connection', 'needs_credits', 'needs_plan', 'needs_confirmation', 'not_eligible']);
const LEAD = Object.freeze({
  needs_connection: 'Not done: this needs an account connected first.',
  needs_credits: 'Not done: this account does not have enough credits for it. Nothing was charged.',
  needs_plan: 'Not done: this needs a paid plan. Nothing was charged.',
  needs_confirmation: 'Not done yet: this waits for the user’s confirmation. Nothing was changed.',
  not_eligible: 'Not done: the platform’s own rule does not allow this for that account. Nothing was charged.',
});
const ERR_KEY = 'hermoso.ai/error', HINTS_KEY = 'hermoso.ai/hints';
const PLAN_CODES = new Set(['posting_limit', 'autopilot_paid_only', 'model_paid_only']);

/** The answer state of a tool result, or null when it is a real failure (or not an error at all). Pure. */
export function answerStateOf(result) {
  if (!result || typeof result !== 'object' || result.isError !== true) return null;
  const meta = (result._meta && result._meta[ERR_KEY]) || null;
  if (!meta || typeof meta !== 'object') return null; // an error we did not author (an SDK schema refusal, a thrown handler): a failure
  const status = Number(meta.status) || 0;
  const code = String(meta.apiCode || meta.code || '');
  const text = (Array.isArray(result.content) ? result.content : []).filter((c) => c && c.type === 'text').map((c) => String(c.text || '')).join('\n');
  if (status >= 500 || status === 429 || status === 0) return null;
  if (code === 'not_eligible') return 'not_eligible';
  if (status === 401 && meta.connector) return 'needs_connection';
  if (PLAN_CODES.has(code)) return 'needs_plan';
  if ((status === 402 || status === 403 || status === 413) && /\bpaid plan\b|\bFree plan\b|\bupgrade\b/i.test(text) && !/\bnot enough credits\b|\bout of credits\b/i.test(text)) return 'needs_plan';
  if (status === 402 && /\bcredits?\b/i.test(text)) return 'needs_credits';
  if (status >= 400 && status < 500 && /\bconfirm\s*:\s*true\b/.test(text) && /\b(re-?send|call (it )?again|confirm)\b/i.test(text) && !/\binvalid|must be\b/i.test(text.split('\n')[0])) return 'needs_confirmation';
  return null;
}

/** The structured answer for a state: what it is, the next step, and the connector / link it names. */
export function answerStateContent(state, result) {
  const meta = (result._meta && result._meta[ERR_KEY]) || {};
  const hints = Array.isArray(result._meta && result._meta[HINTS_KEY]) ? result._meta[HINTS_KEY] : [];
  const text = (Array.isArray(result.content) ? result.content : []).filter((c) => c && c.type === 'text').map((c) => String(c.text || '')).join('\n');
  const link = (text.match(/https:\/\/[^\s)"'”]+/) || [])[0] || null;
  const nextStep = (hints[0] && typeof hints[0].do === 'string' && hints[0].do) || text.replace(/^Error:\s*/, '').split('\n')[0].slice(0, 400);
  return { status: state, done: false, nextStep, ...(meta.connector ? { connector: String(meta.connector) } : {}), ...(link ? { link } : {}), message: text.replace(/^Error:\s*/, '').slice(0, 2000) };
}

/** Rewrite one result. `outputSchema` (the tool's, when it has one) must accept the structured answer, or the result is left as it was. */
export async function asAnswerState(result, outputSchema = null) {
  const state = answerStateOf(result);
  if (!state) return result;
  const sc = answerStateContent(state, result);
  if (outputSchema) {
    try { const parsed = await safeParseAsync(normalizeObjectSchema(outputSchema), sc); if (!parsed || !parsed.success) return result; } catch { return result; }
  }
  const content = (Array.isArray(result.content) ? result.content : []).map((c, i) => (i === 0 && c && c.type === 'text' ? { ...c, text: `${LEAD[state]}\n${String(c.text || '').replace(/^Error:\s*/, '')}` } : c));
  if (!content.length) content.push({ type: 'text', text: LEAD[state] });
  return { ...result, content, structuredContent: sc, isError: false, _meta: { ...(result._meta || {}), 'hermoso.ai/answerState': state } };
}

/** Install on one McpServer: the outermost wrapper of its tools/call handler, so it sees each final result. Idempotent. */
export function installAnswerStates(mcp) {
  try {
    const map = mcp && mcp.server && mcp.server._requestHandlers;
    if (!map || typeof map.get !== 'function') return false;
    const orig = map.get('tools/call');
    if (typeof orig !== 'function' || orig._hermosoAnswerStates) return false;
    const wrapped = async (request, extra) => {
      const r = await orig(request, extra);
      if (!r || r.isError !== true) return r;
      const tool = mcp._registeredTools && mcp._registeredTools[String(request?.params?.name || '')];
      return asAnswerState(r, tool && tool.outputSchema ? tool.outputSchema : null);
    };
    for (const k of Object.keys(orig)) { try { wrapped[k] = orig[k]; } catch {} } // keep the inner wrappers' markers (_hermosoHeldWrap, …)
    wrapped._hermosoAnswerStates = true;
    map.set('tools/call', wrapped);
    return true;
  } catch { return false; }
}
