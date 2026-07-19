// All Hermoso MCP tools, each a thin wrapper over a real /api route (see mcp/client.mjs). Job-based renders
// (video/avatar/stitch) submit to the queue and POLL TO COMPLETION inside the tool — works in every MCP client
// (no experimental Tasks dependency) and returns the final served URL. get_job/list_jobs cover resume/inspection.
// Spend tools hit routes guarded by gateSpend → requireAuth; locally the dev account always resolves (no auth
// needed today), and the SAME guard becomes authoritative under real auth — so this honors no-anon-spend as-is.
import { z } from 'zod';
import { apiGet, apiPost, apiPut, apiSSE, submitJob, getJob, jobResult, pollJob, toRef, API_BASE, PROFILE, mcpCtx } from './client.mjs';

const JOB_TIMEOUT = +(process.env.HERMOSO_JOB_TIMEOUT_MS || 10 * 60 * 1000);
const abs = (u) => (u && u.startsWith('/') ? API_BASE + u : u); // /generated/x.mp4 → clickable absolute URL
const ok = (text, data) => ({ content: [{ type: 'text', text }], structuredContent: data ?? {} });
// Video-return variant: attaches the clip's first frame as an inline image block (Claude can't play mp4 in chat,
// but a poster makes the result VISIBLE, mirroring generate_image). Falls back to plain ok() when frames fail.
const stillMsg = (r) => `Still rendering — job ${r.jobId}. This is NORMAL: video renders take 1–3 minutes and each get_job call waits up to ~45s, so it can take several calls. Keep calling get_job with this id until status is done or error — do NOT ask the user whether to keep waiting, and do NOT re-fire the render on another model (that double-charges). Only surface a problem after ~6 minutes of polling.`;
const okVideo = async (text, r) => {
  if (r?.stillRendering) return ok(stillMsg(r), r); const p = r?.url ? await videoPosterBlock(r.url) : null; return { content: [{ type: 'text', text: p ? text + '\n(first frame attached — open the URL for the full video)' : text }, ...(p ? [p] : [])], structuredContent: r ?? {} }; };

// ── CAPABILITY MAP — the FULL agent surface, four categories. Appended to hermoso_capabilities so an agent that
// probes once learns everything Hermoso does (not just the models): ad spy, create, raw playground, account. Keep
// crisp + tool-named so the model can act on it directly. (Server-level orientation lives in MCP_INSTRUCTIONS below.)
const CAPABILITY_MAP = [
  'What Hermoso can do — the full agent surface (every tool below runs over this MCP):',
  'A) AD SPY / RESEARCH — spy on the ads already winning in any market, then mine them. find_competitors · competitor_teardown · pull_competitor_ads · research_ads (open brief) · ad libraries search_meta_ads / search_google_ads / search_linkedin_ads · organic social search_tiktok / search_instagram / search_youtube / search_reddit / search_threads · scrapecreators_fetch (any allowlisted endpoint) · mine_angles · analyze_video · check_ad_policy · list_skills / get_skill (teardowns + creative playbooks).',
  'B) CREATE — finished, on-brand image & video ads (real product composited in, copy + CTA baked). draft_brand / get_brand / use_brand · plan_ad (concept + copy) → render_ad (the Studio quality pipeline) or generate_image / generate_video / generate_avatar (UGC creators + lip-sync) · make_template_ad (native HTML ad formats) · remix_static / recast_motion / reframe_video / upscale_video / dub_video / change_voice / finish_video / fix_beat / stitch_video · plan_variations + score_ad (fan out + rank).',
  'C) RAW MODEL PLAYGROUND — direct access to the full catalog (30+ image / video / voice / writing models, each with the exact per-render credit cost shown above), no ad framing: generate_image / generate_video (useBrand:false) for plain prompt-only renders, generate_voice for raw text-to-speech against any voice engine, and generate_text for the writing models (Claude / Gemini / GPT / Llama / DeepSeek…) — all against ANY catalog id.',
  'D) ACCOUNT — hermoso_credits (balance) · billing_status (plan + your billing role) · buy_credits (one-click top-up on the saved card, or a first-purchase checkout link) · upgrade_plan / set_auto_reload (admin) · list_jobs / get_job (track async renders).',
].join('\n');

// Server-level `instructions` (initialize response — injected into the model's context by the client). Denser than
// the capability map: it names the three jobs + the same four categories so a freshly-connected agent immediately
// knows the breadth. Exported so BOTH the stdio server (hermoso-mcp.mjs) and the hosted connector (http.mjs) share one
// source of truth. Kept parity across mcp/ and cli/mcp/ (the npm copy).
export const MCP_INSTRUCTIONS = [
  'Hermoso is an AI ad studio you drive over MCP — use it for three jobs: (1) AD SPY / research the ads already winning in any market, (2) CREATE finished on-brand image & video ads, and (3) run RAW generations against the full model catalog. Call hermoso_capabilities FIRST (free) to learn valid model ids + exact credit costs. Capability map:',
  '• AD SPY / RESEARCH: find_competitors, competitor_teardown, pull_competitor_ads, research_ads; ad libraries search_meta_ads / search_google_ads / search_linkedin_ads; organic search_tiktok / search_instagram / search_youtube / search_reddit / search_threads; scrapecreators_fetch; mine_angles; analyze_video; check_ad_policy; list_skills / get_skill.',
  '• CREATE (finished ads): draft_brand → plan_ad → render_ad (Studio quality pipeline) or generate_image / generate_video / generate_avatar; make_template_ad (native HTML formats); remix_static / recast_motion / reframe_video / upscale_video / dub_video / change_voice / finish_video / fix_beat / stitch_video; plan_variations + score_ad.',
  '• RAW MODEL PLAYGROUND: generate_image / generate_video (useBrand:false) for prompt-only renders, generate_voice for text-to-speech, generate_text for the writing models — against any of 30+ image / video / voice / writing model ids (exact costs in hermoso_capabilities), no ad framing.',
  '• ACCOUNT: hermoso_credits, billing_status, buy_credits (one-click top-up / first-purchase link), upgrade_plan / set_auto_reload (admin), list_jobs / get_job.',
  'No anonymous spend — tools/call needs a bearer. Out of credits → buy_credits: with a saved card + admin rights it one-click charges after an explicit confirm:true (state the exact price first); the FIRST purchase is a Stripe link your human pays, which saves the card. Always report the final media URL to the user.',
].join('\n');
// Inline the finished image so Claude RENDERS it in chat instead of just linking it (MCP image content block).
// Skipped silently for huge files / fetch errors — the URL in the text always works.
// Claude can't play video inline — attach the FIRST FRAME as an image block next to the link so the spot is
// visible in chat (0 credits; ffmpeg still via /api/video/frames).
async function videoPosterBlock(videoUrl) {
  try {
    const d = await apiGet('/api/video/frames', { url: videoUrl, n: 1 });
    const f = (d.frames || [])[0]; if (!f || !/^data:image\//.test(f)) return null;
    const [head, b64] = f.split(',');
    return { type: 'image', data: b64, mimeType: head.slice(5).split(';')[0] };
  } catch (e) { console.error('[mcp] video poster failed:', String(e?.message || e).slice(0, 160)); return null; } // silent-null keeps the link usable; log so a missing poster is diagnosable (Dave hit this on Claude.ai)
}
async function imageBlock(url) {
  try {
    const r = await fetch(url); if (!r.ok) return null;
    const ct = (r.headers.get('content-type') || 'image/jpeg').split(';')[0];
    if (!/^image\//.test(ct)) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > 1_400_000) return null;
    return { type: 'image', data: buf.toString('base64'), mimeType: ct };
  } catch { return null; }
}
const wrap = (fn) => async (args, extra) => {
  try { return await fn(args, extra); }
  catch (e) {
    let msg = `Error: ${e?.message || e}`;
    // credit outages need an actionable path the agent can relay — the web app has a top-up gate; here the URL is it
    if (/not enough credits/i.test(msg)) msg += `\nRun buy_credits to top up (credit packs): with a saved card it quotes then one-click charges on confirm:true; with no card yet it returns a checkout link your human pays once (the card saves for one-click after). billing_status shows your balance, plan + billing role; if you're an admin, upgrade_plan moves to a bigger monthly plan (a person pays on Stripe). hermoso_credits shows the balance; hermoso_capabilities lists per-model credit costs.`;
    return { content: [{ type: 'text', text: msg }], isError: true };
  }
};

// run a job to completion, surfacing the served media URL. Under the HOSTED connector (Claude.ai/ChatGPT) the
// client kills long tool calls before a 1-3 min render finishes — so cap the in-call wait there and return a
// RESUMABLE handle instead of dying (the agent polls get_job, which now attaches the poster on done).
async function renderJob(type, input, label) {
  const job = await submitJob(type, input, { label });
  const remote = !!mcpCtx.getStore(); // AsyncLocalStorage ctx only exists on the remote transport
  try {
    const { result } = await pollJob(job.id, { timeoutMs: remote ? 45_000 : JOB_TIMEOUT });
    const url = abs(result?.video || result?.image || result?.url);
    return { jobId: job.id, url, model: result?.model || null, raw: result };
  } catch (e) {
    if (remote && e?.jobId) return { jobId: job.id, url: null, stillRendering: true, raw: null }; // not an error — resume via get_job
    throw e;
  }
}

// Shared outputSchema fields for the job-based render tools (the renderJob result that becomes structuredContent).
// Every field is optional so validation can never fail on a sparse or still-rendering result.
const JOB_OUT = {
  jobId: z.string().optional().describe('the render job id — poll get_job with this id to resume or inspect'),
  url: z.string().nullable().optional().describe('the served URL of the finished media (absent/null while still rendering)'),
  model: z.string().nullable().optional().describe('the product-facing label of the model that rendered it'),
  raw: z.any().optional().describe('the raw job result payload (e.g. images[] for carousel template ads)'),
  stillRendering: z.boolean().optional().describe('true when the render is still in progress — keep polling get_job with jobId'),
};

export function registerTools(server) {
  // ---------- read-only / discovery ----------
  server.registerTool('hermoso_capabilities', {
    title: 'Hermoso capabilities',
    description: 'Probe what this Hermoso account can do RIGHT NOW: available image/video model ids + their exact credit costs, aspect ratios, video durations, the recipe ids, and the canEdit/canAvatar/canPublish flags. Call this FIRST so you generate with valid model ids and known costs. Read-only, free.',
    inputSchema: {}, outputSchema: {
      image: z.any().optional().describe('the default image provider label, or null when image generation is unavailable'),
      video: z.any().optional().describe('the default video provider label, or null when video generation is unavailable'),
      canEdit: z.boolean().optional().describe('whether image editing is enabled on this account'),
      canAvatar: z.boolean().optional().describe('whether talking-avatar generation is enabled'),
      canPublish: z.boolean().optional().describe('whether ad publishing is enabled'),
      editCredits: z.number().optional().describe('credit cost of one image edit'),
      options: z.any().optional().describe('the live model catalog — image/video/voice/llm model lists with per-model credit costs'),
      recipes: z.array(z.any()).optional().describe('the creative recipe catalog (id + label per recipe)'),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, wrap(async () => {
    const d = await apiGet('/api/generate/status');
    const img = (d.options?.image?.models || []).map(m => `${m.id} (${m.label}, ${m.credits}cr${m.refs ? `, ≤${m.refs.max} reference images` : ''}${m.hiRes ? ', 2K' : ''}${m.best ? ', best' : ''})`).join('; ');
    // durations + per-duration credits MATTER: without them agents assume the generic "AI video caps at 8-10s"
    // prior and wrongly steer users to stitching (a real Claude.ai session did exactly that on a 15s ad)
    const vid = (d.options?.video?.models || []).map(m => `${m.id} (${m.label}: one continuous clip of ${(m.durations || []).map(x => `${x}s=${m.credits?.[x] ?? '?'}cr`).join(' ')}${m.audio ? ', native audio' : ', silent'}${m.refs ? `, ${m.refs.max} reference image${m.refs.max === 1 ? '' : 's'}${m.refs.required ? ' (required — image-to-video only)' : ''}` : ''}${m.resolutions ? `, resolutions ${m.resolutions.join('/')}` : ''}${m.best ? ', best' : ''})`).join('; ');
    // voice engines (generate_voice) + writing models (generate_text) — so the RAW PLAYGROUND is usable from one probe
    const voice = d.options?.voice ? (d.options.voice.engines || []).map(e => `${e.id} (${e.label}: ${(e.voices || []).slice(0, 6).join('/')}${(e.voices || []).length > 6 ? '…' : ''}, ${e.creditsPer1k}cr/1k chars)`).join('; ') : 'unavailable';
    const llm = d.options?.llm ? (d.options.llm.models || []).map(m => `${m.id} (${m.label})`).join('; ') : 'unavailable';
    const text = `Image: ${d.image ? img : 'unavailable'}\nVideo: ${d.video ? vid : 'unavailable'}\nIMPORTANT: durations above are SINGLE-PASS — e.g. seedance-2 renders a full multi-beat 15s ad in ONE generation (do NOT assume a generic 8–10s cap, and do NOT stitch for ≤15s spots; stitching is only for longer). durationSeconds must be one of the model's listed values.\nVoice engines (generate_voice): ${voice}\nWriting models (generate_text): ${llm}\ncanEdit:${d.canEdit} canAvatar:${d.canAvatar} canPublish:${d.canPublish}\nRecipes (${(d.recipes || []).length}): ${(d.recipes || []).slice(0, 20).map(r => r.id).join(', ')}…\n\n${CAPABILITY_MAP}`;
    return ok(text, d);
  }));

  server.registerTool('hermoso_credits', {
    title: 'Credit balance',
    description: 'Return the account credit balance, credits used this session, and recent priced calls. Check before kicking off paid generation.',
    inputSchema: {}, outputSchema: {
      accountBalance: z.number().nullable().optional().describe('the account’s Hermoso credit balance (authoritative when authed)'),
      balance: z.number().optional().describe('raw vendor meter balance (operator/local-dev surface)'),
      sessionStart: z.number().nullable().optional().describe('vendor balance at session start (operator surface)'),
      sessionUsed: z.number().optional().describe('credits used this session'),
      recentCalls: z.array(z.any()).optional().describe('recent priced calls with their credit deltas'),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, wrap(async () => {
    const d = await apiGet('/api/credits');
    const bal = d.accountBalance ?? d.balance; // accountBalance = the caller's Hermoso credits (authed); balance = the local-dev usage pill
    return ok(`Balance: ${bal} credits${d.sessionUsed != null ? ` · session used: ${d.sessionUsed}` : ''}`, d);
  }));

  // AGENT BILLING: out of credits → top up. With a saved card + billing-admin rights this is the SAME one-click
  // off-session charge the web app's Add-credits button uses (explicit confirm:true required — an agent states the
  // exact charge before any money moves). First-ever purchase (no card on file) goes through a Stripe checkout link
  // the human pays once — that card then saves for one-click forever. Packs only — subscriptions are in-app.
  server.registerTool('buy_credits', {
    title: 'Buy credits',
    description: "Out of credits? Top up with a credit PACK. Call with no argument to list the available packs (id · credits · price). If the account has a saved card and you have billing-admin rights, calling with `pack` quotes the exact charge and calling again with confirm:true charges the saved card instantly (same one-click top-up as the app — no redirect). If there's no saved card yet, you get a Stripe checkout URL to hand your human for the FIRST purchase; their card saves for one-click after that. Packs only; subscriptions are managed by a person in Settings → Billing.",
    inputSchema: {
      pack: z.string().optional().describe('the pack id to buy (e.g. pack-2k) — omit to list the available packs first'),
      confirm: z.boolean().optional().describe('set true to actually charge the saved card for `pack` (required for the one-click charge; ignored on the checkout-link path)'),
    },
    outputSchema: {
      packs: z.array(z.any()).optional().describe('available credit packs ({id, credits, priceUsd}) when listing'),
      quote: z.any().optional().describe('the one-click charge quote ({packId, credits, priceUsd, card}) awaiting confirm:true'),
      ok: z.boolean().optional().describe('true when a one-click top-up charge succeeded'),
      credits: z.number().optional().describe('credits added by a completed top-up (or bought by the checkout link)'),
      url: z.string().optional().describe('Stripe checkout URL for a first purchase (no saved card yet)'),
      amountUsd: z.number().optional().describe('USD amount of the checkout link'),
      packId: z.string().optional().describe('the pack id the checkout link buys'),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true }, // confirm:true charges the saved card (one-click top-up); link path charges nothing
  }, wrap(async ({ pack, confirm }) => {
    const cfg = await apiGet('/api/billing/config');
    const packs = (cfg.packs || []).map(p => ({ id: p.id, credits: p.credits, priceUsd: p.priceUsd }));
    if (!pack) {
      const lines = packs.map(p => `• ${p.id} — ${p.credits.toLocaleString()} credits · $${p.priceUsd}`).join('\n') || '(no packs configured)';
      return ok(`Credit packs you can buy:\n${lines}\n\nCall buy_credits again with pack="<id>". With a saved card it's a one-click charge (you'll be asked to confirm); otherwise you get a checkout link for your human.`, { packs });
    }
    const match = packs.find(p => p.id === pack);
    if (!match) return ok(`No pack "${pack}". Available: ${packs.map(p => p.id).join(', ') || '(none)'}. Call buy_credits with no argument to see details.`, { packs });
    let st = null;
    try { st = await apiGet('/api/billing/status'); } catch {}
    if (st?.paymentMethodOnFile && st?.isAdmin) {
      const card = st.card ? `${st.card.brand} ····${st.card.last4}` : 'the saved card';
      if (!confirm) return ok(`Ready to charge ${card} $${match.priceUsd} for ${match.credits.toLocaleString()} credits (one-click, no redirect — same as the app's Add credits button). Confirm with your human if they haven't already asked for this, then call buy_credits again with pack="${match.id}" and confirm:true.`, { quote: { packId: match.id, credits: match.credits, priceUsd: match.priceUsd, card: st.card || null } });
      const d = await apiPost('/api/billing/topup', { packId: match.id, idempotencyKey: (globalThis.crypto?.randomUUID?.() || String(Date.now())) });
      return ok(`Done — charged ${card} $${match.priceUsd}; ${match.credits.toLocaleString()} credits are on the account now. (Receipt lands in Settings → Billing → invoice history.)`, d);
    }
    const d = await apiPost('/api/billing/checkout-link', { packId: pack });
    return ok(`Checkout link for ${match.credits.toLocaleString()} credits ($${d.amountUsd ?? match.priceUsd}):\n${d.url}\n\nGive this URL to your human to pay on Stripe's secure page — credits post automatically once payment completes, and their card saves for one-click top-ups (in-app AND via this tool) from then on. Nothing is charged until they pay.`, d);
  }));

  // BILLING SURFACE (read → top-up → plan/auto-reload): hermoso_credits (balance) → buy_credits (top-up link) →
  // billing_status (full picture + your role) → upgrade_plan / set_auto_reload (admin-only, pay-on-Stripe / in-app).
  server.registerTool('billing_status', {
    title: 'Billing status',
    description: "Show this account's billing at a glance: current plan (id + label + monthly price), credit balance, whether auto-reload is on, whether a card is on file, and whether YOU (this key) have ADMIN rights to change billing. Read-only, free. Call it before upgrade_plan / set_auto_reload to know what's possible — members have read-only billing.",
    inputSchema: {}, outputSchema: {
      plan: z.any().optional().describe('the current plan ({id, label, monthlyUsd})'),
      balanceCredits: z.number().optional().describe('the current credit balance'),
      autoReload: z.any().optional().describe('auto-reload config ({enabled, thresholdCredits, reloadCredits, available})'),
      paymentMethodOnFile: z.boolean().optional().describe('whether a card is saved for one-click charges'),
      card: z.any().optional().describe('the saved card ({brand, last4}) when present'),
      role: z.string().optional().describe('this key’s billing role (admin/member)'),
      isAdmin: z.boolean().optional().describe('whether this key can change billing'),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, wrap(async () => {
    const d = await apiGet('/api/billing/status');
    const ar = d.autoReload || {};
    const arLine = ar.available === false ? 'set in the app (not via API)' : (ar.enabled ? `on (below ${ar.thresholdCredits} cr → +${ar.reloadCredits} cr)` : 'off');
    const text = `Plan: ${d.plan?.label} ($${d.plan?.monthlyUsd}/mo)\nBalance: ${d.balanceCredits} credits\nAuto-reload: ${arLine}\nCard on file: ${d.paymentMethodOnFile ? `yes${d.card ? ` (${d.card.brand} ····${d.card.last4})` : ''}` : 'no'}\nYour billing role: ${d.role}${d.isAdmin ? ' — you can change the plan / auto-reload' : ' — read-only; ask an admin to change the plan or auto-reload'}`;
    return ok(text, d);
  }));

  // AGENT BILLING HANDOFF (plans): mint a ready-to-pay Stripe SUBSCRIPTION link for a NEW subscriber; existing-sub
  // changes + downgrades are made in-app (the tool returns exactly what to do). Admin-only; a human always pays.
  server.registerTool('upgrade_plan', {
    title: 'Upgrade plan',
    description: "Change this account's SUBSCRIPTION plan (admin only). Call with no argument to list the plans (id · monthly price · monthly credits); call again with `plan` set to a plan id. A NEW subscriber gets a ready-to-pay Stripe Checkout URL to hand your human — THEY pay on Stripe (agents never spend money directly). If the account already has a paid plan, or you're DOWNGRADING, the change is made by a person in the app (Settings → Billing) and the tool returns exactly what to do. Members (read-only billing) get an honest 'ask an admin' message. Nothing is charged until your human pays.",
    inputSchema: {
      plan: z.string().optional().describe('the plan id to move to (e.g. pro) — omit to list the available plans first'),
      period: z.enum(['mo', 'yr']).optional().describe('billing cadence — monthly (default) or yearly (2 months free)'),
    },
    outputSchema: {
      plans: z.array(z.any()).optional().describe('available paid plans ({id, name, priceUsd, credits}) when listing'),
      mode: z.string().optional().describe("'checkout' (a Stripe URL was minted) or 'in_app' (a person makes the change in the app)"),
      url: z.string().optional().describe('the ready-to-pay Stripe Checkout URL (checkout mode)'),
      plan: z.string().optional().describe('the target plan id'),
      planLabel: z.string().optional().describe('the target plan display name'),
      monthlyUsd: z.number().optional().describe('the plan’s monthly price in USD'),
      chargeUsd: z.number().optional().describe('the actual charge amount (yearly billing charges the annual total)'),
      period: z.string().optional().describe("billing cadence of the link — 'mo' or 'yr'"),
      action: z.string().optional().describe("the in-app action required ('upgrade' or 'downgrade')"),
      guidance: z.string().optional().describe('exact instructions when the change must be made in the app'),
    },
    annotations: { readOnlyHint: true, openWorldHint: true }, // creates no server-side charge; the human pays on Stripe / in-app
  }, wrap(async ({ plan, period }) => {
    const cfg = await apiGet('/api/billing/config');
    const plans = (cfg.plans || []).filter(p => p.priceUsd > 0).map(p => ({ id: p.id, name: p.name, priceUsd: p.priceUsd, credits: p.credits }));
    if (!plan) {
      const lines = plans.map(p => `• ${p.id} — ${p.name}: $${p.priceUsd}/mo · ${p.credits.toLocaleString()} credits/mo`).join('\n') || '(no plans configured)';
      return ok(`Subscription plans:\n${lines}\n\nCall upgrade_plan again with plan="<id>" (admin only). Downgrades + changes for existing subscribers are made in the app.`, { plans });
    }
    const d = await apiPost('/api/billing/plan-link', { planId: plan, period });
    if (d.mode === 'checkout') return ok(`Checkout link for the ${d.planLabel} plan ($${d.monthlyUsd}/mo${d.period === 'yr' ? `, billed $${d.chargeUsd}/yr` : ''}):\n${d.url}\n\nGive this URL to your human to subscribe on Stripe's secure page. Nothing is charged until they pay.`, d);
    return ok(d.guidance, d); // in_app — an existing-subscriber upgrade or a downgrade (done by a person in the app)
  }));

  // Standing auto-reload config — a REAL server-side write now (persists on the account + fires even with no app open).
  // Admin-only; requires a card on file (added ONCE in the app, then agents manage top-ups/auto-reload/plan links fully).
  server.registerTool('set_auto_reload', {
    title: 'Set auto-reload',
    description: "Turn automatic credit reloads on or off (admin only): when the balance drops below a threshold, the card on file is charged for a top-up pack — SERVER-SIDE, even with no app open. Requires a saved card, added once in the app at first checkout/top-up; if there's none the tool tells you exactly where to add it. After that one-time card setup, agents can manage auto-reload, top-ups and plan links fully. Members (read-only billing) get an 'ask an admin' message.",
    inputSchema: {
      enabled: z.boolean().describe('true to turn auto-reload on, false to turn it off'),
      thresholdCredits: z.number().int().optional().describe('reload when the balance drops below this many credits'),
      reloadCredits: z.number().int().optional().describe('how many credits to add each reload — must match a credit pack size (see buy_credits)'),
    },
    outputSchema: {
      applied: z.boolean().optional().describe('whether the auto-reload config was applied'),
      needsCard: z.boolean().optional().describe('true when there is no saved card yet (add one in the app first)'),
      enabled: z.boolean().optional().describe('the resulting auto-reload state'),
      thresholdCredits: z.number().nullable().optional().describe('reload triggers below this balance'),
      reloadCredits: z.number().nullable().optional().describe('credits added per reload'),
      reloadPack: z.any().optional().describe('the pack charged on each reload'),
      capUsd: z.any().optional().describe('monthly auto-reload spend cap in USD, if set'),
      status: z.string().optional().describe('auto-reload status detail'),
      guidance: z.string().optional().describe('instructions when the change must be made in the app'),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, wrap(async ({ enabled, thresholdCredits, reloadCredits }) => {
    const d = await apiPost('/api/billing/autoreload-config', { enabled, thresholdCredits, reloadCredits });
    if (d.needsCard) return ok(d.guidance || 'Add a card on file first (in the app), then auto-reload can use it.', d);
    if (d.applied) return ok(`Auto-reload ${d.enabled ? `ON — reloads${d.reloadCredits != null ? ' +' + d.reloadCredits.toLocaleString() + ' credits' : ''} when the balance drops below ${d.thresholdCredits} credits` : 'OFF'}.`, d);
    return ok(d.guidance || 'Manage auto-reload in the app: Settings → Billing → Auto-reload.', d);
  }));

  server.registerTool('list_brands', {
    title: 'List brands',
    description: "List every brand on this account (id + name) and which one this connection currently acts on. Multi-brand accounts: call this, then use_brand to switch. Read-only, free.",
    inputSchema: {}, outputSchema: {
      brands: z.array(z.any()).optional().describe('every brand on the account ({id, name, active})'),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, wrap(async () => {
    const d = await apiGet('/api/brands');
    const lines = (d.brands || []).map(b => `• ${b.name} (id: ${b.id})${b.active ? '  ← active' : ''}`).join('\n');
    return ok(`Brands on this account:\n${lines}\n\nSwitch with use_brand.`, d);
  }));

  server.registerTool('use_brand', {
    title: 'Switch brand',
    description: "Pin which brand this connection generates for (multi-brand accounts). Pass the brand id or exact name from list_brands. Persists for this API key until changed.",
    inputSchema: { brand: z.string().describe('brand id (e.g. default / p_xxx) or its exact name from list_brands') },
    outputSchema: {
      ok: z.boolean().optional().describe('true when the brand switch persisted'),
      brand: z.any().optional().describe('the now-active brand ({id, name})'),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, wrap(async ({ brand }) => {
    const d = await apiGet('/api/brands');
    const want = String(brand || '').trim().toLowerCase();
    const hit = (d.brands || []).find(b => b.id.toLowerCase() === want || String(b.name || '').toLowerCase() === want);
    if (!hit) return { content: [{ type: 'text', text: `No brand matching "${brand}". Available:\n${(d.brands || []).map(b => `• ${b.name} (id: ${b.id})`).join('\n')}` }], isError: true };
    await apiPost('/api/keys/brand', { profileId: hit.id });
    return ok(`Now acting on ${hit.name} (${hit.id}) — brand, memory, renders and Library all scope to it.`, { ok: true, brand: hit });
  }));

  // ---------- planning (LLM, 0 SC credits) ----------
  server.registerTool('plan_ad', {
    title: 'Plan an ad concept',
    description: 'Creative director: turn a brand + product/brief into a finished ad CONCEPT — copy variants (headline/primary/cta) plus an image_concept.prompt OR a video_storyboard, with the resolved recipe + the model ids to render with. Renders nothing; chain its output into generate_image / generate_video. Spends LLM tokens, 0 ScrapeCreators credits.',
    inputSchema: {
      brand: z.union([z.string(), z.object({}).passthrough()]).optional().describe('brand name, or a brand profile object {name,domain,category,palette,products,…}. OMIT to use the workspace’s SAVED brand + memory automatically (see get_brand); use draft_brand to onboard a new one'),
      product: z.string().describe('what to advertise + any angle/offer the user specified'),
      format: z.enum(['auto', 'image', 'video']).optional().describe("'image', 'video', or 'auto' when unspecified"),
      recipe: z.string().optional().describe('a recipe id from hermoso_capabilities to force an archetype'),
      reference: z.string().optional().describe('a reference ad URL to remix the angle from — Facebook Ad Library, LinkedIn Ad Library or Google Ads Transparency links (the real ad’s copy/advertiser are fetched and fed into the concept)'),
      language: z.string().optional().describe('output language for the ad copy (e.g. Spanish) — default English'),
    },
    outputSchema: {
      format: z.string().optional().describe("the resolved creative format — 'image' or 'video'"),
      concept: z.string().optional().describe('the one-line creative concept'),
      recipe: z.string().optional().describe('the resolved recipe id'),
      recipe_label: z.string().optional().describe('the resolved recipe display name'),
      copy: z.array(z.any()).optional().describe('copy variants ({headline, primary, cta})'),
      image_concept: z.any().optional().describe('the render-ready image concept (prompt etc.) when format is image'),
      video_storyboard: z.any().optional().describe('the timed storyboard (scenes, cta, music) when format is video'),
      render_plan: z.any().optional().describe('the routing plan (structure/duration) render_ad honors'),
      imodel: z.string().optional().describe('the image model id to render with'),
      vmodel: z.string().optional().describe('the video model id to render with'),
      brand: z.any().optional().describe('the brand grounding embedded in the creative (name, logo, palette, productImages)'),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, wrap(async ({ brand, product, format = 'auto', recipe, reference, language }) => {
    const brandObj = brand ? (typeof brand === 'string' ? { name: brand } : brand) : null; // null → the server hydrates the workspace's saved brand/memory/taste
    const d = await apiPost('/api/create', { brand: brandObj, product, format, recipe: recipe || '', reference: reference ? { url: reference } : null, language: language || '' });
    const c = d.creative || d;
    // EMBED THE PLAN'S OWN BRAND in the creative (2026-07-17: a multi-brand caller planned Fly By Jing but render_ad
    // grounded on the account's SAVED brand — the video shipped with the WRONG brand's packshots and end lockup).
    // /api/render/assemble prefers creative.brand, so "pass plan_ad's full output" now carries the right grounding.
    if (brandObj && !c.brand) c.brand = { name: brandObj.name || '', domain: brandObj.domain || '', logo: brandObj.logo || '', sells: brandObj.sells || '', palette: (brandObj.palette || []).slice(0, 4), productImages: (brandObj.productImages || []).slice(0, 4) };
    const text = `Concept (${c.format}${c.recipe_label ? ' · ' + c.recipe_label : ''}): "${c.concept}"\nHeadline: ${c.copy?.[0]?.headline || ''}\nRender model: ${c.format === 'video' ? c.vmodel : c.imodel || '—'}. Next: ${c.format === 'video' ? 'call render_ad with THIS ENTIRE creative object (Studio quality pipeline; a ≤15s storyboard renders as ONE single-pass clip, a longer plan renders as stitched acts automatically — never hand-stitch)' : 'generate_image with the image_concept.prompt'}.`;
    return ok(text, c);
  }));

  // ---------- image (synchronous) ----------
  server.registerTool('generate_image', {
    title: 'Generate ad image',
    description: 'Render a finished ad IMAGE and return its served URL. refImages (local paths or URLs) force product-accurate compositing (drops a real product into the scene). MULTI-BRAND CAUTION: useBrand hydration pulls the SAVED workspace brand — when working a brand that is NOT the saved one (a fresh draft_brand), pass that brand\'s own productImages/logo as refImages (and useBrand:false) or the output composites the WRONG brand\'s product. model = a catalog id from hermoso_capabilities (omit for the default). Fast (seconds). Spends credits.',
    inputSchema: {
      prompt: z.string().describe('the full image prompt — subject, composition, lighting, and any on-image ad text'),
      refImages: z.array(z.string()).optional().describe('local file paths or URLs of product/logo references to composite in'),
      useBrand: z.boolean().optional().describe('default true: with no refImages, the server hydrates the SAVED brand’s product/logo references so the output lands on-brand; pass false for a pure prompt-only render'),
      aspectRatio: z.string().optional().describe("e.g. '1:1', '9:16', '16:9'"),
      model: z.string().optional().describe('image model id from hermoso_capabilities'),
      imageSize: z.string().optional().describe('pixel-size preset for models that support it (e.g. 1K/2K) — omit for the default'),
    },
    outputSchema: {
      image: z.string().optional().describe('the served absolute URL of the finished image'),
      model: z.string().optional().describe('the product-facing label of the model that rendered it'),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, wrap(async ({ prompt, refImages, useBrand, aspectRatio, model, imageSize }) => {
    const refs = refImages?.length ? (await Promise.all(refImages.map(toRef))).filter(Boolean) : undefined;
    const d = await apiPost('/api/generate/image', { prompt, refImages: refs, useBrand: useBrand !== false, aspectRatio, model, imageSize }); // explicit boolean so the server's saved-brand hydration default is unambiguous
    const img = await imageBlock(abs(d.image)); // show the actual creative inline in Claude, not just a URL
    return { content: [{ type: 'text', text: `Image ready: ${abs(d.image)}${d.model ? `  (${d.model})` : ''}` }, ...(img ? [img] : [])], structuredContent: { ...d, image: abs(d.image) } };
  }));

  // ---------- raw playground: voice (TTS) + writing models ----------
  server.registerTool('generate_voice', {
    title: 'Generate voiceover',
    description: "RAW text-to-speech from the voice-model catalog: speak a script in a chosen voice and return the served MP3 URL. For a standalone voiceover / narration clip — NOT for adding audio to a video (render_ad and generate_video voice their own spots; change_voice re-voices a finished clip). engine picks the voice model (default 'seed-audio'; also 'eleven-v3', 'minimax-speech', 'kokoro'); voice is a preset name from that engine (see hermoso_capabilities → voice engines). Paid (a couple of credits by length; ≤900 characters).",
    inputSchema: {
      text: z.string().describe('the script to speak (≤900 characters)'),
      engine: z.string().optional().describe("voice-engine id: 'seed-audio' (default), 'eleven-v3', 'minimax-speech', or 'kokoro' — listed in hermoso_capabilities"),
      voice: z.string().optional().describe("a voice preset from the chosen engine (e.g. 'Aria'/'George' on eleven-v3, 'stokie_en' on seed-audio) — omit for the engine default"),
    },
    outputSchema: {
      audio: z.string().optional().describe('the served absolute URL of the MP3 voice clip'),
      voice: z.string().optional().describe('the voice preset used'),
      model: z.string().optional().describe('the voice engine label'),
      creditsUsed: z.number().optional().describe('credits billed for this clip'),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, wrap(async ({ text, engine, voice }) => {
    const d = await apiPost('/api/generate/voice', { text, ...(engine ? { engine } : {}), ...(voice ? { voice } : {}) });
    return ok(`Voice clip ready — ${d.voice}${d.model ? ` · ${d.model}` : ''}: ${abs(d.audio)}`, { ...d, audio: abs(d.audio) });
  }));

  server.registerTool('generate_text', {
    title: 'Generate text',
    description: "RAW text generation against the writing-model catalog (Claude, Gemini, GPT, Llama, DeepSeek…) — ad copy, hooks, scripts, rewrites, brainstorms. Prompt-only, no ad assembly (for a finished on-brand creative use plan_ad → render_ad). model = a writing-model id from hermoso_capabilities (omit for the default Claude orchestrator). Paid (a credit or two by length).",
    inputSchema: {
      prompt: z.string().describe('the writing task / question'),
      model: z.string().optional().describe('a writing-model id from hermoso_capabilities (a Claude / Gemini / GPT / Llama / DeepSeek id) — omit for the default'),
    },
    outputSchema: {
      text: z.string().optional().describe('the generated text'),
      model: z.string().optional().describe('the writing model label'),
      creditsUsed: z.number().optional().describe('credits billed for this generation'),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, wrap(async ({ prompt, model }) => {
    const d = await apiPost('/api/models/llm', { prompt, ...(model ? { model } : {}) });
    return ok(`${d.text}${d.model ? `\n\n— ${d.model}` : ''}`, d);
  }));

  // ---------- video / avatar / stitch (job-based, polled to completion) ----------
  server.registerTool('render_ad', {
    title: 'Render ad video',
    description: 'RECOMMENDED for finished video ADS: render a plan_ad concept through the SAME quality pipeline as the Hermoso web Studio — timed shot list, exact/clean speech (no garbled words), text composited in post (never model-painted), brand end card, licensed music bed, real product references. Pass plan_ad’s full structured output as `creative`. Honors the plan’s render_plan structure/duration: a ≤15s storyboard renders as ONE single-pass clip; a longer plan automatically renders as STITCHED ACTS (fewest balanced ≤15s clips) — never time-compressed into one clip. Renders take 1–3 min; keep polling get_job if it returns still-rendering. Spends credits.',
    inputSchema: {
      creative: z.object({}).passthrough().describe('the FULL structured output of plan_ad (must contain video_storyboard)'),
      model: z.string().optional().describe('video model id from hermoso_capabilities (default: the plan’s pick). Naming one is a DELIBERATE pick — the server asks before ever swapping it (no silent fallback)'),
      durationSeconds: z.number().optional().describe('total ad length in seconds — omit to honor the plan’s own duration'),
      aspectRatio: z.string().optional().describe('output aspect ratio, e.g. 9:16 (default) / 1:1 / 16:9'),
      resolution: z.enum(['480p', '720p', '1080p', '4k']).optional().describe("'720p' default; '480p' = cheap fast draft pass, '1080p'/'4k' = premium final delivery (more credits)"),
      captions: z.boolean().optional().describe('composited caption pills on/off (default: the recipe decides)'),
      endCard: z.boolean().optional().describe('branded end card on/off (default: on, except organic recipes)'),
      music: z.boolean().optional().describe('licensed music bed on/off (default on)'),
      lockup: z.boolean().optional().describe('persistent brand-logo lockup overlay on/off'),
      ttsVoice: z.string().optional().describe('voiceover voice name (e.g. Rachel / George) when the plan voices over'),
      dryRun: z.boolean().optional().describe('return the routing decision (single pass vs stitched acts, resolved model + act lengths) WITHOUT submitting a render — free, nothing charged'),
    },
    outputSchema: {
      ...JOB_OUT,
      dryRun: z.boolean().optional().describe('true when this was a dry run (no job submitted, nothing charged)'),
      jobType: z.string().optional().describe("the routing decision — 'video' (single pass) or 'stitch' (acts)"),
      input: z.any().optional().describe('the assembled render input (dry run only — resolved model, duration, scenes)'),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, wrap(async (a) => {
    const { input, jobType, notes } = await apiPost('/api/render/assemble', a); // a passes wholesale — resolution/captions/endCard/music/lockup/ttsVoice ride the body
    // LAW 8: render_ad honors render_plan.structure/duration — a >single-clip creative assembles as stitched ACTS
    // (jobType 'stitch': the server packs the scenes into the fewest balanced ≤model-max acts via the shared
    // acts-packing.mjs) instead of the old silent clamp that time-compressed a 30s board into one 15s clip.
    if (a.dryRun) return ok(`DRY RUN — routing decision (no job submitted, nothing charged): jobType=${jobType || 'video'}, model=${input.model}, durationSeconds=${input.durationSeconds}${Array.isArray(input.scenes) ? `, acts=[${input.scenes.map(s => Math.round(s.seconds * 10) / 10).join(', ')}]s` : ' (single pass)'}${input.modelExplicit ? ', modelExplicit (ask-don’t-swap)' : ''}.\n${notes || ''}`, { dryRun: true, jobType: jobType || 'video', input });
    const r = await renderJob(jobType === 'stitch' ? 'stitch' : 'video', input, 'MCP ad render');
    return okVideo(`Ad video ready: ${r.url}${r.model ? `  (${r.model})` : ''}  [job ${r.jobId}]\n${notes || ''}`, r);
  }));


  server.registerTool('make_template_ad', {
    title: 'Make template ad',
    description: "Render a NATIVE-STYLE TEMPLATE ad from pure HTML — no AI video/image model in the loop, renders in ~30 seconds for a couple of credits. Perfect for native-feel social ads at volume. YOU author the content (short, casual, believable — never marketing-speak). Templates (pass as config.template): 'imessage-chat' (VIDEO ~15s: a real-looking iMessage thread where a friend reveals the product as a rich-link card; config: { thread: { contactName, messages: [{from:'them'|'me', text?, product?:{image,title,domain}}] }, theme?:'dark'|'light', endCard:{headline,cta,domain,logo?,color} } — 4-6 short lowercase bubbles, product card mid-thread from 'me', 1-2 excited replies after); 'chatgpt-chat' (VIDEO: a ChatGPT answer streams the punchline; config: { question, answer (may **bold** the brand), productImage?, endCard }); 'apple-notes' (VIDEO: an iPhone note types itself out; config: { title, lines: string[], theme?, endCard }); 'value-prop' (VIDEO ~17s kinetic typography: config: { hook (≤40 chars), claims: string[] (3-5 COMPLETE phrases, ≤6 words / ≤34 chars each — a finished thought, NEVER a clipped clause like 'Looks good on any'), productImages: string[] (2-3 DISTINCT photos — one rotates per card), palette: string[], endCard }); 'static-mockup' (IMAGE: config: { style:'imessage'|'notes'|'card', size?:{w,h}, ...style fields }); 'airdrop-carousel' (VIDEO ~10s: an iOS AirDrop share card springs up and cycles 3-16 REAL product photos to a full-lineup payoff; config: { brandName, products: [{image, title?}], contactLine?, endCard }); 'app-ui-tour' (VIDEO ~12-16s for APP brands: floating-iPhone mockup walks through REAL app screenshots with kinetic captions; config: { hook?, appName, iconImage?, beats: [{screenImage, caption}] (2-6), palette?, fontStack?, endCard }); 'imessage-cascade' (VIDEO ~12s: iOS notification banners spring in and stack over a blurred backdrop; config: { notifications: [{sender, text}] (4-8), backgroundImage?, endCard }); 'photo-grid' (VIDEO ~8s: collage assembles real photos one at a time; config: { title?, photos: [{image, label?}] (4-9), palette?, fontStack?, endCard }); 'vignette' (VIDEO ~12s: cinematic Ken-Burns hero film; config: { hook, lines: [2-4 ≤40ch], heroImage, palette?, fontStack?, endCard }); 'myth-vs-fact' (VIDEO ~15-26s VO-FIRST kinetic explainer with a real VOICEOVER — the family's ONE paid-audio format: a calm-authority read busts 2-4 myths, each MYTH line slamming in with a red per-line strike then the counter FACT line landing bold+affirmative, word-level KARAOKE lighting each word as the VO speaks it; config: { pairs: [{ myth (≤50ch, the common wrong belief), fact (≤60ch, the corrective truth — wrap its payoff phrase in [brackets] to accent it) }] (2-4), palette?, fontStack?, endCard }. Real product truths only — NEVER invent stats. Costs the flat template credits PLUS a small voiceover charge); 'carousel' (MULTI-IMAGE: 5-10 branded 1080×1080 PNG slides for Meta/LinkedIn/IG carousels — returns an images[] array, one PNG per slide; config: { cover: { hook?, title }, slides: [{ headline (≤8 words), support? (≤16 words), stat?: { value, label } }] (3-8; a stat slide is a REAL user-supplied number like '94%' or '40k+' + a label, never invented), cta: { headline, cta?, domain? }, productImage?, logo?, palette?, fontStack?, endCardColor? }). Image URLs may be any public URL — the server localizes them. Spends a couple of credits.",
    inputSchema: {
      config: z.object({}).passthrough().describe("the template config — MUST include config.template (one of the template ids above) plus that template's fields"),
    },
    outputSchema: { ...JOB_OUT },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, wrap(async (a) => {
    const r = await renderJob('templatead', { config: a.config }, 'MCP template ad');
    if (Array.isArray(r?.raw?.images) && r.raw.images.length) { // carousel: one PNG per slide → list every URL + inline the first slide
      const urls = r.raw.images.map((u) => abs(u));
      const first = await imageBlock(urls[0]).catch(() => null);
      return { content: [{ type: 'text', text: `Carousel ready — ${urls.length} slides:\n${urls.map((u, i) => `  ${i + 1}. ${u}`).join('\n')}  [job ${r.jobId}]` }, ...(first ? [first] : [])], structuredContent: r ?? {} };
    }
    if (r?.raw?.image || /\.png($|\?)/.test(r?.url || '')) { const img = r?.url ? await imageBlock(r.url) : null; return { content: [{ type: 'text', text: `Template ad ready: ${r.url}  [job ${r.jobId}]` }, ...(img ? [img] : [])], structuredContent: r ?? {} }; }
    return okVideo(`Template ad ready: ${r.url}${r.model ? `  (${r.model})` : ''}  [job ${r.jobId}]`, r);
  }));

  server.registerTool('finish_video', {
    title: 'Finish video',
    description: "Post-process an EXISTING rendered video (its served mp4 URL) with the proven direct-response 'reviewer' finish and/or a film-grain pass — no AI model, ~30s, a couple of credits. pills=true composites a header pill (e.g. '10/10 would buy again'), a brand-accent sub-pill, and 3-4 green-check proof pills cascading in on the beat (YOU author the copy: header ≤40 chars, sub ≤34, each point ≤44 — concrete real benefits, never fabricated stats). grain=true applies a subtle camera-grain finish that makes photoreal AI renders look phone-shot ('less AI') — works alone or with pills. Returns a NEW video; the original is untouched.",
    inputSchema: {
      videoUrl: z.string().describe('the served URL of the video to finish (from a previous render/job)'),
      header: z.string().optional().describe('header pill copy, ≤40 chars (required when pills is on)'),
      sub: z.string().optional().describe('accent sub-pill copy, ≤34 chars (usually the product/brand)'),
      points: z.array(z.string()).optional().describe('3-4 proof points, ≤44 chars each'),
      accent: z.string().optional().describe('brand accent hex for the sub-pill'),
      pills: z.boolean().optional().describe('default true — set false for a grain-only pass'),
      grain: z.boolean().optional().describe('default false — anti-AI film-grain finish'),
    },
    outputSchema: { ...JOB_OUT },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, wrap(async (a) => {
    const r = await renderJob('videofinish', { videoUrl: a.videoUrl, header: a.header, sub: a.sub, points: a.points, accent: a.accent, pills: a.pills !== false, grain: !!a.grain }, 'MCP video finish');
    return okVideo(`Finished video ready: ${r.url}  [job ${r.jobId}]`, r);
  }));

  server.registerTool('fix_beat', {
    title: 'Fix a video beat',
    description: "Surgically re-render ONE time window (1.5-8s) of an existing rendered video and splice it back on the VIDEO TRACK ONLY — the rest of the video and ALL audio stay byte-identical. Use when one beat/shot is broken ('the shot at 8 seconds glitches') and a full re-render would waste the parts that worked; bills only the replacement clip's seconds (~1/3 of a full render). Do NOT pick a window covering spoken dialogue (a video-only splice under speech breaks lip-sync) — pass speechWindows to enforce this.",
    inputSchema: {
      videoUrl: z.string().describe('the served URL of the master video to fix'),
      startSeconds: z.number().describe('window start in seconds'),
      endSeconds: z.number().describe('window end in seconds (window 1.5-8s)'),
      prompt: z.string().describe('what the replacement footage should show — describe the shot, matching the master\'s style'),
      refImage: z.string().optional().describe('optional product/style anchor image URL'),
      speechWindows: z.array(z.array(z.number())).optional().describe('[[start,end],...] windows with spoken lines — the fix window must not overlap these'),
    },
    outputSchema: { ...JOB_OUT },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, wrap(async (a) => {
    const r = await renderJob('fixbeat', { videoUrl: a.videoUrl, startSeconds: a.startSeconds, endSeconds: a.endSeconds, prompt: a.prompt, refImage: a.refImage, speechWindows: a.speechWindows }, 'MCP fix beat');
    return okVideo(`Fixed beat spliced in: ${r.url}  [job ${r.jobId}]`, r);
  }));

  server.registerTool('generate_video', {
    title: 'Generate video',
    description: 'Render a RAW video clip from your own prompt and return its served mp4 URL. For finished brand ADS prefer render_ad (it runs the Studio quality pipeline — composited text, clean speech, end card, music); use this for raw/experimental clips or precise manual control. ONE generation = one continuous clip up to the model’s longest listed duration (seedance-2 goes to 15s single-pass with a full multi-beat arc — never assume a generic 8–10s cap); durationSeconds must be one of the model’s durations from hermoso_capabilities. Renders take 1–3 min. refImage anchors the opening frame; ttsScript adds a voiceover. Pass refVideo (a clip URL) to EDIT an existing video instead of generating from scratch — the omni engine transforms that clip per your prompt, inheriting the source clip’s canvas + length (aspectRatio/durationSeconds are ignored for an edit). Spends credits (Starter plan is video-blocked server-side).',
    inputSchema: {
      prompt: z.string().describe('the video prompt / shot description (for a refVideo edit, this is the transformation instruction)'),
      refImage: z.string().optional().describe('local path or URL to anchor the first frame'),
      refVideo: z.string().optional().describe("URL of an existing video to EDIT rather than generate from scratch — the omni engine accepts a raw clip and transforms it per your prompt, inheriting the SOURCE clip’s canvas (aspect ratio) and length (aspectRatio/durationSeconds are ignored for an edit). Omit to generate a fresh clip."),
      durationSeconds: z.number().optional().describe('clip length in seconds'),
      aspectRatio: z.string().optional().describe("default '9:16'"),
      model: z.string().optional().describe('video model id from hermoso_capabilities. Naming one is a DELIBERATE pick — the server asks before ever swapping it (no silent fallback); omit it to let the router pick'),
      resolution: z.enum(['480p', '720p', '1080p', '4k']).optional().describe("'720p' default; '480p' = cheap fast draft pass, '1080p'/'4k' = premium final delivery (more credits)"),
      ttsScript: z.string().optional().describe('voiceover script to speak'),
      ttsVoice: z.string().optional().describe('voice name, e.g. Rachel / George'),
      musicMood: z.string().optional().describe('licensed music-bed mood (e.g. upbeat / cinematic) — omit for no music bed'),
    },
    outputSchema: { ...JOB_OUT },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, wrap(async (a) => {
    const refImage = a.refImage ? await toRef(a.refImage) : undefined;
    // an agent that NAMES a model made a deliberate pick — modelExplicit gives it the server-side ask-don't-swap
    // treatment (#310) instead of being treated as a system pick the fallback ladders may silently reroute
    const r = await renderJob('video', { ...a, refImage, modelExplicit: !!a.model }, 'MCP video');
    return okVideo(`Video ready: ${r.url}${r.model ? `  (${r.model})` : ''}  [job ${r.jobId}]`, r);
  }));

  server.registerTool('generate_avatar', {
    title: 'Generate talking avatar',
    description: 'Render a TALKING-AVATAR / creator lip-sync clip from a portrait image + a script. Blocks until done (1–3 min). Requires the avatar capability (canAvatar in hermoso_capabilities). Spends credits.',
    inputSchema: {
      image: z.string().describe('local path or URL of the presenter portrait'),
      script: z.string().describe('the words the avatar speaks'),
      voice: z.string().optional().describe('voice name (Rachel/Sarah/George/Adam)'),
      resolution: z.string().optional().describe("'720p' (default) or '480p' draft"),
    },
    outputSchema: { ...JOB_OUT },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, wrap(async (a) => {
    const image = await toRef(a.image);
    const r = await renderJob('avatar', { ...a, image }, 'MCP avatar');
    return okVideo(`Avatar clip ready: ${r.url}  [job ${r.jobId}]`, r);
  }));

  server.registerTool('stitch_video', {
    title: 'Stitch multi-scene video',
    description: 'Render a multi-scene STITCHED video (≥2 scenes) — ONLY for spots LONGER than one model clip (>15s). A ≤15s multi-beat ad renders better and cheaper as ONE single-pass generate_video/render_ad on seedance-2 (it handles the full hook→demo→payoff arc in one take) — never stitch those. Blocks until done. Spends credits.',
    inputSchema: {
      scenes: z.array(z.object({}).passthrough()).min(2).describe('array of scene objects (visual + optional voiceover/seconds)'),
      aspectRatio: z.string().optional().describe('output aspect ratio, e.g. 9:16 (default) / 1:1 / 16:9'),
      voiceover: z.string().optional().describe('full voiceover script spoken across the scenes'),
      voice: z.string().optional().describe('voiceover voice name, e.g. Rachel / George'),
      resolution: z.string().optional().describe('720p (default), 480p draft, or 1080p final'),
      model: z.string().optional().describe('video model id from hermoso_capabilities — omit to let the router pick'),
      durationSeconds: z.number().optional().describe('total spot length in seconds (defaults to the sum of the scenes’ seconds)'),
    },
    outputSchema: { ...JOB_OUT },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, wrap(async (a) => {
    // HARD GUARD (Dave watched an agent stitch a 15s ad into 4 separate renders): a spot that fits ONE Seedance
    // clip renders single-pass through the Studio assembly instead — no seams, exact multi-beat arc, ~1/4 the cost.
    // The agent's scene list becomes the storyboard; its voiceover lines ride the same exactness rails.
    const total = +a.durationSeconds || (a.scenes || []).reduce((s, x) => s + (+x.seconds || 4), 0);
    if (total <= 15) {
      try {
        const { input } = await apiPost('/api/render/assemble', {
          creative: { recipe: '', copy: [], video_storyboard: { scenes: a.scenes, cta: '', music: '' } },
          durationSeconds: total, aspectRatio: a.aspectRatio, resolution: a.resolution,
        });
        if (a.voiceover && !input.ttsScript) { input.ttsScript = String(a.voiceover); if (a.voice) input.ttsVoice = String(a.voice); }
        const r = await renderJob('video', input, 'MCP ad render (single-pass)');
        return okVideo(`Rendered as ONE single-pass ${input.durationSeconds}s clip instead of stitching (this length fits a single generation — cleaner cuts, exact script, far fewer credits): ${r.url}  [job ${r.jobId}]`, r);
      } catch (e) { console.error('[mcp] single-pass collapse failed, falling back to stitch:', String(e?.message || e).slice(0, 140)); }
    }
    const r = await renderJob('stitch', { ...a, modelExplicit: !!a.model }, 'MCP stitch'); // a named model is a deliberate pick — the server belt never coerces it
    return okVideo(`Stitched video ready: ${r.url}  [job ${r.jobId}]`, r);
  }));

  server.registerTool('get_job', {
    title: 'Get render job',
    description: 'Poll a render job by id. Returns status (queued|running|done|error), progress, and on done the served media URL. Renders take 1–3 minutes: keep calling this until done/error without asking the user — several calls is normal, not a stall.',
    inputSchema: { id: z.string().describe('the job id, e.g. job_xxx') },
    outputSchema: {
      id: z.string().optional().describe('the job id'),
      status: z.string().optional().describe('queued | running | done | error'),
      progress: z.number().optional().describe('0–1 progress when reported'),
      error: z.string().nullable().optional().describe('the failure message when status is error'),
      url: z.string().nullable().optional().describe('the served media URL once done'),
      type: z.string().optional().describe('the job type (video / stitch / avatar / …)'),
      result: z.any().optional().describe('the raw job result payload'),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, wrap(async ({ id }) => {
    const j = await getJob(id);
    const res = jobResult(j);
    const url = abs(res?.video || res?.image || res?.url);
    const text = `Job ${id}: ${j.status}${j.progress ? ` (${Math.round(j.progress * 100)}%)` : ''}${url ? ` → ${url}` : ''}${j.error ? ` — ${j.error}` : ''}`;
    if (j.status === 'done' && res?.video) return okVideo(text, { ...j, url }); // resumed video → same inline poster as a direct return
    if (j.status === 'done' && res?.image) { const img = await imageBlock(url); return { content: [{ type: 'text', text }, ...(img ? [img] : [])], structuredContent: { ...j, url } }; }
    return ok(text, { ...j, url });
  }));

  // ---------- skills (Higgsfield get_workflow_instructions parity: workflows ship as SKILL.md bundles) ----------
  server.registerTool('list_skills', {
    title: 'List skills',
    description: 'List the bundled Hermoso SKILLS — multi-step workflow instructions (SKILL.md) that orchestrate the other tools (research an ad space, plan+render a finished ad, product photoshoot, raw generation) — plus the in-app strategy skills and creative recipes. Call get_skill to load a bundle. Read-only, free.',
    inputSchema: {}, outputSchema: {
      bundles: z.array(z.any()).optional().describe('bundled skills ({name, description}) loadable via get_skill'),
      inApp: z.array(z.any()).optional().describe('in-app strategy skills + creative recipes ({id, kind/group})'),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, wrap(async () => {
    const { readdir, readFile } = await import('node:fs/promises');
    const dir = new URL('../skills/', import.meta.url);
    let bundles = [];
    try {
      const names = await readdir(dir);
      bundles = (await Promise.all(names.map(async (n) => {
        try {
          const md = await readFile(new URL(`../skills/${n}/SKILL.md`, import.meta.url), 'utf8');
          const desc = (/description:\s*>?-?\s*\n?([\s\S]*?)\n[a-z_-]+:/.exec(md)?.[1] || '').replace(/\s+/g, ' ').trim().slice(0, 220);
          return { name: n, description: desc };
        } catch { return null; }
      }))).filter(Boolean);
    } catch {}
    const d = await apiGet('/api/skills').catch(() => ({ skills: [] }));
    const inApp = (d.skills || []).map(s => `${s.id} (${s.kind || s.group})`).join(', ');
    const text = `Skill bundles (call get_skill with the name):\n${bundles.map(b => `- ${b.name}: ${b.description}`).join('\n') || '(none bundled)'}\n\nIn-app strategy skills + creative recipes (pass as plan_ad's recipe / create's skill): ${inApp}`;
    return ok(text, { bundles, inApp: d.skills || [] });
  }));

  server.registerTool('get_skill', {
    title: 'Get skill',
    description: 'Load a bundled skill’s full SKILL.md workflow instructions by name (from list_skills). Follow the loaded instructions to run that workflow with the other tools. Read-only, free.',
    inputSchema: { name: z.string().describe('bundle name from list_skills, e.g. hermoso-generate') },
    outputSchema: {
      name: z.string().optional().describe('the loaded skill bundle name'),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, wrap(async ({ name }) => {
    const safe = String(name).replace(/[^a-z0-9-]/gi, '');
    const { readFile } = await import('node:fs/promises');
    const md = await readFile(new URL(`../skills/${safe}/SKILL.md`, import.meta.url), 'utf8').catch(() => null);
    if (!md) return { content: [{ type: 'text', text: `No skill bundle named "${safe}" — call list_skills for the catalog.` }], isError: true };
    return ok(md.slice(0, 24000), { name: safe });
  }));

  server.registerTool('list_jobs', {
    title: 'List render jobs',
    description: 'List the most recent render jobs + how many are currently running, so you can report on or resume in-flight work.',
    inputSchema: {}, outputSchema: {
      running: z.number().optional().describe('how many jobs are currently running'),
      jobs: z.array(z.any()).optional().describe('recent jobs ({id, type, status, …}), newest first'),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, wrap(async () => {
    const d = await apiGet('/api/jobs');
    const lines = (d.jobs || []).slice(0, 12).map(j => `${j.id} ${j.type} ${j.status}`).join('\n');
    return ok(`${d.running} running. Recent:\n${lines}`, d);
  }));

  // ---------- research / discovery ----------
  server.registerTool('find_competitors', {
    title: 'Find competitors',
    description: "Discover a brand's competitor / similar / adjacent brands from its domain (Claude grounded by web search). mode=competitors (default, excludes the searched company), inspiration (best relevant ads incl. it), or company. 0 ScrapeCreators credits.",
    inputSchema: {
      domain: z.string().describe('the brand domain, e.g. yourbrand.com'),
      mode: z.enum(['competitors', 'inspiration', 'company']).optional().describe("'competitors' (default, excludes the searched company), 'inspiration' (best relevant ads incl. it), or 'company'"),
    },
    outputSchema: {
      candidates: z.array(z.any()).optional().describe('discovered brands ({name, domain, kind, reason})'),
      diagnostics: z.any().optional().describe('discovery diagnostics (LLM tokens, web grounding)'),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  }, wrap(async ({ domain, mode = 'competitors' }) => {
    const d = await apiPost('/api/inspire/competitors', { domain, mode });
    const list = (d.candidates || []).map(c => `${c.name} (${c.domain || '—'}, ${c.kind})`).join('; ');
    return ok(`Found ${d.candidates?.length || 0}: ${list}`, d);
  }));

  server.registerTool('pull_competitor_ads', {
    title: 'Pull competitor ads',
    description: 'Pull a brand\'s real running ads across Meta / Google / LinkedIn ad libraries (deduped, sorted, right page resolved). Spends ScrapeCreators credits.',
    inputSchema: {
      companyName: z.string().optional().describe('the advertiser name'),
      domain: z.string().optional().describe('the advertiser domain'),
      platforms: z.array(z.string()).optional().describe("default ['facebook']; add 'google','linkedin'"),
      country: z.string().optional().describe("2-letter, default 'US'"),
      limit: z.number().optional().describe('max ads per platform (default 30)'),
      sort: z.string().optional().describe("'longest_running' (default) etc."),
    },
    outputSchema: {
      facebook: z.any().optional().describe('Meta results ({ads[], matched} or {error}; null when not requested)'),
      google: z.any().optional().describe('Google results ({ads[], cursor} or {error}; null when not requested)'),
      linkedin: z.any().optional().describe('LinkedIn results ({ads[], cursor} or {error}; null when not requested)'),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  }, wrap(async (a) => {
    const d = await apiPost('/api/inspire/fanout', { platforms: ['facebook'], country: 'US', limit: 30, sort: 'longest_running', ...a });
    return ok(`Pulled ads for ${a.companyName || a.domain}.`, d);
  }));

  server.registerTool('research_ads', {
    title: 'Research ads',
    description: 'Natural-language ad research: a Claude tool-use loop over Meta/Google/LinkedIn ad libraries + organic TikTok. Returns a summary + the found ads (with their served URLs). Spends LLM tokens + ScrapeCreators credits.',
    inputSchema: {
      query: z.string().describe('what to research, e.g. "the longest-running protein-pancake ads on Meta"'),
      brand: z.union([z.string(), z.object({}).passthrough()]).optional().describe('brand name or profile object to tailor the research to; omit to use the workspace’s saved brand'),
    },
    outputSchema: {
      reply: z.string().optional().describe('the research summary'),
      results: z.array(z.any()).optional().describe('the found ads/videos (normalized card objects with served URLs)'),
      actions: z.any().optional().describe('follow-up actions the research loop suggested'),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  }, wrap(async ({ query, brand }) => {
    const brandObj = typeof brand === 'string' ? { name: brand } : brand || null;
    const d = await apiSSE('/api/explore/chat', { messages: [{ role: 'user', content: query }], brand: brandObj });
    return ok(`${d.reply || ''}\n\n(${(d.results || []).length} ads found)`, { reply: d.reply, results: d.results, actions: d.actions });
  }));

  // ---------- structured ad-spy (webapp Explore-chat parity: direct library/social pulls, no LLM loop) ----------
  // For when the agent KNOWS what to pull (one brand / keyword / platform): a single API call returning compact
  // JSON — cheaper + faster than research_ads, which stays the right tool for open-ended cross-platform judgment.
  const qp = (o) => Object.fromEntries(Object.entries(o || {}).filter(([, v]) => v != null && v !== '')); // URLSearchParams renders undefined as the literal string "undefined" — strip empties before they hit the API
  const trunc = (s, n = 200) => { const t = String(s || '').replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n - 1) + '…' : t; };
  const nAds = (n) => Math.min(25, Math.max(1, Math.round(+n) || 8));
  const adsOut = (label, total, items) => ok(JSON.stringify({ found: total, showing: items.length, [label]: items }), { found: total, [label]: items }); // compact JSON summary, never the raw firehose

  server.registerTool('search_meta_ads', {
    title: 'Search Meta ads',
    description: "Structured Meta (Facebook/Instagram) Ad Library pull — use when you know exactly WHAT to fetch: a keyword (query) OR one advertiser (companyName / pageId). Returns compact JSON {page_name, body, cta, link, dates, media} per ad. For open-ended research that needs judgment across platforms, use research_ads instead. Spends ScrapeCreators credits (~1–2).",
    inputSchema: {
      query: z.string().optional().describe('keyword search across ALL advertisers (use INSTEAD of companyName/pageId)'),
      companyName: z.string().optional().describe('one advertiser’s ads by brand name'),
      pageId: z.string().optional().describe('one advertiser’s ads by Facebook page id (most precise)'),
      country: z.string().optional().describe("2-letter code or 'ALL' (default ALL)"),
      status: z.enum(['ACTIVE', 'INACTIVE', 'ALL']).optional().describe("ACTIVE = currently running; default ALL (includes proven past winners)"),
      mediaType: z.enum(['ALL', 'IMAGE', 'VIDEO', 'MEME', 'IMAGE_AND_MEME', 'NONE']).optional().describe('filter by creative type (default ALL)'),
      limit: z.number().int().optional().describe('max ads returned (1–25, default 8)'),
    },
    outputSchema: {
      found: z.number().optional().describe('total ads found upstream'),
      ads: z.array(z.any()).optional().describe('the compact ad objects ({page_name, body, cta, link, dates, media})'),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  }, wrap(async (a) => {
    if (!a.query && !a.companyName && !a.pageId) throw new Error('Pass query (keyword) OR companyName/pageId (one advertiser).');
    const common = qp({ country: a.country, status: a.status, media_type: a.mediaType });
    const d = a.query
      ? await apiGet('/api/fb/search', { query: a.query, ...common })
      : await apiGet('/api/fb/company-ads', qp({ companyName: a.companyName, pageId: a.pageId, ...common }));
    const raw = d.results || d.searchResults || []; // company-ads → results[], keyword search → searchResults[]
    const ads = raw.slice(0, nAds(a.limit)).map((x) => {
      const s = x.snapshot || {};
      return qp({
        page_name: x.page_name, body: trunc(typeof s.body === 'string' ? s.body : s.body?.text), cta: s.cta_text, link: s.link_url,
        dates: [x.start_date_string, x.end_date_string].filter(Boolean).join(' → '),
        media: s.videos?.[0]?.video_sd_url || s.images?.[0]?.resized_image_url || s.cards?.[0]?.resized_image_url || s.cards?.[0]?.video_sd_url || s.videos?.[0]?.video_preview_image_url,
      });
    });
    return adsOut('ads', d.searchResultsCount ?? raw.length, ads);
  }));

  server.registerTool('search_google_ads', {
    title: 'Search Google ads',
    description: "Structured Google Ads Transparency pull for ONE advertiser (by domain or advertiserId) — use when you know the brand; use research_ads for open-ended research. Deliberately fetches the cheap BASIC listing (get_ad_details=false, ~1 credit — the detailed variant with per-ad headlines costs 25 credits/call and is not exposed here). Returns compact JSON {advertiser, format, adUrl, image, firstShown, lastShown} per ad.",
    inputSchema: {
      domain: z.string().optional().describe("the advertiser's domain, e.g. nike.com"),
      advertiserId: z.string().optional().describe('Google advertiser id (AR…) when the domain is ambiguous'),
      region: z.string().optional().describe('2-letter region, default US'),
      limit: z.number().int().optional().describe('max ads returned (1–25, default 8)'),
    },
    outputSchema: {
      found: z.number().optional().describe('total ads found upstream'),
      ads: z.array(z.any()).optional().describe('the compact ad objects ({advertiser, format, adUrl, image, firstShown, lastShown})'),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  }, wrap(async (a) => {
    if (!a.domain && !a.advertiserId) throw new Error('Pass domain or advertiserId.');
    const d = await apiGet('/api/google/company-ads', qp({ domain: a.domain, advertiser_id: a.advertiserId, region: a.region, get_ad_details: 'false' }));
    const raw = d.ads || [];
    const ads = raw.slice(0, nAds(a.limit)).map((g) => qp({ advertiser: g.advertiserName, format: g.format, adUrl: g.adUrl, image: g.imageUrl, firstShown: g.firstShown, lastShown: g.lastShown }));
    return adsOut('ads', d.number_of_ads_estimate ?? raw.length, ads);
  }));

  server.registerTool('search_linkedin_ads', {
    title: 'Search LinkedIn ads',
    description: "Structured LinkedIn Ad Library search by company name, keyword, or companyId — use for a targeted B2B pull; use research_ads for open-ended research. Returns compact JSON {advertiser, headline, description, cta, link, media, dates, impressions} per ad — LinkedIn is the one library exposing real impression counts. Spends ScrapeCreators credits (~1).",
    inputSchema: {
      company: z.string().optional().describe('advertiser company name'),
      keyword: z.string().optional().describe('keyword across all advertisers'),
      companyId: z.string().optional().describe('LinkedIn company id (numeric) when the name is ambiguous'),
      countries: z.string().optional().describe("CSV of 2-letter codes like 'US,CA'; omit or 'ALL' = worldwide"),
      limit: z.number().int().optional().describe('max ads returned (1–25, default 8)'),
    },
    outputSchema: {
      found: z.number().optional().describe('total ads found upstream'),
      ads: z.array(z.any()).optional().describe('the compact ad objects ({advertiser, headline, description, cta, link, media, dates, impressions})'),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  }, wrap(async (a) => {
    if (!a.company && !a.keyword && !a.companyId) throw new Error('Pass company, keyword, or companyId.');
    const d = await apiGet('/api/linkedin/search', qp({ company: a.company, keyword: a.keyword, companyId: a.companyId, countries: a.countries }));
    const raw = d.ads || [];
    const ads = raw.slice(0, nAds(a.limit)).map((x) => qp({
      advertiser: x.advertiser, headline: trunc(x.headline, 120), description: trunc(x.description), cta: x.cta,
      link: x.destinationUrl, media: x.video || x.image, dates: [x.startDate, x.endDate].filter(Boolean).join(' → '), impressions: x.totalImpressions,
    }));
    return adsOut('ads', d.totalAds ?? raw.length, ads);
  }));

  server.registerTool('search_tiktok', {
    title: 'Search TikTok',
    description: "Organic TikTok keyword search (there is NO TikTok ad library) — top-performing videos to mine for hooks/trends/remixable creative. Returns compact JSON {desc, author, handle, plays, likes, link, cover} per video, ranked by plays. Use research_ads for open-ended research. Spends ScrapeCreators credits (~1).",
    inputSchema: {
      query: z.string().describe('keyword or hashtag (no # needed)'),
      limit: z.number().int().optional().describe('max videos returned (1–25, default 8)'),
    },
    outputSchema: {
      found: z.number().optional().describe('total videos found'),
      videos: z.array(z.any()).optional().describe('the compact video objects ({desc, author, handle, plays, likes, link, cover}), ranked by plays'),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  }, wrap(async ({ query, limit }) => {
    const d = await apiGet('/api/sc/run', { __path: '/v1/tiktok/search/keyword', query });
    const all = (d.search_item_list || []).map((x) => x.aweme_info).filter(Boolean).map((v) => {
      const au = v.author || {}, st = v.statistics || {}, vid = v.video || {};
      return qp({
        desc: trunc(v.desc), author: au.nickname || au.unique_id, handle: au.unique_id, plays: st.play_count, likes: st.digg_count,
        link: au.unique_id && v.aweme_id ? `https://www.tiktok.com/@${au.unique_id}/video/${v.aweme_id}` : '',
        cover: vid.cover?.url_list?.[0] || vid.origin_cover?.url_list?.[0],
      });
    }).sort((a, b) => (b.plays || b.likes || 0) - (a.plays || a.likes || 0)); // TOP by plays — "top-performing" means ranked, not API order
    return adsOut('videos', all.length, all.slice(0, nAds(limit)));
  }));

  server.registerTool('search_instagram', {
    title: 'Search Instagram',
    description: "Organic Instagram REELS keyword search (/v2/instagram/reels/search — ScrapeCreators' only IG keyword surface; profile/hashtag pulls go through scrapecreators_fetch with a handle). Returns compact JSON {desc, author, handle, plays, likes, link, cover} per reel, ranked by plays. Spends ScrapeCreators credits (~1).",
    inputSchema: {
      query: z.string().describe('keyword to search reels for'),
      limit: z.number().int().optional().describe('max reels returned (1–25, default 8)'),
    },
    outputSchema: {
      found: z.number().optional().describe('total reels found'),
      reels: z.array(z.any()).optional().describe('the compact reel objects ({desc, author, handle, plays, likes, link, cover}), ranked by plays'),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  }, wrap(async ({ query, limit }) => {
    const d = await apiGet('/api/sc/run', { __path: '/v2/instagram/reels/search', query });
    const all = (d.reels || d.items || []).map((r) => {
      const o = r.owner || r.user || {};
      return qp({
        desc: trunc(typeof r.caption === 'string' ? r.caption : (r.caption?.text || r.accessibility_caption)),
        author: o.full_name || o.username, handle: o.username,
        plays: r.video_play_count || r.video_view_count, likes: r.like_count || r.edge_liked_by?.count,
        link: r.url || (r.shortcode ? `https://www.instagram.com/reel/${r.shortcode}/` : ''),
        cover: r.thumbnail_src || r.display_url,
      });
    }).filter((x) => x.cover || x.link).sort((a, b) => (b.plays || b.likes || 0) - (a.plays || a.likes || 0));
    return adsOut('reels', all.length, all.slice(0, nAds(limit)));
  }));

  server.registerTool('search_youtube', {
    title: 'Search YouTube',
    description: "Organic YouTube keyword search (/v1/youtube/search) — videos to mine for hooks/angles/long-form structure. Returns compact JSON {desc (title), author, handle, plays, link, cover} per video, ranked by views. Spends ScrapeCreators credits (~1).",
    inputSchema: {
      query: z.string().describe('keyword to search videos for'),
      limit: z.number().int().optional().describe('max videos returned (1–25, default 8)'),
    },
    outputSchema: {
      found: z.number().optional().describe('total videos found'),
      videos: z.array(z.any()).optional().describe('the compact video objects ({desc, author, handle, plays, link, cover}), ranked by views'),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  }, wrap(async ({ query, limit }) => {
    const d = await apiGet('/api/sc/run', { __path: '/v1/youtube/search', query });
    const all = (d.videos || []).filter((v) => (v.type || 'video') === 'video').map((v) => {
      const ch = v.channel || {};
      return qp({ desc: trunc(v.title, 120), author: ch.title || ch.handle, handle: ch.handle, plays: v.viewCountInt, link: v.url || (v.id ? `https://www.youtube.com/watch?v=${v.id}` : ''), cover: v.thumbnail });
    }).filter((x) => x.cover || x.link).sort((a, b) => (b.plays || 0) - (a.plays || 0));
    return adsOut('videos', all.length, all.slice(0, nAds(limit)));
  }));

  server.registerTool('search_reddit', {
    title: 'Search Reddit',
    description: "Reddit keyword search (/v1/reddit/search, top-ranked) — a goldmine for the customer's OWN words (pain points, objections, language) to mine into ad hooks and copy. Returns compact JSON {desc (title+selftext), subreddit, upvotes, comments, link} per post. Spends ScrapeCreators credits (~1).",
    inputSchema: {
      query: z.string().describe('what to search Reddit for'),
      limit: z.number().int().optional().describe('max posts returned (1–25, default 8)'),
    },
    outputSchema: {
      found: z.number().optional().describe('total posts found'),
      posts: z.array(z.any()).optional().describe('the compact post objects ({desc, subreddit, upvotes, comments, link})'),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  }, wrap(async ({ query, limit }) => {
    const d = await apiGet('/api/sc/run', { __path: '/v1/reddit/search', query, sort: 'top' });
    const all = (d.posts || d.results || []).map((p) => qp({
      desc: trunc([p.title, p.selftext].filter(Boolean).join(' — '), 260),
      subreddit: p.subreddit ? `r/${p.subreddit}` : '', upvotes: p.ups ?? p.score, comments: p.num_comments,
      link: p.permalink ? (/^https?:/.test(p.permalink) ? p.permalink : `https://www.reddit.com${p.permalink}`) : p.url,
    })).filter((x) => x.desc || x.link);
    return adsOut('posts', all.length, all.slice(0, nAds(limit)));
  }));

  server.registerTool('search_threads', {
    title: 'Search Threads',
    description: "Organic Threads keyword search (/v1/threads/search) — short-form text/social posts for trend + voice research. Returns compact JSON {desc, author, handle, likes, link, cover} per post. Spends ScrapeCreators credits (~1).",
    inputSchema: {
      query: z.string().describe('keyword to search Threads for'),
      limit: z.number().int().optional().describe('max posts returned (1–25, default 8)'),
    },
    outputSchema: {
      found: z.number().optional().describe('total posts found'),
      posts: z.array(z.any()).optional().describe('the compact post objects ({desc, author, handle, likes, link, cover})'),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  }, wrap(async ({ query, limit }) => {
    const d = await apiGet('/api/sc/run', { __path: '/v1/threads/search', query });
    const all = (d.posts || d.results || []).map((p) => {
      const u = p.user || {};
      return qp({
        desc: trunc((p.caption && (p.caption.text || (typeof p.caption === 'string' ? p.caption : ''))) || p.accessibility_caption),
        author: u.full_name || u.username, handle: u.username, likes: p.like_count,
        link: p.code && u.username ? `https://www.threads.net/@${u.username}/post/${p.code}` : '',
        cover: p.image_versions2?.candidates?.[0]?.url,
      });
    }).filter((x) => x.desc || x.link || x.cover);
    return adsOut('posts', all.length, all.slice(0, nAds(limit)));
  }));

  server.registerTool('scrapecreators_fetch', {
    title: 'Fetch ScrapeCreators endpoint',
    description: "Generic ScrapeCreators escape hatch for any ALLOWLISTED long-tail endpoint the dedicated search_* tools don't cover — e.g. {path:'/v1/instagram/profile', params:{handle:'nike'}}. Allowlisted platform families: TikTok (+ TikTok Shop), Instagram, YouTube, Facebook (organic profiles/posts/events/marketplace), LinkedIn (organic posts/companies), Twitter/X, Reddit, Threads, Snapchat, Pinterest, Twitch, Bluesky, Truth Social, Rumble, Spotify, SoundCloud, GitHub, Google search, link-in-bio pages (Linktree etc.). Param names vary per endpoint (profiles use `handle`, keyword searches use `query`, Reddit uses `subreddit`). WARNING: returns RAW provider JSON — large and messy; prefer the dedicated search_* tools. Spends ScrapeCreators credits.",
    inputSchema: {
      path: z.string().describe("exact SC endpoint path, e.g. '/v1/tiktok/profile' — non-allowlisted paths are rejected"),
      params: z.object({}).passthrough().optional().describe("endpoint query params, e.g. {handle:'nike'}"),
    },
    outputSchema: {}, // deliberately empty — the raw provider payload (any shape, can be huge) stays in the text
    annotations: { readOnlyHint: true, openWorldHint: true },
  }, wrap(async ({ path, params }) => {
    const d = await apiGet('/api/sc/run', { __path: path, ...qp(params || {}) });
    const raw = JSON.stringify(d);
    return ok(raw.length > 24000 ? raw.slice(0, 24000) + '\n… (truncated — narrow the query or use a dedicated search_* tool)' : raw); // no structuredContent: raw payloads can be huge, the text IS the result
  }));

  // ---------- brand onboarding ----------
  server.registerTool('get_brand', {
    title: 'Get saved brand',
    description: 'What Hermoso ALREADY KNOWS for this account/workspace — the same saved brand profile (products, logos, palette, positioning) + learned memory the web Studio uses. Call this FIRST: if hasBrand is true you can omit brand everywhere; if false, onboard with draft_brand. 0 credits.',
    inputSchema: {},
    outputSchema: {
      hasBrand: z.boolean().optional().describe('whether a brand is saved for this workspace'),
      brand: z.any().optional().describe('the saved brand profile (name, domain, category, products, palette, …) or null'),
      memoryCount: z.number().optional().describe('how many learned memory notes the workspace holds'),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  }, wrap(async () => {
    const d = await apiGet('/api/brand/current');
    const text = d?.hasBrand
      ? `Saved brand: ${d.brand.name || d.brand.domain}${d.brand.category ? ' · ' + d.brand.category : ''} · ${d.memoryCount} learned memory notes. plan_ad / plan_variations / create use it automatically when you omit brand.`
      : 'No saved brand for this workspace yet — onboard one with draft_brand (it saves automatically), or the user can onboard in the web Studio.';
    return ok(text, d);
  }));

  server.registerTool('draft_brand', {
    title: 'Draft brand profile',
    description: 'Onboard a brand profile — from a website domain, a free-text description, or a social handle — into a {name, products, logo, …} object you can pass to plan_ad / generate. 0 ScrapeCreators credits. IMPORTANT: a domain can resolve to a DIFFERENT company than intended (e.g. bala.com is an engineering firm, not the Bala fitness brand at shopbala.com). Before spending any credits on research or renders, VERIFY the returned `name` (and `summary`) match the brand the user meant; if it looks wrong, re-draft with the correct domain or a description (pass save:false until confirmed) — this tool cannot ask the user, so the caller owns that check.',
    inputSchema: {
      domain: z.string().optional().describe('a website to scrape'),
      description: z.string().optional().describe('a free-text brand description (no website)'),
      socialHandle: z.string().optional().describe('a social handle to draft from (influencers/creators) — pair with platform'),
      platform: z.string().optional().describe('platform for socialHandle (instagram/tiktok/…)'),
      save: z.boolean().optional().describe('save as the workspace’s brand (like Studio onboarding) so plan_ad/create use it automatically. Default: saves only when NO brand is saved yet; pass true to overwrite, false to never save'),
    },
    outputSchema: {
      name: z.string().optional().describe('the drafted brand name — VERIFY it matches the brand the user meant'),
      domain: z.string().optional().describe('the brand website domain (empty for non-website drafts)'),
      category: z.string().optional().describe('the detected category'),
      summary: z.string().optional().describe('a short positioning summary'),
      sells: z.any().optional().describe('what the brand sells'),
      logo: z.string().optional().describe('the detected logo URL'),
      palette: z.array(z.any()).optional().describe('the brand colors'),
      products: z.any().optional().describe('the detected products'),
      productImages: z.array(z.any()).optional().describe('product photo URLs'),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  }, wrap(async ({ save, ...a }) => {
    const d = await apiPost('/api/brand/draft', a);
    const p = d.profile || d;
    let saved = false;
    if (save !== false) {
      try {
        const cur = save === true ? null : await apiGet('/api/brand/current').catch(() => null);
        if (save === true || !cur?.hasBrand) {
          const bk = PROFILE !== 'default' ? `heist.brand.v1.${PROFILE}` : 'heist.brand.v1'; // mirror the webapp's per-profile key namespacing
          await apiPut(`/api/store/${encodeURIComponent(bk)}`, { value: JSON.stringify(p) });
          saved = true;
        }
      } catch {} // saving is best-effort — the drafted profile is still returned either way
    }
    return ok(`Drafted brand: ${p.name || '—'}${p.category ? ' · ' + p.category : ''}.${saved ? ' Saved as the workspace brand — plan_ad/create now use it automatically.' : ' Pass this object to plan_ad.'}`, p);
  }));

  // ---------- assets ----------
  server.registerTool('fetch_asset', {
    title: 'Fetch asset',
    description: 'Resolve a generated asset reference (a /generated/… path or any URL) to a clickable absolute URL + a direct download URL.',
    inputSchema: { url: z.string().describe('the asset url or /generated/ path'), name: z.string().optional().describe('optional filename for the download') },
    outputSchema: {
      url: z.string().optional().describe('the clickable absolute asset URL'),
      downloadUrl: z.string().optional().describe('a direct download URL for the asset'),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, wrap(async ({ url, name }) => {
    const absolute = abs(url);
    const dl = `${API_BASE}/api/download?url=${encodeURIComponent(url)}${name ? `&name=${encodeURIComponent(name)}` : ''}`;
    return ok(`Asset: ${absolute}\nDownload: ${dl}`, { url: absolute, downloadUrl: dl });
  }));

  // ---------- post-production & analysis (Higgsfield-parity wave: each wraps an EXISTING worker/route) ----------
  server.registerTool('analyze_video', {
    title: 'Analyze video',
    description: "Break a video ad down into its structure: the verbatim transcript (voiceover + on-screen text) with a beat list, plus duration and sampled frame timestamps. Use to study a reference/competitor ad before remixing its structure. Costs ~a transcription call; no ScrapeCreators credits.",
    inputSchema: { url: z.string().describe('the video URL (a served /generated/ path or a public http(s) video)') },
    outputSchema: {
      durationSeconds: z.number().optional().describe('the video length in seconds'),
      frameTimes: z.array(z.number()).optional().describe('timestamps (seconds) of the sampled frames'),
      transcript: z.string().nullable().optional().describe('verbatim voiceover + on-screen text with a beat list (null when silent/unreachable)'),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  }, wrap(async ({ url }) => {
    const [fr, tr] = await Promise.all([
      apiGet(`/api/video/frames?n=auto&url=${encodeURIComponent(url)}`).catch(() => null),
      apiGet(`/api/video/transcript?url=${encodeURIComponent(url)}`).catch(() => null),
    ]);
    const dur = fr?.durationSeconds, times = fr?.times || [];
    const transcript = tr?.transcript || '(no transcript — the video may be silent or unreachable)';
    return ok(`Duration: ${dur ? Math.round(dur) + 's' : 'unknown'} · frames sampled at: ${times.map(t => Math.round(t * 10) / 10 + 's').join(', ') || 'n/a'}\n\nTranscript & beats:\n${transcript}`, { durationSeconds: dur, frameTimes: times, transcript: tr?.transcript || null });
  }));

  server.registerTool('score_ad', {
    title: 'Score ad',
    description: "Virality/performance prediction for a finished ad (image or video URL): overall score, per-dimension breakdown (scroll-stop, hook, clarity, brand/product, CTA, retention, goal fit), strengths, and the single biggest fix. Use BEFORE spending on distribution, or to rank variants.",
    inputSchema: {
      url: z.string().describe('the ad asset URL (a /generated/ path or public URL)'),
      kind: z.enum(['image', 'video']).optional().describe("'image' (default) or 'video'"),
      intent: z.string().optional().describe('what the ad is trying to achieve, for goal-fit scoring'),
    },
    outputSchema: {
      overall: z.number().optional().describe('the overall score out of 100'),
      tier: z.string().optional().describe('the qualitative tier'),
      dimensions: z.array(z.any()).optional().describe('per-dimension breakdown ({name, score})'),
      top_fix: z.string().optional().describe('the single biggest improvement lever'),
      strengths: z.any().optional().describe('what the ad already does well'),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  }, wrap(async ({ url, kind = 'image', intent = '' }) => {
    const d = await apiPost('/api/score/ad', { url, kind, intent, format: kind });
    if (!d) return ok('Could not score that ad.');
    const dims = (d.dimensions || []).map(x => `${x.name}: ${x.score}`).join(' · ');
    return ok(`Overall ${d.overall}/100 (${d.tier || ''})\n${dims}\nBiggest lever: ${d.top_fix || '—'}`, d);
  }));

  server.registerTool('reframe_video', {
    title: 'Reframe video',
    description: "Reframe a video to a different aspect ratio (e.g. 16:9 master → 9:16 vertical) with smart subject tracking. Paid render; returns the served URL of the reframed video.",
    inputSchema: { video: z.string().describe('the source video URL'), aspectRatio: z.enum(['9:16', '1:1', '16:9', '4:3', '3:4', '21:9', '9:21']).describe('the target aspect ratio') },
    outputSchema: { ...JOB_OUT },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, wrap(async ({ video, aspectRatio }) => {
    const r = await renderJob('reframe', { video, aspectRatio }, `Reframe → ${aspectRatio}`);
    return okVideo(`Reframed video (${aspectRatio}): ${r.url}`, r);
  }));

  server.registerTool('upscale_video', {
    title: 'Upscale video',
    description: "Upscale a video to higher resolution (2x) for final delivery. Paid render; returns the served URL.",
    inputSchema: { video: z.string().describe('the source video URL') },
    outputSchema: { ...JOB_OUT },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, wrap(async ({ video }) => {
    const r = await renderJob('upscale', { video, factor: 2 }, 'Upscale 2x');
    return okVideo(`Upscaled video: ${r.url}`, r);
  }));

  server.registerTool('dub_video', {
    title: 'Dub video',
    description: "Remake a finished video ad's voiceover in another language (translated script, re-voiced, re-muxed). Paid; returns the served URL of the localized video.",
    inputSchema: {
      video: z.string().describe('the source video URL'),
      language: z.string().describe("target language, e.g. 'Spanish', 'de', 'French (Canada)'"),
      script: z.string().optional().describe('the original spoken script if known — improves translation fidelity'),
    },
    outputSchema: { ...JOB_OUT },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, wrap(async ({ video, language, script }) => {
    const r = await renderJob('dub', { video, language, script: script || '' }, `Dub → ${language}`);
    return okVideo(`Localized video (${language}): ${r.url}`, r);
  }));

  server.registerTool('change_voice', {
    title: 'Change narrator voice',
    description: "Swap the narration of a finished video into a different voice — keeps the performance, lip-sync, and background sound. Use when the user likes the video but wants a different narrator voice; use dub_video only for language translation. Paid; returns the served URL.",
    inputSchema: {
      video: z.string().describe('the source video URL'),
      voice: z.string().optional().describe("target narrator voice preset name, e.g. 'Aria', 'George', 'Rachel', 'Sarah', 'Brian', 'Charlotte' (defaults to a warm female read)"),
    },
    outputSchema: { ...JOB_OUT },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, wrap(async ({ video, voice }) => {
    const r = await renderJob('voiceswap', { video, ...(voice ? { voice } : {}) }, 'Voice swap');
    return okVideo(`Voice-swapped video: ${r.url}`, r);
  }));

  server.registerTool('recast_motion', {
    title: 'Recast motion',
    description: "Motion transfer: re-perform a reference video's motion with a different person/character (supply their image). The reference clip drives the movement; the image supplies the identity. Paid render.",
    inputSchema: {
      image: z.string().describe("the actor/character image URL (who should appear)"),
      video: z.string().describe('the reference video whose motion to re-perform'),
      prompt: z.string().optional().describe('optional scene/style guidance'),
      orientation: z.enum(['video', 'image']).optional().describe("which aspect to keep: the video's (default) or the image's"),
    },
    outputSchema: { ...JOB_OUT },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, wrap(async ({ image, video, prompt = '', orientation = 'video' }) => {
    const r = await renderJob('motion', { image, video, prompt, orientation }, 'Motion recast');
    return okVideo(`Recast video: ${r.url}`, r);
  }));

  server.registerTool('plan_variations', {
    title: 'Plan ad variations',
    description: "Fan a brief into N DISTINCT ad angles (different hooks/mechanics/audiences), each with its own headline + visual brief — then render each with generate_image and rank with score_ad. LLM planning only; renders nothing itself.",
    inputSchema: {
      brand: z.union([z.string(), z.object({}).passthrough()]).optional().describe('brand name or profile object; OMIT to use the workspace’s saved brand'),
      product: z.string().describe('what to advertise'),
      count: z.number().int().min(2).max(8).optional().describe('how many distinct variants (default 6)'),
      language: z.string().optional().describe('output language for the variant copy (e.g. Spanish) — default English'),
    },
    outputSchema: {
      variants: z.array(z.any()).optional().describe('the distinct ad angles ({name, hook, headline, visual brief})'),
      angles: z.array(z.any()).optional().describe('alternate key the planner may return the variants under'),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, wrap(async ({ brand, product, count = 6, language }) => {
    const brandObj = brand ? (typeof brand === 'string' ? { name: brand } : brand) : null;
    const d = await apiPost('/api/batch/plan', { brand: brandObj, product, count, language: language || '' });
    const vars = d?.variants || d?.angles || [];
    const text = vars.map((v, i) => `${i + 1}. ${v.name || v.angle || 'Variant'} — ${v.hook || v.headline || ''}`).join('\n') || 'No variants returned.';
    return ok(text, d);
  }));

  // ---------- research analysis & creative remix (webapp Create-chat parity — the last four app-only chat tools, now headless) ----------
  // The web Studio versions of these read the CLIENT's chat/creative state; the MCP variants take explicit inputs and
  // resolve the ACTIVE brand SERVER-SIDE (same source as get_brand). Pass brandId to act on a specific brand — that
  // pins this key's active brand exactly like use_brand (persists) — or omit it to use the currently-active brand.
  const activeBrand = async (brandId) => {
    if (brandId) {
      const list = await apiGet('/api/brands');
      const want = String(brandId).trim().toLowerCase();
      const hit = (list.brands || []).find(b => b.id.toLowerCase() === want || String(b.name || '').toLowerCase() === want);
      if (!hit) throw new Error(`No brand matching "${brandId}" — call list_brands for the available brands.`);
      await apiPost('/api/keys/brand', { profileId: hit.id }); // pin it (use_brand semantics — persists for this key)
    }
    const cur = await apiGet('/api/brand/current').catch(() => null);
    return cur?.hasBrand ? cur.brand : null;
  };

  server.registerTool('competitor_teardown', {
    title: 'Competitor teardown',
    description: "Tear a competitor's ad strategy down into an actionable playbook: their opening-hook MIX, longest-running campaign THEMES, the WHITE SPACE nobody in their set runs, 2-3 render-ready COUNTER-PLAYS, and the territories they own that you should avoid. Pass `competitor` {name, domain?}. CONTRACT: supply `ads` (raw ad objects from a prior pull_competitor_ads / search_meta_ads call) to tear exactly those down, OR omit `ads` and this pulls the competitor's real Meta ads first (spends ~1-2 ScrapeCreators credits, longest-running = proven winners). Auto-tailors the white space + counter-plays to YOUR saved brand. Spends LLM tokens (0 SC credits when you pass ads).",
    inputSchema: {
      competitor: z.object({ name: z.string().describe('the competitor brand name'), domain: z.string().optional().describe('their domain — sharpens the auto-pull page match') }).describe('the competitor to tear down'),
      ads: z.array(z.object({}).passthrough()).optional().describe('ad objects to tear down (from pull_competitor_ads / search_meta_ads). Omit to auto-pull their Meta ads first.'),
      language: z.string().optional().describe('output language (default English)'),
    },
    outputSchema: {
      teardown: z.any().optional().describe('the playbook — hook_taxonomy, campaigns, white_space, counter_plays, not_saying'),
      adCount: z.number().optional().describe('how many ads were analyzed'),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  }, wrap(async ({ competitor, ads, language }) => {
    const name = String(competitor?.name || '').trim();
    if (!name) throw new Error('competitor.name is required.');
    let use = Array.isArray(ads) ? ads : [];
    if (!use.length) { // no ads supplied → pull the competitor's real Meta ads (the pull_competitor_ads path), then tear THOSE down
      const pulled = await apiPost('/api/inspire/fanout', { companyName: name, domain: competitor?.domain || '', platforms: ['facebook'], country: 'US', limit: 30, sort: 'longest_running' });
      use = pulled?.facebook?.ads || [];
      if (!use.length) throw new Error(`No Meta ads found to tear down for "${name}". Pull them another way (search_meta_ads with a keyword) and pass the results as ads.`);
    }
    const brand = await activeBrand().catch(() => null); // tailor white space + counter-plays to the saved brand (best-effort)
    const d = await apiPost('/api/research/teardown', { competitor: { name, domain: competitor?.domain || '' }, ads: use, brand, language: language || '' });
    const t = d.teardown || {};
    const hooks = (t.hook_taxonomy || []).map(h => `${h.type}×${h.count}`).join(', ');
    const camps = (t.campaigns || []).map(c => `“${c.theme}” (${c.longest_running_days}d)`).join('; ');
    const ws = (t.white_space || []).map(w => `• ${w.angle}`).join('\n');
    const plays = (t.counter_plays || []).map(p => `• [${p.format}] ${p.title}: ${p.brief}`).join('\n');
    const text = `Teardown of ${name} (${d.adCount} ads):\nHook mix: ${hooks || '—'}\nCampaign themes: ${camps || '—'}\nWhite space:\n${ws || '—'}\nCounter-plays:\n${plays || '—'}\nThey own (avoid): ${(t.not_saying || []).join(' · ') || '—'}`;
    return ok(text, d);
  }));

  server.registerTool('check_ad_policy', {
    title: 'Check ad policy',
    description: "Pre-flight ad copy against Meta's REAL, live Advertising Standards before you run it — a flat 1-credit check. Pulls Meta's actual policy pages and returns a verdict (pass / fix / block) where every flagged issue QUOTES Meta's own policy text verbatim plus a compliant rewrite that keeps the sell. It's a check, not an edit — it never changes the creative. Especially worth running for regulated-adjacent categories (health/supplements, weight-loss or beauty results claims, finance/crypto/insurance, alcohol, dating, gambling) or ANY strong/absolute/guaranteed claim.",
    inputSchema: {
      copy: z.string().describe('the ad copy / script / on-screen text to check'),
      claims: z.string().optional().describe('the claims / proof points the ad makes'),
      category: z.string().optional().describe('the product category — helps pick the relevant policy pages'),
      imageDescription: z.string().optional().describe('a description of the creative / image when relevant'),
    },
    outputSchema: {
      verdict: z.string().optional().describe('pass / fix / block'),
      summary: z.string().optional().describe('one-line verdict summary'),
      findings: z.array(z.any()).optional().describe('flagged issues ({severity, issue, policy_quote, fix_suggestion, where_in_ad})'),
      anchors: z.array(z.any()).optional().describe('the Meta policy pages consulted ({url, …})'),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
  }, wrap(async ({ copy, claims, category, imageDescription }) => {
    const d = await apiPost('/api/policy/check', { copy, claims: claims || '', category: category || '', imageDescription: imageDescription || '' });
    const findings = (d.findings || []).map((f, i) => `${i + 1}. [${f.severity || 'issue'}] ${f.where_in_ad ? `"${f.where_in_ad}" — ` : ''}${f.issue || ''}\n   Meta: “${f.policy_quote || ''}”${f.fix_suggestion ? `\n   Fix: ${f.fix_suggestion}` : ''}`).join('\n');
    const anchors = (d.anchors || []).map(a => a.url).filter(Boolean).join(', ');
    const text = `Verdict: ${String(d.verdict || '').toUpperCase()} — ${d.summary || ''}\n${findings || '(no issues found)'}\n\nPolicies consulted: ${anchors || '—'}`;
    return ok(text, d);
  }));

  server.registerTool('remix_static', {
    title: 'Remix a static ad',
    description: "One-click STATIC-AD REMIX: rebuild a competitor/reference STATIC (image) ad as an on-brand version — SAME layout, composition and energy, but YOUR product, brand colours, logo and voice, with every trace of the source brand removed. Pass `imageUrl` = the static ad image to remix. Uses your saved brand (pass brandId to target a specific brand — that switches this key's active brand like use_brand). IMAGES ONLY — for video ads use render_ad. Bills as one image generation.",
    inputSchema: {
      imageUrl: z.string().describe('the URL of the static ad image to remix'),
      brandId: z.string().optional().describe('a brand id/name from list_brands to remix for; omit to use the active brand'),
    },
    outputSchema: {
      image: z.string().optional().describe('the served absolute URL of the remixed ad image'),
      model: z.string().optional().describe('the model label that rendered it'),
      slots: z.any().optional().describe('the filled slot map (layout elements swapped to your brand)'),
      residual: z.any().optional().describe('source-branding sweep result ({clean, note})'),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, wrap(async ({ imageUrl, brandId }) => {
    const brand = await activeBrand(brandId);
    if (!brand) throw new Error('No saved brand to remix for — onboard one with draft_brand, or pass a brandId from list_brands.');
    const spec = await apiPost('/api/remix/spec', { imageUrl }); // ONE vision call → the slot-map spec (flat-billed)
    const d = await apiPost('/api/remix/render', { spec, imageUrl, brand, sourceAdvertiser: spec?.source_brand || '' });
    const url = abs(d.image);
    const img = await imageBlock(url); // show the remixed creative inline, not just a link
    const resid = d.residual && d.residual.clean === false ? `\n⚠ Residual source branding may remain: ${d.residual.note}` : '';
    return { content: [{ type: 'text', text: `Remixed ad ready: ${url}${d.model ? `  (${d.model})` : ''}${resid}` }, ...(img ? [img] : [])], structuredContent: { ...d, image: url } };
  }));

  server.registerTool('mine_angles', {
    title: 'Mine customer angles',
    description: "Mine ad ANGLES from real customer language: gathers the customer's own words (Reddit, TikTok, the brand's review page + review-site results) and returns a RANKED angle bank — each angle tagged (pain / outcome / identity / fear / competitive-displacement / social-proof / contrast), 2-5 VERBATIM proof quotes, a 0-100 score with breakdown, and a ready-to-run hook in the customer's own voice. Reads YOUR saved brand (pass brandId to target a specific brand — that switches this key's active brand like use_brand). To tear down a COMPETITOR use competitor_teardown instead. Spends a few ScrapeCreators credits + LLM tokens.",
    inputSchema: {
      brandId: z.string().optional().describe('a brand id/name from list_brands to mine for; omit to use the active brand'),
    },
    outputSchema: {
      angles: z.array(z.any()).optional().describe('the ranked angle bank ({category, angle, score, hook_draft, proof_quotes})'),
      sourceCount: z.number().optional().describe('how many customer sources were mined'),
      note: z.string().optional().describe('why no angles were returned, when the bank is empty'),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
  }, wrap(async ({ brandId }) => {
    const brand = await activeBrand(brandId);
    if (!brand) throw new Error('No saved brand to mine angles for — onboard one with draft_brand, or pass a brandId from list_brands.');
    const d = await apiPost('/api/research/angles', { brand });
    const angles = d.angles || [];
    if (!angles.length) return ok(d.note || 'Not enough public customer language surfaced to mine reliable angles yet.', d);
    const text = angles.map((a, i) => `${i + 1}. [${a.category}] ${a.angle} (score ${a.score})\n   Hook: ${a.hook_draft || ''}\n   Proof: ${(a.proof_quotes || []).map(q => `“${q}”`).join(' · ')}`).join('\n');
    return ok(`Mined ${angles.length} angles from ${d.sourceCount} customer sources:\n${text}`, d);
  }));

  // ---------- product-photo tools (Studio-chat parity) ----------
  server.registerTool('list_product_photos', {
    title: 'List product photos',
    description: "List the product photos ALREADY saved in your workspace — the brand's product library plus any app-store screens (also surfaces photos locked in your OTHER creations, since a set product lands in the shared library). FREE — returns each photo's url + label. Call it before set_product_image to see the existing photos you can reuse. Reads YOUR saved brand (pass brandId to target a specific brand — that switches this key's active brand like use_brand).",
    inputSchema: {
      brandId: z.string().optional().describe('a brand id/name from list_brands whose product library to list; omit to use the active brand'),
    },
    outputSchema: {
      summary: z.string().optional().describe('a readable rundown of the saved product photos'),
      photos: z.array(z.any()).optional().describe('the saved photos ({url, label, …})'),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  }, wrap(async ({ brandId }) => {
    const brand = await activeBrand(brandId);
    const d = await apiPost('/api/product/photos', { brand: brand || {} });
    return ok(d.summary || 'The workspace has no saved product photos yet.', d);
  }));

  server.registerTool('set_product_image', {
    title: 'Set product photo',
    description: "Lock an image as the ad's real PRODUCT photo so every render grounds on the true packaging. Pass `imageUrl` = a product shot's URL — an image from a prior research result (an organic Instagram/TikTok post, a scraped page image), a workspace / list_product_photos url, or any public product photo. The server downloads it and runs a product+safety check: a lifestyle/scene shot with no clear product, or an off-category / unsafe image, is REJECTED and NOTHING is locked (the summary says why). On PASS it persists the photo to a DURABLE url and returns it — pass that url as a reference to generate_image / render_ad. Bills one vision check. Reads YOUR saved brand for the category match (pass brandId to target a specific brand — switches this key's active brand like use_brand).",
    inputSchema: {
      imageUrl: z.string().describe('the image URL to lock as the product (from a research result, a workspace / list_product_photos url, or any public product photo)'),
      source_note: z.string().optional().describe('a short note on where it came from, e.g. "from their IG post"'),
      brandId: z.string().optional().describe('a brand id/name from list_brands to lock the product for; omit to use the active brand'),
    },
    outputSchema: {
      attached: z.boolean().optional().describe('true when the image passed the product check and was locked'),
      summary: z.string().optional().describe('the check verdict — on rejection, why nothing was locked'),
      url: z.string().nullable().optional().describe('the durable served URL of the locked product photo'),
      source_note: z.string().nullable().optional().describe('where the photo came from'),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  }, wrap(async ({ imageUrl, source_note, brandId }) => {
    const brand = await activeBrand(brandId);
    const d = await apiPost('/api/product/set-image', { imageUrl, source_note: source_note || '', brand: brand || {} });
    if (!d.attached) return ok(d.summary || 'That image was not locked as the product.', d); // gate honesty: rejected → nothing attached
    const url = abs(d.url);
    const img = await imageBlock(url); // show the locked product inline
    return { content: [{ type: 'text', text: `${d.summary}\nProduct photo: ${url}` }, ...(img ? [img] : [])], structuredContent: { ...d, url } };
  }));
}
