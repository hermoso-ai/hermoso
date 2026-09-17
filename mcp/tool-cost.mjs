// ── WHAT A TOOL COSTS, AS find_tools REPORTS IT (2026-09-17) ───────────────────────────────────────────────────
//
// An agent choosing between two tools should be able to see the price before it calls one, the way it can see the
// parameters. Monid's `inspect` does exactly this and their docs tell the agent to read the live price rather than
// trust the doc — "it is the source of truth, not this document". Ours has to hold the same line.
//
// THERE IS NO PER-TOOL PRICE TABLE IN THIS PRODUCT, AND INVENTING ONE WOULD BE THE WRONG FIX. Credits are spent
// per MODEL RUN, and what a run costs depends on the model, the resolution and the length — which is why the only
// exact numbers live in the live catalog `/api/generate/status` serves and `hermoso_capabilities` prints. A number
// written into this file would be a second, stale answer to a question the server already answers correctly
// ([[unsourced-capability-comments]]). So: THIS MODULE CLASSIFIES, IT NEVER PRICES. Every digit find_tools shows
// comes from that same live catalog, fetched once per process and quoted as a range; when the catalog has not been
// read the row says the class and no number, which is honest rather than guessed.
//
// THE CLASSIFICATION IS THE SERVER'S OWN ONE SENTENCE, MAPPED ONTO THE GROUP MARKERS. `COST_MODEL_SENTENCE` in
// server.js — the one copy every surface prints — says credits are spent on exactly two things, running an AI
// model and Ad Spy research, with X as the single per-call exception, and that everything else (publishing,
// scheduling, campaign management, analytics, comments, DMs, connectors, brands, team) is free on every plan.
// Those two things are the `create` and `research` groups, which each tool declares by the `server.group()` marker
// it was written under and which `tools/tool-group-truth-check.mjs` already holds true. So the rule derives from
// two things that are independently maintained, not from a hand-list of 841 names:
//
//     group `create`   → 'model'     (it runs a model — image, video, voice, text, planning, post-production)
//     group `research` → 'research'  (Ad Spy: our own research key pays the vendor)
//     provider `x`     → 'percall'   (X bills us per API request; the documented exception)
//     everything else  → 'free'
//
// THE TWO EXCEPTION SETS BELOW ARE THE READS THAT LIVE INSIDE THOSE GROUPS — a Library listing or a job poll is
// filed under `create` because that is the section it was written in, and it spends nothing. They are the only
// hand-maintained part, they are small, and `tools/tool-cost-health-check.mjs` cross-examines them against each
// tool's OWN description: a tool whose description says "0 credits" or "Free, read-only" may not be classed paid,
// and one whose description states its OWN price ("Spends credits" at a sentence start, or a "Paid (…)" clause)
// may not be classed free. That makes the two statements check each other instead of drifting apart. The claim has
// to be about THIS tool: three genuinely free tools merely CONTAIN the words — hermoso_credits prints the rule
// itself, list_creators explains that generating a fresh face costs credits, and set_competitor_watch says the
// weekly RUN spends — so a loose match would have mis-flagged all three.
//
// PURE, NO IMPORTS, so the checks RUN these functions and so the cli twin — which ships without lib/ and without a
// repo around it — resolves the same specifier the server copy does.

// Reads inside `create`. Each is a lookup or a poll: it returns something we already hold and runs no model.
export const CREATE_FREE_READS = Object.freeze([
  'get_job', 'list_library', 'fetch_asset', 'list_skills', 'get_skill',
  'list_product_photos', 'fetch_app_screens', 'list_hooks',
  'list_meta_posts', 'list_published_posts', 'post_performance', 'diagnose_posts', 'backfill_posts',
]);
// Reads inside `research`. `find_competitors` says "0 credits" in its own description (it is the discovery model,
// billed to us, not a ScrapeCreators call); the watch tools only write and read a stored preference — the weekly
// run that spends is a job, not this call.
export const RESEARCH_FREE_READS = Object.freeze(['find_competitors', 'list_watch_findings', 'set_competitor_watch']);

export const COST_CLASSES = Object.freeze(['free', 'model', 'research', 'percall']);

/**
 * The cost CLASS of one tool. `group` is the registry's own marker for it; `provider` is toolProvider(name).
 * Unknown/unmapped ⇒ 'free', which matches the server's sentence: everything that is not a model run or Ad Spy
 * research is free on every plan.
 */
export function toolCostClass(name, group, provider = null) {
  const n = String(name || '');
  if (provider === 'x') return 'percall';                     // X charges per API request — the one exception
  if (group === 'create') return CREATE_FREE_READS.includes(n) ? 'free' : 'model';
  if (group === 'research') return RESEARCH_FREE_READS.includes(n) ? 'free' : 'research';
  return 'free';
}

// The sentence each class prints. NO DIGITS HERE — see the header. `range` is filled in by the caller from the
// live catalog when it has read one.
export function costLabel(cls, range = '') {
  if (cls === 'percall') return 'a few credits per call (X charges per API request)';
  if (cls === 'research') return 'credits (Ad Spy research)';
  if (cls === 'model') return range ? `credits — ${range}` : 'credits (runs a model; hermoso_capabilities has the exact per-model figure)';
  return 'free';
}

/**
 * The one range find_tools quotes, built from the SAME payload hermoso_capabilities prints
 * (`GET /api/generate/status`). Returns '' when the catalog has not been read — an absent number is never
 * replaced by a guessed one ([[failed-read-is-not-empty]]).
 *
 * `kind` picks which catalog to read: a video tool is priced by the video models, an image tool by the image ones.
 * Anything else gets the whole span, which is the honest answer for a tool that could route to either.
 */
export function creditRangeFrom(status, kind = 'any') {
  if (!status || typeof status !== 'object') return '';
  const nums = [];
  const eat = (rows) => { for (const m of rows || []) {
    if (typeof m?.credits === 'number') nums.push(m.credits);
    else if (m?.credits && typeof m.credits === 'object') for (const v of Object.values(m.credits)) if (typeof v === 'number') nums.push(v);
    if (m?.creditsBySize) for (const v of Object.values(m.creditsBySize)) if (typeof v === 'number') nums.push(v);
  } };
  if (kind === 'image' || kind === 'any') eat(status.options?.image?.models);
  if (kind === 'video' || kind === 'any') eat(status.options?.video?.models);
  const ok = nums.filter((n) => Number.isFinite(n) && n > 0);
  if (!ok.length) return '';
  const lo = Math.min(...ok), hi = Math.max(...ok);
  return lo === hi ? `${lo} credits` : `${lo}-${hi} credits by model/length/resolution`;
}

// Which catalog a generation tool is priced from. Deliberately tiny and name-shaped: a tool it does not recognise
// gets the class label with no number, which is the safe direction.
export const costKindOf = (name) => (/video|avatar|sizzle|explainer|stitch|reframe|upscale|recast|dub|clip|subtitle|beat|finish|multiply|motion/i.test(String(name || '')) ? 'video'
  : /image|thumbnail|photo|static|render_ad|template/i.test(String(name || '')) ? 'image' : 'any');
