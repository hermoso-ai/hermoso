// ── HINTS: THE NEXT STEP, NAMED (2026-09-17) ───────────────────────────────────────────────────────────────────
//
// This product already tells an agent what to do next, constantly and well — "connect it under
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
// THE WALL SELLS CREDITS FIRST (owner 2026-11-06, fi:3d3bd64bedef: "Shouldnt it just tells them they can't afford it and
// then try to upsell the plans/credits?"). The agent says plainly that the account does not have enough credits and offers
// credits and plans; the image and the light draft stay listed LAST, for a user who asks for something cheaper themselves,
// never as the agent's own pick. A video-plus-static ask is priced whole (`needCredits`, `alsoImage`) and neither half is made.
// ── THE TWO PRICED DOORS, AS AN AGENT RELAYS THEM (2026-11-12) ──────────────────────────────────────────────────────
// A balance refusal carries `buy` (the server's buyDoorsFor): a monthly plan and a credit pack sized to the ask, each with
// its price, its credits and a checkout link that needs no sign-in, plus the same offer as ready-made `lines`. The old
// answer explained how buy_credits works and left the agent to make a second call before the user saw a price. Now the
// prices and the links are in the refusal itself. Never on a widget host (ChatGPT may not link to a checkout): the
// callers pass `buy` only when the host is not one. Pure, no imports: the twin rule.
export function buyDoorsOf(e, widgetHost) {
  const b = e && e.buy;
  return !widgetHost && b && typeof b === 'object' && b.pack && Array.isArray(b.lines) && b.lines.length ? b : null;
}
export function buyDoorsText(buy, tool) {
  if (!buy) return '';
  const lines = buy.lines.map((x) => String(x)).filter(Boolean);
  const doors = lines.filter((l) => l.startsWith('•'));
  return [buy.plan ? `Recommend the ${buy.plan.name} plan to the user, with its link; a one-time credit pack is the other option:` : 'Give the user this way to continue, with its link:', ...doors,
    `Each link opens a secure checkout page for this account, no sign-in needed. Once they have paid, call ${tool || 'the same tool'} again with the same arguments. A card already on file: buy_credits({pack:"${buy.pack.id}"}) quotes it and charges on confirm.`].join('\n');
}
export const buyDoorsHints = (buy, tool) => (buy ? [{ do: `${buy.plan ? `recommend the ${buy.plan.name} plan from this message with its price and link, and mention the one-time pack as the other option` : 'show the user the pack from this message with its price and link'}; after they pay, call ${tool || 'the same tool'} again with the same arguments`, why: 'the account cannot cover this call; each link is a checkout for this account that needs no sign-in, and nothing was charged' }] : []);
export function videoChoiceHints(tool, choice, opts = {}) {
  const c = choice && typeof choice === 'object' ? choice : {}, o = c.options || {};
  const out = opts.widgetHost
    ? [{ do: `tell the user they do not have enough credits: it needs ${c.short ?? '?'} more than the account has; they add credits or pick a plan in their Hermoso account at ${ACCOUNT_INFO_URL}`, why: 'this host does not offer purchases, so nothing is bought from here' }]
    : opts.buy ? buyDoorsHints(opts.buy, tool)
    : [
      { do: 'buy_credits({})', why: `${c.short ?? '?'} credits short; a pack covers it, then the same call makes it as asked` },
      { do: 'upgrade_plan({})', why: 'a monthly plan (Starter, Pro, Studio) includes monthly credits and no markup on models' },
    ];
  if (c.welcomeClaim && c.welcomeClaim.url) out.unshift(welcomeClaimHint(c.welcomeClaim));
  out.push({ do: videoChoiceImageCall(tool), why: `only if the user asks for something cheaper instead: the image version is ~${o.image?.credits ?? '?'} credits against a balance of ${c.balance ?? '?'}` });
  if (o.draft && o.draft.model) out.push({ do: videoChoiceDraftCall(tool, o.draft), why: `only if the user asks for something cheaper instead: a light draft on ${o.draft.label || o.draft.model} (${o.draft.durationSeconds}s) is ~${(Number(o.draft.credits) || 0) + (Number(o.draft.planCredits) || 0)} credits and fits the balance` });
  return out;
}
export function videoChoiceText(tool, choice, opts = {}) {
  const c = choice && typeof choice === 'object' ? choice : {}, o = c.options || {};
  const d = o.draft && o.draft.model ? o.draft : null;
  const need = Number(c.needCredits) > 0 ? Number(c.needCredits) : (c.videoCredits ?? '?');
  const what = c.alsoImage
    ? `The ${c.seconds ? `${c.seconds}s ` : ''}video and the static together`
    : `${c.seconds ? `A ${c.seconds}s video${c.lengthBasis === 'source' ? ' (the original’s length)' : ''}` : 'This video'}`;
  const lines = [
    // A clone names which length it priced (lengthBasis, 2026-10-07) and any post lookup reading that length cost.
    `Not enough credits for this. ${what} would cost about ${need} credits and the account has ${c.balance ?? '?'} (${c.short ?? '?'} short).${c.lengthBasis === 'estimate' && c.seconds ? ` That price ASSUMES ${c.seconds}s: the original’s length could not be read before planning, and the clone will match its real length, so say it is an estimate.` : ''} ${Number(c.lookupCredits) > 0 ? `Nothing was planned or rendered; reading the original’s length cost ${Math.round(Number(c.lookupCredits))} credit${Math.round(Number(c.lookupCredits)) === 1 ? '' : 's'} (the post lookup the clone reuses).` : 'Nothing was planned, rendered or charged.'} Tell the user plainly they do not have enough credits for it and offer credits or a plan; never switch the format or make part of the ask for them:`,
    // A WIDGET HOST (ChatGPT) GETS NO PURCHASE ROUTE (2026-09-30): its plugin guidelines let a plugin explain that a
    // feature needs more credits and link an informational page, never a checkout. `o.topup.url` is a checkout link.
    ...(opts.widgetHost
      ? [`  1. The user can add credits or pick a plan in their Hermoso account (${ACCOUNT_INFO_URL}); then the same call makes it as asked. Nothing can be bought from here.`]
      : opts.buy ? [buyDoorsText(opts.buy, tool)]
      : [`  1. Add credits: buy_credits({}) quotes a pack on a saved card or returns a checkout link${o.topup?.url ? ` (or ${o.topup.url})` : ''}; then repeat the same call and it goes ahead as asked.`,
        `  2. Or a monthly plan: upgrade_plan({}) lists them; Starter, Pro and Studio include monthly credits and no markup on models, so credits go further.`]),
  ];
  if (c.welcomeClaim && c.welcomeClaim.url) lines.splice(1, 0, `  First: ${welcomeClaimSentence(c.welcomeClaim)}`);
  lines.push(`  Only if the user asks for something cheaper instead: make it as an image (~${o.image?.credits ?? '?'} credits): ${videoChoiceImageCall(tool)}.`);
  if (d) lines.push(`  Or, again only if they ask, render the video as a light draft on ${d.label || d.model} (${d.durationSeconds}s, ~${(Number(d.credits) || 0) + (Number(d.planCredits) || 0)} credits${d.audio === false ? '; SILENT: no voice, dialogue or music, so tell the user before they pick it for a spoken ad' : ''}): ${videoChoiceDraftCall(tool, d)}.`);
  return lines.join('\n');
}


// ── A FINISHED RENDER, READ FROM THE REPLY (2026-11-02) ─────────────────────────────────────────────────────────────
// Which replies may carry the "post this" next step (lib/connect-prompt.mjs): the tools that make a file, and only once
// that file exists. A hosted video answers {stillRendering} and arrives through get_job, so get_job is on the list and a
// queued, running or failed job is not a finished render. Pure, no imports — the twin rule above.
export const RENDER_REPLY_TOOLS = Object.freeze(['generate_image', 'generate_video', 'render_ad', 'make_template_ad', 'make_motion_film', 'make_thumbnail', 'make_explainer', 'generate_avatar', 'stitch_video', 'product_sizzle', 'recast_motion', 'finish_video', 'multiply_ad', 'clone_video', 'clone_static', 'remix_static', 'get_job']);
const _VIDEO_FILE = /\.(mp4|mov|webm|m4v)(\?|#|$)/i, _IMAGE_FILE = /\.(png|jpe?g|webp|gif)(\?|#|$)/i;
export function finishedRenderKind(tool, r) {
  if (!RENDER_REPLY_TOOLS.includes(String(tool || '')) || !r || r.isError || !Array.isArray(r.content)) return '';
  const s = r.structuredContent;
  if (!s || typeof s !== 'object' || s.stillRendering) return '';
  if (typeof s.status === 'string' && s.status && s.status !== 'done') return '';
  const inner = [s, s.raw, s.result, s.result && s.result.data].filter((x) => x && typeof x === 'object');
  const has = (k) => inner.some((x) => (Array.isArray(x[k]) ? x[k].length > 0 : !!x[k]));
  const url = String(s.url || '');
  if (has('video') || _VIDEO_FILE.test(url)) return 'video';
  if (has('image') || has('images') || has('thumbnails') || has('slides') || _IMAGE_FILE.test(url)) return 'image';
  return '';
}

// ── A FINISHED RENDER ON A WIDGET HOST NEEDS NO OTHER PICTURE (2026-11-03) ───────────────────────────────────────────
// Measured on ChatGPT: after generate_image returned a finished Fernfizz ad, the reply showed ChatGPT's OWN image-search
// result beside it (a 3D-model page from an unrelated site, rendered as a "search image" chip), because the model wanted
// a picture in its answer and our card was the only one it had been told not to repeat. The card already shows the
// result, so the reply says so and asks for no other picture. Agent-facing, not user-facing. Pure, no imports.
export const WIDGET_RESULT_NOTE = (kind) => `Note for the assistant, not for the user: the Hermoso card in this reply already shows the finished ${kind === 'video' ? 'video' : 'image'}. Show no other picture with it, no image search and no web images, because none of them is this result.`;
export function withWidgetResultNote(tool, r, widgetHost) {
  if (!widgetHost) return r;
  const kind = finishedRenderKind(tool, r);
  if (!kind) return r;
  return { ...r, content: [...r.content, { type: 'text', text: WIDGET_RESULT_NOTE(kind) }] };
}

// ── OUT OF CREDITS ON A HOST THAT FORBIDS SELLING CREDITS (2026-09-30, OpenAI's plugin guidelines) ─────────────────
// "Plugins may: explain that a certain feature is not available with the user's current plan or entitlement; link to
// an informational page … Plugins may not: link directly to a checkout … or promote upgrades." ChatGPT is not offered
// buy_credits / upgrade_plan (WITHHELD_FROM_WIDGET_HOSTS), so its out-of-credits reply must not name them either, and
// the server's own sentence ("Upgrade or top up to keep going.") is rewritten to say where the account is managed.
// The link is the pricing page, which describes the options and starts nothing. Pure, no imports — the twin rule.
// TAGGED src=chatgpt-credits (2026-11-12, lib/buy-page.mjs): the pricing page shows a visitor with this tag one button, "Buy credits
// or a plan", to the app's buy page. Still the informational page ChatGPT's rules allow, and the only link this host is ever
// given; the buy page itself is never linked from here. The tag rides only the refusal text, never a tool definition.
export const ACCOUNT_INFO_URL = 'https://hermoso.ai/pricing?src=chatgpt-credits';
// …AND THE PLAN TIER THE ACCOUNT IS ON, AND NOTHING ELSE (2026-11-12, owner: "shouldnt we only show plans higher than the plan
// they are on?"). The pricing page is static and cannot see the account, so the link says which tier it is on (&from=starter)
// and the page hides the plans at or below it. A tier is not personal data; no id, email or balance ever rides the link. An
// unknown or free tier is the plain link (every plan is above Free). Pure; tools.mjs reads the tier once per refusal.
export const PLAN_TIERS = Object.freeze(['free', 'basic', 'starter', 'pro', 'studio']);
export function accountInfoUrl(tier) {
  const t = String(tier || '').trim().toLowerCase();
  return PLAN_TIERS.includes(t) && t !== 'free' ? `${ACCOUNT_INFO_URL}&from=${t}` : ACCOUNT_INFO_URL;
}
/** A refusal written for a widget host, with the tier put on its info link (text and hints). The text is otherwise untouched. */
export function withInfoTier(text, hints, tier) {
  const u = accountInfoUrl(tier);
  if (u === ACCOUNT_INFO_URL) return { text, hints };
  const sw = (x) => String(x).split(ACCOUNT_INFO_URL).join(u);
  return { text: sw(text), hints: (hints || []).map((h) => (h && typeof h === 'object' ? { ...h, ...(typeof h.do === 'string' ? { do: sw(h.do) } : {}), ...(typeof h.why === 'string' ? { why: sw(h.why) } : {}) } : h)) };
}
export const ACCOUNT_CREDITS_LINE = `The user can add credits or pick a plan in their Hermoso account at ${ACCOUNT_INFO_URL}, then ask again.`; // the neutral fact every widget-host refusal carries (owner, 2026-11-12): what to do and where, never a pitch
export const CREDITS_LOW_NOTE = `The Hermoso account does not have enough credits for this. Tell the user plainly. ${ACCOUNT_CREDITS_LINE} Nothing can be bought from here.`;
const UPSELL_SENTENCE_RE = /\s*(?:please\s+)?(?:upgrade(?:\s+your\s+plan)?\s+or\s+top\s+up|top\s+up|add\s+credits|buy\s+(?:more\s+)?credits|monthly\s+plans\s+have\s+no\s+markup\s+on\s+models)\b[^.!\n]*[.!]?/gi; // the monthly-plan upsell (2026-10-20) is a promotion too: a widget host (ChatGPT) never hears it
// ── FREE CREDITS NOT CLAIMED YET (2026-10-25, ChatGPT funnel) ─────────────────────────────────────────────────────
// An account whose welcome credits were never added (the one-time check that a person is behind it did not pass
// silently at sign-in) reads 0 credits. Its fix is opening a one-click link once (2026-11-10: signed for the account, no sign-in), which is not a purchase, so it is
// said on every host, ChatGPT included. The server marks the refusal (meta.welcomeClaim = {credits, url}).
export const welcomeClaimSentence = (w) => `This account has not received its ${Number(w?.credits) || 0} free credits yet. The user opens ${w?.url} once in a browser (one click, no sign-in and no card) and they arrive in a few seconds after a quick check that a person is there.`;
export const welcomeClaimHint = (w) => ({ do: `ask the user to open ${w?.url} once in a browser (one click, no sign-in) to receive the ${Number(w?.credits) || 0} free credits; then run the same call again`, why: 'the account never received its free credits: they wait behind a one-time check that a person is behind the account, which runs in the browser' });
export function neutralCreditsText(msg, nums = {}) {
  const base = stripPlanPromo(String(msg ?? '').replace(UPSELL_SENTENCE_RE, '')).replace(/[ \t]+$/gm, '').replace(/\s*[—–,:-]\s*$/gm, '.').trim();
  // The numbers, when the server's sentence did not carry them ("You’re out of credits." does not): read from the refusal's
  // structured block (e.buy.need / .balance), never parsed from prose. A count, not a price.
  const need = Math.round(Number(nums?.need) || 0), bal = Number(nums?.balance);
  const numLine = need > 0 && !/\bneeds?\b[^.\n]*\d/i.test(base) ? `This needs about ${need} credits${Number.isFinite(bal) && nums?.balance != null ? ` and the account has ${Math.max(0, Math.floor(bal))}` : ''}.` : '';
  return [base, numLine, CREDITS_LOW_NOTE].filter(Boolean).join('\n');
}
// ── NO PLAN PITCH ON A WIDGET HOST, WHEREVER IT CAME FROM (2026-11-12) ────────────────────────────────────────────
// Measured on production: a ChatGPT out-of-credits refusal carried no price and no checkout link and STILL ended
// "Starter, Pro and Studio have no markup on models, so your credits go twice as far." — the server's withPlanUpsell
// sentence (server.js PLAN_UPSELL_LINE, or its "on one of those plans this needs about N" form), which UPSELL_SENTENCE_RE
// above did not know. OpenAI's app guidelines: apps "may not … promote upgrades". So the rule is a SENTENCE filter, not a
// list of known sentences: on a widget host any sentence (or list item) that pitches a plan, names a purchase tool, a
// price, a checkout or a top-up is dropped, and the neutral line (ACCOUNT_CREDITS_LINE) says what to do and where.
// Two strengths. PLAN_PROMO_RE is for text that is ABOUT credits or the account (a credits refusal, the capability map),
// where "$" or "upgrade" can only be selling. PLAN_PITCH_RE is narrow enough for any reply on a widget host (a budget
// error says "$5", ad copy says "go further"): only our own pitch phrases and the purchase tools' names.
export const PLAN_PROMO_RE = /\b(?:buy_credits|upgrade_plan|set_auto_reload|billing_status)\b|\bupgrad(?:e|es|ed|ing)\b|no markup|twice as far|\bgo(?:es)? further\b|checkout|\btop[- ]?ups?\b|\$\s?\d|WHY HERMOSO|\bcredit packs?\b|\bper month\b|\/mo\b/i;
export const PLAN_PITCH_RE = /no markup on (?:image, video and voice )?models|credits? go(?:es)? (?:twice as far|further)|\bStarter, Pro and Studio\b|\b(?:buy_credits|upgrade_plan|set_auto_reload|billing_status)\b/i;
// Split `s` at every `sep` that sits outside parentheses/brackets, so "(a, b; c)" is never cut in half.
function splitTop(s, sep) {
  const out = []; let depth = 0, from = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '(' || ch === '[' || ch === '{') depth++;
    else if ((ch === ')' || ch === ']' || ch === '}') && depth > 0) depth--;
    else if (depth === 0) {
      if (sep === 'sentence') { if (/[.!?]/.test(ch) && /\s/.test(s[i + 1] || '')) { out.push(s.slice(from, i + 1)); from = i + 1; } }
      else if (s.startsWith(sep, i)) { out.push(s.slice(from, i)); from = i + sep.length; i += sep.length - 1; }
    }
  }
  out.push(s.slice(from));
  return out;
}
const PROMO_LEVELS = [['sentence', ' '], ['; ', '; '], [' · ', ' · ']];
export function stripPlanPromo(text, re = PLAN_PROMO_RE) {
  const prune = (s, levels) => {
    if (!re.test(s)) return s;
    for (let k = 0; k < levels.length; k++) {
      const [sep, join] = levels[k];
      const parts = splitTop(s, sep);
      if (parts.length < 2) continue;
      return parts.map((p) => prune(sep === 'sentence' ? p.trim() : p, levels.slice(k + 1))).filter((p) => p.trim()).join(join);
    }
    return '';
  };
  const src = String(text ?? '');
  if (!re.test(src)) return src;
  return src.split('\n').map((line) => (re.test(line) ? { line: prune(line, PROMO_LEVELS), cut: true } : { line, cut: false }))
    .filter((x) => !(x.cut && !x.line.trim())).map((x) => x.line).join('\n');
}
// A reply on a widget host, with every pitch sentence out of its text blocks (a JSON block is data and left whole) and
// out of its hints. The result object is copied, never edited in place.
export function withoutPlanPitch(r, re = PLAN_PITCH_RE) {
  if (!r || typeof r !== 'object') return r;
  let out = r;
  if (Array.isArray(r.content) && r.content.some((b) => b && b.type === 'text' && typeof b.text === 'string' && re.test(b.text) && !/^\s*[[{]/.test(b.text))) {
    out = { ...out, content: r.content.map((b) => (b && b.type === 'text' && typeof b.text === 'string' && !/^\s*[[{]/.test(b.text) ? { ...b, text: stripPlanPromo(b.text, re) } : b)) };
  }
  const h = out._meta && Array.isArray(out._meta[HINTS_KEY]) ? out._meta[HINTS_KEY] : null;
  if (h && h.some((x) => PLAN_PROMO_RE.test(`${x.do} ${x.why}`))) {
    const kept = h.filter((x) => !PLAN_PROMO_RE.test(`${x.do} ${x.why}`));
    const meta = { ...out._meta };
    if (kept.length) meta[HINTS_KEY] = kept; else delete meta[HINTS_KEY];
    out = { ...out, _meta: meta };
  }
  return out;
}
export const creditsLowHints = () => [{ do: `tell the user the account does not have enough credits for this; they can add credits or pick a plan in their Hermoso account at ${ACCOUNT_INFO_URL}, then ask again`, why: 'this host does not offer purchases, so nothing is bought from here' }];
