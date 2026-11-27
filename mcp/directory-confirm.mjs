// ── PROPOSE, THEN APPROVE: THE CONFIRMATION GATE ON THE CURATED CLAUDE DIRECTORY CONNECTORS (2026-11-26) ───────────────
// Anthropic approved Hermoso Social Scheduler as a community connector on one condition: "post_to_meta, post_to_x, …,
// reply_to_inbox_item publish and reply with no confirmation gate … Put a real user confirmation in front of each live
// publish and reply … a propose-then-approve flow (the tool returns a preview — text, media, destination account — and a
// separate confirm tool or a required user-entered confirmation token commits it); an MCP elicitation step that shows the
// exact post and destination; or draft-by-default publishing." destructiveHint alone was not enough, and an instruction
// telling the assistant to ask first is exactly what they rejected.
//
// So on a gated tool of a curated connector the FIRST call does nothing but describe: the exact text, every media URL,
// each destination account / Page / board / chat / handle as the connection resolves it right now, and when. Then:
//   • a client that declared the MCP `elicitation` capability is shown that preview as a confirmation form, and the action
//     runs only on an ACCEPT with confirm:true. A decline or cancel runs nothing and issues no code (a code would let the
//     model step around the user's no).
//   • every other client (and a form that could not be shown) gets the preview plus a short single-use confirmation code.
//     The action runs only when the same tool is called again with the same arguments plus `confirmationCode`.
// The code is bound by HMAC to the tool, the caller's account and the canonical JSON of every argument, so any change to
// the payload is refused; the destinations shown are re-resolved on the commit and a change there is refused too. A code
// is single use (it is spent the moment it is presented, before anything runs, so two concurrent commits cannot both
// publish), lives CONFIRM_TTL_MS, and a payload mismatch burns it. Refusals hand back a fresh preview, never a silent run.
//
// The state is in memory on purpose: one Cloud Run instance serves the MCP transport (maxScale=1), a code outlives no
// restart (the user previews again), and the HMAC key is random per process, so a code can never be minted offline.
//
// Only the curated connectors use it (mcp/tools.mjs replayTools applies it when curatedTokenOf(directory) names a token
// in CONFIRM_GATED). The full connection and every other host are unchanged. cli/mcp/directory-confirm.mjs is a
// byte-identical twin. Pinned by tools/directory-curated-check.mjs (it RUNS the gate against a stub API).
import { createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

export const CONFIRM_ARG = 'confirmationCode';
export const CONFIRM_TTL_MS = 10 * 60 * 1000;
export const CONFIRM_ELICIT_MS = Math.max(5000, Number(process.env.DIRECTORY_ELICIT_MS) || 4 * 60 * 1000);

// What is gated, per curated connector. Social Scheduler: every tool that publishes, schedules, changes, re-sends or
// removes a post, or replies as the brand (the thirteen Anthropic named). Creator Campaigns (still in review): every
// write that reaches a creator, commits the brand to pay, or changes what creators can join; the two ADDITIVE writes (a
// draft campaign nobody can join, a shortlist row) and update_saved_creator (the workspace's own outreach note, sent to
// nobody) stay one-step. Ad Research and Ads Reporting carry no write at all.
export const CONFIRM_GATED = Object.freeze({
  'directory-scheduler': Object.freeze(['post_to_meta', 'post_to_x', 'post_to_linkedin', 'post_to_bluesky', 'post_to_pinterest', 'post_to_telegram', 'post_to_tiktok', 'post_to_youtube', 'schedule_post', 'reschedule_post', 'retry_scheduled', 'cancel_scheduled', 'reply_to_inbox_item']),
  'directory-creators': Object.freeze(['update_creator_campaign', 'creator_campaign_link', 'bulk_invite_creators', 'email_campaign_creator', 'review_campaign_creator', 'review_campaign_post']),
});
export const isConfirmGated = (tok, name) => !!(tok && Object.prototype.hasOwnProperty.call(CONFIRM_GATED, tok) && CONFIRM_GATED[tok].includes(name));

// The sentence every gated tool's listed description ends with, and the parameter it adds.
export const CONFIRM_DESC = Object.freeze({
  'directory-scheduler': 'Two steps: the first call only returns a preview of the exact post, media, destination accounts and timing, with a single-use confirmationCode; it runs when repeated with that code after the user approves, or on the user\'s yes in a confirmation form.',
  'directory-creators': 'Two steps: the first call only returns a preview of exactly what will change, with a single-use confirmationCode; it runs when repeated with that code after the user approves, or on the user\'s yes in a confirmation form.',
});
export const CONFIRM_PARAM_DESC = 'The single-use code from this tool\'s preview of the same arguments, given after the user approves that preview. Absent, the call only returns the preview. Expires after 10 minutes; any change to the arguments needs a new preview.';

// A call that cannot have any effect passes straight through (a dry run stores and posts nothing; a draft is never
// published until it is scheduled, which is a separate, gated call).
export const confirmPassThrough = (name, args) => !!args && ((args.dryRun === true && (name === 'schedule_post' || name === 'post_to_x')) || (args.draft === true && name === 'schedule_post'));

// ── the code ──────────────────────────────────────────────────────────────────────────────────────────────────────────
const KEY = randomBytes(32);
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I, O, 0, 1
const PENDING = new Map(); // code -> { mac, tool, owner, destKey, exp }
const SPENT = new Map(); // code -> exp (so a reused code is named as reused, not as unknown)
const PENDING_MAX = 20000;

export function canonicalJson(v) {
  const c = (x) => {
    if (x === undefined || typeof x === 'function' || typeof x === 'symbol') return undefined;
    if (x === null || typeof x !== 'object') return typeof x === 'number' && !Number.isFinite(x) ? null : x;
    if (Array.isArray(x)) return x.map((y) => { const z = c(y); return z === undefined ? null : z; });
    const o = {};
    for (const k of Object.keys(x).sort()) { const z = c(x[k]); if (z !== undefined) o[k] = z; }
    return o;
  };
  return JSON.stringify(c(v) ?? null);
}
// Everything the call will send, minus the code itself. `bind` is what else the code is tied to (a per-call brand).
export function payloadMac(tool, owner, args, bind = '') {
  const a = {}; if (args && typeof args === 'object') for (const k of Object.keys(args)) if (k !== CONFIRM_ARG) a[k] = args[k];
  return createHmac('sha256', KEY).update(String(tool)).update('\0').update(String(owner)).update('\0').update(String(bind)).update('\0').update(canonicalJson(a)).digest();
}
export const normalizeCode = (c) => String(c == null ? '' : c).toUpperCase().replace(/[^A-Z0-9]/g, '');
function sweep(now) {
  for (const [k, e] of PENDING) if (e.exp <= now) PENDING.delete(k);
  for (const [k, exp] of SPENT) if (exp <= now) SPENT.delete(k);
  while (PENDING.size > PENDING_MAX) PENDING.delete(PENDING.keys().next().value);
}
export function issueCode({ tool, owner, mac, destKey = '', now = Date.now() }) {
  sweep(now);
  let code = '';
  do { code = ''; for (let i = 0; i < 6; i++) code += ALPHABET[randomInt(ALPHABET.length)]; } while (PENDING.has(code) || SPENT.has(code));
  const exp = now + CONFIRM_TTL_MS;
  PENDING.set(code, { mac, tool, owner, destKey, exp });
  return { code, expiresAt: new Date(exp).toISOString() };
}
// { ok:true } or { ok:false, reason } with reason one of: unknown, used, expired, tool, payload, destination.
// A code presented by its own caller is spent HERE, before anything runs, whatever the outcome; a code that belongs to
// another account is answered as unknown and left alone.
export function redeemCode({ code, tool, owner, mac, destKey = '', now = Date.now() }) {
  const k = normalizeCode(code);
  const e = PENDING.get(k);
  if (!e) return { ok: false, reason: SPENT.has(k) && SPENT.get(k) > now ? 'used' : 'unknown' };
  if (e.owner !== owner) return { ok: false, reason: 'unknown' };
  PENDING.delete(k); SPENT.set(k, e.exp);
  if (e.exp <= now) return { ok: false, reason: 'expired' };
  if (e.tool !== tool) return { ok: false, reason: 'tool' };
  if (!(Buffer.isBuffer(mac) && mac.length === e.mac.length && timingSafeEqual(mac, e.mac))) return { ok: false, reason: 'payload' };
  if (String(destKey) !== String(e.destKey)) return { ok: false, reason: 'destination' };
  return { ok: true };
}
// Spend a code without running anything: the 2026-07-28 era (mcp/era-2026-serve.mjs) holds a preview's code server-side
// while the user answers its MRTR form, and a no (or a dismissal) must leave nothing redeemable behind, exactly as the
// legacy elicitation branch below issues no code at all.
export function spendCode(code, now = Date.now()) {
  const k = normalizeCode(code);
  const e = PENDING.get(k);
  if (!e) return false;
  PENDING.delete(k); SPENT.set(k, Math.max(e.exp, now));
  return true;
}
export const _confirmStateForTests = Object.freeze({ clear() { PENDING.clear(); SPENT.clear(); }, size: () => PENDING.size });
const REFUSED = {
  unknown: 'is not a code this connection issued (or it was issued to another account)',
  used: 'was already used',
  expired: 'has expired',
  tool: 'was issued for a different action',
  payload: 'was issued for different content: the arguments changed after the preview',
  destination: 'was issued for different destination accounts: what the connection posts to changed after the preview',
};

// ── the preview ───────────────────────────────────────────────────────────────────────────────────────────────────────
const CH_LABEL = { facebook: 'Facebook', instagram: 'Instagram', threads: 'Threads', tiktok: 'TikTok', youtube: 'YouTube', linkedin: 'LinkedIn', x: 'X', pinterest: 'Pinterest', google_business: 'Google Business Profile', bluesky: 'Bluesky', telegram: 'Telegram', wordpress: 'WordPress', discord: 'Discord', slack: 'Slack', whop: 'Whop', shopify_blog: 'Shopify blog', webflow: 'Webflow', wix: 'Wix' };
const POST_TOOL_CHANNEL = { post_to_x: 'x', post_to_linkedin: 'linkedin', post_to_bluesky: 'bluesky', post_to_pinterest: 'pinterest', post_to_telegram: 'telegram', post_to_tiktok: 'tiktok', post_to_youtube: 'youtube' };
const MULTI = new Set(['tiktok', 'x', 'youtube', 'threads', 'bluesky', 'telegram', 'pinterest', 'instagram']);
// The words people read, shown in full and first. Everything else the call sends is listed after, so nothing is hidden.
const TEXT_KEYS = ['title', 'photoTitle', 'message', 'text', 'description', 'captions', 'thread', 'threadsChain', 'threadsLongText', 'firstComment', 'linkTitle', 'linkDescription', 'linkName', 'videoTitle', 'videoDescription', 'documentTitle', 'excerpt', 'seoTitle', 'seoDescription', 'name', 'brief', 'reason', 'comment', 'displayName'];
const MEDIA_KEYS = ['imageUrl', 'imageUrls', 'videoUrl', 'mediaUrl', 'mediaUrls', 'documentUrl', 'thumbnailUrl', 'videoThumbnailUrl', 'coverUrl', 'coverImageUrl', 'captionsSrt', 'linkThumbnailUrl', 'linkPicture', 'media', 'attachments', 'link', 'linkUrl', 'linkAttachment', 'callToActionLink'];
const DEST_KEYS = ['target', 'account', 'accounts', 'accountGroup', 'pageId', 'boardId', 'boardSectionId', 'chatId', 'linkedinOrganizationId', 'locationId', 'channels', 'brand', 'brands', 'id', 'campaignId', 'participantId', 'submissionId', 'targetCampaignId'];
const WHEN_KEYS = ['at', 'atByChannel', 'timezone', 'useQueue', 'scheduleAt', 'publishAt'];
const ACTION_KEYS = ['action', 'status', 'kind', 'privacy', 'destination', 'visibility'];
const quote = (s) => `"""\n${String(s)}\n"""`;
const show = (v) => (typeof v === 'string' ? v : JSON.stringify(v));

async function safe(fn, ms = 8000) {
  try { return await Promise.race([Promise.resolve().then(fn), new Promise((_, rej) => { const t = setTimeout(() => rej(new Error('timed out')), ms); if (t && typeof t.unref === 'function') t.unref(); })]); }
  catch (e) { return { __err: String((e && e.message) || e).slice(0, 160) }; }
}
// One read per provider per preview (memoised inside a describe call).
function readers(apiGet) {
  const memo = new Map();
  const get = (p, q) => { const k = p + JSON.stringify(q || {}); if (!memo.has(k)) memo.set(k, safe(() => apiGet(p, q))); return memo.get(k); };
  return {
    accounts: (p) => get(`/api/connectors/${p}/accounts`),
    pages: () => get('/api/meta/pages'),
    linkedin: () => get('/api/linkedin/identities'),
    boards: () => get('/api/pinterest/boards'),
    locations: () => get('/api/google-business/locations'),
    schedule: (brand) => get('/api/schedule', brand ? { brandId: brand } : undefined),
  };
}
const handleOf = (s) => String(s || '').trim().replace(/^@/, '').toLowerCase();
function pickAccount(d, want, label) {
  if (d && d.__err) return { name: `${label} account (could not be read just now: ${d.__err})`, id: '?' };
  const rows = Array.isArray(d && d.accounts) ? d.accounts : [];
  const nm = (a) => (a.handle ? '@' + a.handle : a.label || String(a.id));
  if (want) {
    const w = handleOf(want);
    const hit = rows.find((a) => String(a.id) === String(want) || handleOf(a.handle) === w);
    return hit ? { name: `${label} ${nm(hit)}`, id: String(hit.id) } : { name: `${label} account "${want}" (not among this brand's connected ${label} accounts, so the call will be refused)`, id: 'missing:' + want };
  }
  if (rows.length === 1) return { name: `${label} ${nm(rows[0])}`, id: String(rows[0].id) };
  if (!rows.length) return { name: `${label}: no account connected to this brand (the call will be refused)`, id: 'none' };
  return { name: `${label}: ${rows.length} accounts connected (${rows.map(nm).join(', ')}) and none named, so the call will be refused until one is chosen`, id: 'ambiguous' };
}
async function resolveChannel(R, ch, a, accountsMap) {
  const label = CH_LABEL[ch] || ch;
  const want = (accountsMap && accountsMap[ch] !== undefined) ? accountsMap[ch] : (a.account || '');
  if (ch === 'facebook' || (ch === 'instagram' && !want)) {
    const d = await R.pages();
    if (d && d.__err) return { channel: ch, name: `${label} (the Page could not be read just now: ${d.__err})`, id: '?' };
    const pages = Array.isArray(d && d.pages) ? d.pages : [];
    let pg = a.pageId ? pages.find((p) => String(p.id) === String(a.pageId)) : pages.length === 1 ? pages[0] : null;
    if (ch === 'facebook') {
      if (pg) return { channel: ch, name: `Facebook Page "${pg.name}" (id ${pg.id})`, id: String(pg.id) };
      if (a.pageId) return { channel: ch, name: `Facebook Page ${a.pageId} (not shared with this brand, so the call will be refused)`, id: 'missing:' + a.pageId };
      return { channel: ch, name: pages.length ? `Facebook: ${pages.length} Pages shared (${pages.map((p) => p.name).join(', ')}) and none named, so the call will be refused until one is chosen` : 'Facebook: no Page shared with this brand (the call will be refused)', id: pages.length ? 'ambiguous' : 'none' };
    }
    if (pg && pg.instagram) return { channel: ch, name: `Instagram @${pg.instagram.username} (linked to the Page "${pg.name}")`, id: String(pg.instagram.id || pg.instagram.username) };
  }
  if (ch === 'linkedin') {
    const d = await R.linkedin();
    if (d && d.__err) return { channel: ch, name: `LinkedIn (could not be read just now: ${d.__err})`, id: '?' };
    if (a.linkedinOrganizationId) {
      const pg = (Array.isArray(d && d.pages) ? d.pages : []).find((p) => String(p.id) === String(a.linkedinOrganizationId));
      return pg ? { channel: ch, name: `LinkedIn company Page "${pg.name}" (id ${pg.id})`, id: 'org:' + pg.id } : { channel: ch, name: `LinkedIn company Page ${a.linkedinOrganizationId} (not shared with this brand, so the call will be refused)`, id: 'missing:' + a.linkedinOrganizationId };
    }
    const m = d && d.member;
    return m ? { channel: ch, name: `the personal LinkedIn profile of ${m.name || 'the connected member'}`, id: 'member:' + m.id } : { channel: ch, name: 'LinkedIn: no personal profile connected (the call will be refused)', id: 'none' };
  }
  if (ch === 'google_business') {
    const d = await R.locations();
    const locs = Array.isArray(d && d.locations) ? d.locations.filter((l) => l.selected !== false) : [];
    const l = a.locationId ? locs.find((x) => String(x.id) === String(a.locationId)) : locs.length === 1 ? locs[0] : null;
    if (d && d.__err) return { channel: ch, name: `Google Business Profile (could not be read just now: ${d.__err})`, id: '?' };
    return l ? { channel: ch, name: `Google Business Profile listing "${l.title || l.id}"${l.address ? ` (${l.address})` : ''}`, id: String(l.id) } : { channel: ch, name: a.locationId ? `Google Business Profile listing ${a.locationId} (not shared with this brand, so the call will be refused)` : `Google Business Profile: ${locs.length} listings shared and none named`, id: a.locationId ? 'missing:' + a.locationId : 'ambiguous' };
  }
  if (MULTI.has(ch)) {
    const acc = pickAccount(await R.accounts(ch), Array.isArray(want) ? want.join(',') : want === 'all' ? '' : want, label);
    const out = { channel: ch, name: want === 'all' ? `${label}: every connected account` : acc.name, id: want === 'all' ? 'all' : acc.id };
    if (Array.isArray(want) && want.length > 1) { out.name = `${label} accounts ${want.join(', ')}`; out.id = want.map(String).sort().join(','); }
    if (ch === 'pinterest') {
      if (!a.boardId) { out.name += ', and no board named (Pinterest needs one, so the call will be refused)'; out.id += '|board:none'; }
      else { const b = await R.boards(); const row = (Array.isArray(b && b.boards) ? b.boards : Array.isArray(b && b.items) ? b.items : []).find((x) => String(x.id) === String(a.boardId)); out.name += `, board ${row ? `"${row.name}" (id ${a.boardId})` : a.boardId}`; out.id += '|board:' + a.boardId; }
    }
    if (ch === 'telegram') { out.name += a.chatId ? `, into the chat ${a.chatId}` : ', and no chat named (the call will be refused)'; out.id += '|chat:' + (a.chatId || 'none'); }
    return out;
  }
  return { channel: ch, name: `the ${label} ${/wordpress|webflow|wix|shopify_blog/.test(ch) ? 'site' : 'workspace'} connected to this brand${a.slackChannel ? `, channel ${a.slackChannel}` : a.discordChannel ? `, channel ${a.discordChannel}` : ''}`, id: ch + (a.slackChannel || a.discordChannel ? ':' + (a.slackChannel || a.discordChannel) : '') };
}
function findRow(d, id) {
  if (!d || d.__err) return null;
  for (const k of ['scheduled', 'history', 'drafts']) { const hit = (Array.isArray(d[k]) ? d[k] : []).find((r) => r && r.id === id); if (hit) return hit; }
  return null;
}
const ACTION_OF = {
  post_to_meta: (a) => (a.scheduleAt && (a.target || 'facebook') === 'facebook' ? `Schedule a Facebook Page post for ${a.scheduleAt} (Facebook publishes it then, publicly)` : `Publish ${a.story ? 'a 24-hour Story' : 'a post'} to ${CH_LABEL[a.target || 'facebook']} now, publicly`),
  post_to_x: (a) => `Publish ${Array.isArray(a.thread) && a.thread.length ? `a ${a.thread.length}-part thread` : a.replyToId ? `a reply to post ${a.replyToId}` : 'a post'} to X now, publicly`,
  post_to_linkedin: () => 'Publish a post to a LinkedIn profile now, publicly',
  post_to_bluesky: () => 'Publish a post to Bluesky now, publicly',
  post_to_pinterest: () => 'Create a Pin now, on the public profile',
  post_to_telegram: () => 'Send a message to a Telegram chat now, as the brand\'s bot',
  post_to_tiktok: (a) => (a.destination === 'draft' ? 'Send a video or photo post to the TikTok inbox as a draft (it is not published until the user finishes it in TikTok)' : `Publish to TikTok now with privacy ${a.privacy || '(not chosen: the call will be refused)'}`),
  post_to_youtube: (a) => (a.publishAt ? `Upload a video to YouTube, private until ${a.publishAt}, then public` : `Upload a video to YouTube now, ${a.privacy || 'public'}`),
  schedule_post: (a) => (a.useQueue ? 'Schedule a post into the brand\'s next free posting slot; it goes live publicly then' : `Schedule a post for ${a.at || '(each channel\'s own time)'}${a.timezone ? ` (${a.timezone})` : ''}; it goes live publicly then`),
  reschedule_post: (a) => `Change the queued post ${a.id}`,
  cancel_scheduled: (a) => `Remove the queued post ${a.id}; it will not publish`,
  retry_scheduled: (a) => `Send the failed post ${a.id} again${a.at ? ` at ${a.at}` : ' now'}`,
  reply_to_inbox_item: (a) => `Reply as the brand to the inbox item ${a.id}`,
};
// The preview. Never throws: a read that fails is named in the preview (and in destKey) instead of hiding the line.
// `inbox` maps an inbox source id to { label, private }, read from mcp/tools.mjs's INBOX_SOURCES by the caller.
export async function describeAction(tool, args, { apiGet, title = '', inbox = null, dryRun = null } = {}) {
  const a = args && typeof args === 'object' ? args : {};
  const R = readers(apiGet || (async () => { throw new Error('no reader'); }));
  const lines = [];
  const dests = [];
  let row = null;
  const action = (ACTION_OF[tool] || (() => title || tool))(a);
  if (['reschedule_post', 'cancel_scheduled', 'retry_scheduled'].includes(tool)) {
    const d = await R.schedule(a.brand);
    row = findRow(d, String(a.id || ''));
    if (d && d.__err) lines.push(`The queued post could not be read just now (${d.__err}).`);
    else if (!row) lines.push(`No queued or sent post with id ${a.id} was found on this brand, so the call will be refused.`);
  }
  // Destinations.
  if (tool === 'post_to_meta') dests.push(await resolveChannel(R, a.target || 'facebook', a, null));
  else if (POST_TOOL_CHANNEL[tool]) dests.push(await resolveChannel(R, POST_TOOL_CHANNEL[tool], a, null));
  else if (['schedule_post', 'reschedule_post', 'retry_scheduled', 'cancel_scheduled'].includes(tool)) {
    const merged = { ...(row || {}), ...a };
    const chans = Array.isArray(a.channels) && a.channels.length ? a.channels : Array.isArray(row && row.channels) ? row.channels : [];
    const acct = (a.accounts && typeof a.accounts === 'object') ? a.accounts : (row && row.accounts && typeof row.accounts === 'object' ? row.accounts : null);
    for (const ch of chans) dests.push(await resolveChannel(R, String(ch), merged, acct));
    if (a.brands) dests.push({ channel: 'brands', name: `each of these brands' own connected channels: ${show(a.brands)}`, id: 'brands:' + canonicalJson(a.brands) });
  } else if (tool === 'reply_to_inbox_item') {
    const src = String(a.id || '').split(':')[0];
    const meta = inbox && inbox[src];
    dests.push({ channel: src, name: meta ? `${meta.label} ${String(a.id).slice(src.length + 1)}: ${meta.private ? 'a PRIVATE reply to that person' : 'a PUBLIC reply, visible to everyone who can see the original'}` : `inbox item ${a.id}`, id: String(a.id || '') });
  } else {
    for (const k of ['campaignId', 'participantId', 'submissionId', 'targetCampaignId']) if (a[k]) dests.push({ channel: k, name: `${k} ${a[k]}`, id: `${k}:${a[k]}` });
  }
  lines.unshift(`Action: ${action}.`);
  if (dests.length) lines.push(`Destination${dests.length > 1 ? 's' : ''}:\n${dests.map((d) => `  - ${d.name}`).join('\n')}`);
  // When.
  const when = WHEN_KEYS.filter((k) => a[k] !== undefined && a[k] !== '' && a[k] !== false).map((k) => `${k}: ${show(a[k])}`);
  if (row && row.at && !a.at && tool !== 'post_to_meta') when.unshift(`currently queued for ${row.at}`);
  if (when.length) lines.push(`When: ${when.join('; ')}`);
  // The post as it stands (for a change: what is there now, then what changes).
  if (row && tool !== 'reschedule_post') {
    const cur = [];
    if (row.message) cur.push(`Text:\n${quote(row.message)}`);
    if (row.captions && typeof row.captions === 'object') for (const [ch, t] of Object.entries(row.captions)) cur.push(`Text on ${CH_LABEL[ch] || ch}:\n${quote(t)}`);
    for (const k of MEDIA_KEYS) if (row[k]) cur.push(`${k}: ${show(row[k])}`);
    if (cur.length) lines.push(`The post:\n${cur.join('\n')}`);
  }
  if (row && tool === 'reschedule_post' && row.message && a.message === undefined) lines.push(`Text (unchanged):\n${quote(row.message)}`);
  const words = [];
  for (const k of TEXT_KEYS) {
    const v = a[k];
    if (v === undefined || v === null || v === '') continue;
    if (k === 'captions' && typeof v === 'object' && !Array.isArray(v)) { for (const [ch, t] of Object.entries(v)) words.push(`Text on ${CH_LABEL[ch] || ch}${tool === 'reschedule_post' ? ' (new)' : ''}:\n${quote(t)}`); continue; }
    if (Array.isArray(v)) { words.push(`${k} (${v.length} parts):\n${v.map((t, i) => `  ${i + 1}. ${quote(typeof t === 'string' ? t : JSON.stringify(t))}`).join('\n')}`); continue; }
    words.push(`${k}${tool === 'reschedule_post' ? ' (new)' : ''}:\n${quote(typeof v === 'string' ? v : JSON.stringify(v))}`);
  }
  if (words.length) lines.push(words.join('\n'));
  const media = MEDIA_KEYS.filter((k) => a[k] !== undefined && a[k] !== null && a[k] !== '' && !(Array.isArray(a[k]) && !a[k].length)).map((k) => (Array.isArray(a[k]) ? `${k} (in order):\n${a[k].map((u, i) => `  ${i + 1}. ${show(u)}`).join('\n')}` : `${k}: ${show(a[k])}`));
  if (media.length) lines.push(`Media and links:\n${media.join('\n')}`);
  const acts = ACTION_KEYS.filter((k) => a[k] !== undefined && a[k] !== '').map((k) => `${k}: ${show(a[k])}`);
  if (acts.length) lines.push(acts.join('\n'));
  const shown = new Set([...TEXT_KEYS, ...MEDIA_KEYS, ...WHEN_KEYS, ...ACTION_KEYS, ...DEST_KEYS, CONFIRM_ARG]);
  const rest = Object.keys(a).filter((k) => !shown.has(k) && a[k] !== undefined && a[k] !== '' && !(Array.isArray(a[k]) && !a[k].length)).sort();
  if (rest.length) lines.push(`Other settings sent:\n${rest.map((k) => `  ${k}: ${show(a[k])}`).join('\n')}`);
  const named = DEST_KEYS.filter((k) => a[k] !== undefined && a[k] !== '' && !['channels', 'id'].includes(k) && !dests.some((d) => d.channel === k)).map((k) => `${k}: ${show(a[k])}`);
  if (named.length) lines.push(`Named in the call: ${named.join('; ')}`);
  if (typeof dryRun === 'function') {
    const r = await safe(dryRun, 15000);
    const t = r && !r.__err ? (Array.isArray(r.content) ? r.content.map((c) => c && c.text).filter(Boolean).join(' ') : '') : '';
    if (t) lines.push(`${tool === 'post_to_x' ? 'Cost check (nothing posted)' : 'Pre-check (nothing stored)'}: ${t.slice(0, 900)}`);
  }
  const destKey = canonicalJson(dests.map((d) => [d.channel, d.id]).sort((x, y) => (x[0] + x[1] < y[0] + y[1] ? -1 : 1)));
  return { action, text: lines.join('\n\n'), destinations: dests.map((d) => ({ channel: d.channel, account: d.name })), destKey };
}

// ── the gate ──────────────────────────────────────────────────────────────────────────────────────────────────────────
// handler: the tool's own handler. server: the McpServer (for the client's declared capabilities and elicitation).
// owner(): who is calling (an account id; never an argument). bind(args): anything else the code is tied to.
export function makeConfirmGate({ tool, title = '', handler, server = null, apiGet = null, owner = () => 'local', bind = () => '', inbox = null, dryRun = null, now = () => Date.now() }) {
  const gated = async (args, extra) => {
    const a = args && typeof args === 'object' ? args : {};
    const presented = Object.prototype.hasOwnProperty.call(a, CONFIRM_ARG) ? a[CONFIRM_ARG] : undefined;
    if (presented !== undefined) { try { delete a[CONFIRM_ARG]; } catch {} }
    if (confirmPassThrough(tool, a)) return handler(a, extra);
    const who = String(owner() || 'local');
    const mac = payloadMac(tool, who, a, bind(a));
    const pv = await describeAction(tool, a, { apiGet, title, inbox, dryRun: typeof dryRun === 'function' && !['reschedule_post', 'cancel_scheduled', 'retry_scheduled'].includes(tool) ? () => dryRun(a, extra) : null });
    let refused = '';
    if (presented !== undefined && presented !== null && String(presented).trim() !== '') {
      const r = redeemCode({ code: presented, tool, owner: who, mac, destKey: pv.destKey, now: now() });
      if (r.ok) return handler(a, extra);
      refused = `The confirmation code ${normalizeCode(presented) || '(empty)'} ${REFUSED[r.reason] || 'was not accepted'}. Nothing was done.`;
    }
    // A client that can show a confirmation form: the user answers there, and no code is issued at all.
    const caps = !refused && server && server.server && typeof server.server.getClientCapabilities === 'function' ? server.server.getClientCapabilities() : null;
    let formNote = '';
    if (caps && caps.elicitation && typeof server.server.elicitInput === 'function') {
      try {
        const res = await server.server.elicitInput({
          message: `Please confirm.\n\n${pv.text}`.slice(0, 12000),
          requestedSchema: { type: 'object', properties: { confirm: { type: 'boolean', title: 'Yes, do exactly this', description: 'Nothing happens unless this is ticked and accepted.', default: false } }, required: ['confirm'] },
        }, { relatedRequestId: extra && extra.requestId, timeout: CONFIRM_ELICIT_MS, ...(extra && extra.signal ? { signal: extra.signal } : {}) });
        if (res && res.action === 'accept' && res.content && res.content.confirm === true) return handler(a, extra);
        const how = res && res.action === 'accept' ? 'accepted the form without ticking the confirmation' : res && res.action === 'decline' ? 'declined' : 'cancelled';
        return {
          content: [{ type: 'text', text: `Not done: the user ${how} on the confirmation form. Nothing was published, sent or changed.\n\n${pv.text}` }],
          structuredContent: { confirmation: { status: 'declined', via: 'elicitation', action: pv.action, destinations: pv.destinations } },
        };
      } catch (e) { formNote = `The confirmation form could not be shown (${String((e && e.message) || e).slice(0, 120)}), so this preview carries a code instead.`; }
    }
    const { code, expiresAt } = issueCode({ tool, owner: who, mac, destKey: pv.destKey, now: now() });
    const head = refused ? `${refused} A new preview follows.` : 'PREVIEW ONLY. Nothing has been published, sent or changed.';
    const tail = `Confirmation code: ${code} (single use, valid 10 minutes, for exactly this content and these destinations). The action runs only when this tool is called again with the same arguments plus confirmationCode "${code}", which is for after the user has seen this preview and approved it. Any change to the content or destination needs a new preview.`;
    return {
      content: [{ type: 'text', text: [head, formNote, pv.text, tail].filter(Boolean).join('\n\n') }],
      structuredContent: { confirmation: { status: refused ? 'refused_new_preview' : 'preview', code, expiresAt, action: pv.action, destinations: pv.destinations } },
    };
  };
  try { gated._hermosoTool = handler && handler._hermosoTool; gated._hermosoConfirmGate = tool; } catch {}
  return gated;
}
