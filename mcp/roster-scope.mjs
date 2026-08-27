// ── THE CONNECTOR SCOPE — ONE LAW, TWO SURFACES (2026-08-26) ─────────────────────────────────────────────────────
//
// WHICH CONNECTOR A TOOL NEEDS, and therefore whether carrying it in a roster buys the caller anything. Shipped
// first for the Studio chat (lib/studio-roster.mjs, which re-exports every symbol below), and lifted here so the
// MCP twins can apply the IDENTICAL decision. It lives in mcp/ rather than lib/ for one mechanical reason: the
// published npm package (cli/) ships `cli/mcp/**` and nothing else, so `./roster-scope.mjs` is the only path that
// resolves from BOTH mcp/tools.mjs and its byte-identical cli/mcp/tools.mjs twin.
//
// WHY GATE ON THE CONNECTION AT ALL. A connector-bound tool for a provider the account has not connected can only
// ever answer `401 {connector:'<p>'}` — "not connected has ONE shape". Carrying it buys the caller nothing, costs
// them context on every turn, and actively harms them: a roster many times past the 30–50 tool accuracy cliff is
// exactly what makes a model pick the wrong tool. The MCP spec (rev 2026-07-28, Tools ▸ Capabilities) blesses this
// precise shape and no other: the tool set "MUST NOT vary per-connection or as a side effect of other requests on
// the connection. The set MAY vary by the authorization presented on the request — for example, returning only the
// tools the caller's granted scopes permit — since credentials are per-request input, not connection state."
//
// FIVE SAFETY PROPERTIES, each mutation-tested, because the failure mode of getting this wrong is INVISIBLE — a
// silently missing tool reads as the model refusing, not as a bug:
//
//   1. **A failed connector read is never a refusal.** `readOk:false` holds back NOTHING. An unreadable store must
//      never manufacture a capability loss ([[failed-read-is-not-empty]]).
//   2. **An UNMAPPED tool is never held back.** The rules below are an allow-list of things we can justify, not a
//      classifier. Anything this module cannot confidently attribute to a connector stays in the roster — which is
//      what makes adding a tool safe: tool N+1 keeps working, it just does not get the saving.
//   3. **Every provider named here must exist in the live connector registry.** A typo'd provider id would match
//      nothing in `connected` and silently drop its whole family FOREVER, on every account. The check asserts the
//      rule table against server.js's own CONNECTOR_INFO keys.
//   4. **Research is never gated** — see NEVER_GATE below, and note the measured result on the MCP roster: of the
//      18 tools in the `research` group, the `core` group and the `workspace` group, ZERO are connector-mapped.
//   5. **A tool we did not register is not ours to filter.** Both callers hand these functions OUR tool names only;
//      a user's own MCP server may call something `search_youtube_transcripts` and it must never be touched.
//
// Pure by design so the checks RUN these functions rather than reading the source. NO IMPORTS: the cli twin is
// rsync'd into a published package that has no lib/ and no repo around it.
// RESEARCH IS NEVER GATED, AND THIS LIST IS THE REASON THE WHOLE CHANGE IS SAFE.
//
// The ad libraries and organic social search run on OUR OWN research key, not on the user's connection — a brand
// with nothing connected can and must still spy on its competitors' Meta ads. But their NAMES look exactly like
// connector tools: `search_meta_ads` contains `_meta_`, `search_youtube` contains `youtube`. Six of the nine would
// have been silently gated by the rules below, which would have broken the product's single most-used feature for
// every new account — the exact users this change exists to protect.
//
// DERIVED, NOT HAND-LISTED. `tools/studio-roster-check.mjs` asserts this set is a SUPERSET of server.js's own
// `SC_WINDOW_TOOLS` — the set the route already uses to decide which tools take a research-balance window.
// So a tenth research-backed tool added there fails the suite rather than quietly losing research for zero-connector
// accounts. Anything our own research key pays for, the user reaches without connecting anything.
//
// NOTE what is deliberately NOT here: `search_instagram_hashtag`, `instagram_profile`, `search_threads_keyword`,
// `discover_tiktok_creators`, `tiktok_creator_info`. Those read the PLATFORM's data through the USER'S token
// (Business Discovery, the Threads API, TikTok's Creator Marketplace) — free to us, but impossible without the
// connection, so gating them is correct.
export const NEVER_GATE = new Set([
  'search_meta_ads', 'search_google_ads', 'search_linkedin_ads', 'search_tiktok',
  'search_instagram', 'search_youtube', 'search_reddit', 'search_threads', 'fetch_social_data',
]);

// Tool-name → connector provider. ORDERED: the first match wins, so the more specific pattern must come first.
//
// THE ORDER IS LOAD-BEARING AND IS THE EASIEST THING TO GET WRONG. Six platforms hold TWO independent connections —
// posting and ads are separate consents with separate tokens (CLAUDE.md records this explicitly for TikTok: "IT IS
// A SEPARATE CONNECTION FROM THE `tiktok` POSTING CONNECTOR", and the same split is real for X, Pinterest, Reddit,
// Snapchat and Microsoft). So `*_tiktok_ads_*` must be tested BEFORE the bare `tiktok` rule, or every ads tool
// would be gated on the posting connector and a user with TikTok Ads connected but not TikTok posting would lose
// the whole ads family they are paying for.
export const TOOL_PROVIDER_RULES = [
  // ── ads platforms that are their OWN connection (must precede the posting rules below) ──
  [/_tiktok_ads_|^tiktok_ads_/, 'tiktok_ads'],
  [/_x_ads_|^x_ads_/, 'x_ads'],
  [/_pinterest_ads_|^pinterest_ads_/, 'pinterest_ads'],
  [/_reddit_ads_|^reddit_ads_/, 'reddit_ads'],
  [/_snapchat_ads_|^snapchat_ads_/, 'snapchat_ads'],
  [/_microsoft_ads_|^microsoft_ads_|_microsoft_merchant_/, 'microsoft_ads'],
  [/_apple_ads_|^apple_ads_/, 'apple_ads'],
  [/_openai_ads_|^openai_ads_/, 'openai_ads'],
  // Google Ads owns Merchant Center + the Ads↔Analytics link (both are Google Ads API surfaces, not GA4 ones).
  [/_google_ads_|^google_ads_|_merchant_|^merchant_|^list_merchant_|link_google_ads_to_analytics/, 'google_ads'],
  // ── LinkedIn: ads and posting share ONE connection (the Advertising API grant carries w_organization_social —
  //    see [[linkedin-connector-live]]), so both families gate on the single `linkedin` provider. ──
  [/linkedin/, 'linkedin'],
  // ── Meta: ads management AND FB/IG posting are one connector ([[meta-integration]]). Threads is separate. ──
  [/^threads_|_thread$|_threads_|^(list|search|reply_to|repost|delete|hide)_thread/, 'threads'],
  [/_meta_|^meta_|_meta$|instagram|whatsapp/, 'meta'],
  // ── analytics / measurement, each its own connection ──
  [/_analytics_|^analytics_(realtime|report)$|analytics_compatibility|analytics_stream/, 'google_analytics'],
  [/mixpanel/, 'mixpanel'],
  [/tag_manager/, 'google_tag_manager'],
  [/search_console/, 'google_search_console'],
  [/bing_webmaster/, 'bing_webmaster'],
  [/posthog/, 'posthog'],
  [/amplitude/, 'amplitude'],
  // ── posting-only channels ──
  [/youtube/, 'youtube'],
  [/google_business|business_location/, 'google_business'],
  [/_drive_|^list_drive|^get_drive|^create_drive|^save_to_drive$|_doc$|^read_doc|^create_doc|^update_doc|^append_to_doc|sheet/, 'google_drive'],
  [/onedrive/, 'microsoft_onedrive'],
  [/bluesky/, 'bluesky'],
  [/telegram/, 'telegram'],
  [/^post_to_tiktok$|^tiktok_|_tiktok_/, 'tiktok'],
  [/^post_to_x$|^delete_x_post$|^send_x_dm$|^list_x_dms$|^x_(mentions|post)/, 'x'],
  [/pinterest/, 'pinterest'],
  [/reddit/, 'reddit'],
  [/snapchat/, 'snapchat'],
];

// The provider a tool needs, or null when this module cannot attribute it. null ⇒ NEVER dropped (property 2).
export function toolProvider(name) {
  const n = String(name || '');
  if (!n) return null;
  if (NEVER_GATE.has(n)) return null;   // research runs on our key — checked FIRST, before any pattern can claim it
  for (const [re, provider] of TOOL_PROVIDER_RULES) if (re.test(n)) return provider;
  return null;
}
// THE ONE DECISION, and the only one either surface is allowed to make. `conn` is `{connected, readOk}` — the
// shape both the Studio route's connector read and the MCP transports' `/api/connectors/providers` read produce.
//
// Returns TRUE only when we KNOW the read succeeded AND we can attribute the tool to a provider AND that provider
// is not connected. Every other answer is FALSE, i.e. keep it — which is properties 1 and 2 expressed as the
// default rather than as two branches somebody could forget to write.
export function toolHeldBackByConnectors(name, conn) {
  if (!conn || !conn.readOk) return false;                       // property 1 — fail OPEN on an unreadable store
  const p = toolProvider(name);
  if (p === null) return false;                                  // property 2 — unmapped is never held back
  const on = conn.connected instanceof Set ? conn.connected : new Set(conn.connected || []);
  return !on.has(p);
}
