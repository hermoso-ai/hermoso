// ── HINTS: THE NEXT STEP, NAMED (2026-09-17) ───────────────────────────────────────────────────────────────────
//
// This product already tells an agent what to do next, constantly and well — "connect it under Settings ▸
// Connectors, then call again", "run buy_credits to top up", "call find_tools then call_tool", "reconnect with
// ?tools=all". Every one of those is a SENTENCE inside a wall of other sentences, so reading it is a parsing job
// an agent may or may not do. Monid rides a `Hints` block on its responses — server-suggested next command,
// related endpoints, caveats — and tells the agent to prefer hints over guessing. That is the cheap half we were
// missing: the advice exists, it just was not addressable.
//
// SO THIS ADDS A FIELD AND REMOVES NOTHING. The prose stays exactly as it was, because it is what a model
// actually reads and because half our hosts show only the text. The hint is the same advice, keyed, for a client
// or an agent that wants to branch on it rather than match a string.
//
// WHERE IT RIDES. `_meta`, which the MCP spec makes the sanctioned extension point on any result ("any result MAY
// carry it"), so every client that does not know the key ignores it. This file already puts the structured error
// marker there for the same reason. NOT `structuredContent`: a tool declares an outputSchema and a caller may
// validate against it, and a next-step suggestion is not part of any tool's output contract.
//
// THE SHAPE IS {do, why} AND NOTHING ELSE. `do` is the action, written as the call to make where there is one, so
// it can be executed without interpretation; `why` is the reason, so an agent can decide rather than obey. No
// severity, no codes, no nesting — a richer shape would need a schema, a version and a migration, and the whole
// value here is that it is free to add wherever we already write the sentence.
//
// PURE, NO IMPORTS — same twin-safety rule as roster-scope.mjs and well-formed.mjs.

export const HINTS_KEY = 'hermoso.ai/hints';
export const HINTS_MAX = 4;          // a list nobody reads is not a hint; keep it to the next step, not a plan
export const HINT_DO_MAX = 200, HINT_WHY_MAX = 300;

/** Normalise a hint list. Drops anything without a `do`, trims, caps. Never throws. */
export function normalizeHints(hints) {
  try {
    const out = [];
    for (const h of Array.isArray(hints) ? hints : []) {
      const doIt = String(h?.do ?? '').replace(/\s+/g, ' ').trim().slice(0, HINT_DO_MAX);
      if (!doIt) continue;                                   // a hint with no action is noise
      out.push({ do: doIt, why: String(h?.why ?? '').replace(/\s+/g, ' ').trim().slice(0, HINT_WHY_MAX) });
      if (out.length >= HINTS_MAX) break;
    }
    return out;
  } catch { return []; }
}

/**
 * Attach hints to a tool result without touching anything already on it — including an existing `_meta`, which
 * carries the structured error marker on every failure and must survive.
 * A result with no usable hints comes back BY REFERENCE, unchanged: adding an empty key to every reply in the
 * product would be pure weight.
 */
export function withHints(result, hints) {
  const list = normalizeHints(hints);
  if (!list.length || !result || typeof result !== 'object') return result;
  return { ...result, _meta: { ...(result._meta || {}), [HINTS_KEY]: list } };
}

/** Read them back — the shape a check and a client both use, so neither has to know the key. */
export const hintsOf = (result) => (result && result._meta && Array.isArray(result._meta[HINTS_KEY])) ? result._meta[HINTS_KEY] : [];
