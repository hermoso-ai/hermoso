// All Hermoso MCP tools, each a thin wrapper over a real /api route (see mcp/client.mjs). Job-based renders
// (video/avatar/stitch) submit to the queue and POLL TO COMPLETION inside the tool — works in every MCP client
// (no experimental Tasks dependency) and returns the final served URL. get_job/list_jobs cover resume/inspection.
// Spend tools hit routes guarded by gateSpend → requireAuth; locally the dev account always resolves (no auth
// needed today), and the SAME guard becomes authoritative under real auth — so this honors no-anon-spend as-is.
import { z } from 'zod';
import { apiGet, apiPost, apiPut, apiSSE, submitJob, getJob, jobResult, pollJob, toRef, API_BASE, PROFILE } from './client.mjs';

const JOB_TIMEOUT = +(process.env.HERMOSO_JOB_TIMEOUT_MS || 10 * 60 * 1000);
const abs = (u) => (u && u.startsWith('/') ? API_BASE + u : u); // /generated/x.mp4 → clickable absolute URL
const ok = (text, data) => ({ content: [{ type: 'text', text }], structuredContent: data ?? undefined });
const wrap = (fn) => async (args, extra) => {
  try { return await fn(args, extra); }
  catch (e) { return { content: [{ type: 'text', text: `Error: ${e?.message || e}` }], isError: true }; }
};

// run a job to completion, surfacing the served media URL
async function renderJob(type, input, label) {
  const job = await submitJob(type, input, { label });
  const { result } = await pollJob(job.id, { timeoutMs: JOB_TIMEOUT });
  const url = abs(result?.video || result?.image || result?.url);
  return { jobId: job.id, url, model: result?.model || null, raw: result };
}

export function registerTools(server) {
  // ---------- read-only / discovery ----------
  server.registerTool('hermoso_capabilities', {
    description: 'Probe what this Hermoso account can do RIGHT NOW: available image/video model ids + their exact credit costs, aspect ratios, video durations, the recipe ids, and the canEdit/canAvatar/canPublish flags. Call this FIRST so you generate with valid model ids and known costs. Read-only, free.',
    inputSchema: {}, annotations: { readOnlyHint: true, openWorldHint: false },
  }, wrap(async () => {
    const d = await apiGet('/api/generate/status');
    const img = (d.options?.image?.models || []).map(m => `${m.id} (${m.label}, ${m.credits}cr${m.best ? ', best' : ''})`).join('; ');
    const vid = (d.options?.video?.models || []).map(m => `${m.id} (${m.label})`).join('; ');
    const text = `Image: ${d.image ? img : 'unavailable'}\nVideo: ${d.video ? vid : 'unavailable'}\ncanEdit:${d.canEdit} canAvatar:${d.canAvatar} canPublish:${d.canPublish}\nRecipes (${(d.recipes || []).length}): ${(d.recipes || []).slice(0, 20).map(r => r.id).join(', ')}…`;
    return ok(text, d);
  }));

  server.registerTool('hermoso_credits', {
    description: 'Return the account credit balance, credits used this session, and recent priced calls. Check before kicking off paid generation.',
    inputSchema: {}, annotations: { readOnlyHint: true, openWorldHint: false },
  }, wrap(async () => {
    const d = await apiGet('/api/credits');
    return ok(`Balance: ${d.balance} credits · session used: ${d.sessionUsed ?? 0}`, d);
  }));

  // ---------- planning (LLM, 0 SC credits) ----------
  server.registerTool('plan_ad', {
    description: 'Creative director: turn a brand + product/brief into a finished ad CONCEPT — copy variants (headline/primary/cta) plus an image_concept.prompt OR a video_storyboard, with the resolved recipe + the model ids to render with. Renders nothing; chain its output into generate_image / generate_video. Spends LLM tokens, 0 ScrapeCreators credits.',
    inputSchema: {
      brand: z.union([z.string(), z.object({}).passthrough()]).optional().describe('brand name, or a brand profile object {name,domain,category,palette,products,…}. OMIT to use the workspace’s SAVED brand + memory automatically (see get_brand); use draft_brand to onboard a new one'),
      product: z.string().describe('what to advertise + any angle/offer the user specified'),
      format: z.enum(['auto', 'image', 'video']).optional().describe("'image', 'video', or 'auto' when unspecified"),
      recipe: z.string().optional().describe('a recipe id from hermoso_capabilities to force an archetype'),
      reference: z.string().optional().describe('a reference ad URL to remix the angle from'),
      language: z.string().optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  }, wrap(async ({ brand, product, format = 'auto', recipe, reference, language }) => {
    const brandObj = brand ? (typeof brand === 'string' ? { name: brand } : brand) : null; // null → the server hydrates the workspace's saved brand/memory/taste
    const d = await apiPost('/api/create', { brand: brandObj, product, format, recipe: recipe || '', reference: reference ? { url: reference } : null, language: language || '' });
    const c = d.creative || d;
    const text = `Concept (${c.format}${c.recipe_label ? ' · ' + c.recipe_label : ''}): "${c.concept}"\nHeadline: ${c.copy?.[0]?.headline || ''}\nRender model: ${c.format === 'video' ? c.vmodel : c.imodel || '—'}. Next: generate_${c.format === 'video' ? 'video' : 'image'} with the ${c.format === 'video' ? 'storyboard' : 'image_concept.prompt'}.`;
    return ok(text, c);
  }));

  // ---------- image (synchronous) ----------
  server.registerTool('generate_image', {
    description: 'Render a finished ad IMAGE and return its served URL. refImages (local paths or URLs) force product-accurate compositing (drops a real product into the scene). model = a catalog id from hermoso_capabilities (omit for the default). Fast (seconds). Spends credits.',
    inputSchema: {
      prompt: z.string().describe('the full image prompt — subject, composition, lighting, and any on-image ad text'),
      refImages: z.array(z.string()).optional().describe('local file paths or URLs of product/logo references to composite in'),
      aspectRatio: z.string().optional().describe("e.g. '1:1', '9:16', '16:9'"),
      model: z.string().optional().describe('image model id from hermoso_capabilities'),
      imageSize: z.string().optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  }, wrap(async ({ prompt, refImages, aspectRatio, model, imageSize }) => {
    const refs = refImages?.length ? (await Promise.all(refImages.map(toRef))).filter(Boolean) : undefined;
    const d = await apiPost('/api/generate/image', { prompt, refImages: refs, aspectRatio, model, imageSize });
    return ok(`Image ready: ${abs(d.image)}${d.model ? `  (${d.model})` : ''}`, { ...d, image: abs(d.image) });
  }));

  // ---------- video / avatar / stitch (job-based, polled to completion) ----------
  server.registerTool('generate_video', {
    description: 'Render a VIDEO ad and return its served mp4 URL. Renders take 1–3 min — this tool blocks until done. refImage anchors the opening frame; ttsScript adds a voiceover. model = a video catalog id from hermoso_capabilities. Spends credits (Starter plan is video-blocked server-side).',
    inputSchema: {
      prompt: z.string().describe('the video prompt / shot description'),
      refImage: z.string().optional().describe('local path or URL to anchor the first frame'),
      durationSeconds: z.number().optional().describe('clip length in seconds'),
      aspectRatio: z.string().optional().describe("default '9:16'"),
      model: z.string().optional(),
      resolution: z.string().optional().describe("'720p' (default) or '1080p'"),
      ttsScript: z.string().optional().describe('voiceover script to speak'),
      ttsVoice: z.string().optional().describe('voice name, e.g. Rachel / George'),
      musicMood: z.string().optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  }, wrap(async (a) => {
    const refImage = a.refImage ? await toRef(a.refImage) : undefined;
    const r = await renderJob('video', { ...a, refImage }, 'MCP video');
    return ok(`Video ready: ${r.url}${r.model ? `  (${r.model})` : ''}  [job ${r.jobId}]`, r);
  }));

  server.registerTool('generate_avatar', {
    description: 'Render a TALKING-AVATAR / creator lip-sync clip from a portrait image + a script. Blocks until done (1–3 min). Requires the avatar capability (canAvatar in hermoso_capabilities). Spends credits.',
    inputSchema: {
      image: z.string().describe('local path or URL of the presenter portrait'),
      script: z.string().describe('the words the avatar speaks'),
      voice: z.string().optional().describe('voice name (Rachel/Sarah/George/Adam)'),
      resolution: z.string().optional().describe("'720p' (default) or '480p' draft"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  }, wrap(async (a) => {
    const image = await toRef(a.image);
    const r = await renderJob('avatar', { ...a, image }, 'MCP avatar');
    return ok(`Avatar clip ready: ${r.url}  [job ${r.jobId}]`, r);
  }));

  server.registerTool('stitch_video', {
    description: 'Render a multi-scene STITCHED video (≥2 scenes) — the long-form / multi-beat path. Blocks until done. Spends credits.',
    inputSchema: {
      scenes: z.array(z.object({}).passthrough()).min(2).describe('array of scene objects (visual + optional voiceover/seconds)'),
      aspectRatio: z.string().optional(),
      voiceover: z.string().optional(),
      voice: z.string().optional(),
      resolution: z.string().optional(),
      model: z.string().optional(),
      durationSeconds: z.number().optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  }, wrap(async (a) => {
    const r = await renderJob('stitch', a, 'MCP stitch');
    return ok(`Stitched video ready: ${r.url}  [job ${r.jobId}]`, r);
  }));

  server.registerTool('get_job', {
    description: 'Poll a render job by id. Returns status (queued|running|done|error), progress, and on done the served media URL. Use to resume a render left in flight.',
    inputSchema: { id: z.string().describe('the job id, e.g. job_xxx') },
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, wrap(async ({ id }) => {
    const j = await getJob(id);
    const res = jobResult(j);
    const url = abs(res?.video || res?.image || res?.url);
    return ok(`Job ${id}: ${j.status}${j.progress ? ` (${Math.round(j.progress * 100)}%)` : ''}${url ? ` → ${url}` : ''}${j.error ? ` — ${j.error}` : ''}`, { ...j, url });
  }));

  server.registerTool('list_jobs', {
    description: 'List the most recent render jobs + how many are currently running, so you can report on or resume in-flight work.',
    inputSchema: {}, annotations: { readOnlyHint: true, openWorldHint: false },
  }, wrap(async () => {
    const d = await apiGet('/api/jobs');
    const lines = (d.jobs || []).slice(0, 12).map(j => `${j.id} ${j.type} ${j.status}`).join('\n');
    return ok(`${d.running} running. Recent:\n${lines}`, d);
  }));

  // ---------- research / discovery ----------
  server.registerTool('find_competitors', {
    description: "Discover a brand's competitor / similar / adjacent brands from its domain (Claude grounded by web search). mode=competitors (default, excludes the searched company), inspiration (best relevant ads incl. it), or company. 0 ScrapeCreators credits.",
    inputSchema: {
      domain: z.string().describe('the brand domain, e.g. flourish.com'),
      mode: z.enum(['competitors', 'inspiration', 'company']).optional(),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  }, wrap(async ({ domain, mode = 'competitors' }) => {
    const d = await apiPost('/api/inspire/competitors', { domain, mode });
    const list = (d.candidates || []).map(c => `${c.name} (${c.domain || '—'}, ${c.kind})`).join('; ');
    return ok(`Found ${d.candidates?.length || 0}: ${list}`, d);
  }));

  server.registerTool('pull_competitor_ads', {
    description: 'Pull a brand\'s real running ads across Meta / Google / LinkedIn ad libraries (deduped, sorted, right page resolved). Spends ScrapeCreators credits.',
    inputSchema: {
      companyName: z.string().optional().describe('the advertiser name'),
      domain: z.string().optional().describe('the advertiser domain'),
      platforms: z.array(z.string()).optional().describe("default ['facebook']; add 'google','linkedin'"),
      country: z.string().optional().describe("2-letter, default 'US'"),
      limit: z.number().optional(),
      sort: z.string().optional().describe("'longest_running' (default) etc."),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  }, wrap(async (a) => {
    const d = await apiPost('/api/inspire/fanout', { platforms: ['facebook'], country: 'US', limit: 30, sort: 'longest_running', ...a });
    return ok(`Pulled ads for ${a.companyName || a.domain}.`, d);
  }));

  server.registerTool('research_ads', {
    description: 'Natural-language ad research: a Claude tool-use loop over Meta/Google/LinkedIn ad libraries + organic TikTok. Returns a summary + the found ads (with their served URLs). Spends LLM tokens + ScrapeCreators credits.',
    inputSchema: {
      query: z.string().describe('what to research, e.g. "the longest-running protein-pancake ads on Meta"'),
      brand: z.union([z.string(), z.object({}).passthrough()]).optional(),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  }, wrap(async ({ query, brand }) => {
    const brandObj = typeof brand === 'string' ? { name: brand } : brand || null;
    const d = await apiSSE('/api/explore/chat', { messages: [{ role: 'user', content: query }], brand: brandObj });
    return ok(`${d.reply || ''}\n\n(${(d.results || []).length} ads found)`, { reply: d.reply, results: d.results, actions: d.actions });
  }));

  // ---------- brand onboarding ----------
  server.registerTool('get_brand', {
    description: 'What Hermoso ALREADY KNOWS for this account/workspace — the same saved brand profile (products, logos, palette, positioning) + learned memory the web Studio uses. Call this FIRST: if hasBrand is true you can omit brand everywhere; if false, onboard with draft_brand. 0 credits.',
    inputSchema: {},
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  }, wrap(async () => {
    const d = await apiGet('/api/brand/current');
    const text = d?.hasBrand
      ? `Saved brand: ${d.brand.name || d.brand.domain}${d.brand.category ? ' · ' + d.brand.category : ''} · ${d.memoryCount} learned memory notes. plan_ad / plan_variations / create use it automatically when you omit brand.`
      : 'No saved brand for this workspace yet — onboard one with draft_brand (it saves automatically), or the user can onboard in the web Studio.';
    return ok(text, d);
  }));

  server.registerTool('draft_brand', {
    description: 'Onboard a brand profile — from a website domain, a free-text description, or a social handle — into a {name, products, logo, …} object you can pass to plan_ad / generate. 0 ScrapeCreators credits.',
    inputSchema: {
      domain: z.string().optional().describe('a website to scrape'),
      description: z.string().optional().describe('a free-text brand description (no website)'),
      socialHandle: z.string().optional(),
      platform: z.string().optional().describe('platform for socialHandle (instagram/tiktok/…)'),
      save: z.boolean().optional().describe('save as the workspace’s brand (like Studio onboarding) so plan_ad/create use it automatically. Default: saves only when NO brand is saved yet; pass true to overwrite, false to never save'),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
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
    description: 'Resolve a generated asset reference (a /generated/… path or any URL) to a clickable absolute URL + a direct download URL.',
    inputSchema: { url: z.string().describe('the asset url or /generated/ path'), name: z.string().optional() },
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, wrap(async ({ url, name }) => {
    const absolute = abs(url);
    const dl = `${API_BASE}/api/download?url=${encodeURIComponent(url)}${name ? `&name=${encodeURIComponent(name)}` : ''}`;
    return ok(`Asset: ${absolute}\nDownload: ${dl}`, { url: absolute, downloadUrl: dl });
  }));

  // ---------- post-production & analysis (Higgsfield-parity wave: each wraps an EXISTING worker/route) ----------
  server.registerTool('analyze_video', {
    description: "Break a video ad down into its structure: the verbatim transcript (voiceover + on-screen text) with a beat list, plus duration and sampled frame timestamps. Use to study a reference/competitor ad before remixing its structure. Costs ~a transcription call; no ScrapeCreators credits.",
    inputSchema: { url: z.string().describe('the video URL (a served /generated/ path or a public http(s) video)') },
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
    description: "Virality/performance prediction for a finished ad (image or video URL): overall score, per-dimension breakdown (scroll-stop, hook, clarity, brand/product, CTA, retention, goal fit), strengths, and the single biggest fix. Use BEFORE spending on distribution, or to rank variants.",
    inputSchema: {
      url: z.string().describe('the ad asset URL (a /generated/ path or public URL)'),
      kind: z.enum(['image', 'video']).optional(),
      intent: z.string().optional().describe('what the ad is trying to achieve, for goal-fit scoring'),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  }, wrap(async ({ url, kind = 'image', intent = '' }) => {
    const d = await apiPost('/api/score/ad', { url, kind, intent, format: kind });
    if (!d) return ok('Could not score that ad.');
    const dims = (d.dimensions || []).map(x => `${x.name}: ${x.score}`).join(' · ');
    return ok(`Overall ${d.overall}/100 (${d.tier || ''})\n${dims}\nBiggest lever: ${d.top_fix || '—'}`, d);
  }));

  server.registerTool('reframe_video', {
    description: "Reframe a video to a different aspect ratio (e.g. 16:9 master → 9:16 vertical) with smart subject tracking. Paid render; returns the served URL of the reframed video.",
    inputSchema: { video: z.string().describe('the source video URL'), aspectRatio: z.enum(['9:16', '1:1', '16:9']).describe('the target aspect ratio') },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  }, wrap(async ({ video, aspectRatio }) => {
    const r = await renderJob('reframe', { video, aspectRatio }, `Reframe → ${aspectRatio}`);
    return ok(`Reframed video (${aspectRatio}): ${r.url}`, r);
  }));

  server.registerTool('upscale_video', {
    description: "Upscale a video to higher resolution (2x) for final delivery. Paid render; returns the served URL.",
    inputSchema: { video: z.string().describe('the source video URL') },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  }, wrap(async ({ video }) => {
    const r = await renderJob('upscale', { video, factor: 2 }, 'Upscale 2x');
    return ok(`Upscaled video: ${r.url}`, r);
  }));

  server.registerTool('dub_video', {
    description: "Remake a finished video ad's voiceover in another language (translated script, re-voiced, re-muxed). Paid; returns the served URL of the localized video.",
    inputSchema: {
      video: z.string().describe('the source video URL'),
      language: z.string().describe("target language, e.g. 'Spanish', 'de', 'French (Canada)'"),
      script: z.string().optional().describe('the original spoken script if known — improves translation fidelity'),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  }, wrap(async ({ video, language, script }) => {
    const r = await renderJob('dub', { video, language, script: script || '' }, `Dub → ${language}`);
    return ok(`Localized video (${language}): ${r.url}`, r);
  }));

  server.registerTool('recast_motion', {
    description: "Motion transfer: re-perform a reference video's motion with a different person/character (supply their image). The reference clip drives the movement; the image supplies the identity. Paid render.",
    inputSchema: {
      image: z.string().describe("the actor/character image URL (who should appear)"),
      video: z.string().describe('the reference video whose motion to re-perform'),
      prompt: z.string().optional().describe('optional scene/style guidance'),
      orientation: z.enum(['video', 'image']).optional().describe("which aspect to keep: the video's (default) or the image's"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  }, wrap(async ({ image, video, prompt = '', orientation = 'video' }) => {
    const r = await renderJob('motion', { image, video, prompt, orientation }, 'Motion recast');
    return ok(`Recast video: ${r.url}`, r);
  }));

  server.registerTool('plan_variations', {
    description: "Fan a brief into N DISTINCT ad angles (different hooks/mechanics/audiences), each with its own headline + visual brief — then render each with generate_image and rank with score_ad. LLM planning only; renders nothing itself.",
    inputSchema: {
      brand: z.union([z.string(), z.object({}).passthrough()]).optional().describe('brand name or profile object; OMIT to use the workspace’s saved brand'),
      product: z.string().describe('what to advertise'),
      count: z.number().int().min(2).max(8).optional().describe('how many distinct variants (default 6)'),
      language: z.string().optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  }, wrap(async ({ brand, product, count = 6, language }) => {
    const brandObj = brand ? (typeof brand === 'string' ? { name: brand } : brand) : null;
    const d = await apiPost('/api/batch/plan', { brand: brandObj, product, count, language: language || '' });
    const vars = d?.variants || d?.angles || [];
    const text = vars.map((v, i) => `${i + 1}. ${v.name || v.angle || 'Variant'} — ${v.hook || v.headline || ''}`).join('\n') || 'No variants returned.';
    return ok(text, d);
  }));
}
