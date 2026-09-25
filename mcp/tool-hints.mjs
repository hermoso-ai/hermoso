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


// ── A VIDEO THE CALLER EXPECTS AND CANNOT AFFORD IS A CHOICE, NOT A SWAP (2026-09-22) ─────────────────────
// The server refuses BEFORE planning or reserving — nothing billed — and the refusal carries `videoChoice`
// (server.js videoChoiceFor): the video's price against the balance, the image alternative priced, a top-up, and,
// only when one fits the balance together with the plan, a light draft. The text spells the same three options so
// a model can act on them; the hints are those options keyed as {do, why}, so an agent can branch instead of parsing.
// Which call makes the image depends on the tool that refused: plan_ad plans again with format image, render_ad goes
// back to plan_ad for an image plan, generate_video becomes generate_image. Pure, no imports — the twin rule above.
export function videoChoiceImageCall(tool) {
  const t = String(tool || '');
  if (t === 'generate_video') return 'generate_image({prompt: the same prompt})';
  if (t === 'render_ad') return "plan_ad({…the same brief, format: 'image'}) then generate_image with its image_concept.prompt";
  if (t === 'clone_video') return "plan_ad({reference: the same link, format: 'image'}) then generate_image";
  return `${t || 'the same call'}({…the same arguments, format: 'image'})`;
}
export function videoChoiceDraftCall(tool, d) {
  const t = String(tool || '');
  const m = String(d?.model || ''), s = Math.round(Number(d?.durationSeconds) || 0);
  if (t === 'plan_ad' || t === 'clone_video') return `${t}({…the same arguments, format: 'video', draft: {model: '${m}', durationSeconds: ${s}}})`;
  return `${t || 'the same call'}({…the same arguments, model: '${m}', durationSeconds: ${s}})`;
}
export function videoChoiceHints(tool, choice) {
  const c = choice && typeof choice === 'object' ? choice : {}, o = c.options || {};
  const out = [
    { do: videoChoiceImageCall(tool), why: `the image version is ~${o.image?.credits ?? '?'} credits against a balance of ${c.balance ?? '?'}; the video needs ~${c.videoCredits ?? '?'}` },
    { do: 'buy_credits({})', why: `${c.short ?? '?'} credits short of the video; a pack or a plan covers it, then the same call plans the video` },
  ];
  if (o.draft && o.draft.model) out.push({ do: videoChoiceDraftCall(tool, o.draft), why: `a light draft on ${o.draft.label || o.draft.model} (${o.draft.durationSeconds}s) is ~${(Number(o.draft.credits) || 0) + (Number(o.draft.planCredits) || 0)} credits and fits the balance; render the premium version after topping up` });
  return out;
}
export function videoChoiceText(tool, choice) {
  const c = choice && typeof choice === 'object' ? choice : {}, o = c.options || {};
  const d = o.draft && o.draft.model ? o.draft : null;
  const lines = [
    `${c.seconds ? `A ${c.seconds}s video` : 'This video'} would cost about ${c.videoCredits ?? '?'} credits and the account has ${c.balance ?? '?'} (${c.short ?? '?'} short). Nothing was planned, rendered or charged. Tell the user and let them choose — never switch the format for them:`,
    `  1. Make it as an image instead (~${o.image?.credits ?? '?'} credits): ${videoChoiceImageCall(tool)}.`,
    `  2. Add credits: buy_credits({}) quotes a pack on a saved card or returns a checkout link${o.topup?.url ? ` (or ${o.topup.url})` : ''}; then repeat the same call and the video goes ahead as asked.`,
  ];
  if (d) lines.push(`  3. Render the video anyway as a light draft on ${d.label || d.model} (${d.durationSeconds}s, ~${(Number(d.credits) || 0) + (Number(d.planCredits) || 0)} credits${d.audio === false ? '; SILENT: no voice, dialogue or music, so tell the user before they pick it for a spoken ad' : ''}): ${videoChoiceDraftCall(tool, d)}. Premium models once they top up.`);
  else lines.push(`  (No light-model draft fits this balance, so there is no "render anyway" option here.)`);
  return lines.join('\n');
}
