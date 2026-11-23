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
// ([[unsourced-capability-comments]]). So: THIS MODULE CLASSIFIES AND FORMATS, IT NEVER PRICES. Every digit find_tools
// shows comes from that same live catalog, read per session (see `toolPriceText` below); when the catalog has not
// been read the row names get_cost and no number, which is honest rather than guessed.
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
  'list_product_photos', 'fetch_app_screens', 'list_hooks', 'list_templates', 'face_check',
  'list_meta_posts', 'list_published_posts', 'post_performance', 'diagnose_posts', 'backfill_posts',
  // The product catalog (2026-10-06): a store read or write, and a product page read with curl and parsed locally (no
  // model; POST /api/products answers creditsUsed: 0). Each says "Free" / "0 credits" in its own description.
  'list_products', 'add_product', 'refresh_products', 'update_product', 'remove_product',
  // Story films (2026-11-11): the catalog, one card's recipe and starting a run (the outline) are store reads and writes;
  // each says "Free" in its own description. advance_story_film runs the paid stages and stays a model tool.
  'list_story_cards', 'get_story_card', 'start_story_film',
  // view_images (2026-11-16): the brand's own Library pictures scaled by local ffmpeg; says "Free" in its own description.
  'view_images',
]);
// Reads inside `research`. `find_competitors` says "0 credits" in its own description (it is the discovery model,
// billed to us, not a paid ad-data call); the watch tools only write and read a stored preference — the weekly
// run that spends is a job, not this call.
// find_company_contacts (2026-11-17) reads a company's own pages and DNS on our own server: no data vendor, no model; its description says "Free: 0 credits".
export const RESEARCH_FREE_READS = Object.freeze(['find_competitors', 'list_watch_findings', 'set_competitor_watch', 'find_company_contacts']);

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

// ── ONE SHORT PRICE PER TOOL (2026-11-17, owner-approved: "an agent knows the price before it runs") ──────────────
// find_tools, get_instructions and GET /v1/tools each print `price`: one short string an agent can read at a glance,
// in one of four shapes, and every digit in it is read off the live catalog (`GET /api/generate/status`):
//
//     'free'                                      the class says so (publishing, campaigns, analytics, lookups…)
//     '<lo>-<hi> credits by model'                a raw generation tool, spanned over the whole model catalog
//     '<n> credits' / '<n> credits per second'    one catalog figure prices it outright
//     'from <n> credits'                          it scales with length, model or how much work it does
//
// The same rule as the header above: NO DIGIT LIVES IN THIS FILE. A tool the catalog does not price yet (or a
// catalog that has not been read) says 'credits vary: get_cost prices it' — the exact, nothing-billed quote every
// paying tool already takes — never a guessed number ([[failed-read-is-not-empty]]).
//
// THE DIGEST IS SMALL ON PURPOSE. The status payload is ~125 KB; a hosted session keeps only these few numbers. And
// it spans BOTH rates (standardCredits and memberCredits) for the catalog ranges, so a range read by one account is
// still true for another — a member pays the low end, a Free account the high end, and both are inside it.
const _pos = (v) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null);
function _span(models) {
  const nums = [];
  const eat = (v) => {
    if (_pos(v) != null) nums.push(v);
    else if (v && typeof v === 'object') for (const x of Object.values(v)) eat(x);
  };
  for (const m of models || []) {
    if (!m || typeof m !== 'object' || m.deprecated) continue;
    for (const k of ['credits', 'standardCredits', 'memberCredits', 'creditsBySize', 'creditsByRes']) eat(m[k]);
  }
  return nums.length ? [Math.min(...nums), Math.max(...nums)] : null;
}
const _min = (vals) => { const ok = vals.map(_pos).filter((v) => v != null); return ok.length ? Math.min(...ok) : null; };

// The flat figures the status payload already publishes for one tool each, by the payload's own key.
export const PRICE_KEYS = Object.freeze(['editCredits', 'reframeCredits', 'upscaleCredits', 'dubCredits', 'voiceSwapCredits',
  'clipCredits', 'subtitleCredits', 'explainCredits', 'editVideoCredits', 'postEditCredits', 'avatarCreditsPerSecond',
  // the mini tools (2026-11-23), only where the published figure IS the least a call costs: each is that tool's floor
  // (the upscaler's megapixel floor, one cut-out, a second of sound, a picture up to 1 MP). The per-10-second figures the
  // payload also publishes are priced at 30 fps, above what a lower-frame-rate clip costs, so those tools keep the metered floor.
  'imageUpscaleCredits', 'bgRemoveCredits', 'stemMinCredits', 'anglesCredits']);

/** The handful of numbers `toolPriceText` reads, from one /api/generate/status payload. null when there is none. */
export function priceDigestFrom(status) {
  if (!status || typeof status !== 'object') return null;
  const o = status.options || {};
  const flat = {};
  for (const k of PRICE_KEYS) { const v = _pos(status[k]); if (v != null) flat[k] = v; }
  const tp = status.toolPrices && typeof status.toolPrices === 'object' ? status.toolPrices : {};
  return {
    image: _span(o.image?.models),
    video: _span(o.video?.models),
    flat,
    voicePer1k: _pos(o.voice?.creditsPer1k),
    sfxFrom: _min((o.sfx?.engines || []).flatMap((e) => Object.values(e?.creditsBySeconds || {}))),
    musicFrom: _min((o.music?.models || []).flatMap((m) => [m?.credits15s, m?.credits])),
    meteredFrom: _pos(tp.meteredFloor),        // the least a metered step (a writing model, a lookup) can bill
    researchFrom: _pos(tp.researchLookup),     // one Ad Spy data lookup
    model3dFrom: _min(Object.values(status.model3dCredits || {})),                       // photo_to_model's cheaper tier
    singingFrom: _span([{ credits: status.singingAd?.credits }])?.[0] ?? null,             // the cheapest singing ad on the table
  };
}

const _n = (v) => (Number.isInteger(v) ? String(v) : String(Math.round(v * 10) / 10));
const _cr = (v) => `${_n(v)} credit${v === 1 ? '' : 's'}`;
const _range = (r, by) => (r ? (r[0] === r[1] ? _cr(r[0]) : `${_n(r[0])}-${_n(r[1])} credits by ${by}`) : '');

// How each tool the catalog prices outright reads its figure. A name not here falls back to its class (below).
// `from` marks a figure that is the start of a scale (by length, by sections); `per` names the unit it is quoted in.
export const TOOL_PRICE_SPECS = Object.freeze({
  generate_image: { range: 'image', by: 'model and size' },
  generate_video: { range: 'video', by: 'model, length and resolution' },
  edit_image: { flat: 'editCredits' },
  reframe_video: { flat: 'reframeCredits', from: true },
  upscale_video: { flat: 'upscaleCredits', from: true },
  dub_video: { flat: 'dubCredits', from: true },
  change_voice: { flat: 'voiceSwapCredits', from: true },
  clip_video: { flat: 'clipCredits', from: true },
  add_subtitles: { flat: 'subtitleCredits', from: true },
  make_explainer: { flat: 'explainCredits', from: true },
  edit_video: { flat: 'editVideoCredits', from: true },
  post_edit: { flat: 'postEditCredits', from: true },
  generate_avatar: { flat: 'avatarCreditsPerSecond', per: 'second' },
  generate_voice: { digest: 'voicePer1k', per: '1,000 characters' },
  generate_sfx: { digest: 'sfxFrom', from: true },
  generate_music: { digest: 'musicFrom', from: true },
  upscale_image: { flat: 'imageUpscaleCredits', from: true },
  cut_out_background: { flat: 'bgRemoveCredits' },
  split_vocals: { flat: 'stemMinCredits', from: true },
  reangle_image: { flat: 'anglesCredits', from: true },
  photo_to_model: { digest: 'model3dFrom', from: true },
  make_singing_ad: { digest: 'singingFrom', from: true },
});
export const PRICE_UNKNOWN = 'credits vary: get_cost prices it';

/**
 * The one short price string for a tool. `cls` is toolCostClass's answer (after the caller has applied any
 * spend-exemption); `digest` is priceDigestFrom's. PURE.
 */
export function toolPriceText(name, cls, digest) {
  if (cls === 'free') return 'free';
  if (cls === 'percall') return 'per call at X’s rate (hermoso_credits xCost)';
  const d = digest || null;
  if (cls === 'research') return d?.researchFrom ? `from ${_cr(d.researchFrom)}` : PRICE_UNKNOWN;
  const spec = TOOL_PRICE_SPECS[String(name || '')];
  if (spec && d) {
    if (spec.range) { const t = _range(d[spec.range], spec.by); if (t) return t; }
    const v = spec.flat ? d.flat?.[spec.flat] : spec.digest ? d[spec.digest] : null;
    if (_pos(v) != null) return `${spec.from ? 'from ' : ''}${_cr(v)}${spec.per ? ` per ${spec.per}` : ''}`;
  }
  return d?.meteredFrom ? `from ${_cr(d.meteredFrom)}` : PRICE_UNKNOWN;
}
