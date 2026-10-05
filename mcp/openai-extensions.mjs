// ── CHATGPT PLUGIN EXTENSIONS: THE HERMOSO APP (2026-10-02, behind a flag) ────────────────────────────────────────
//
// WHAT. One MCP App (spec: github.com/openai/mcp-extensions docs/spec.md and the MCP Apps spec 2026-01-26, both read
// 2026-10-02) that ChatGPT opens in several places:
//   • the SIDEBAR (`global` entrypoint, tool open_hermoso_home): a Hermoso HOME. A composer that sends to the chat
//     (type @ to add a brand, saved creator, product photo or Library item), quick starts, and cards for the Library,
//     a new ad, Ad Spy, the calendar, connections and brand setup;
//   • beside a conversation (`thread` entrypoint, tool open_library): Library, Renders, Calendar, Create;
//   • inline in the conversation, when the model calls show_ad_concepts (the concept picker: the user picks ONE
//     concept before anything renders), show_ad_results (a gallery of a batch the user already asked for),
//     open_ad_brief (the brief form) or set_up_hermoso (brand + connections setup);
//   • the plugin SETTINGS page (capability `openai/settings`, tools read_hermoso_settings / update_hermoso_settings);
//   • the desktop composer's @-MENTIONS (search_hermoso_items + `hermoso://` resources the model can read).
// Built on the MCP Apps bridge (`text/html;profile=mcp-app`, `ui/initialize`, `tools/call`), not on the older
// skybridge widgets the three existing cards use, which stay exactly as they are.
//
// WHY A FLAG, AND WHY TWO KEYS TO IT. The ChatGPT plugin is IN REVIEW, and nothing here may move what the reviewed
// connector sees. So it is registered ONLY when the server sets HERMOSO_CHATGPT_EXT=1 AND the connection asks with
// `?ext=1` on its MCP URL AND the host is a widget host (ChatGPT). Any one missing and `tools/list`, `resources/list`
// and the initialize capabilities are byte-for-byte what they were; tools/chatgpt-extensions-check.mjs RUNS
// registerTools both ways to prove it. After the plugin is published, OpenAI's daily scan reviews new tools on their
// own without touching the approved ones, which is why these are NEW tools and no entrypoint `_meta` is ever added to
// an existing, reviewed tool.
//
// THE APP NEVER SPENDS AND NEVER PUBLISHES ON ITS OWN: every write it makes is one the user confirmed ON SCREEN, on a
// step that says what happens (the click IS the confirmation, exactly like a calendar move). Those writes are: moving
// or cancelling a queued post (Calendar), drafting the brand profile (Setup), switching brand, the settings page,
// rendering the ONE concept the user picked (Render it), scheduling a finished result (Schedule), and pausing or
// turning on an ad campaign (Ads). Each goes through its own app-only tool that runs the EXISTING tools' handlers
// in-process (reschedule_post, cancel_scheduled, draft_brand, use_brand, plan_ad + render_ad / generate_image,
// schedule_post, the per-platform status tool), never a re-implementation and never a generic executor.
// WHY RENDER IT CALLS A TOOL AND DOES NOT SEND A MESSAGE (2026-10-03, live): a message the app sends reads to ChatGPT
// as the app talking, and it refused to spend on one ("its message doesn't authorize a paid render"), so the user had
// to confirm twice. Wording a message so the model skips its own confirmation reads as weakening a safety check, so
// the app does not try: the confirmed click runs the render itself. Everything that is still a REQUEST (a new brief,
// more ideas, building a campaign, the composer) goes to the chat as a message, and the model confirms it there.
//
// NO COMMERCE IN THE APP. OpenAI's plugin guidelines forbid selling digital goods inside a plugin, so the app shows
// no plan, price, balance, top-up or upgrade anywhere; the check greps the HTML for it. A refusal for lack of credits
// reaches the app as one neutral sentence (neutralNote), never with a buy step.
//
// BYTE-TWIN: this file ships in the npm CLI as cli/mcp/openai-extensions.mjs and must stay identical (mcp-parity,
// cli-package-loads-check). It imports nothing from tools.mjs (no cycle); tools.mjs hands it what it needs.
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';

export const CHATGPT_EXT_ENV = 'HERMOSO_CHATGPT_EXT';
export const LIBRARY_APP_MIME = 'text/html;profile=mcp-app';  // the MCP Apps profile (ext-apps RESOURCE_MIME_TYPE)
export const EXT_HOME_TOOL = 'open_hermoso_home';
export const EXT_ENTRY_TOOL = 'open_library';
export const EXT_DATA_TOOL = 'library_app_data';
export const EXT_CONCEPTS_TOOL = 'show_ad_concepts';
export const EXT_RESULTS_TOOL = 'show_ad_results';
export const EXT_BRIEF_TOOL = 'open_ad_brief';
export const EXT_SETUP_TOOL = 'set_up_hermoso';
export const EXT_SETTINGS_READ_TOOL = 'read_hermoso_settings';
export const EXT_SETTINGS_UPDATE_TOOL = 'update_hermoso_settings';
export const EXT_MENTIONS_TOOL = 'search_hermoso_items';
export const EXT_RESCHEDULE_TOOL = 'reschedule_post_from_calendar';
export const EXT_CANCEL_TOOL = 'cancel_post_from_calendar';
export const EXT_DRAFT_TOOL = 'draft_brand_from_setup';
export const EXT_RENDER_TOOL = 'render_concept_from_app';
export const EXT_SCHEDULE_TOOL = 'schedule_post_from_app';
export const EXT_ADS_STATUS_TOOL = 'set_campaign_status_from_app';
export const EXT_TOOL_NAMES = Object.freeze([EXT_HOME_TOOL, EXT_ENTRY_TOOL, EXT_DATA_TOOL, EXT_CONCEPTS_TOOL, EXT_RESULTS_TOOL, EXT_BRIEF_TOOL, EXT_SETUP_TOOL, EXT_SETTINGS_READ_TOOL, EXT_SETTINGS_UPDATE_TOOL, EXT_MENTIONS_TOOL, EXT_RESCHEDULE_TOOL, EXT_CANCEL_TOOL, EXT_DRAFT_TOOL, EXT_RENDER_TOOL, EXT_SCHEDULE_TOOL, EXT_ADS_STATUS_TOOL]);
// Tools the app (or ChatGPT itself) calls and the model is never offered (`_meta.ui.visibility: ['app']`).
export const EXT_APP_ONLY_TOOLS = Object.freeze([EXT_DATA_TOOL, EXT_MENTIONS_TOOL, EXT_RESCHEDULE_TOOL, EXT_CANCEL_TOOL, EXT_DRAFT_TOOL, EXT_RENDER_TOOL, EXT_SCHEDULE_TOOL, EXT_ADS_STATUS_TOOL]);
// Tools that render the app (each links `_meta.ui.resourceUri`).
export const EXT_APP_TOOLS = Object.freeze([EXT_HOME_TOOL, EXT_ENTRY_TOOL, EXT_CONCEPTS_TOOL, EXT_RESULTS_TOOL, EXT_BRIEF_TOOL, EXT_SETUP_TOOL]);
export const EXT_SECTIONS = Object.freeze(['library', 'jobs', 'brands', 'calendar', 'brand', 'connectors', 'creators', 'products', 'prefs', 'ads']);
export const EXT_VIEWS = Object.freeze(['home', 'library', 'jobs', 'calendar', 'ads', 'create', 'setup', 'concepts', 'results']);

// ── THE ADS VIEW: ONE ROW PER PLATFORM, EACH NAMING THE EXISTING TOOLS IT READS AND WRITES THROUGH ────────────────
// Every platform's own list tool and status tool, with the argument shapes those tools declare (read from their
// inputSchemas in tools.mjs, 2026-10-03). `provider` is the connection the tools need; the check asserts it equals
// roster-scope's toolProvider() for both tools, so this table cannot drift from the gate. A platform is read only
// when its connection is on (list_connectors). `accounts` is the tool that names the ad accounts shared with this
// brand, where the list tool needs one; the view reads at most three per platform. Both directions of a status change
// pass confirm:true, because the app only calls after the user confirmed that exact change on screen (and TikTok and
// Snapchat refuse every change without it). Pause and turn-on only: archive and delete stay chat requests.
const firstOf = (...v) => v.find((x) => x != null && x !== '');
export const ADS_PLATFORMS = Object.freeze({
  meta: { provider: 'meta', label: 'Meta',
    accounts: { tool: 'list_meta_pages', args: {}, pick: (d) => (d.adAccounts || []).map((a) => ({ id: `act_${String(a.accountId || a.id || '').replace(/^act_/, '')}`, name: a.name || '' })) },
    list: { tool: 'list_meta_ads', args: (acc) => ({ adAccountId: acc.id, level: 'campaign', limit: 50 }), rows: (d) => d.items },
    status: { tool: 'set_meta_campaign_status', args: (acc, id, on) => ({ campaignId: id, status: on ? 'ACTIVE' : 'PAUSED', confirm: true }) } },
  google_ads: { provider: 'google_ads', label: 'Google Ads',
    accounts: { tool: 'list_google_ads_campaigns', args: {}, pick: (d) => (d.accounts || []).map((a) => ({ id: String(a.customerId || a.id || ''), name: a.name || '' })) },
    list: { tool: 'list_google_ads_campaigns', args: (acc) => ({ customerId: acc.id, limit: 50 }), rows: (d) => d.campaigns, window: 'last 30 days' }, // the tool's own default metrics window
    status: { tool: 'set_google_ads_status', args: (acc, id, on) => ({ customerId: acc.id, level: 'campaign', campaignId: id, status: on ? 'ENABLED' : 'PAUSED', confirm: true }) } },
  microsoft_ads: { provider: 'microsoft_ads', label: 'Microsoft Advertising',
    accounts: { tool: 'list_microsoft_ads_campaigns', args: {}, pick: (d) => (d.accounts || []).map((a) => ({ id: String(a.accountId || a.id || ''), name: a.name || '' })) },
    list: { tool: 'list_microsoft_ads_campaigns', args: (acc) => ({ accountId: acc.id }), rows: (d) => d.campaigns },
    status: { tool: 'set_microsoft_ads_status', args: (acc, id, on) => ({ accountId: acc.id, level: 'campaign', campaignId: id, status: on ? 'Active' : 'Paused', confirm: true }) } },
  linkedin: { provider: 'linkedin', label: 'LinkedIn Ads',
    accounts: { tool: 'list_linkedin_ads_campaigns', args: {}, pick: (d) => (d.accounts || []).map((a) => ({ id: String(a.id || ''), name: a.name || '' })) },
    list: { tool: 'list_linkedin_ads_campaigns', args: (acc) => ({ adAccountId: acc.id }), rows: (d) => d.campaigns },
    status: { tool: 'set_linkedin_ads_status', args: (acc, id, on) => ({ adAccountId: acc.id, level: 'campaign', campaignId: id, status: on ? 'ACTIVE' : 'PAUSED', confirm: true }) } },
  tiktok_ads: { provider: 'tiktok_ads', label: 'TikTok Ads',
    accounts: { tool: 'list_tiktok_ads_accounts', args: {}, pick: (d) => (d.advertisers || []).map((a) => ({ id: String(a.advertiserId || a.id || ''), name: a.name || '' })) },
    list: { tool: 'list_tiktok_ads_campaigns', args: (acc) => ({ advertiserId: acc.id }), rows: (d) => d.campaigns },
    status: { tool: 'set_tiktok_ads_status', args: (acc, id, on) => ({ advertiserId: acc.id, level: 'campaign', ids: [id], status: on ? 'ENABLE' : 'DISABLE', confirm: true }) } },
  snapchat_ads: { provider: 'snapchat_ads', label: 'Snapchat Ads',
    accounts: { tool: 'list_snapchat_ads_accounts', args: {}, pick: (d) => (d.adAccounts || []).map((a) => ({ id: String(a.adAccountId || a.id || ''), name: a.name || '' })) },
    list: { tool: 'list_snapchat_ads_campaigns', args: (acc) => ({ adAccountId: acc.id }), rows: (d) => d.campaigns },
    status: { tool: 'set_snapchat_ads_status', args: (acc, id, on) => ({ adAccountId: acc.id, level: 'campaign', ids: [id], status: on ? 'ACTIVE' : 'PAUSED', confirm: true }) } },
  pinterest_ads: { provider: 'pinterest_ads', label: 'Pinterest Ads',
    accounts: { tool: 'list_pinterest_ads_campaigns', args: {}, pick: (d) => (d.accounts || []).map((a) => ({ id: String(a.adAccountId || a.id || ''), name: a.name || '' })) },
    list: { tool: 'list_pinterest_ads_campaigns', args: (acc) => ({ adAccountId: acc.id }), rows: (d) => d.campaigns },
    status: { tool: 'set_pinterest_ads_status', args: (acc, id, on) => ({ adAccountId: acc.id, level: 'campaign', campaignId: id, status: on ? 'ACTIVE' : 'PAUSED', confirm: true }) } },
  reddit_ads: { provider: 'reddit_ads', label: 'Reddit Ads',
    accounts: { tool: 'list_reddit_ads_campaigns', args: {}, pick: (d) => (d.accounts || []).map((a) => ({ id: String(a.id || a.adAccountId || ''), name: a.name || '' })) },
    list: { tool: 'list_reddit_ads_campaigns', args: (acc) => ({ adAccountId: acc.id }), rows: (d) => d.campaigns },
    status: { tool: 'set_reddit_ads_status', args: (acc, id, on) => ({ adAccountId: acc.id, kind: 'campaign', id, status: on ? 'ACTIVE' : 'PAUSED', confirm: true }) } },
  x_ads: { provider: 'x_ads', label: 'X Ads',
    accounts: { tool: 'list_x_ads_accounts', args: {}, pick: (d) => (d.accounts || []).map((a) => ({ id: String(a.id || a.accountId || ''), name: a.name || '' })) },
    list: { tool: 'list_x_ads_campaigns', args: (acc) => ({ accountId: acc.id }), rows: (d) => d.campaigns },
    status: { tool: 'set_x_ads_status', args: (acc, id, on) => ({ accountId: acc.id, campaignId: id, status: on ? 'ACTIVE' : 'PAUSED', confirm: true }) } },
  openai_ads: { provider: 'openai_ads', label: 'ChatGPT Ads', accounts: null,
    list: { tool: 'list_openai_ads_campaigns', args: () => ({}), rows: (d) => d.campaigns, account: (d) => (d.account ? { id: String(d.account.id || ''), name: d.account.brandName || d.account.name || '' } : null) },
    status: { tool: 'set_openai_ads_status', args: (acc, id, on) => ({ level: 'campaign', campaignId: id, status: on ? 'active' : 'paused', confirm: true }) } },
  applovin_ads: { provider: 'applovin_ads', label: 'AppLovin Ads', accounts: null, // one connection = one AppLovin account
    list: { tool: 'list_applovin_ads_campaigns', args: () => ({}), rows: (d) => d.campaigns },
    status: { tool: 'set_applovin_ads_status', args: (acc, id, on) => ({ level: 'campaign', campaignId: id, status: on ? 'LIVE' : 'PAUSED', confirm: true }) } },
  apple_ads: { provider: 'apple_ads', label: 'Apple Ads', accounts: null,
    list: { tool: 'list_apple_ads_campaigns', args: () => ({}), rows: (d) => d.campaigns },
    status: { tool: 'set_apple_ads_status', args: (acc, id, on) => ({ level: 'campaign', id, status: on ? 'ENABLED' : 'PAUSED', confirm: true }) } },
});
export const ADS_STATUS_TOOLS = Object.freeze(Object.values(ADS_PLATFORMS).map((p) => p.status.tool));
// The existing tool(s) each app-only WRITE runs, in-process, after the user confirmed in the app.
export const EXT_DELEGATES = Object.freeze({
  [EXT_RESCHEDULE_TOOL]: 'reschedule_post', [EXT_CANCEL_TOOL]: 'cancel_scheduled', [EXT_DRAFT_TOOL]: 'draft_brand',
  [EXT_SCHEDULE_TOOL]: 'schedule_post',
  [EXT_RENDER_TOOL]: Object.freeze(['plan_ad', 'render_ad', 'generate_image']),
  [EXT_ADS_STATUS_TOOL]: ADS_STATUS_TOOLS,
});
const ACTIVE_RE = /^(active|enabled?|running|delivering|serving|live)$/i; // live: AppLovin Ads (2026-10-04)
const PAUSED_RE = /^(paused|disabled?|campaign_paused|on_hold)$/i;
const money = (n, cur, usd) => (Number.isFinite(+n) ? (usd ? `$${+n}` : `${+n}${cur ? ' ' + cur : ''}`) : '');
// One campaign row, whatever the platform calls its fields. Spend and results appear ONLY when the list tool returned
// them (today: Google Ads' metrics); nothing is estimated. `state` decides which switch the row offers: the status a
// person SET (configured / operation / status) rather than what the platform says is serving.
export function adRow(c, currency = '', window = '') {
  if (!c || typeof c !== 'object') return null;
  const id = String(firstOf(c.id, c.campaign_id, c.campaignId) ?? '');
  if (!id) return null;
  const setTo = String(firstOf(c.configured_status, c.operation_status, c.status, c.effective_status, c.displayStatus) ?? '');
  const shown = String(firstOf(c.effective_status, c.summaryStatus, c.displayStatus, c.status, c.configured_status, c.operation_status) ?? '');
  const state = ACTIVE_RE.test(setTo) ? 'active' : PAUSED_RE.test(setTo) ? 'paused' : 'other';
  const cur = c.currency || currency || '';
  const daily = c.dailyBudgetUsd != null ? money(c.dailyBudgetUsd, '', true) : c.dailyBudget != null ? money(c.dailyBudget, cur) : c.dailyBudgetAmount?.amount != null ? money(c.dailyBudgetAmount.amount, c.dailyBudgetAmount.currency || cur) : '';
  const total = !daily && c.lifetimeBudget != null ? money(c.lifetimeBudget, cur) : '';
  const m = c.metrics && typeof c.metrics === 'object' ? c.metrics : null;
  const results = m ? [m.costUsd != null && Number.isFinite(+m.costUsd) ? `$${(+m.costUsd).toFixed(2)} spent` : '', m.clicks != null ? `${m.clicks} clicks` : '', m.conversions != null ? `${m.conversions} conversions` : ''].filter(Boolean).join(' · ') : '';
  return { id, name: clip(firstOf(c.name, c.campaign_name, c.title) || id, 90), status: humanize(String(shown).toLowerCase()), state, budget: daily ? `${daily} a day` : total ? `${total} total` : '', results: results && window ? `${results} (${window})` : results };
}
const PANEL_VIEWS = ['library', 'jobs', 'calendar'];
// The per-brand defaults this app adds (captions, end card, default channels). The language and the active brand
// are NOT stored here: they live where every other surface already reads them (/api/settings, use_brand).
export const EXT_PREFS_KEY = 'hermoso.chatgpt.prefs.v1';
export const EXT_SETTINGS_CAPABILITY = Object.freeze({ readTool: EXT_SETTINGS_READ_TOOL, updateTool: EXT_SETTINGS_UPDATE_TOOL });

// `?ext=1` on the connector URL. Read by the transport beside `?tools=`; presentation only, never auth or spend.
export const chatgptExtAsked = (v) => /^(1|true|on|yes)$/i.test(String(Array.isArray(v) ? v[0] : (v ?? '')).trim());
// All three keys, in one predicate so the transport and the check cannot disagree about what "on" means.
export const chatgptExtOn = ({ env = process.env, asked, widgetHost } = {}) =>
  !!widgetHost && String(env?.[CHATGPT_EXT_ENV] ?? '').trim() === '1' && chatgptExtAsked(asked);

// THE SIDEBAR ICON. The spec asks for a 20x20 monochrome SVG in currentColor. This is the bloom (four petals and a
// centre, public/brand/bloom-mono-black.svg) redrawn in currentColor at the spec's stroke weight. A data: URI, so it
// needs no hosting and no CSP entry. SDK 1.29 does not serialize tool `icons`, so installEntrypointIcons adds it.
const ICON_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" width="20" height="20" fill="none">'
  + '<g stroke="currentColor" stroke-width="1.33">'
  + [0, 45, 90, 135].map((r) => `<ellipse cx="10" cy="6" rx="2.6" ry="5.2" transform="rotate(${r} 10 10)"/>`).join('')
  + '</g><circle cx="10" cy="10" r="1.3" fill="currentColor"/></svg>';
export const ENTRY_ICON = Object.freeze({ src: 'data:image/svg+xml;base64,' + Buffer.from(ICON_SVG).toString('base64'), mimeType: 'image/svg+xml', sizes: ['any'] });

// ── THE APP ──────────────────────────────────────────────────────────────────────────────────────────────────────
// Self-contained HTML + inline JS (no bundler in this repo). The bridge is the MCP Apps postMessage JSON-RPC, written
// out by hand: the method names are pinned against @modelcontextprotocol/ext-apps spec.types (2026-01-26) and the
// OpenAI extension keys against @openai/mcp-extensions 0.1.0, both read 2026-10-02. Colours come from the host's own
// style variables (the names OpenAI's styles.css reads), with light/dark fallbacks.
// BUTTONS AND ACCENT ARE OURS, NOT THE HOST'S (2026-10-03, founder, from ChatGPT dark mode): the primary button used
// the host's info blue (--color-text-info) with the page background as its text, which ChatGPT dark mode painted as
// near-black text on a mid blue. Buttons now use the Typeset tokens: --btn-bg/--btn-fg (near-black on light, near-white
// on dark), a hairline --ring on secondary buttons, and one warm accent (#c74800, lifted to #ff9a5c on dark) for focus,
// selection and progress only. tools/chatgpt-extensions-check.mjs computes every button's text contrast in both themes.
// String.raw so regex backslashes in the inline script survive; nothing below uses ${} or a backtick. The one value
// spliced in is the bloom (%%BLOOM%%), so the hash below covers it.
const APP_STYLE = String.raw`<style>
:root{color-scheme:light dark;
 --bg:var(--color-background-primary,light-dark(#fff,#181818));
 --fg:var(--color-text-primary,light-dark(#1a1c1f,#fff));
 --muted:var(--color-text-secondary,light-dark(rgba(26,28,31,.68),rgba(255,255,255,.62)));
 --line:var(--color-border-secondary,light-dark(rgba(26,28,31,.1),rgba(255,255,255,.12)));
 --card:color-mix(in oklab,var(--fg) 5%,var(--bg));
 --card2:color-mix(in oklab,var(--fg) 9%,var(--bg));
 --accent:light-dark(#c74800,#ff9a5c);
 --accent-ink:light-dark(#a33b00,#ffb489);
 --accent-bg:light-dark(#fbece3,#3a2114);
 --btn-bg:light-dark(#0a0a0a,#fafafa);
 --btn-fg:light-dark(#ffffff,#0a0a0a);
 --ring:light-dark(rgba(10,10,10,.22),rgba(250,250,250,.28));
 --ok:var(--color-text-success,light-dark(#118a3e,#62d38d));
 --warn:var(--color-text-warning,light-dark(#b8450a,#ff8549));
 --danger:light-dark(#b42318,#ff7b72);
 --radius:var(--border-radius-lg,12px);
 --cur:var(--cursor-interaction,pointer)}
:root[data-theme=light]{color-scheme:light}:root[data-theme=dark]{color-scheme:dark}
*{box-sizing:border-box}
[hidden]{display:none!important}
body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.45 var(--font-sans,-apple-system,system-ui,"Segoe UI",Roboto,sans-serif);-webkit-font-smoothing:antialiased}
button,select,input,textarea{font:inherit;color:inherit}
button,select{cursor:var(--cur)}
button:focus-visible,select:focus-visible,input:focus-visible,textarea:focus-visible,.tile:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.top{display:flex;align-items:center;gap:6px;padding:8px 12px;border-bottom:1px solid var(--line);flex-wrap:wrap}
.brand{font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:38%;min-width:0}
.brand select{max-width:100%;background:transparent;border:1px solid var(--line);border-radius:8px;padding:3px 6px}
.tabs{display:flex;gap:4px;margin-left:auto;flex-wrap:wrap}
@media (max-width:560px){.brand{max-width:62%}.tabs{order:3;width:100%;margin-left:0;flex-wrap:nowrap;overflow-x:auto;scrollbar-width:none}.tabs::-webkit-scrollbar{display:none}.top .push{margin-left:auto}.tab{flex:none}}
.tab,.btn,.seg button,.chip{border:1px solid var(--ring);background:transparent;color:var(--fg);border-radius:999px;padding:4px 11px}
.tab[aria-selected=true],.seg button[aria-pressed=true]{background:var(--fg);color:var(--bg);border-color:var(--fg)}
.btn.primary{background:var(--btn-bg);border-color:var(--btn-bg);color:var(--btn-fg);font-weight:600}
.btn.danger{color:var(--danger);border-color:color-mix(in oklab,var(--danger) 45%,transparent)}
.btn:disabled{opacity:.5;cursor:default}
.icon{border:0;background:transparent;padding:4px 7px;border-radius:8px;color:var(--muted)}
.icon:hover{background:var(--card)}
.cardhead{display:flex;align-items:baseline;gap:8px;padding:10px 12px 0}
.cardhead b{font-size:15px}.cardhead span{color:var(--muted);font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
main{padding:12px}
.note{color:var(--muted);padding:16px 4px;text-align:center}
.note.err{color:var(--warn)}
.note.left{text-align:left;padding:6px 0}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(128px,1fr));gap:10px}
.tile{position:relative;border:1px solid var(--line);border-radius:var(--radius);overflow:hidden;background:var(--card);aspect-ratio:1/1;padding:0;cursor:var(--cur)}
.tile img{width:100%;height:100%;object-fit:cover;display:block}
.tile .ph{display:flex;align-items:center;justify-content:center;height:100%;color:var(--muted);font-size:12px;padding:6px;text-align:center}
.tile .badge{position:absolute;left:6px;bottom:6px;background:rgba(0,0,0,.62);color:#fff;border-radius:6px;font-size:11px;padding:1px 6px}
.tile.sel{outline:2px solid var(--accent);outline-offset:-2px}
.tile .chk{position:absolute;right:6px;top:6px;background:var(--btn-bg);color:var(--btn-fg);border-radius:999px;font-size:11px;padding:1px 7px}
.tile .bar{position:absolute;left:8px;right:8px;bottom:8px;margin:0}
.detail{margin-top:12px;border:1px solid var(--line);border-radius:var(--radius);padding:10px;background:var(--card)}
.detail .media{display:flex;justify-content:center;background:rgba(0,0,0,.04);border-radius:8px;overflow:hidden}
.detail img,.detail video{max-width:100%;max-height:52vh;display:block}
.meta{color:var(--muted);font-size:12px;margin:8px 0}
.row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.list{display:flex;flex-direction:column;gap:8px}
.item{display:flex;gap:10px;align-items:center;border:1px solid var(--line);border-radius:var(--radius);padding:8px;background:var(--card)}
.item img{width:48px;height:48px;object-fit:cover;border-radius:8px;flex:none}
.item .t{font-weight:600}.s{color:var(--muted);font-size:12px}
.grow{flex:1;min-width:0}
.bar{height:4px;background:var(--line);border-radius:4px;overflow:hidden;margin-top:6px}.bar i{display:block;height:100%;background:var(--accent)}
.bar i.busy{width:35%;animation:busy 1.4s ease-in-out infinite}
@keyframes busy{0%{margin-left:-35%}100%{margin-left:100%}}
@media (prefers-reduced-motion:reduce){.bar i.busy{animation:none;width:100%;opacity:.5}}
h2{font-size:17px;margin:4px 0 10px}
h3{font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:var(--muted);margin:16px 0 6px}
.hero{max-width:680px;margin:18px auto 6px;text-align:center}
.hero .logo{color:var(--accent);display:inline-flex}.hero .logo svg{width:34px;height:34px}
.hero h1{font-size:21px;margin:8px 0 14px;font-weight:650}
.composer{position:relative;text-align:left;border:1px solid var(--line);border-radius:18px;background:var(--card);padding:10px 10px 8px}
.composer textarea{width:100%;border:0;background:transparent;resize:none;outline:none;min-height:44px;max-height:180px;padding:2px 4px}
.crow{display:flex;align-items:center;gap:8px}
.send{margin-left:auto;width:32px;height:32px;border-radius:999px;border:0;background:var(--fg);color:var(--bg);font-weight:700}
.send:disabled{opacity:.35;cursor:default}
.mchips{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:6px}
.mchip{display:inline-flex;align-items:center;gap:6px;background:var(--accent-bg);color:var(--accent-ink);border-radius:999px;padding:2px 4px 2px 8px;font-size:12px;max-width:100%}
.mchip img{width:18px;height:18px;border-radius:5px;object-fit:cover}
.mchip button{border:0;background:transparent;color:inherit;padding:0 4px}
.menu{position:absolute;left:8px;right:8px;top:100%;margin-top:4px;z-index:5;background:var(--bg);border:1px solid var(--line);border-radius:12px;box-shadow:0 8px 28px rgba(0,0,0,.18);max-height:260px;overflow:auto;padding:4px}
.menu button{display:flex;gap:8px;align-items:center;width:100%;text-align:left;border:0;background:transparent;padding:6px 8px;border-radius:8px}
.menu button[aria-selected=true],.menu button:hover{background:var(--card2)}
.menu img,.menu .sq{width:26px;height:26px;border-radius:6px;object-fit:cover;flex:none;background:var(--card2)}
.menu .k{color:var(--muted);font-size:11px;margin-left:auto}
.quick{display:flex;flex-wrap:wrap;gap:6px;justify-content:center;margin:12px 0 4px}
.chip{font-size:13px;background:var(--card)}
.cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px}
.gcard{text-align:left;border:1px solid var(--line);border-radius:var(--radius);background:var(--card);padding:12px;cursor:var(--cur)}
.gcard b{display:block;margin-bottom:2px}.gcard span{color:var(--muted);font-size:12px}
.field{margin:12px 0}
.field>label,.flabel{display:block;font-weight:600;margin-bottom:6px}
.field textarea,.field input[type=text],.field input[type=datetime-local],select.in{width:100%;border:1px solid var(--line);border-radius:10px;background:var(--bg);padding:8px 10px}
.seg{display:inline-flex;gap:4px;flex-wrap:wrap}
.pick{display:grid;grid-template-columns:repeat(auto-fill,minmax(76px,1fr));gap:8px}
.pick .tile{aspect-ratio:1/1}
.pick .tile .ph{font-size:11px}
.pick .tile[aria-pressed=true]{outline:2px solid var(--accent);outline-offset:-2px}
.pick .cap{position:absolute;left:0;right:0;bottom:0;background:linear-gradient(transparent,rgba(0,0,0,.65));color:#fff;font-size:10px;padding:10px 5px 3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
dl.sum{display:grid;grid-template-columns:max-content 1fr;gap:6px 14px;margin:8px 0}
dl.sum dt{color:var(--muted)}dl.sum dd{margin:0;min-width:0;overflow-wrap:anywhere}
dl.sum img{width:40px;height:40px;object-fit:cover;border-radius:8px;vertical-align:middle;margin-right:6px}
.steps{display:flex;gap:6px;margin:0 0 12px;flex-wrap:wrap}
.steps span{font-size:12px;color:var(--muted);border:1px solid var(--line);border-radius:999px;padding:2px 10px}
.steps span.on{color:var(--bg);background:var(--fg);border-color:var(--fg)}
.bcard{display:flex;gap:12px;align-items:flex-start;border:1px solid var(--line);border-radius:var(--radius);padding:12px;background:var(--card)}
.bcard img{width:56px;height:56px;object-fit:contain;border-radius:10px;background:#fff;flex:none}
.pill{display:inline-block;font-size:11px;border-radius:999px;padding:1px 8px;border:1px solid var(--line);color:var(--muted)}
.pill.on{color:var(--ok);border-color:color-mix(in oklab,var(--ok) 45%,transparent)}
.pill.warn{color:var(--warn);border-color:color-mix(in oklab,var(--warn) 45%,transparent)}
.concept{border:1px solid var(--line);border-radius:var(--radius);background:var(--card);padding:12px;margin-bottom:10px}
.concept .n{display:inline-flex;width:22px;height:22px;border-radius:999px;background:var(--fg);color:var(--bg);font-size:12px;font-weight:700;align-items:center;justify-content:center;margin-right:6px}
.concept .ttl{font-weight:650}
.concept .hl{margin:6px 0 2px;font-weight:600}
.concept .vis{color:var(--muted);font-size:12px;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;margin-top:4px}
.confirm{margin-top:10px;border-top:1px solid var(--line);padding-top:10px}
.confirm select{border:1px solid var(--line);border-radius:8px;background:var(--bg);padding:3px 6px}
.week{display:flex;flex-direction:column;gap:8px}
@media (min-width:760px){.week{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:6px}.day{min-height:180px}}
.day{border:1px solid var(--line);border-radius:10px;padding:6px;background:var(--card);min-width:0}
.day.past{opacity:.6}
.day.drop{outline:2px dashed var(--accent);outline-offset:-2px}
.day .dh{font-size:12px;color:var(--muted);margin-bottom:6px;display:flex;justify-content:space-between}
.day .dh b{color:var(--fg)}
.post{display:block;width:100%;text-align:left;border:1px solid var(--line);border-radius:8px;background:var(--bg);padding:6px;margin-bottom:6px;cursor:grab}
.post.ro{cursor:var(--cur)}
.post .pt{font-weight:600;font-size:12px}.post .pc{font-size:11px;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.post img{width:100%;height:56px;object-fit:cover;border-radius:6px;margin-top:4px;display:block}
.post.open{outline:2px solid var(--accent);outline-offset:-2px}
.wkbar{display:flex;align-items:center;gap:8px;margin-bottom:8px}
.wkbar b{margin-right:auto}
.modal{position:fixed;inset:0;background:rgba(0,0,0,.42);display:flex;align-items:center;justify-content:center;padding:16px;z-index:20}
.modal[hidden]{display:none}
.mbox{background:var(--bg);color:var(--fg);border-radius:16px;max-width:420px;width:100%;padding:16px;box-shadow:0 18px 50px rgba(0,0,0,.3)}
.mbox h4{margin:0 0 6px;font-size:16px}
.mbox p{margin:0 0 14px;color:var(--muted)}
.mbox .row{justify-content:flex-end}
.toast{position:fixed;left:50%;bottom:14px;transform:translateX(-50%);background:var(--fg);color:var(--bg);border-radius:999px;padding:6px 14px;font-size:13px;z-index:30;max-width:90%}
.toast[hidden]{display:none}
.notices{display:flex;flex-direction:column;gap:4px;margin-top:10px}
.notice{display:flex;gap:7px;align-items:flex-start;font-size:12px;color:var(--muted);text-align:left}
.notice .ni{flex:none;width:15px;height:15px;border-radius:999px;border:1px solid currentColor;font-size:9px;line-height:13px;text-align:center;font-weight:700;font-style:normal;margin-top:1px}
body.modal-open main{min-height:300px}
</style>`;

const APP_BODY = String.raw`<div class="top" id="top">
  <div class="brand" id="brand"></div>
  <div class="tabs" role="tablist" id="tabs">
    <button class="tab" role="tab" data-act="tab" data-view="home">Home</button>
    <button class="tab" role="tab" data-act="tab" data-view="library">Library</button>
    <button class="tab" role="tab" data-act="tab" data-view="jobs">Renders</button>
    <button class="tab" role="tab" data-act="tab" data-view="calendar">Calendar</button>
    <button class="tab" role="tab" data-act="tab" data-view="ads">Ads</button>
    <button class="tab" role="tab" data-act="tab" data-view="create">Create</button>
  </div>
  <button class="icon push" data-act="tab" data-view="setup" title="Set up Hermoso" aria-label="Set up Hermoso">&#9881;</button>
  <button class="icon" id="refresh" data-act="refresh" title="Refresh" aria-label="Refresh">&#8635;</button>
  <button class="icon" id="expand" data-act="expand" title="Expand" aria-label="Expand" hidden>&#10530;</button>
</div>
<div class="cardhead" id="cardhead" hidden><b id="cardtitle"></b><span id="cardsub"></span></div>
<main id="main"><div class="note">Loading Hermoso...</div></main>
<div class="modal" id="modal" hidden></div>
<div class="toast" id="toast" role="status" hidden></div>`;

const APP_SCRIPT = String.raw`<script>
(function(){
  'use strict';
  var PROTOCOL = '2026-01-26';
  var TOOL = { data: 'library_app_data', reschedule: 'reschedule_post_from_calendar', cancel: 'cancel_post_from_calendar', draft: 'draft_brand_from_setup', render: 'render_concept_from_app', schedule: 'schedule_post_from_app', adsStatus: 'set_campaign_status_from_app', useBrand: 'use_brand' };
  var TOOL_VIEW = { open_hermoso_home: 'home', open_library: 'library', open_ad_brief: 'create', set_up_hermoso: 'setup', show_ad_concepts: 'concepts', show_ad_results: 'results' };
  var CARD_VIEWS = ['concepts', 'results'];
  var PANEL_VIEWS = ['home', 'library', 'jobs', 'calendar', 'ads', 'create', 'setup'];
  var SECTIONS_FOR = { home: ['brand', 'brands', 'library', 'jobs', 'prefs'], library: ['library', 'jobs', 'brands', 'calendar'], jobs: ['jobs', 'brands'], calendar: ['calendar', 'brands', 'prefs'], ads: ['ads', 'brands'], create: ['brand', 'brands', 'library', 'creators', 'products', 'prefs'], setup: ['brand', 'brands', 'connectors'] };
  var EDITABLE = ['queued', 'scheduled'];
  var state = {
    view: 'home', surface: 'panel', data: null, host: {}, caps: {}, selected: [], focus: null, busy: false, pollTimer: null, pollStarted: 0, routed: false, ready: false,
    composer: { mentions: [], menu: [], hi: 0, loadingPool: false },
    brief: { step: 'form', format: 'image', aspect: '1:1', length: 15, count: 4, product: null, productPhoto: null, creator: null, asset: null },
    setup: { step: 'brand', mode: 'website', editing: false, drafting: false, draft: null, watch: null, watchUntil: 0, watchTimer: null },
    concepts: { open: null, sent: {}, opts: {}, starting: null, err: null },
    sched: null, started: [], noticesSaid: "[]",
    cal: { offset: 0, open: null, full: {}, drag: null, draftAt: '' }
  };
  var pending = {}; var nextId = 1;
  var $ = function(id){ return document.getElementById(id); };
  var esc = function(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); };
  var D = function(){ return state.data || {}; };

  // ── the MCP Apps bridge: JSON-RPC over postMessage to the host frame ──
  function send(msg){ try { window.parent.postMessage(msg, '*'); } catch (e) {} }
  function rpc(method, params, ms){
    var id = nextId++;
    send({ jsonrpc: '2.0', id: id, method: method, params: params || {} });
    return new Promise(function(resolve, reject){
      pending[id] = { resolve: resolve, reject: reject };
      setTimeout(function(){ if (pending[id]) { delete pending[id]; reject(new Error('The host did not answer ' + method)); } }, ms || 60000);
    });
  }
  function notify(method, params){ send({ jsonrpc: '2.0', method: method, params: params || {} }); }
  window.addEventListener('message', function(ev){
    if (ev.source !== window.parent) return;
    var m = ev.data; if (!m || m.jsonrpc !== '2.0') return;
    if (m.id != null && !m.method) {
      var p = pending[m.id]; if (!p) return; delete pending[m.id];
      if (m.error) p.reject(new Error((m.error && m.error.message) || 'Request failed')); else p.resolve(m.result);
      return;
    }
    if (m.method === 'ui/notifications/tool-input') { var v = m.params && m.params.arguments && m.params.arguments.view; if (v && !state.data) setView(v, true); return; }
    if (m.method === 'ui/notifications/tool-result') { var sc = m.params && m.params.structuredContent; if (sc) takeResult(sc); return; }
    if (m.method === 'ui/notifications/host-context-changed') { applyHost(m.params || {}); return; }
    if (m.method === 'ui/resource-teardown' && m.id != null) { stopPoll(); stopWatch(); send({ jsonrpc: '2.0', id: m.id, result: {} }); return; }
    if (m.method === 'ping' && m.id != null) { send({ jsonrpc: '2.0', id: m.id, result: {} }); return; }
  });
  function callTool(name, args, ms){
    return rpc('tools/call', { name: name, arguments: args || {} }, ms).then(function(r){
      if (r && r.isError) throw new Error(textOf(r) || 'That did not work.');
      return r || {};
    });
  }
  function textOf(r){ var c = (r && r.content) || []; for (var i = 0; i < c.length; i++) if (c[i].type === 'text') return c[i].text; return ''; }

  // ── host context: theme, style variables, display mode, deep link, attached context ──
  function applyHost(ctx){
    for (var k in ctx) state.host[k] = ctx[k];
    var root = document.documentElement;
    if (ctx.theme) root.setAttribute('data-theme', ctx.theme);
    var vars = ctx.styles && ctx.styles.variables;
    if (vars) for (var name in vars) { if (vars[name] != null) root.style.setProperty(name, vars[name]); }
    if (ctx['openai/interactionCursor']) root.style.setProperty('--cursor-interaction', ctx['openai/interactionCursor'] === 'default' ? 'default' : 'pointer');
    var modes = state.host.availableDisplayModes || [];
    $('expand').hidden = !(state.host.displayMode === 'inline' && modes.indexOf('fullscreen') >= 0);
    if (!state.data && ctx.toolInfo && ctx.toolInfo.tool && TOOL_VIEW[ctx.toolInfo.tool.name]) { state.view = TOOL_VIEW[ctx.toolInfo.tool.name]; state.surface = CARD_VIEWS.indexOf(state.view) >= 0 ? 'card' : 'panel'; }
    if (ctx['openai/deepLink'] && ctx['openai/deepLink'].url) route(ctx['openai/deepLink'].url);
    if ('openai/modelContext' in ctx) {
      var mc = ctx['openai/modelContext'];
      var urls = mc && mc.structuredContent && mc.structuredContent.selected;
      state.selected = Array.isArray(urls) ? urls.filter(function(u){ return typeof u === 'string'; }) : [];
    }
    render();
  }
  function route(url){
    var seg = String(url || '/').split('?')[0].split('/').filter(Boolean)[0] || 'home';
    if (PANEL_VIEWS.indexOf(seg) >= 0) { state.routed = true; state.surface = 'panel'; setView(seg, true); }
  }
  function reportSize(){
    // The CONTENT height, not the frame's: documentElement.scrollHeight is never less than the iframe itself, so an
    // inline card could grow and never shrink back. Sent only after the handshake, as the bridge expects.
    if (!state.ready || (state.host.displayMode && state.host.displayMode !== 'inline')) return;
    notify('ui/notifications/size-changed', { height: Math.ceil(document.body.getBoundingClientRect().height) });
  }
  function takeResult(sc){
    state.data = sc;
    if (sc.view && !state.routed) state.view = sc.view;
    state.surface = sc.surface || (CARD_VIEWS.indexOf(state.view) >= 0 ? 'card' : 'panel');
    if (sc.view === 'create' && sc.brief) { if (sc.brief.format) state.brief.format = sc.brief.format; if (sc.brief.product) state.brief.product = sc.brief.product; if (state.brief.format === 'video' && state.brief.aspect === '1:1') state.brief.aspect = '9:16'; }
    if (sc.view === 'setup' && sc.step) state.setup.step = sc.step;
    render(); schedulePoll();
  }

  // ── server data, through the host (no fetch: the app has no network of its own) ──
  function load(sections, extra){
    if (state.busy) return Promise.resolve();
    state.busy = true; $('refresh').disabled = true;
    var args = { view: state.view, sections: sections || [] };
    for (var x in (extra || {})) args[x] = extra[x];
    return rpc('tools/call', { name: TOOL.data, arguments: args }).then(function(r){
      var sc = r && r.structuredContent;
      if (r && r.isError) throw new Error(textOf(r) || 'Could not load this right now.');
      if (sc) {
        // Merge: a jobs-only poll must not wipe the Library, and a section that now reads must drop its old note.
        var prev = state.data || {}; var notes = {}; var k;
        for (k in (prev.notes || {})) if ((sections || []).indexOf(k) < 0) notes[k] = prev.notes[k];
        for (k in (sc.notes || {})) notes[k] = sc.notes[k];
        for (k in sc) if (k !== 'notes' && k !== 'view' && k !== 'surface' && k !== 'results' && k !== 'post') prev[k] = sc[k];
        if (sc.results) {
          var have = prev.results || [];
          sc.results.forEach(function(n){ var i = -1; for (var j = 0; j < have.length; j++) if (have[j].id && have[j].id === n.id) i = j; if (i >= 0) { if (!n.label) n.label = have[i].label; if (n.caption == null) n.caption = have[i].caption; n.notices = joinNotices(have[i].notices, n.notices); have[i] = n; } else have.push(n); });
          prev.results = have;
        }
        if (sc.post && sc.post.id) state.cal.full[sc.post.id] = sc.post;
        prev.notes = notes; state.data = prev;
      }
    }).catch(function(e){ state.loadError = String(e && e.message || e); }).then(function(){
      state.busy = false; $('refresh').disabled = false; render(); schedulePoll();
      if (startedNoticesKey() !== state.noticesSaid) syncContext();
    });
  }
  // What a render says to the person (a saved photo of a person left out as the product, a label or product finding):
  // one plain line each, written by the server (renderNotices). The card shows them under the render while it renders
  // and once it is done, and the model is told the same lines as context.
  function joinNotices(a, b){ var out = []; (a || []).concat(b || []).forEach(function(t){ if (t && out.indexOf(t) < 0) out.push(t); }); return out; }
  function noticesFor(jobId){ var rs = D().results || []; for (var i = 0; i < rs.length; i++) if (jobId && rs[i].id === jobId) return rs[i].notices || []; return []; }
  function startedNoticesKey(){ return JSON.stringify(state.started.map(function(s){ return joinNotices(s.notices, noticesFor(s.jobId)); })); }
  function noticeHtml(list, lead){ return (list || []).map(function(t){ return '<div class="notice" role="note"><i class="ni" aria-hidden="true">i</i><span>' + (lead ? esc(lead) + ': ' : '') + esc(t) + '</span></div>'; }).join(''); }
  function activeJobs(){ var j = (D().jobs) || []; return j.filter(function(x){ return x.status === 'queued' || x.status === 'running'; }); }
  function pendingResults(){ var r = D().results || []; return r.filter(function(x){ return x.id && (x.status === 'queued' || x.status === 'running'); }); }
  function schedulePoll(){
    stopPoll();
    var jobs = activeJobs().length, res = state.view === 'results' ? pendingResults() : [];
    if (!jobs && !res.length) { state.pollStarted = 0; return; }
    if (!state.pollStarted) state.pollStarted = Date.now();
    if (Date.now() - state.pollStarted > 20 * 60 * 1000) return;   // a stuck render must not poll for ever
    state.pollTimer = setTimeout(function(){
      if (res.length) { load([], { jobIds: res.map(function(x){ return x.id; }) }); return; }
      var before = activeJobs().length;
      load(['jobs']).then(function(){ if (activeJobs().length < before) load(['library', 'jobs']); });
    }, 8000);
  }
  function stopPoll(){ if (state.pollTimer) { clearTimeout(state.pollTimer); state.pollTimer = null; } }

  // ── talking to the chat ──
  function assetBlock(a){
    var title = (a.kind === 'video' ? 'Video' : 'Image') + (a.label ? ': ' + a.label : ' from your Hermoso Library');
    var block = { type: 'text', text: 'Hermoso Library ' + (a.kind || 'asset') + (a.label ? ' "' + a.label + '"' : '') + '. Asset URL: ' + a.url + (a.model ? ' (made with ' + a.model + ')' : '') + '. Use this exact URL when the user asks to post, schedule, edit or reuse it.', _meta: { 'openai/title': title.slice(0, 80) } };
    if (a.thumb) block._meta['openai/thumbnail'] = { src: a.thumb };
    return block;
  }
  function canContext(){ var c = state.caps || {}; return !!(c.updateModelContext || (c.experimental && c.experimental['openai/modelContext'])); }
  function syncContext(){
    var pool = (D().items || []).concat(D().results || []);
    var seen = {}; var items = pool.filter(function(a){ if (!a.url || seen[a.url] || state.selected.indexOf(a.url) < 0) return false; seen[a.url] = 1; return true; });
    if (!canContext()) return Promise.resolve();
    state.noticesSaid = startedNoticesKey();
    var content = items.map(assetBlock).concat(state.started.map(function(s){ var nt = joinNotices(s.notices, noticesFor(s.jobId)); return { type: 'text', text: 'From the Hermoso app the user confirmed and started a render of ' + s.label + ' (job ' + s.jobId + '). It shows in the app; do not start it again.' + (nt.length ? ' The app shows the user this note about it: ' + nt.join(' ') : '') }; }));
    return rpc('ui/update-model-context', { content: content, structuredContent: { selected: items.map(function(a){ return a.url; }), renders: state.started.map(function(s){ return s.jobId; }) } }).catch(function(){});
  }
  function toggleSelect(url){
    var i = state.selected.indexOf(url);
    if (i >= 0) state.selected.splice(i, 1); else state.selected.push(url);
    syncContext(); render();
  }
  // Every hand-off to the conversation goes through here. Without ui/message the text is put in front of the user
  // to send themselves, never silently dropped.
  function sendMessage(content, okText){
    if (state.caps && state.caps.message) {
      return rpc('ui/message', { role: 'user', content: content }).then(function(){ toast(okText || 'Sent to the chat'); return true; })
        .catch(function(e){ toast('Could not send: ' + (e && e.message || e)); return false; });
    }
    var text = content.map(function(b){ return b.text || ''; }).join('\n');
    showModal({ title: 'Send this in the chat', body: text, ok: 'Close', cancel: null });
    return Promise.resolve(false);
  }
  function askToPost(a){
    var pr = D().prefs || {};
    var tail = pr.channels && pr.channels.length ? ' My default channels are ' + pr.channels.join(', ') + '.' : '';
    sendMessage([assetBlock(a), { type: 'text', text: 'Help me post or schedule this to my channels.' + tail }]);
  }
  function openLink(url){ if (state.caps && state.caps.openLinks) return rpc('ui/open-link', { url: url }).catch(function(){}); toast('Open ' + url); return Promise.resolve(); }
  var toastTimer = null;
  function toast(t){ var el = $('toast'); el.textContent = t; el.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(function(){ el.hidden = true; }, 3200); }
  var modalResolve = null;
  function showModal(o){
    var el = $('modal');
    el.innerHTML = '<div class="mbox" role="dialog" aria-modal="true"><h4>' + esc(o.title) + '</h4><p>' + esc(o.body).replace(/\n/g, '<br>') + '</p><div class="row">'
      + (o.cancel ? '<button class="btn" data-act="m-cancel">' + esc(o.cancel) + '</button>' : '')
      + '<button class="btn ' + (o.danger ? 'danger' : 'primary') + '" data-act="m-ok">' + esc(o.ok || 'OK') + '</button></div></div>';
    el.hidden = false; document.body.classList.add('modal-open'); reportSize();
    var b = el.querySelector('[data-act=m-ok]'); if (b) b.focus();
    return new Promise(function(res){ modalResolve = res; });
  }
  function closeModal(v){ var el = $('modal'); el.hidden = true; el.innerHTML = ''; document.body.classList.remove('modal-open'); if (modalResolve) { var r = modalResolve; modalResolve = null; r(v); } reportSize(); }

  // ── views ──
  function setView(v, quiet){
    if (PANEL_VIEWS.indexOf(v) < 0 && CARD_VIEWS.indexOf(v) < 0) return;
    state.view = v; state.focus = null;
    if (PANEL_VIEWS.indexOf(v) >= 0 && state.surface === 'card' && !quiet) state.surface = 'panel';
    if (!quiet) {
      var have = { library: 'items', jobs: 'jobs', brands: 'brands', calendar: 'scheduled', brand: 'profile', connectors: 'connections', creators: 'creators', products: 'products', prefs: 'prefs', ads: 'ads' };
      var need = (SECTIONS_FOR[v] || []).filter(function(s){ return !(have[s] in D()); });
      if (need.length) load(need);
    }
    render();
  }
  function header(){
    var d = D(); var b = d.brand; var brands = d.brands || [];
    var card = state.surface === 'card';
    $('top').hidden = card; $('cardhead').hidden = !card;
    if (card) {
      var t = state.view === 'concepts' ? 'Ad concepts' : state.view === 'results' ? (d.title || 'Your ads') : state.view === 'setup' ? 'Set up Hermoso' : state.view === 'create' ? 'New ad' : 'Hermoso';
      $('cardtitle').textContent = t;
      $('cardsub').textContent = state.view === 'concepts' && d.product ? 'for ' + d.product : (d.brand && d.brand.name ? d.brand.name : (d.brandName || ''));
      return;
    }
    var el = $('brand');
    if (brands.length > 1) {
      el.innerHTML = '<select id="brandSel" aria-label="Profile">' + brands.map(function(x){ return '<option value="' + esc(x.id) + '"' + (x.active ? ' selected' : '') + '>' + esc(x.name || x.id) + '</option>'; }).join('') + '</select>';
    } else el.textContent = b && b.name ? b.name : 'Hermoso';
    var tabs = document.querySelectorAll('.tab');
    for (var i = 0; i < tabs.length; i++) tabs[i].setAttribute('aria-selected', String(tabs[i].getAttribute('data-view') === state.view));
  }
  function sectionNote(key){ var n = D().notes && D().notes[key]; return n ? '<div class="note err">' + esc(n) + '</div>' : ''; }
  function tileHtml(a, i, act, sel){
    return '<button class="tile' + (sel ? ' sel' : '') + '" data-act="' + act + '" data-i="' + i + '" aria-label="' + esc((a.kind || 'asset') + ' ' + (a.label || '')) + '">'
      + (a.thumb ? '<img loading="lazy" alt="" src="' + esc(a.thumb) + '">' : '<span class="ph">' + esc(a.kind || 'asset') + '</span>')
      + (a.kind === 'video' ? '<span class="badge">&#9654; video</span>' : '')
      + (sel ? '<span class="chk">in chat</span>' : '') + '</button>';
  }
  function detailHtml(f){
    var sel = state.selected.indexOf(f.url) >= 0;
    return '<div class="detail"><div class="media">'
      + (f.kind === 'video' && f.playable ? '<video controls playsinline preload="metadata" src="' + esc(f.url) + '"' + (f.thumb ? ' poster="' + esc(f.thumb) + '"' : '') + '></video>' : (f.thumb ? '<img alt="" src="' + esc(f.thumb) + '">' : ''))
      + '</div><div class="meta">' + esc([f.label, f.model, f.age].filter(Boolean).join(' · ')) + '</div><div class="row">'
      + (canContext() ? '<button class="btn primary" data-act="sel">' + (sel ? 'Remove from chat' : 'Add to chat') + '</button>' : '')
      + '<button class="btn" data-act="sched-open">Schedule</button>'
      + (state.caps && state.caps.message ? '<button class="btn" data-act="post-focus">Ask Hermoso to post it</button>' : '')
      + (state.caps && state.caps.openLinks ? '<button class="btn" data-act="open-focus">Open file</button>' : '')
      + '</div>' + (state.sched && state.sched.url === f.url ? schedHtml(f) : '') + '</div>';
  }

  // ── SCHEDULE: a finished result to the connected channels, at a time, behind an on-screen confirm ──
  function schedDefaultAt(){ var t = new Date(); t.setDate(t.getDate() + 1); t.setHours(9, 0, 0, 0); return localInput(t); }
  function openSched(f){
    var pr = D().prefs || {};
    state.sched = { url: f.url, kind: f.kind, caption: f.caption || '', at: schedDefaultAt(), picked: (pr.channels || []).slice(), err: '', done: null, busy: false };
    if (!('channels' in D())) load(['connectors']);
    render();
  }
  function schedChannels(f){ return (D().channels || []).filter(function(c){ return f.kind === 'video' || c.id !== 'youtube'; }); }
  function schedHtml(f){
    var s = state.sched;
    if (s.done) return '<div class="confirm"><b>Scheduled</b><div class="s">' + esc(when(s.done.at) + ' to ' + s.done.labels.join(', ')) + '. You can move or cancel it in the Calendar.</div><div class="row" style="margin-top:8px"><button class="btn" data-act="tab" data-view="calendar">Open the Calendar</button><button class="btn" data-act="sched-close">Done</button></div></div>';
    var d = D();
    var html = '<div class="confirm"><b>Schedule this ' + (f.kind === 'video' ? 'video' : 'image') + '</b>';
    if (d.notes && d.notes.connectors) html += sectionNote('connectors');
    else if (!d.channels) html += '<div class="s">Loading your channels...</div>';
    else {
      var chans = schedChannels(f);
      html += '<div class="field"><span class="flabel">Post to</span>' + (chans.length ? '<div class="seg" role="group">' + chans.map(function(c){ return '<button data-act="sched-ch" data-v="' + esc(c.id) + '" aria-pressed="' + (s.picked.indexOf(c.id) >= 0) + '">' + esc(c.label) + '</button>'; }).join('') + '</div>' : '<div class="s">No posting channel is connected yet.</div> <button class="btn" data-act="setup" data-step="connections">Connect a channel</button>') + '</div>';
      html += '<div class="field"><label for="schedAt">When</label><input type="datetime-local" id="schedAt" value="' + esc(s.at) + '"><div class="s">' + esc(tz() || 'Your time zone') + '</div></div>';
      html += '<div class="field"><label for="schedCaption">Caption</label><textarea id="schedCaption" rows="3" placeholder="What the post says">' + esc(s.caption) + '</textarea></div>';
    }
    if (s.err) html += '<div class="note err left">' + esc(s.err) + '</div>';
    html += '<div class="row"><button class="btn" data-act="sched-close">Cancel</button><button class="btn primary" data-act="sched-go"' + (s.busy || !d.channels ? ' disabled' : '') + '>' + (s.busy ? 'Scheduling...' : 'Schedule post') + '</button></div></div>';
    return html;
  }
  function schedule(){
    var f = focused(); var s = state.sched; if (!f || !s || s.busy) return;
    var chans = schedChannels(f).filter(function(c){ return s.picked.indexOf(c.id) >= 0; });
    if (!chans.length) { s.err = 'Pick at least one channel.'; return render(); }
    var t = new Date(s.at);
    if (isNaN(t) || t.getTime() < Date.now() + 120000) { s.err = 'Pick a time in the future.'; return render(); }
    s.err = '';
    var labels = chans.map(function(c){ return c.label; });
    showModal({ title: 'Schedule this post?', body: 'It goes live publicly on ' + labels.join(', ') + '\non ' + when(t) + (tz() ? ' (' + tz() + ')' : '') + '.\nYou can move or cancel it in the Calendar until then.', ok: 'Schedule post', cancel: 'Not yet' }).then(function(yes){
      if (!yes) return render();
      s.busy = true; render();
      var args = { channels: chans.map(function(c){ return c.id; }), at: t.toISOString(), message: s.caption };
      if (f.kind === 'video') args.videoUrl = f.url; else args.imageUrl = f.url;
      callTool(TOOL.schedule, args, 120000).then(function(){ s.busy = false; s.done = { at: t, labels: labels }; toast('Scheduled for ' + when(t)); return load(['calendar']); })
        .catch(function(e){ s.busy = false; s.err = String(e && e.message || e); render(); });
    });
  }
  function focused(){ var list = state.view === 'results' ? (D().results || []) : (D().items || []); return state.focus != null ? list[state.focus] : null; }

  // HOME: a composer that sends to the chat, quick starts and shortcuts. Nothing here spends: it hands requests over.
  var BLOOM = '%%BLOOM%%';
  function homeView(){
    var d = D(); var p = d.profile; var live = activeJobs().length;
    var c = state.composer;
    var html = '<section class="hero"><span class="logo" aria-hidden="true">' + BLOOM + '</span><h1>What would you like to make?</h1>'
      + '<div class="composer"><div class="mchips" id="mchips">' + c.mentions.map(function(m, i){ return '<span class="mchip">' + (m.thumb ? '<img alt="" src="' + esc(m.thumb) + '">' : '') + esc(m.name) + '<button data-act="mention-remove" data-i="' + i + '" aria-label="Remove ' + esc(m.name) + '">&#215;</button></span>'; }).join('') + '</div>'
      + '<textarea id="composer" rows="2" placeholder="Describe an ad, a post or a question. Type @ to add a profile, creator, product or Library item." aria-label="Message to Hermoso"></textarea>'
      + '<div class="menu" id="mmenu" role="listbox" hidden></div>'
      + '<div class="crow"><span class="s">Sends to this chat</span><button class="send" data-act="send" id="sendBtn" aria-label="Send">&#8593;</button></div></div>'
      + '<div class="quick">'
      + '<button class="chip" data-act="msg" data-text="Show me the ads my top competitors are running right now.">Research competitors&#39; ads</button>'
      + '<button class="chip" data-act="create" data-format="image">Make an image ad</button>'
      + '<button class="chip" data-act="create" data-format="video">Make a video ad</button>'
      + '<button class="chip" data-act="msg" data-text="Help me schedule a post from my Hermoso Library.">Schedule a post</button>'
      + '</div></section>';
    html += '<h3>Get started</h3><div class="cards">'
      + gcard('tab', 'library', 'Library', 'Your images and videos')
      + gcard('tab', 'create', 'Create', 'Pick options, see concepts, then render')
      + '<button class="gcard" data-act="msg" data-text="Show me the ads my top competitors are running right now, and what is working for them."><b>Ad Spy</b><span>What competitors are running</span></button>'
      + gcard('tab', 'calendar', 'Calendar', 'Scheduled posts, move or cancel')
      + gcard('tab', 'ads', 'Ads', 'Your campaigns, pause or turn on')
      + gcard('setup', 'connections', 'Connections', 'Channels and ad accounts')
      + gcard('setup', 'brand', p ? 'Profile' : 'Set up profile', p ? (p.name || 'Your profile') : 'Read your website or description')
      + '</div>';
    if (live) html += '<div class="note left"><button class="btn" data-act="tab" data-view="jobs">' + live + ' render' + (live === 1 ? '' : 's') + ' in progress</button></div>';
    if (d.notes && d.notes.brand) html += sectionNote('brand');
    return html;
  }
  function gcard(act, target, title, sub){
    return '<button class="gcard" data-act="' + act + '" ' + (act === 'setup' ? 'data-step' : 'data-view') + '="' + target + '"><b>' + esc(title) + '</b><span>' + esc(sub) + '</span></button>';
  }

  // the composer's @-mentions, from what the app has already read (no extra network)
  function mentionPool(){
    var d = D(); var out = [];
    (d.brands || []).forEach(function(b){ out.push({ kind: 'brand', id: b.id, name: b.name || b.id, sub: b.active ? 'Profile, active' : 'Profile' }); });
    (d.creators || []).forEach(function(c){ out.push({ kind: 'creator', id: c.id, name: c.name || 'Creator', thumb: c.thumb, sub: c.preset ? 'Preset creator' : 'Saved creator' }); });
    (d.products || []).forEach(function(p, i){ out.push({ kind: 'product', id: p.url, url: p.url, name: p.label || ('Product photo ' + (i + 1)), thumb: p.thumb, sub: 'Product photo' }); });
    (d.items || []).forEach(function(a, i){ out.push({ kind: 'asset', id: a.url, url: a.url, name: (a.kind === 'video' ? 'Video' : 'Image') + (a.age ? ' · ' + a.age : '') + (a.model ? ' · ' + a.model : ''), thumb: a.thumb, sub: 'Library', asset: a }); });
    return out;
  }
  function mentionQuery(ta){
    var upto = ta.value.slice(0, ta.selectionStart || 0);
    var m = /(^|\s)@([^\s@]{0,40})$/.exec(upto);
    return m ? m[2].toLowerCase() : null;
  }
  function updateMenu(){
    var ta = $('composer'); var menu = $('mmenu'); if (!ta || !menu) return;
    var q = mentionQuery(ta);
    if (q == null) { menu.hidden = true; state.composer.menu = []; return; }
    if (!state.composer.loadingPool && !('creators' in D()) && !('products' in D())) { state.composer.loadingPool = true; load(['creators', 'products']).then(function(){ var t = $('composer'); if (t) { t.focus(); updateMenu(); } }); }
    var list = mentionPool().filter(function(x){ return !q || String(x.name).toLowerCase().indexOf(q) >= 0 || String(x.sub).toLowerCase().indexOf(q) >= 0; }).slice(0, 8);
    state.composer.menu = list; if (state.composer.hi >= list.length) state.composer.hi = 0;
    menu.innerHTML = list.length ? list.map(function(x, i){ return '<button role="option" data-act="mention-pick" data-i="' + i + '" aria-selected="' + (i === state.composer.hi) + '">' + (x.thumb ? '<img alt="" src="' + esc(x.thumb) + '">' : '<span class="sq"></span>') + '<span>' + esc(x.name) + '</span><span class="k">' + esc(x.sub) + '</span></button>'; }).join('') : '<div class="note">Nothing matches.</div>';
    menu.hidden = false; reportSize();
  }
  function pickMention(i){
    var x = state.composer.menu[i]; var ta = $('composer'); if (!x || !ta) return;
    var pos = ta.selectionStart || 0; var before = ta.value.slice(0, pos).replace(/@[^\s@]{0,40}$/, ''); var after = ta.value.slice(pos);
    ta.value = before + after; state.composer.text = ta.value;
    if (!state.composer.mentions.some(function(m){ return m.kind === x.kind && m.id === x.id; })) state.composer.mentions.push(x);
    $('mmenu').hidden = true; state.composer.menu = [];
    $('mchips').innerHTML = state.composer.mentions.map(function(m, j){ return '<span class="mchip">' + (m.thumb ? '<img alt="" src="' + esc(m.thumb) + '">' : '') + esc(m.name) + '<button data-act="mention-remove" data-i="' + j + '" aria-label="Remove ' + esc(m.name) + '">&#215;</button></span>'; }).join('');
    ta.focus(); ta.setSelectionRange(before.length, before.length); reportSize();
  }
  function mentionBlock(m){
    if (m.kind === 'asset' && m.asset) return assetBlock(m.asset);
    if (m.kind === 'brand') return { type: 'text', text: 'Hermoso profile "' + m.name + '" (profile id ' + m.id + '). If it is not the active profile, switch to it with use_brand first.', _meta: { 'openai/title': ('Profile: ' + m.name).slice(0, 80) } };
    if (m.kind === 'creator') return { type: 'text', text: 'Hermoso creator "' + m.name + '" (creator id ' + m.id + '). Cast them with the creator option when making a video.', _meta: { 'openai/title': ('Creator: ' + m.name).slice(0, 80) } };
    return { type: 'text', text: 'Product photo "' + m.name + '": ' + m.url + '. Use this exact image as the product.', _meta: { 'openai/title': ('Product: ' + m.name).slice(0, 80) } };
  }
  function sendComposer(){
    var ta = $('composer'); var text = ta ? ta.value.trim() : '';
    if (!text && !state.composer.mentions.length) { if (ta) ta.focus(); return; }
    var content = [{ type: 'text', text: text || 'Use these.' }].concat(state.composer.mentions.map(mentionBlock));
    sendMessage(content).then(function(ok){ if (ok) { state.composer.mentions = []; if ($('composer')) $('composer').value = ''; render(); } });
  }

  function libraryView(){
    var d = D(); var items = d.items || [];
    if (d.notes && d.notes.library) return sectionNote('library');
    if (!items.length) return '<div class="note">Nothing here yet. Ask Hermoso for an image or video ad and it will appear here.</div>';
    var html = '<div class="grid">' + items.map(function(a, i){ return tileHtml(a, i, 'focus', state.selected.indexOf(a.url) >= 0); }).join('') + '</div>';
    var f = focused(); if (f) html += detailHtml(f);
    return html;
  }
  function jobsView(){
    var d = D(); var jobs = d.jobs || [];
    if (d.notes && d.notes.jobs) return sectionNote('jobs');
    var live = jobs.filter(function(j){ return j.status === 'queued' || j.status === 'running'; });
    var done = jobs.filter(function(j){ return live.indexOf(j) < 0; }).slice(0, 8);
    var row = function(j){
      var pct = Math.max(0, Math.min(100, Math.round(+j.progress || 0)));
      return '<div class="item">' + (j.thumb ? '<img alt="" src="' + esc(j.thumb) + '">' : '')
        + '<div class="grow"><div class="t">' + esc(j.label || j.type || 'Render') + '</div>'
        + '<div class="s">' + esc([j.statusText, j.model, j.stage].filter(Boolean).join(' · ')) + '</div>'
        + ((j.status === 'queued' || j.status === 'running') ? '<div class="bar"><i style="width:' + pct + '%"></i></div>' : '')
        + '</div></div>';
    };
    var html = '<h3>In progress</h3>' + (live.length ? '<div class="list">' + live.map(row).join('') + '</div>' : '<div class="note">No renders in progress.</div>');
    if (done.length) html += '<h3>Recent</h3><div class="list">' + done.map(row).join('') + '</div>';
    return html;
  }

  // ── CALENDAR: a week you can drag posts across, with a time picker for the same move, and cancel ──
  var POST_STATUS = { queued: 'Scheduled', scheduled: 'Scheduled', running: 'Posting', done: 'Posted', posted: 'Posted', partial: 'Partly posted', error: 'Failed', failed: 'Failed', cancelled: 'Cancelled' };
  function tz(){ try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) { return ''; } }
  function when(at, opts){ if (!at) return ''; var t = new Date(at); if (isNaN(t)) return ''; try { return t.toLocaleString(state.host.locale || undefined, opts || { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); } catch (e) { return t.toISOString(); } }
  function dayKey(t){ return t.getFullYear() + '-' + (t.getMonth() + 1) + '-' + t.getDate(); }
  function weekDays(){ var s = new Date(); s.setHours(0, 0, 0, 0); s.setDate(s.getDate() + state.cal.offset * 7); var out = []; for (var i = 0; i < 7; i++) { var x = new Date(s); x.setDate(s.getDate() + i); out.push(x); } return out; }
  function findPost(id){ var all = (D().scheduled || []).concat(D().history || []); for (var i = 0; i < all.length; i++) if (all[i].id === id) return all[i]; return null; }
  function localInput(t){ var p = function(n){ return (n < 10 ? '0' : '') + n; }; return t.getFullYear() + '-' + p(t.getMonth() + 1) + '-' + p(t.getDate()) + 'T' + p(t.getHours()) + ':' + p(t.getMinutes()); }
  function calendarView(){
    var d = D();
    if (d.notes && d.notes.calendar) return sectionNote('calendar');
    var up = d.scheduled || []; var past = d.history || [];
    var days = weekDays(); var keys = days.map(dayKey);
    var start = days[0].getTime(), end = days[6].getTime() + 864e5;
    var before = up.filter(function(p){ var t = new Date(p.at).getTime(); return t < start; }).length;
    var after = up.filter(function(p){ var t = new Date(p.at).getTime(); return t >= end; }).length;
    var html = '<div class="wkbar"><b>' + esc(when(days[0], { month: 'short', day: 'numeric' }) + ' to ' + when(days[6], { month: 'short', day: 'numeric' })) + '</b>'
      + '<button class="btn" data-act="cal-week" data-d="-1" aria-label="Previous week"' + (state.cal.offset <= 0 && !before ? ' disabled' : '') + '>&#8592;</button>'
      + '<button class="btn" data-act="cal-week" data-d="0">This week</button>'
      + '<button class="btn" data-act="cal-week" data-d="1" aria-label="Next week">&#8594;</button></div>';
    html += '<div class="s" style="margin-bottom:8px">Drag a post to another day to move it, or open it to pick a new time. Times are in ' + esc(tz() || 'your time zone') + '.</div>';
    html += '<div class="week">' + days.map(function(day, i){
      var isPast = day.getTime() < new Date().setHours(0, 0, 0, 0);
      var posts = up.filter(function(p){ return p.at && dayKey(new Date(p.at)) === keys[i]; }).sort(function(a, b){ return new Date(a.at) - new Date(b.at); });
      return '<section class="day' + (isPast ? ' past' : '') + '" data-day="' + i + '"' + (isPast ? '' : ' data-drop="1"') + ' aria-label="' + esc(when(day, { weekday: 'long', month: 'long', day: 'numeric' })) + '">'
        + '<div class="dh"><b>' + esc(when(day, { weekday: 'short' })) + '</b><span>' + esc(when(day, { month: 'short', day: 'numeric' })) + '</span></div>'
        + posts.map(postChip).join('') + '</section>';
    }).join('') + '</div>';
    if (before || after) html += '<div class="s" style="margin-top:6px">' + [before ? before + ' earlier' : '', after ? after + ' later than this week' : ''].filter(Boolean).join(', ') + '.</div>';
    if (!up.length) html += '<div class="note">Nothing scheduled. Ask Hermoso to schedule a post.</div>';
    var open = state.cal.open ? findPost(state.cal.open) : null;
    if (open) html += postDetail(open);
    if (past.length) html += '<h3>Recently posted</h3><div class="list">' + past.map(function(p){ return '<div class="item"><div class="grow"><div class="t">' + esc(when(p.at) || 'Unscheduled') + '</div><div class="s">' + esc([(p.channels || []).join(', '), POST_STATUS[p.status] || p.status].filter(Boolean).join(' · ')) + '</div>' + (p.message ? '<div class="s">' + esc(p.message) + '</div>' : '') + '</div></div>'; }).join('') + '</div>';
    return html;
  }
  function postChip(p){
    var ed = EDITABLE.indexOf(p.status) >= 0;
    return '<button class="post' + (ed ? '' : ' ro') + (state.cal.open === p.id ? ' open' : '') + '" data-act="cal-open" data-id="' + esc(p.id) + '"' + (ed ? ' draggable="true"' : '') + ' aria-label="' + esc('Post at ' + when(p.at) + ' to ' + (p.channels || []).join(', ')) + '">'
      + '<div class="pt">' + esc(when(p.at, { hour: 'numeric', minute: '2-digit' })) + ' · ' + esc((p.channels || []).join(', ')) + '</div>'
      + (p.message ? '<div class="pc">' + esc(p.message) + '</div>' : '')
      + (p.thumb ? '<img alt="" loading="lazy" src="' + esc(p.thumb) + '">' : '') + '</button>';
  }
  function postDetail(p){
    var full = state.cal.full[p.id] || p; var ed = EDITABLE.indexOf(p.status) >= 0;
    var html = '<div class="detail"><div class="row"><b class="grow">' + esc(when(p.at) || 'Unscheduled') + '</b><span class="pill">' + esc(POST_STATUS[p.status] || p.status) + '</span><button class="icon" data-act="cal-close" aria-label="Close">&#215;</button></div>'
      + '<div class="meta">' + esc((p.channels || []).join(', ')) + (tz() ? ' · ' + esc(tz()) : '') + '</div>';
    if (full.mediaUrl || full.thumb) html += '<div class="media">' + (full.media === 'video' && full.playable ? '<video controls playsinline preload="metadata" src="' + esc(full.mediaUrl) + '"' + (full.thumb ? ' poster="' + esc(full.thumb) + '"' : '') + '></video>' : (full.thumb ? '<img alt="" src="' + esc(full.thumb) + '">' : '')) + '</div>';
    if (full.message) html += '<p style="white-space:pre-wrap;margin:10px 0">' + esc(full.message) + '</p>';
    if (ed) {
      var at = state.cal.draftAt || (p.at ? localInput(new Date(p.at)) : '');
      html += '<div class="field"><label for="newAt">New time</label><input type="datetime-local" id="newAt" value="' + esc(at) + '"></div>'
        + '<div class="row"><button class="btn primary" data-act="cal-move" data-id="' + esc(p.id) + '">Move to this time</button><button class="btn danger" data-act="cal-cancel" data-id="' + esc(p.id) + '">Cancel post</button></div>';
    } else html += '<div class="s">This post is not queued any more, so it can no longer be moved or cancelled here.</div>';
    return html + '</div>';
  }
  function moveTo(p, t){
    if (!p || isNaN(t)) return;
    if (t.getTime() < Date.now() + 60000) { toast('Pick a time in the future.'); return; }
    var chans = (p.channels || []).join(', ');
    showModal({ title: 'Move this post?', body: 'From ' + when(p.at) + '\nto ' + when(t) + (tz() ? ' (' + tz() + ')' : '') + '.\nIt posts to ' + (chans || 'its channels') + ' at the new time.', ok: 'Move post', cancel: 'Keep it' }).then(function(yes){
      if (!yes) return;
      callTool(TOOL.reschedule, { id: p.id, at: t.toISOString() }).then(function(){ toast('Moved to ' + when(t)); state.cal.draftAt = ''; return load(['calendar']); })
        .catch(function(e){ showModal({ title: 'Could not move it', body: String(e && e.message || e), ok: 'OK' }); });
    });
  }
  function cancelPost(p){
    showModal({ title: 'Cancel this post?', body: 'It will not be published' + ((p.channels || []).length ? ' to ' + p.channels.join(', ') : '') + '. This cannot be undone.', ok: 'Cancel post', cancel: 'Keep it', danger: true }).then(function(yes){
      if (!yes) return;
      callTool(TOOL.cancel, { id: p.id }).then(function(){ toast('Post cancelled'); state.cal.open = null; return load(['calendar']); })
        .catch(function(e){ showModal({ title: 'Could not cancel it', body: String(e && e.message || e), ok: 'OK' }); });
    });
  }

  // ── ADS: campaigns on every connected ad platform. Pause or turn on behind a confirm; building one is a chat request ──
  function adsView(){
    var d = D();
    var html = '<div class="wkbar"><b>Campaigns</b><button class="btn" data-act="ads-build">Ask Hermoso to build a campaign</button></div>';
    if (d.notes && d.notes.ads) return html + sectionNote('ads');
    var groups = d.ads;
    if (!groups) return html + '<div class="note">Loading your campaigns...</div>';
    if (!groups.length) return html + '<div class="note">No ad platform is connected for this profile yet.</div><div class="row" style="justify-content:center"><button class="btn primary" data-act="setup" data-step="connections">Connect an ad account</button></div>';
    groups.forEach(function(g, gi){
      html += '<h3>' + esc(g.label + (g.accountName ? ' · ' + g.accountName : '')) + '</h3>';
      if (g.note) { html += '<div class="note err left">' + esc(g.note) + '</div>'; return; }
      if (!g.campaigns.length) { html += '<div class="s">No campaigns on this account yet.</div>'; return; }
      html += '<div class="list">' + g.campaigns.map(function(c, ci){
        var pill = '<span class="pill' + (c.state === 'active' ? ' on' : '') + '">' + esc(c.status || (c.state === 'active' ? 'Active' : c.state === 'paused' ? 'Paused' : 'Unknown')) + '</span>';
        var btn = c.state === 'active' ? '<button class="btn" data-act="ads-toggle" data-g="' + gi + '" data-c="' + ci + '">Pause</button>' : c.state === 'paused' ? '<button class="btn" data-act="ads-toggle" data-g="' + gi + '" data-c="' + ci + '">Turn on</button>' : '';
        return '<div class="item"><div class="grow"><div class="t">' + esc(c.name) + '</div><div class="s">' + esc([c.budget, c.results].filter(Boolean).join(' · ')) + '</div></div>' + pill + btn + '</div>';
      }).join('') + '</div>';
    });
    return html;
  }
  function toggleCampaign(g, c){
    if (!g || !c) return;
    var on = c.state !== 'active';
    var body = on ? 'This campaign will start spending on ' + g.label + '.\n"' + c.name + '"' + (c.budget ? '\nBudget: ' + c.budget : '') + (g.accountName ? '\nAd account: ' + g.accountName : '') + '\nAds inside it run only when they are on too.'
      : '"' + c.name + '" on ' + g.label + ' stops spending. You can turn it back on here.';
    showModal({ title: on ? 'Turn this campaign on?' : 'Pause this campaign?', body: body, ok: on ? 'Turn on and start spending' : 'Pause campaign', cancel: on ? 'Keep it paused' : 'Keep it running', danger: on }).then(function(yes){
      if (!yes) return;
      callTool(TOOL.adsStatus, { platform: g.platform, accountId: g.accountId || undefined, campaignId: c.id, status: on ? 'active' : 'paused' }, 120000)
        .then(function(){ toast(on ? 'Campaign turned on' : 'Campaign paused'); return load(['ads']); })
        .catch(function(e){ showModal({ title: on ? 'Could not turn it on' : 'Could not pause it', body: String(e && e.message || e), ok: 'OK' }); });
    });
  }
  function askToBuildCampaign(){
    var names = (D().ads || []).map(function(g){ return g.label; }).filter(function(x, i, a){ return a.indexOf(x) === i; });
    sendMessage([{ type: 'text', text: 'Help me build a new ad campaign' + (names.length ? ' on ' + names.join(' or ') : '') + '. Ask me what it should promote, the budget and the audience, and show me everything before anything goes live.' }]);
  }

  // ── CREATE: the brief form. Review, confirm, then the brief goes to the chat, which shows concepts first ──
  var ASPECTS = ['9:16', '1:1', '4:5', '16:9']; var LENGTHS = [8, 15, 30, 60]; var COUNTS = [3, 4, 6];
  function seg(act, list, cur, fmt){ return '<div class="seg" role="group">' + list.map(function(v){ return '<button data-act="' + act + '" data-v="' + esc(v) + '" aria-pressed="' + (String(v) === String(cur)) + '">' + esc(fmt ? fmt(v) : v) + '</button>'; }).join('') + '</div>'; }
  function pickGrid(act, list, cur, none){
    var html = '<div class="pick"><button class="tile" data-act="' + act + '" data-i="-1" aria-pressed="' + (cur == null) + '"><span class="ph">' + esc(none) + '</span></button>';
    html += list.map(function(x, i){ return '<button class="tile" data-act="' + act + '" data-i="' + i + '" aria-pressed="' + (cur === i) + '" aria-label="' + esc(x.name || x.label || 'option') + '">' + (x.thumb ? '<img loading="lazy" alt="" src="' + esc(x.thumb) + '">' : '<span class="ph">' + esc(x.name || x.label || '') + '</span>') + ((x.name || x.label) ? '<span class="cap">' + esc(x.name || x.label) + '</span>' : '') + '</button>'; }).join('');
    return html + '</div>';
  }
  function briefProductText(){ var b = state.brief; if (b.product != null) return b.product; var p = D().profile; return (p && (p.sells || p.name)) || ''; }
  function createView(){
    var b = state.brief; var d = D();
    if (b.step === 'sent') return '<h2>Sent to the chat</h2><p class="s">Your concepts will show up in the chat. Pick one there to render it.</p><div class="row"><button class="btn" data-act="b-again">Start another</button></div>';
    var prefs = d.prefs || {};
    var prod = b.productPhoto != null ? (d.products || [])[b.productPhoto] : null;
    var cr = b.creator != null ? (d.creators || [])[b.creator] : null;
    var as = b.asset != null ? (d.items || [])[b.asset] : null;
    if (b.step === 'review') {
      var row = function(k, v){ return '<dt>' + esc(k) + '</dt><dd>' + v + '</dd>'; };
      return '<h2>Review your ad</h2><dl class="sum">'
        + row('For', esc(briefProductText() || 'My brand'))
        + row('Format', esc(b.format === 'video' ? 'Video' : 'Image') + ', ' + esc(b.aspect) + (b.format === 'video' ? ', ' + b.length + ' seconds' : ''))
        + row('Product photo', prod ? '<img alt="" src="' + esc(prod.thumb) + '">' + esc(prod.label || 'Selected') : 'Hermoso picks')
        + row('Creator', cr ? (cr.thumb ? '<img alt="" src="' + esc(cr.thumb) + '">' : '') + esc(cr.name) : 'Hermoso picks')
        + row('Reference', as ? '<img alt="" src="' + esc(as.thumb) + '">From your Library' : 'None')
        + row('Concepts', String(b.count))
        + (b.format === 'video' ? row('Captions', prefs.captions ? 'On' : 'Off') + row('End card', prefs.endCard ? 'On' : 'Off') : '')
        + '</dl><p class="s">Hermoso comes up with ' + b.count + ' concepts first, in the chat. Nothing is rendered until you pick one. Coming up with concepts uses your Hermoso account.</p>'
        + '<div class="row"><button class="btn" data-act="b-back">Back</button><button class="btn primary" data-act="b-go">Get concepts</button></div>';
    }
    var html = state.surface === 'card' ? '' : '<h2>New ad</h2>';
    html += '<div class="field"><label for="briefProduct">What is it for?</label><textarea id="briefProduct" rows="2" placeholder="A product, an offer or a launch, in your words">' + esc(briefProductText()) + '</textarea></div>';
    html += '<div class="field"><span class="flabel">Format</span>' + seg('b-format', ['image', 'video'], b.format, function(v){ return v === 'video' ? 'Video' : 'Image'; }) + '</div>';
    html += '<div class="field"><span class="flabel">Size</span>' + seg('b-aspect', ASPECTS, b.aspect) + '</div>';
    if (b.format === 'video') html += '<div class="field"><span class="flabel">Length</span>' + seg('b-length', LENGTHS, b.length, function(v){ return v + 's'; }) + '</div>';
    html += '<div class="field"><span class="flabel">Product photo</span>' + (d.notes && d.notes.products ? sectionNote('products') : (d.products ? (d.products.length ? pickGrid('b-product', d.products, b.productPhoto, 'Hermoso picks') : '<div class="s">No product photos saved yet. Hermoso uses your profile.</div>') : '<div class="s">Loading...</div>')) + '</div>';
    html += '<div class="field"><span class="flabel">Creator</span>' + (d.notes && d.notes.creators ? sectionNote('creators') : (d.creators ? (d.creators.length ? pickGrid('b-creator', d.creators, b.creator, 'Hermoso picks') : '<div class="s">No saved creators yet.</div>') : '<div class="s">Loading...</div>')) + '</div>';
    html += '<div class="field"><span class="flabel">Reference from your Library</span>' + (d.items && d.items.length ? pickGrid('b-asset', d.items.slice(0, 11), b.asset, 'None') : '<div class="s">Nothing in your Library yet.</div>') + '</div>';
    html += '<div class="field"><span class="flabel">How many concepts</span>' + seg('b-count', COUNTS, b.count) + '</div>';
    html += '<div class="row"><button class="btn primary" data-act="b-review">Review</button></div>';
    return html;
  }
  function briefMessage(){
    var b = state.brief; var d = D(); var prefs = d.prefs || {};
    var prod = b.productPhoto != null ? (d.products || [])[b.productPhoto] : null;
    var cr = b.creator != null ? (d.creators || [])[b.creator] : null;
    var as = b.asset != null ? (d.items || [])[b.asset] : null;
    var lines = ['Come up with ' + b.count + ' ad concepts for this brief and show them to me with show_ad_concepts. Wait for me to pick one; do not render anything yet.',
      'For: ' + (briefProductText() || 'my brand'),
      'Format: ' + (b.format === 'video' ? 'video, ' + b.aspect + ', ' + b.length + ' seconds' : 'image, ' + b.aspect)];
    if (b.format === 'video') lines.push('Captions: ' + (prefs.captions ? 'on' : 'off') + '. End card: ' + (prefs.endCard ? 'on' : 'off') + '.');
    var content = [{ type: 'text', text: lines.join('\n') }];
    if (prod) content.push({ type: 'text', text: 'Product photo to use: ' + prod.url, _meta: { 'openai/title': ('Product: ' + (prod.label || 'photo')).slice(0, 80) } });
    if (cr) content.push({ type: 'text', text: 'Creator to cast: "' + cr.name + '" (creator id ' + cr.id + ').', _meta: { 'openai/title': ('Creator: ' + cr.name).slice(0, 80) } });
    if (as) content.push(assetBlock(as));
    return content;
  }

  // ── SETUP: brand, then connections, then a first ad ──
  var GROUPS = [['channels', 'Social channels'], ['ads', 'Ad platforms'], ['data', 'Data and tools']];
  function setupView(){
    var s = state.setup; var d = D(); var p = d.profile;
    var steps = [['brand', '1. Profile'], ['connections', '2. Connections'], ['first', '3. First ad']];
    var html = '<div class="steps">' + steps.map(function(x){ return '<span class="' + (x[0] === s.step ? 'on' : '') + '">' + x[1] + '</span>'; }).join('') + '</div>';
    if (s.step === 'brand') {
      if (d.notes && d.notes.brand) return html + sectionNote('brand');
      if (s.drafting) return html + '<div class="note">Reading ' + esc(s.input || 'your brand') + '. This can take up to a minute.</div>';
      var shown = s.draft || p;
      if (shown && !s.editing) {
        html += '<div class="bcard">' + (shown.logo ? '<img alt="" src="' + esc(shown.logo) + '">' : '') + '<div class="grow"><b>' + esc(shown.name || 'Your profile') + '</b>'
          + '<div class="s">' + esc([shown.domain, shown.category].filter(Boolean).join(' · ')) + '</div>'
          + (shown.summary ? '<p class="s" style="margin:6px 0 0">' + esc(shown.summary) + '</p>' : '') + '</div></div>';
        if (s.draft) html += '<p class="s">' + (s.draft.saved ? 'Saved to your profile.' : 'Not saved.') + ' Is this the right company? If not, try its exact website or describe it.</p>';
        html += '<div class="row" style="margin-top:10px"><button class="btn primary" data-act="s-step" data-step="connections">Looks right, continue</button><button class="btn" data-act="s-edit">Use a different website or description</button></div>';
        return html;
      }
      html += '<p class="s">Hermoso reads your website (or your description) to learn your products, logo, colours and voice.</p>'
        + '<div class="field">' + seg('s-mode', ['website', 'description'], s.mode, function(v){ return v === 'website' ? 'Website' : 'Describe it'; }) + '</div>'
        + '<div class="field">' + (s.mode === 'website' ? '<input type="text" inputmode="url" id="setupInput" placeholder="yourbrand.com" value="' + esc(s.input || '') + '" aria-label="Website">' : '<textarea id="setupInput" rows="3" placeholder="What you sell, who it is for, how you sound" aria-label="Profile description">' + esc(s.input || '') + '</textarea>') + '</div>'
        + '<div class="row"><button class="btn primary" data-act="s-draft">Set up my profile</button>' + (p ? '<button class="btn" data-act="s-keep">Keep ' + esc(p.name || 'the current profile') + '</button>' : '') + '</div>';
      return html;
    }
    if (s.step === 'connections') {
      if (d.notes && d.notes.connectors) return html + sectionNote('connectors') + '<div class="row"><button class="btn" data-act="s-check">Try again</button></div>';
      var conns = d.connections;
      if (!conns) return html + '<div class="note">Loading your accounts...</div>';
      html += '<p class="s">Connecting opens Hermoso in your browser to sign in to that account. Come back here when you are done; this list updates by itself.</p>';
      GROUPS.forEach(function(g){
        var rows = conns.filter(function(c){ return c.group === g[0]; }); if (!rows.length) return;
        html += '<h3>' + esc(g[1]) + '</h3><div class="list">' + rows.map(function(c){
          var pill = c.connected ? (c.needsReconnect ? '<span class="pill warn">Needs reconnect</span>' : '<span class="pill on">Connected</span>') : '<span class="pill">Not connected</span>';
          var btn = !c.connected ? '<button class="btn" data-act="s-connect" data-p="' + esc(c.provider) + '">Connect</button>' : (c.needsReconnect ? '<button class="btn" data-act="s-connect" data-p="' + esc(c.provider) + '">Reconnect</button>' : '');
          return '<div class="item"><div class="grow"><div class="t">' + esc(c.name) + '</div><div class="s">' + esc(c.label || '') + '</div></div>' + pill + btn + '</div>';
        }).join('') + '</div>';
      });
      if (state.setup.watch) html += '<div class="note left">Waiting for ' + esc(state.setup.watch) + ' to connect...</div>';
      html += '<div class="row" style="margin-top:12px"><button class="btn" data-act="s-check">Check again</button><button class="btn primary" data-act="s-step" data-step="first">Continue</button></div>';
      return html;
    }
    html += '<h2>You are set up</h2><p class="s">Make a first ad: pick the options, see a few concepts, and render only the one you like.</p>'
      + '<div class="row"><button class="btn primary" data-act="tab" data-view="create">Make my first ad</button>'
      + '<button class="btn" data-act="msg" data-text="Come up with 4 ad concepts for my brand and show them to me with show_ad_concepts. Wait for me to pick one before rendering anything.">Show me ad ideas</button></div>';
    return html;
  }
  function startWatch(provider){
    stopWatch(); state.setup.watch = provider; state.setup.watchUntil = Date.now() + 3 * 60 * 1000;
    var tick = function(){
      if (!state.setup.watch || Date.now() > state.setup.watchUntil) { stopWatch(); render(); return; }
      load(['connectors']).then(function(){
        var c = (D().connections || []).filter(function(x){ return x.provider === provider; })[0];
        if (c && c.connected && !c.needsReconnect) { toast(c.name + ' connected'); stopWatch(); render(); return; }
        state.setup.watchTimer = setTimeout(tick, 6000);
      });
    };
    state.setup.watchTimer = setTimeout(tick, 6000);
  }
  function stopWatch(){ if (state.setup.watchTimer) clearTimeout(state.setup.watchTimer); state.setup.watchTimer = null; state.setup.watch = null; }
  function draftBrand(){
    var s = state.setup; var el = $('setupInput'); s.input = el ? el.value.trim() : (s.input || '');
    if (!s.input) { toast(s.mode === 'website' ? 'Type your website first.' : 'Describe yourself first.'); return; }
    var p = D().profile;
    var go = function(replace){
      s.drafting = true; render();
      var args = s.mode === 'website' ? { domain: s.input } : { description: s.input };
      if (replace) args.replace = true;
      callTool(TOOL.draft, args, 180000).then(function(r){
        var sc = r.structuredContent || {}; s.draft = sc.brand ? { name: sc.brand.name, domain: sc.brand.domain, category: sc.brand.category, summary: sc.brand.summary, logo: sc.brand.logo, saved: !!sc.saved } : null; s.editing = false;
        return load(['brand', 'brands']);
      }).catch(function(e){ showModal({ title: 'Could not set up your profile', body: String(e && e.message || e), ok: 'OK' }); })
        .then(function(){ s.drafting = false; render(); });
    };
    if (!p) { go(false); return; }
    showModal({ title: 'Replace your profile?', body: 'Hermoso reads ' + s.input.slice(0, 120) + ' and replaces the saved profile for ' + (p.name || 'this profile') + ' with what it finds. The current profile is overwritten.', ok: 'Replace it', cancel: 'Cancel', danger: true }).then(function(yes){ if (yes) go(true); });
  }

  // ── CONCEPTS: pick ONE before anything renders. Render it, on the confirm step, renders that one concept itself ──
  function conceptOpts(i){
    var d = D(); var o = state.concepts.opts[i];
    if (!o) { var f = d.format === 'video' ? 'video' : 'image'; o = state.concepts.opts[i] = { format: f, aspect: d.aspectRatio || (f === 'video' ? '9:16' : '1:1'), length: d.durationSeconds || 15 }; }
    return o;
  }
  function sel(field, i, list, cur, fmt){ return '<select data-field="' + field + '" data-i="' + i + '" aria-label="' + field + '">' + list.map(function(v){ return '<option value="' + esc(v) + '"' + (String(v) === String(cur) ? ' selected' : '') + '>' + esc(fmt ? fmt(v) : v) + '</option>'; }).join('') + '</select>'; }
  function conceptsView(){
    var d = D(); var cs = d.concepts || [];
    var html = d.note ? '<div class="note err">' + esc(d.note) + '</div>' : '';
    if (!cs.length) return html || '<div class="note">No concepts yet.</div>';
    html += cs.map(function(c, i){
      var open = state.concepts.open === i; var sent = state.concepts.sent[i]; var starting = state.concepts.starting === i;
      var h = '<div class="concept"><div><span class="n">' + (i + 1) + '</span><span class="ttl">' + esc(c.title || 'Concept ' + (i + 1)) + '</span>' + (c.hook ? ' <span class="pill">' + esc(c.hook) + '</span>' : '') + '</div>'
        + (c.headline ? '<div class="hl">&#8220;' + esc(c.headline) + '&#8221;</div>' : '')
        + (c.line ? '<div class="s">' + esc(c.line) + '</div>' : '')
        + (c.visual ? '<div class="vis">' + esc(c.visual) + '</div>' : '');
      if (starting) h += '<div class="confirm"><b>Starting concept ' + (i + 1) + '</b><div class="s">Hermoso is writing the full ad and starting the render. This can take a minute.</div><div class="bar"><i class="busy"></i></div></div>';
      else if (sent) h += '<div class="confirm"><div class="row"><span class="s grow">Rendering on your Hermoso account.</span><button class="btn" data-act="c-see">See it</button></div>' + (noticesFor(sent).length ? '<div class="notices">' + noticeHtml(noticesFor(sent)) + '</div>' : '') + '</div>';
      else if (open) {
        var o = conceptOpts(i);
        h += '<div class="confirm"><b>Render concept ' + (i + 1) + '?</b><div class="row" style="margin:8px 0">'
          + sel('format', i, ['image', 'video'], o.format, function(v){ return v === 'video' ? 'Video' : 'Image'; })
          + sel('aspect', i, ASPECTS, o.aspect)
          + (o.format === 'video' ? sel('length', i, LENGTHS.indexOf(+o.length) < 0 ? LENGTHS.concat([+o.length]) : LENGTHS, o.length, function(v){ return v + ' seconds'; }) : '')
          + '</div><div class="s">Render it makes this concept on your Hermoso account and shows it here. Only this concept is rendered.</div>'
          + (state.concepts.err && state.concepts.err.i === i ? '<div class="note err left">' + esc(state.concepts.err.text) + '</div>' : '')
          + '<div class="row" style="margin-top:8px"><button class="btn" data-act="c-back">Back</button><button class="btn primary" data-act="c-go" data-i="' + i + '"' + (state.concepts.starting != null ? ' disabled' : '') + '>Render it</button></div></div>';
      } else h += '<div class="row" style="margin-top:10px"><button class="btn primary" data-act="c-pick" data-i="' + i + '">Render this one</button></div>';
      return h + '</div>';
    }).join('');
    html += '<div class="row"><button class="btn" data-act="c-more">More ideas</button></div>';
    return html;
  }
  // The click on Render it, on the step that says it renders on the user's account, IS the confirmation, exactly like
  // a calendar move: the app runs the render through its own app-only tool and shows it in place. Nothing is sent to
  // the chat, so the model is never asked to spend on the app's say-so.
  function captionFor(c){ return [c.headline, c.line].filter(Boolean).join('\n\n'); }
  function renderConcept(i){
    var d = D(); var c = (d.concepts || [])[i]; if (!c || state.concepts.starting != null) return;
    var o = conceptOpts(i); var prefs = d.prefs || {};
    var args = { product: d.product || '', concept: { title: c.title, hook: c.hook, hookId: c.hookId, headline: c.headline, line: c.line, visual: c.visual }, format: o.format, aspectRatio: o.aspect };
    if (o.format === 'video') { args.durationSeconds = +o.length; args.captions = prefs.captions === true; args.endCard = prefs.endCard === true; }
    if (d.productImage) args.productImage = d.productImage;
    if (d.creator) args.creator = d.creator;
    if (d.reference) args.reference = d.reference;
    state.concepts.starting = i; state.concepts.err = null; render();
    callTool(TOOL.render, args, 300000).then(function(r){
      var sc = (r && r.structuredContent) || {};
      if (!sc.jobId && !sc.url) throw new Error(textOf(r) || 'The render did not start.');
      var label = 'Concept ' + (i + 1) + (c.title ? ': ' + c.title : '');
      state.concepts.starting = null; state.concepts.open = null; state.concepts.sent[i] = sc.jobId || sc.url;
      var nts = Array.isArray(sc.notices) ? sc.notices.filter(function(t){ return typeof t === 'string' && t; }) : [];
      var dd = D(); dd.results = (dd.results || []).concat([{ id: sc.jobId || '', status: sc.url ? 'done' : 'queued', progress: 0, url: sc.url || '', kind: o.format, thumb: '', label: label, caption: captionFor(c), notices: nts }]);
      if (sc.jobId) { state.started.push({ jobId: sc.jobId, label: label, notices: nts }); syncContext(); }
      dd.title = 'Your renders'; state.focus = null; state.view = 'results'; render(); schedulePoll();
    }).catch(function(e){ state.concepts.starting = null; state.concepts.err = { i: i, text: String(e && e.message || e) }; render(); });
  }
  function moreConcepts(){
    var d = D(); var titles = (d.concepts || []).map(function(c){ return c.title; }).filter(Boolean);
    showModal({ title: 'More ideas?', body: 'Hermoso comes up with more concepts in the chat. This uses your Hermoso account. Nothing is rendered.', ok: 'Get more ideas', cancel: 'Cancel' }).then(function(yes){
      if (!yes) return;
      sendMessage([{ type: 'text', text: 'Come up with ' + ((d.concepts || []).length || 4) + ' more ad concepts' + (d.product ? ' for ' + d.product : '') + ', different from these: ' + titles.join('; ') + '. Show them with show_ad_concepts and wait for me to pick one.' }]);
    });
  }

  // ── RESULTS: a batch the user already asked for. Use one in the chat, or hand it back to post or schedule ──
  function resultsView(){
    var d = D(); var rs = d.results || [];
    var html = d.note ? '<div class="note err">' + esc(d.note) + '</div>' : '';
    if (!rs.length) return html || '<div class="note">Nothing to show yet.</div>';
    html += '<div class="grid">' + rs.map(function(a, i){
      if (a.status === 'done' && a.url) return tileHtml(a, i, 'r-focus', state.selected.indexOf(a.url) >= 0);
      var pct = Math.max(0, Math.min(100, Math.round(+a.progress || 0)));
      var label = a.status === 'error' ? 'Failed' : a.status === 'not_found' ? 'Not found' : a.status === 'queued' ? 'Queued' : 'Rendering';
      return '<div class="tile" role="img" aria-label="' + esc(label) + '"><span class="ph">' + esc(label) + (a.error ? ': ' + esc(a.error) : '') + (a.label ? '<br>' + esc(a.label) : '') + '</span>' + ((a.status === 'running' || a.status === 'queued') ? '<div class="bar">' + (pct >= 5 ? '<i style="width:' + pct + '%"></i>' : '<i class="busy"></i>') + '</div>' : '') + '</div>';
    }).join('') + '</div>';
    var said = rs.filter(function(a){ return a.notices && a.notices.length; });
    if (said.length) html += '<div class="notices">' + said.map(function(a){ return noticeHtml(a.notices, rs.length > 1 ? a.label : ''); }).join('') + '</div>';
    var live = pendingResults().length;
    if (live) html += '<div class="s" style="margin-top:8px">' + live + ' render' + (live === 1 ? '' : 's') + ' in progress. ' + (live === 1 ? 'It shows' : 'They show') + ' here when done, usually within a few minutes. You can keep chatting meanwhile.</div>';
    var f = focused(); if (f) html += detailHtml(f);
    if ((d.concepts || []).length) html += '<div class="row" style="margin-top:10px"><button class="btn" data-act="r-concepts">Back to the concepts</button></div>';
    return html;
  }

  function render(){
    header();
    var main = $('main');
    var keepComposer = state.view === 'home' && $('composer') ? $('composer').value : null;
    var act = document.activeElement; var keepId = act && act.id && act !== document.body ? act.id : null; var caret = null;
    try { if (keepId && typeof act.selectionStart === 'number') caret = [act.selectionStart, act.selectionEnd]; } catch (e) {}
    if (!state.data) { main.innerHTML = state.loadError ? '<div class="note err">' + esc(state.loadError) + '</div>' : '<div class="note">Loading Hermoso...</div>'; reportSize(); return; }
    var html = state.loadError ? '<div class="note err">' + esc(state.loadError) + '</div>' : '';
    var v = state.view;
    html += v === 'home' ? homeView() : v === 'jobs' ? jobsView() : v === 'calendar' ? calendarView() : v === 'ads' ? adsView() : v === 'create' ? createView() : v === 'setup' ? setupView() : v === 'concepts' ? conceptsView() : v === 'results' ? resultsView() : libraryView();
    main.innerHTML = html;
    if (keepComposer != null && $('composer')) $('composer').value = keepComposer;
    if (keepId && $(keepId)) { try { $(keepId).focus(); if (caret) $(keepId).setSelectionRange(caret[0], caret[1]); } catch (e) {} }
    state.loadError = null;
    reportSize();
  }

  // ── one delegated listener for every action ──
  document.addEventListener('click', function(e){
    var el = e.target.closest ? e.target.closest('[data-act]') : null; if (!el || el.disabled) return;
    var a = el.getAttribute('data-act'); var i = +el.getAttribute('data-i');
    var d = D();
    if (a === 'm-ok') return closeModal(true);
    if (a === 'm-cancel') return closeModal(false);
    if (a === 'tab') { if (el.getAttribute('data-view') === 'setup') state.setup.step = state.setup.step || 'brand'; return setView(el.getAttribute('data-view')); }
    if (a === 'refresh') return load(SECTIONS_FOR[state.view] || ['library', 'jobs', 'brands', 'calendar']);
    if (a === 'expand') return rpc('ui/request-display-mode', { mode: 'fullscreen' }).then(function(r){ if (r && r.mode) applyHost({ displayMode: r.mode }); }).catch(function(){});
    if (a === 'focus' || a === 'r-focus') { state.focus = state.focus === i ? null : i; state.sched = null; return render(); }
    if (a === 'sel') { var f = focused(); if (f) toggleSelect(f.url); return; }
    if (a === 'post-focus') { var f2 = focused(); if (f2) askToPost(f2); return; }
    if (a === 'open-focus') { var f3 = focused(); if (f3) openLink(f3.url); return; }
    // schedule
    if (a === 'sched-open') { var f4 = focused(); if (f4) openSched(f4); return; }
    if (a === 'sched-close') { state.sched = null; return render(); }
    if (a === 'sched-ch') { var sp = state.sched && state.sched.picked; if (sp) { var cv = el.getAttribute('data-v'); var ix = sp.indexOf(cv); if (ix >= 0) sp.splice(ix, 1); else sp.push(cv); state.sched.err = ''; } return render(); }
    if (a === 'sched-go') return schedule();
    // ads
    if (a === 'ads-toggle') { var ag = (d.ads || [])[+el.getAttribute('data-g')]; return toggleCampaign(ag, ag && ag.campaigns[+el.getAttribute('data-c')]); }
    if (a === 'ads-build') return askToBuildCampaign();
    if (a === 'msg') return sendMessage([{ type: 'text', text: el.getAttribute('data-text') }]);
    if (a === 'create') { state.brief.format = el.getAttribute('data-format') === 'video' ? 'video' : 'image'; state.brief.aspect = state.brief.format === 'video' ? '9:16' : '1:1'; state.brief.step = 'form'; return setView('create'); }
    if (a === 'setup') { state.setup.step = el.getAttribute('data-step') || 'brand'; setView('setup'); if (state.setup.step === 'connections' && !d.connections) load(['connectors']); return; }
    if (a === 'send') return sendComposer();
    if (a === 'mention-pick') return pickMention(i);
    if (a === 'mention-remove') { state.composer.mentions.splice(i, 1); return render(); }
    // brief
    if (a === 'b-format') { state.brief.format = el.getAttribute('data-v'); if (state.brief.format === 'video' && state.brief.aspect === '1:1') state.brief.aspect = '9:16'; return render(); }
    if (a === 'b-aspect') { state.brief.aspect = el.getAttribute('data-v'); return render(); }
    if (a === 'b-length') { state.brief.length = +el.getAttribute('data-v'); return render(); }
    if (a === 'b-count') { state.brief.count = +el.getAttribute('data-v'); return render(); }
    if (a === 'b-product') { state.brief.productPhoto = i < 0 ? null : i; return render(); }
    if (a === 'b-creator') { state.brief.creator = i < 0 ? null : i; return render(); }
    if (a === 'b-asset') { state.brief.asset = i < 0 ? null : i; return render(); }
    if (a === 'b-review') { var bp = $('briefProduct'); if (bp) state.brief.product = bp.value.trim(); state.brief.step = 'review'; return render(); }
    if (a === 'b-back') { state.brief.step = 'form'; return render(); }
    if (a === 'b-go') return sendMessage(briefMessage(), 'Brief sent. Concepts are on the way').then(function(ok){ if (ok) { state.brief.step = 'sent'; render(); } });
    if (a === 'b-again') { state.brief = { step: 'form', format: 'image', aspect: '1:1', length: 15, count: 4, product: null, productPhoto: null, creator: null, asset: null }; return render(); }
    // setup
    if (a === 's-mode') { var si = $('setupInput'); if (si) state.setup.input = si.value; state.setup.mode = el.getAttribute('data-v'); return render(); }
    if (a === 's-edit') { state.setup.editing = true; state.setup.draft = null; return render(); }
    if (a === 's-keep') { state.setup.editing = false; return render(); }
    if (a === 's-draft') return draftBrand();
    if (a === 's-step') { state.setup.step = el.getAttribute('data-step'); if (state.setup.step === 'connections') load(['connectors']); return render(); }
    if (a === 's-check') return load(['connectors']);
    if (a === 's-connect') { var pv = el.getAttribute('data-p'); var c = (d.connections || []).filter(function(x){ return x.provider === pv; })[0]; if (c && c.connectUrl) { openLink(c.connectUrl).then(function(){ startWatch(pv); render(); }); } return; }
    // concepts
    if (a === 'c-pick') { state.concepts.open = i; return render(); }
    if (a === 'c-back') { state.concepts.open = null; return render(); }
    if (a === 'c-go') return renderConcept(i);
    if (a === 'c-see') { state.focus = null; state.view = 'results'; render(); return schedulePoll(); }
    if (a === 'r-concepts') { state.focus = null; state.sched = null; state.view = 'concepts'; return render(); }
    if (a === 'c-more') return moreConcepts();
    // calendar
    if (a === 'cal-week') { var dd = +el.getAttribute('data-d'); state.cal.offset = dd === 0 ? 0 : state.cal.offset + dd; return render(); }
    if (a === 'cal-open') { var id = el.getAttribute('data-id'); state.cal.draftAt = ''; state.cal.open = state.cal.open === id ? null : id; render(); if (state.cal.open && !state.cal.full[id]) load([], { postId: id }); return; }
    if (a === 'cal-close') { state.cal.open = null; return render(); }
    if (a === 'cal-move') { var p = findPost(el.getAttribute('data-id')); var v = $('newAt') ? $('newAt').value : ''; if (!v) { toast('Pick a new time first.'); return; } return moveTo(p, new Date(v)); }
    if (a === 'cal-cancel') return cancelPost(findPost(el.getAttribute('data-id')));
  });
  document.addEventListener('change', function(e){
    var t = e.target;
    if (t && t.id === 'brandSel') {
      var id = t.value; t.disabled = true;
      callTool(TOOL.useBrand, { brand: id }).catch(function(err){ state.loadError = String(err && err.message || err); })
        .then(function(){ state.selected = []; syncContext(); return load(['library', 'jobs', 'brands', 'calendar', 'brand', 'prefs']); });
      return;
    }
    if (t && t.getAttribute && t.getAttribute('data-field')) { var o = conceptOpts(+t.getAttribute('data-i')); var f = t.getAttribute('data-field'); o[f] = f === 'length' ? +t.value : t.value; render(); return; }
    if (t && t.id === 'newAt') state.cal.draftAt = t.value;
    if (t && t.id === 'schedAt' && state.sched) state.sched.at = t.value;
  });
  document.addEventListener('input', function(e){
    var t = e.target;
    if (t && t.id === 'composer') { t.style.height = 'auto'; t.style.height = Math.min(180, t.scrollHeight) + 'px'; updateMenu(); return; }
    if (t && t.id === 'briefProduct') { state.brief.product = t.value; return; }
    if (t && t.id === 'setupInput') { state.setup.input = t.value; return; }
    if (t && t.id === 'schedCaption' && state.sched) { state.sched.caption = t.value; return; }
    if (t && t.id === 'schedAt' && state.sched) { state.sched.at = t.value; return; }
  });
  document.addEventListener('keydown', function(e){
    var t = e.target;
    if (e.key === 'Escape' && !$('modal').hidden) { closeModal(false); return; }
    if (!t || t.id !== 'composer') return;
    var menuOpen = $('mmenu') && !$('mmenu').hidden && state.composer.menu.length;
    if (menuOpen && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) { e.preventDefault(); var n = state.composer.menu.length; state.composer.hi = (state.composer.hi + (e.key === 'ArrowDown' ? 1 : n - 1)) % n; updateMenu(); return; }
    if (menuOpen && (e.key === 'Enter' || e.key === 'Tab')) { e.preventDefault(); pickMention(state.composer.hi); return; }
    if (e.key === 'Escape' && menuOpen) { $('mmenu').hidden = true; return; }
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); sendComposer(); }
  });
  // drag a queued post to another day: same time of day, then the confirm says the exact new time
  document.addEventListener('dragstart', function(e){ var el = e.target.closest && e.target.closest('.post[draggable=true]'); if (!el) return; state.cal.drag = el.getAttribute('data-id'); try { e.dataTransfer.setData('text/plain', state.cal.drag); e.dataTransfer.effectAllowed = 'move'; } catch (x) {} });
  document.addEventListener('dragover', function(e){ var z = e.target.closest && e.target.closest('[data-drop]'); if (!z || !state.cal.drag) return; e.preventDefault(); z.classList.add('drop'); });
  document.addEventListener('dragleave', function(e){ var z = e.target.closest && e.target.closest('[data-drop]'); if (z) z.classList.remove('drop'); });
  document.addEventListener('dragend', function(){ state.cal.drag = null; var zs = document.querySelectorAll('.drop'); for (var i = 0; i < zs.length; i++) zs[i].classList.remove('drop'); });
  document.addEventListener('drop', function(e){
    var z = e.target.closest && e.target.closest('[data-drop]'); if (!z || !state.cal.drag) return; e.preventDefault(); z.classList.remove('drop');
    var p = findPost(state.cal.drag); state.cal.drag = null; if (!p || !p.at) return;
    var day = weekDays()[+z.getAttribute('data-day')]; var old = new Date(p.at);
    var t = new Date(day); t.setHours(old.getHours(), old.getMinutes(), 0, 0);
    if (dayKey(t) === dayKey(old)) return;
    moveTo(p, t);
  });
  window.addEventListener('focus', function(){ if (state.setup.watch) load(['connectors']); });
  if (window.ResizeObserver) new ResizeObserver(reportSize).observe(document.body);

  rpc('ui/initialize', { appInfo: { name: 'hermoso', version: '1.1.0' }, appCapabilities: { availableDisplayModes: ['inline', 'fullscreen'] }, protocolVersion: PROTOCOL }, 15000)
    .then(function(r){
      state.caps = (r && r.hostCapabilities) || {};
      applyHost((r && r.hostContext) || {});
      notify('ui/notifications/initialized', {});
      state.ready = true; reportSize();
      // The spec asks an app to render the tool result it is handed rather than call again. Only if none arrives
      // (an entrypoint opened before its result, or a host that skips it) does the app ask for the data itself.
      setTimeout(function(){
        if (state.data) return;
        if (CARD_VIEWS.indexOf(state.view) >= 0) { state.loadError = 'Ask Hermoso again to show this.'; render(); return; }
        load(SECTIONS_FOR[state.view] || SECTIONS_FOR.home);
      }, 2500);
    })
    .catch(function(e){ state.loadError = 'This view needs ChatGPT to open it. ' + String(e && e.message || e); state.data = state.data || null; render(); });
})();
</script>`;

export const LIBRARY_APP_HTML = ('<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">\n'
  + APP_STYLE + '</head><body>\n' + APP_BODY + '\n' + APP_SCRIPT + '</body></html>').replace('%%BLOOM%%', ICON_SVG.replace(/'/g, '"').replace('width="20" height="20"', 'width="34" height="34"'));

export const LIBRARY_APP_URI = `ui://hermoso/library-${createHash('sha1').update(LIBRARY_APP_HTML).digest('hex').slice(0, 10)}.html`;
const LIBRARY_ANY_HASH = 'ui://hermoso/library-{hash}.html';
export const MENTION_URI_TEMPLATE = 'hermoso://{kind}/{id}';
export const LIBRARY_DISPLAY_MODES = Object.freeze({ availableDisplayModes: ['inline', 'fullscreen'], preferredDisplayMode: 'inline' });

// The resource `_meta`: the CSP the existing cards use (own origins only, no connect, no frames, both shapes) plus
// the display modes. `inline` is PREFERRED because a model-invoked card should not take the whole window over a chat;
// the two entrypoints open fullscreen regardless (spec: "ChatGPT uses the fullscreen display mode for all
// entrypoints"), and the app offers Expand when it is inline.
export const libraryResourceMeta = (resourceMeta, origins) => ({
  ...resourceMeta('Hermoso in ChatGPT: a home screen, this profile’s Library, renders in progress, the posting calendar, ad campaigns, a new-ad brief, ad concepts to pick from before rendering, and profile setup.', origins),
  'openai/ui': { ...LIBRARY_DISPLAY_MODES },
});

// ── A REFUSAL FOR LACK OF CREDITS IS ONE NEUTRAL SENTENCE INSIDE THE APP ─────────────────────────────────────────
// Elsewhere an out-of-credits answer names buy_credits and a checkout link. OpenAI's guidelines allow a plugin to say a
// feature needs more credits and forbid any step toward a purchase, so inside the app that answer is replaced by the
// one sentence below. Everything else passes through as it was written.
export const NEUTRAL_CREDIT_NOTE = 'This needs more credits than this Hermoso account has right now.';
export const neutralNote = (t) => {
  const s = String(t ?? '').replace(/^Error:\s*/, '').trim();
  if (/insufficient|not enough credits|out of credits|buy_credits|top[- ]?up|upgrade_plan|checkout|\b402\b|credit balance/i.test(s)) return NEUTRAL_CREDIT_NOTE;
  return s.slice(0, 240);
};

// ── WHAT THE APP RENDERS: PURE, SO A CHECK RUNS IT ───────────────────────────────────────────────────────────────
// `reads` holds, per section, `{data}` from the existing tool's structuredContent or `{error}` with its text. A
// FAILED read is reported as a note and never as an empty list ([[failed-read-is-not-empty]]).
// OUR OWN HOUSEKEEPING IS NOT A RENDER. /api/jobs lists every job on the account, including idle nudges, retention
// sweeps and drift watches queued for later (measured on a fresh local account: one `agentidle` "nudge", queued for
// tomorrow, would have shown as "1 render in progress"). Mirrors server.js JOB_TYPES_HIDDEN_FROM_V1, and the check
// fails if that list gains a type this one lacks. A job queued for LATER is not in progress either.
export const PANEL_HIDDEN_JOB_TYPES = Object.freeze(['purge', 'agentidle', 'agentsetupmail', 'uploadretention', 'connectordrift', 'falwatch', 'faceassetsweep', 'searchvis', 'mcpcanary', 'welcomeads', 'lifecycleedu', 'connhealth']);
const ageText = (h) => (h == null || !Number.isFinite(+h) ? '' : +h < 1 ? 'just now' : +h < 48 ? `${Math.round(+h)}h ago` : `${Math.round(+h / 24)}d ago`);
const VIDEO_RE = /\.(mp4|webm|mov|m4v)([?#]|$)/i;
const clip = (s, n) => { const t = String(s ?? '').replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n - 1) + '…' : t; };
const EDITABLE_POST = ['queued', 'scheduled'];

// Display name and group for every connector the server offers. An id this table does not know still renders, by
// its own id, in the third group, so a new connector is never hidden ([[failed-read-is-not-empty]]).
const PROVIDER_INFO = {
  meta: ['Meta (Facebook and Instagram)', 'channels'], instagram: ['Instagram', 'channels'], threads: ['Threads', 'channels'],
  tiktok: ['TikTok', 'channels'], youtube: ['YouTube', 'channels'], linkedin: ['LinkedIn', 'channels'], x: ['X', 'channels'],
  pinterest: ['Pinterest', 'channels'], bluesky: ['Bluesky', 'channels'], telegram: ['Telegram', 'channels'], reddit: ['Reddit', 'channels'],
  google_business: ['Google Business Profile', 'channels'], whatsapp: ['WhatsApp', 'channels'], snapchat: ['Snapchat', 'channels'],
  google_ads: ['Google Ads', 'ads'], tiktok_ads: ['TikTok Ads', 'ads'], linkedin_ads: ['LinkedIn Ads', 'ads'], microsoft_ads: ['Microsoft Advertising', 'ads'],
  reddit_ads: ['Reddit Ads', 'ads'], pinterest_ads: ['Pinterest Ads', 'ads'], snapchat_ads: ['Snapchat Ads', 'ads'], x_ads: ['X Ads', 'ads'],
  openai_ads: ['ChatGPT Ads', 'ads'], apple_ads: ['Apple Ads', 'ads'], applovin_ads: ['AppLovin Ads', 'ads'],
  google_drive: ['Google Drive, Sheets and Docs', 'data'], onedrive: ['OneDrive', 'data'], google_analytics: ['Google Analytics', 'data'],
  search_console: ['Google Search Console', 'data'], merchant_center: ['Google Merchant Center', 'data'], slack: ['Slack', 'data'],
  shopify: ['Shopify', 'data'], stripe: ['Stripe', 'data'], hubspot: ['HubSpot', 'data'],
};
export const providerInfo = (p) => {
  const hit = PROVIDER_INFO[p];
  if (hit) return { name: hit[0], group: hit[1] };
  const name = String(p || '').split('_').filter(Boolean).map((w) => (w === 'ads' ? 'Ads' : w.charAt(0).toUpperCase() + w.slice(1))).join(' ') || String(p);
  return { name, group: /_ads$/.test(String(p)) ? 'ads' : 'data' };
};
// The publishing channels a connector carries, for the "post here by default" settings. The ids are schedule_post's.
const CHANNELS_OF = { meta: ['facebook', 'instagram'], instagram: ['instagram'], threads: ['threads'], tiktok: ['tiktok'], youtube: ['youtube'], linkedin: ['linkedin'], x: ['x'], pinterest: ['pinterest'], google_business: ['google_business'], bluesky: ['bluesky'], telegram: ['telegram'] };
const CHANNEL_LABEL = { facebook: 'Facebook', instagram: 'Instagram', threads: 'Threads', tiktok: 'TikTok', youtube: 'YouTube', linkedin: 'LinkedIn', x: 'X', pinterest: 'Pinterest', google_business: 'Google Business Profile', bluesky: 'Bluesky', telegram: 'Telegram' };
export const ALL_CHANNELS = Object.freeze(Object.keys(CHANNEL_LABEL));

export function libraryPayload(reads = {}, { view = 'library', origins = [], proxyBase = '', abs = (u) => u } = {}) {
  const appOrigin = (() => { try { return new URL(proxyBase).origin; } catch { return ''; } })();
  const own = (u) => { try { return origins.includes(new URL(u).origin); } catch { return false; } };
  // A picture on any other host goes through our own /api/img, exactly as the ad card does, or the CSP blanks it.
  const picture = (u) => (!u ? '' : own(u) ? u : (proxyBase ? proxyBase + encodeURIComponent(u) : ''));
  const poster = (u) => (appOrigin && u ? `${appOrigin}/api/video/poster?url=${encodeURIComponent(u)}` : '');
  const out = { view: EXT_VIEWS.includes(view) ? view : 'library', notes: {} };
  const errText = (r) => neutralNote(r?.error || 'Could not load this right now.');
  const media = (u) => { const url = abs(u); const video = VIDEO_RE.test(url); return { url, video, thumb: video ? poster(url) : picture(url) }; };

  if (reads.library) {
    if (reads.library.error) out.notes.library = errText(reads.library);
    else out.items = (reads.library.data?.assets || []).filter((a) => a && a.url).slice(0, 24).map((a) => {
      const url = abs(a.url); const video = a.kind === 'video' || VIDEO_RE.test(url);
      return { url, kind: video ? 'video' : (a.kind || 'image'), model: a.model || '', age: ageText(a.ageHours), thumb: video ? poster(url) : picture(url), playable: video && own(url) };
    });
  }
  if (reads.jobs) {
    if (reads.jobs.error) out.notes.jobs = errText(reads.jobs);
    else {
      const STATUS = { queued: 'Queued', running: 'Rendering', done: 'Done', error: 'Failed', cancelled: 'Cancelled' };
      // NOT /api/jobs' own `running`: that is the PROCESS-wide count (every account's renders), not this user's.
      const now = Date.now();
      const isWork = (j) => j && !PANEL_HIDDEN_JOB_TYPES.includes(j.type) && !(j.status === 'queued' && Number(j.runAt) > now + 60e3);
      out.jobs = (reads.jobs.data?.jobs || []).filter(isWork).slice(0, 12).map((j) => {
        const r = j?.result || {};
        const img = r.image || (Array.isArray(r.images) && r.images[0]) || (Array.isArray(r.thumbnails) && r.thumbnails[0]?.image) || '';
        const vid = r.video || (Array.isArray(r.clips) && r.clips[0]?.video) || '';
        const thumb = img ? picture(abs(img)) : vid ? poster(abs(vid)) : '';
        return { id: j.id, type: j.type || '', label: j.label || '', status: j.status || '', statusText: STATUS[j.status] || j.status || '', progress: Number(j.progress) || 0, stage: j.status === 'running' ? (j.stage || '') : '', model: j.model || '', thumb };
      });
      out.running = out.jobs.filter((j) => j.status === 'queued' || j.status === 'running').length;
    }
  }
  if (reads.brands) {
    if (reads.brands.error) out.notes.brands = errText(reads.brands);
    else {
      const bs = (reads.brands.data?.brands || []).filter((b) => b && b.id != null).map((b) => ({ id: String(b.id), name: b.name || String(b.id), active: !!b.active }));
      out.brands = bs;
      const a = bs.find((b) => b.active);
      out.brand = a ? { id: a.id, name: a.name } : null;
    }
  }
  if (reads.calendar) {
    if (reads.calendar.error) out.notes.calendar = errText(reads.calendar);
    else {
      const row = (p) => {
        const m = p.mediaUrl ? media(p.mediaUrl) : null;
        return { id: p.id || '', at: p.at || null, channels: Array.isArray(p.channels) ? p.channels : [], status: p.status || '', message: clip(p.message, 140), media: p.media || (m ? (m.video ? 'video' : 'image') : 'none'), thumb: m ? m.thumb : '', editable: EDITABLE_POST.includes(p.status) };
      };
      out.scheduled = (reads.calendar.data?.scheduled || []).slice(0, 40).map(row);
      out.history = (reads.calendar.data?.history || []).slice(-6).reverse().map(row);
    }
  }
  if (reads.post) {
    if (reads.post.error) out.notes.post = errText(reads.post);
    else {
      const p = (reads.post.data?.scheduled || [])[0] || (reads.post.data?.history || [])[0] || null;
      if (p) {
        const raw = p.videoUrl || p.imageUrl || (Array.isArray(p.imageUrls) && p.imageUrls[0]) || '';
        const m = raw ? media(raw) : null;
        out.post = { id: p.id || '', at: p.at || null, channels: Array.isArray(p.channels) ? p.channels : [], status: p.status || '', message: String(p.message || '').slice(0, 2000), mediaUrl: m ? m.url : '', media: m ? (m.video ? 'video' : 'image') : 'none', thumb: m ? m.thumb : '', playable: !!(m && m.video && own(m.url)) };
      }
    }
  }
  if (reads.brand) {
    if (reads.brand.error) out.notes.brand = errText(reads.brand);
    else {
      const d = reads.brand.data || {}; const b = d.hasBrand ? d.brand : null;
      const sells = Array.isArray(b?.sells) ? b.sells.join(', ') : b?.sells;
      out.profile = b ? { name: b.name || b.domain || '', domain: b.domain || '', category: b.category || '', summary: clip(b.summary || b.positioning, 240), sells: clip(sells || b.product || '', 140), logo: b.logo ? picture(abs(b.logo)) : '' } : null;
    }
  }
  if (reads.connectors) {
    if (reads.connectors.error) out.notes.connectors = errText(reads.connectors);
    else {
      const d = reads.connectors.data || {};
      const tpl = typeof d.connectLink === 'string' && /^https:\/\//.test(d.connectLink) && d.connectLink.includes('{provider}') ? d.connectLink : 'https://app.hermoso.ai/?connect={provider}';
      const on = new Map();
      for (const c of d.connectors || []) if (c && c.provider && c.status !== 'revoked') on.set(c.provider, c);
      const ids = [...new Set([...(Array.isArray(d.providers) ? d.providers : []), ...on.keys()])].filter((p) => typeof p === 'string' && p);
      const ORDER = { channels: 0, ads: 1, data: 2 };
      out.connections = ids.map((p) => {
        const c = on.get(p); const info = providerInfo(p);
        return { provider: p, name: info.name, group: info.group, connected: !!c, label: c?.agentLabel ? clip(c.agentLabel, 80) : '', needsReconnect: !!(c && (c.scopeDrift?.status === 'missing' || /error|expired|invalid/i.test(String(c.status || '')))), connectUrl: tpl.replace('{provider}', encodeURIComponent(p)) };
      }).sort((a, b) => (ORDER[a.group] - ORDER[b.group]) || (Number(b.connected) - Number(a.connected)) || a.name.localeCompare(b.name));
      // The channels a post can be scheduled to right now: schedule_post's ids, from the connections that are on.
      // Google Business Profile is left out because schedule_post refuses it at enqueue (held back by Google).
      out.channels = [...new Set(out.connections.filter((c) => c.connected).flatMap((c) => CHANNELS_OF[c.provider] || []))].filter((id) => id !== 'google_business').map((id) => ({ id, label: CHANNEL_LABEL[id] }));
    }
  }
  if (reads.ads) {
    if (reads.ads.error) out.notes.ads = errText(reads.ads);
    else out.ads = (reads.ads.data?.platforms || []).filter((g) => g && ADS_PLATFORMS[g.platform]).map((g) => {
      const P = ADS_PLATFORMS[g.platform];
      const base = { platform: g.platform, label: P.label, accountId: g.account?.id || '', accountName: clip(g.account?.name || '', 60) };
      if (g.error) return { ...base, campaigns: [], note: errText(g) };
      const d = g.data || {};
      const acc = !g.account && typeof P.list.account === 'function' ? P.list.account(d) : null;
      const rows = (Array.isArray(P.list.rows(d)) ? P.list.rows(d) : []).map((c) => adRow(c, d.currency, P.list.window || '')).filter(Boolean).slice(0, 25);
      return { ...base, ...(acc ? { accountId: acc.id, accountName: clip(acc.name, 60) } : {}), campaigns: rows };
    });
  }
  if (reads.creators) {
    if (reads.creators.error) out.notes.creators = errText(reads.creators);
    else {
      const d = reads.creators.data || {};
      const mine = (d.creators || []).filter((c) => c && c.id != null).map((c) => ({ id: String(c.id), name: c.name || 'Creator', thumb: c.image ? picture(abs(c.image)) : '', preset: false }));
      const presets = (d.presets || []).filter((c) => c && c.id != null).slice(0, 8).map((c) => ({ id: String(c.id), name: c.name || 'Preset creator', thumb: c.image ? picture(abs(c.image)) : '', preset: true }));
      out.creators = [...mine, ...presets].slice(0, 24);
    }
  }
  if (reads.products) {
    if (reads.products.error) out.notes.products = errText(reads.products);
    else out.products = (reads.products.data?.photos || []).filter((p) => p && p.url).slice(0, 24).map((p) => ({ url: abs(p.url), label: clip(p.label || p.title || '', 60), thumb: picture(abs(p.url)) }));
  }
  if (reads.prefs) {
    if (reads.prefs.error) out.notes.prefs = errText(reads.prefs);
    else {
      const p = reads.prefs.data || {};
      out.prefs = { language: p.language || 'English', captions: p.captions === true, endCard: p.endCard === true, channels: (Array.isArray(p.channels) ? p.channels : []).filter((c) => ALL_CHANNELS.includes(c)) };
    }
  }
  if (reads.results) {
    out.results = (reads.results.items || []).map((x) => resultItem(x, { abs, picture, poster, own }));
  }
  if (!Object.keys(out.notes).length) delete out.notes;
  return out;
}
// ── WHAT A RENDER SAYS TO THE PERSON, ONE PLAIN LINE EACH (2026-10-04) ───────────────────────────────────────────────
// A render can come back with something the user has to hear: their saved product photo is a picture of a person and was
// left out as the product (`brandPhoto`, lib/brand-face-product.mjs, on render_ad and generate_image), the label was
// re-printed or still reads wrong (`labelPass`), or the product in the result is not theirs (`productCheck` on an image,
// `qa.productMismatch` on a video). The tool replies say these to an agent in its own register (tool names, capitals);
// the card shows each as one short sentence a person reads, built from the STRUCTURED fields, never fished out of prose.
// A label pass that only confirmed the label ('checked') or was switched off ('off') changed nothing and stays quiet.
// Any line that names a tool, a field or anything about paying is dropped rather than shown. Pure: the check RUNS it,
// and the app script only displays the strings this returns.
const NOTICE_SKIP = /\b(credits?|charged|price|pricing|buy|purchase|checkout|top[- ]?up|upgrade|billing)\b|\b[a-z]+_[a-z_]+\b/i;
const noticeLine = (t) => {
  let s = String(t ?? '').replace(/^[\s\u26a0\ufe0f!]+/u, '').replace(/\s*[\u2014\u2013]\s*/g, ', ').replace(/\s+/g, ' ').trim();
  if (!s || NOTICE_SKIP.test(s)) return '';
  if (!/[.!?]$/.test(s)) s += '.';
  return clip(s, 240);
};
const payloadOf = (j) => { const r = j && typeof j === 'object' ? j.result : null; return r && typeof r === 'object' && Object.prototype.hasOwnProperty.call(r, 'data') ? r.data : r; };
export function renderNotices(x) {
  const d = x && typeof x === 'object' ? x : {};
  const out = [];
  const count = (v) => (Array.isArray(v) ? v.length : 0);
  const bp = d.brandPhoto && typeof d.brandPhoto === 'object' ? d.brandPhoto : null;
  if (bp) {
    const left = count(bp.leftOut), unread = count(bp.unread);
    if (left === 1) out.push('Your saved product photo shows a person, so it was left out as the product. Add a photo of the product itself in Hermoso, and save the person as a creator to put them in your ads.');
    else if (left > 1) out.push(`${left} of your saved product photos show a person, so they were left out as the product. Add photos of the product itself in Hermoso, and save the person as a creator to put them in your ads.`);
    if (unread === 1) out.push('Your saved product photo could not be checked for a person, so it was used as is.');
    else if (unread > 1) out.push(`${unread} of your saved product photos could not be checked for a person, so they were used as is.`);
  }
  const lp = d.labelPass && typeof d.labelPass === 'object' ? d.labelPass : null;
  if (lp && (lp.status === 'fixed' || lp.status === 'left')) { const t = noticeLine(lp.note); if (t) out.push(t); }
  const pc = d.productCheck && typeof d.productCheck === 'object' ? d.productCheck : null;
  if (pc && pc.verdict === 'absent') out.push('Your product does not appear in this image.');
  else if (pc && pc.verdict === 'mismatch') { const why = noticeLine(Array.isArray(pc.issues) ? pc.issues[0] : '').replace(/\.$/, ''); out.push(`The product in this image does not match your product photo${why ? `: ${why.charAt(0).toLowerCase()}${why.slice(1)}` : ''}.`); }
  if (d.qa && typeof d.qa === 'object' && d.qa.productMismatch) out.push('The product in this video does not match your product photo.');
  return [...new Set(out)].slice(0, 4);
}
// The same lines for the model, so ChatGPT can explain what the card shows. '' when there is nothing to say.
export const noticesText = (lines, lead = 'The app shows the user this note about the render') => (Array.isArray(lines) && lines.length ? `${lead}: ${lines.join(' ')}` : '');

// One gallery item from a get_job read (`{id, data}` / `{id, error}`) or a plain URL (`{url}`).
function resultItem(x, { abs, picture, poster, own }) {
  if (x.url && !x.id) {
    const url = abs(x.url); const video = VIDEO_RE.test(url);
    return { id: '', status: 'done', progress: 100, url, kind: video ? 'video' : 'image', thumb: video ? poster(url) : picture(url), playable: video && own(url), label: '' };
  }
  if (x.error) return { id: x.id, status: 'error', progress: 0, url: '', kind: '', thumb: '', label: '', error: neutralNote(x.error) };
  const j = x.data || {};
  const notices = renderNotices({ ...(payloadOf(j) || {}), ...(j.brandPhoto ? { brandPhoto: j.brandPhoto } : {}) });
  const raw = j.url || j.result?.video || j.result?.image || (Array.isArray(j.result?.images) && j.result.images[0]) || '';
  const url = raw ? abs(raw) : '';
  const video = /video|stitch|avatar|clip|reframe|upscale|dub/i.test(String(j.type || '')) || VIDEO_RE.test(url);
  const status = String(j.status || 'queued');
  const pr = Number(j.progress) || 0;
  return {
    id: String(j.id || x.id), status, progress: status === 'done' ? 100 : Math.round(pr <= 1 ? pr * 100 : pr), url: status === 'done' ? url : '',
    kind: video ? 'video' : 'image', thumb: status === 'done' && url ? (video ? poster(url) : picture(url)) : '', playable: video && own(url), label: '',
    ...(status === 'error' || status === 'not_found' ? { error: neutralNote(j.error || (status === 'not_found' ? 'No render with this id on this account.' : 'The render failed.')) } : {}),
    ...(notices.length ? { notices } : {}),
  };
}
// The model's half: a short sentence. The grid itself is the app's; structuredContent carries the URLs.
export const libraryText = (p) => {
  const bits = [];
  if (p.brand?.name) bits.push(`Profile: ${p.brand.name}.`);
  if (Array.isArray(p.items)) bits.push(p.items.length ? `${p.items.length} Library asset${p.items.length === 1 ? '' : 's'}, newest first.` : 'The Library is empty.');
  if (Array.isArray(p.jobs)) { const live = p.jobs.filter((j) => j.status === 'queued' || j.status === 'running').length; bits.push(`${live} render${live === 1 ? '' : 's'} in progress.`); }
  if (Array.isArray(p.scheduled)) bits.push(`${p.scheduled.length} post${p.scheduled.length === 1 ? '' : 's'} scheduled.`);
  if (Array.isArray(p.connections)) bits.push(`${p.connections.filter((c) => c.connected).length} of ${p.connections.length} accounts connected.`);
  if (Array.isArray(p.ads)) bits.push(p.ads.length ? `${p.ads.reduce((n, g) => n + g.campaigns.length, 0)} ad campaigns across ${[...new Set(p.ads.map((g) => g.label))].join(', ')}.` : 'No ad platform is connected.');
  if ('profile' in p) bits.push(p.profile ? `Saved profile: ${p.profile.name}.` : 'No profile saved yet.');
  // One reason said once: signed out, all four sections fail with the same sentence.
  const notes = Object.entries(p.notes || {}); const reasons = [...new Set(notes.map(([, v]) => v))];
  if (notes.length && reasons.length === 1) bits.push(`${notes.map(([k]) => k).join(', ')} could not be read: ${reasons[0]}`);
  else for (const [k, v] of notes) bits.push(`${k} could not be read: ${v}`);
  const lead = { home: 'Hermoso home is open.', ads: 'Hermoso Ads is open: the campaigns on every connected ad platform, which the user can pause or turn on after confirming on screen.', create: 'The new-ad form is open; the user picks options and reviews them, then the form sends the brief to this chat.', setup: 'Hermoso setup is open (brand, then connections, then a first ad).' }[p.view] || 'The Hermoso Library is open.';
  return `${lead} ${bits.join(' ')} The user can pick an asset to add it to the chat; it then arrives as context carrying its exact URL.`;
};

// ── CONCEPTS ─────────────────────────────────────────────────────────────────────────────────────────────────────
// Whatever shape the concepts arrive in (plan_variations' {angle, hook_mechanic, headline, supporting, prompt}, a
// plan_ad creative, or a list the model wrote), the cards read the same six fields.
const humanize = (s) => String(s || '').replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
export function normalizeConcepts(list) {
  return (Array.isArray(list) ? list : []).filter((c) => c && typeof c === 'object').slice(0, 8).map((c) => ({
    title: clip(c.title || c.angle || c.name || c.concept || '', 80),
    hook: clip(c.hook || c.hook_label || (c.hook_mechanic ? humanize(c.hook_mechanic) : '') || '', 60),
    // the planner's own hook id (list_hooks), carried so Render it asks plan_ad for the same opening mechanic
    hookId: /^[a-z][a-z0-9_]{1,40}$/.test(String(c.hook_mechanic || c.hookId || '')) ? String(c.hook_mechanic || c.hookId) : '',
    headline: clip(c.headline || c.copy?.[0]?.headline || '', 140),
    line: clip(c.line || c.supporting || c.primary || c.copy?.[0]?.primary || '', 200),
    cta: clip(c.cta || c.copy?.[0]?.cta || '', 40),
    visual: clip(c.description || c.visual || c.brief || c.prompt || c.image_concept?.prompt || '', 320),
  })).filter((c) => c.title || c.headline || c.visual);
}
export const conceptsText = (p) => (p.concepts?.length
  ? `Showing ${p.concepts.length} ad concept${p.concepts.length === 1 ? '' : 's'} as cards. Nothing has been rendered. Wait for the user to pick one: when they confirm a pick on its card, the card itself renders that one concept on their Hermoso account and shows it in place, so do not render it again from the chat. Concepts: ${p.concepts.map((c, i) => `${i + 1}. ${c.title || c.headline}`).join('; ')}.`
  : `No concepts to show. ${p.note || ''}`.trim());

// ── SETTINGS (openai/settings) ───────────────────────────────────────────────────────────────────────────────────
export const SETTINGS_LANGUAGES = Object.freeze(['English', 'Spanish', 'French', 'German', 'Italian', 'Portuguese', 'Brazilian Portuguese', 'Dutch', 'Polish', 'Swedish', 'Danish', 'Norwegian', 'Finnish', 'Turkish', 'Russian', 'Ukrainian', 'Arabic', 'Hebrew', 'Hindi', 'Indonesian', 'Japanese', 'Korean', 'Chinese (Simplified)', 'Chinese (Traditional)', 'Thai', 'Vietnamese']);
// Pure: the settings page from what the existing tools answered. Brand names are the enum (an id like p_x7 means
// nothing to a person); two brands with one name get a suffix, and the same function resolves the label back.
export function settingsModel({ brands = [], language = 'English', prefs = {}, connectors = [] } = {}) {
  const seen = new Map(); const brandLabels = [];
  for (const b of brands) { const base = String(b.name || b.id); const n = (seen.get(base) || 0) + 1; seen.set(base, n); brandLabels.push({ id: String(b.id), label: n > 1 ? `${base} (${n})` : base, active: !!b.active }); }
  const active = brandLabels.find((b) => b.active) || brandLabels[0];
  const langs = SETTINGS_LANGUAGES.includes(language) || !language ? [...SETTINGS_LANGUAGES] : [language, ...SETTINGS_LANGUAGES];
  const channels = [...new Set(connectors.filter((c) => c && c.connected !== false).flatMap((c) => CHANNELS_OF[c.provider] || []))];
  const want = new Set(Array.isArray(prefs.channels) ? prefs.channels : []);
  const properties = {};
  const values = {};
  if (brandLabels.length) { properties.brand = { type: 'string', title: 'Profile', description: 'The profile Hermoso works on in ChatGPT. Everything below is saved per profile.', enum: brandLabels.map((b) => b.label) }; values.brand = active.label; }
  properties.language = { type: 'string', title: 'Language for new ads', description: 'The language ads, scripts and copy are written in. Applies everywhere you use Hermoso.', enum: langs }; values.language = language || 'English';
  properties.captions = { type: 'boolean', title: 'Captions on new videos', description: 'Burn subtitles of the spoken words into new video ads unless you say otherwise.' }; values.captions = prefs.captions === true;
  properties.endCard = { type: 'boolean', title: 'Brand end card on new videos', description: 'Add your brand end card to new video ads unless you say otherwise.' }; values.endCard = prefs.endCard === true;
  for (const ch of channels) { properties[`channel_${ch}`] = { type: 'boolean', title: `Post to ${CHANNEL_LABEL[ch]} by default`, description: `Suggest ${CHANNEL_LABEL[ch]} when you ask Hermoso to post or schedule.` }; values[`channel_${ch}`] = want.has(ch); }
  const layout = [
    { kind: 'group', title: 'Profile', items: [...(properties.brand ? [{ kind: 'property', property: 'brand' }] : []), { kind: 'tool', tool: EXT_SETUP_TOOL, title: 'Set up profile and accounts…', description: 'Read your website, then connect your channels and ad accounts.' }] },
    { kind: 'group', title: 'New ads', items: [{ kind: 'property', property: 'language' }, { kind: 'property', property: 'captions' }, { kind: 'property', property: 'endCard' }] },
  ];
  if (channels.length) layout.push({ kind: 'group', title: 'Posting', items: channels.map((ch) => ({ kind: 'property', property: `channel_${ch}` })) });
  return { schema: { type: 'object', properties }, values, layout, brandIdOf: (label) => (brandLabels.find((b) => b.label === label) || brandLabels.find((b) => b.id === label) || null)?.id || null };
}

// ── MENTIONS ─────────────────────────────────────────────────────────────────────────────────────────────────────
const assetId = (url) => createHash('sha1').update(String(url)).digest('hex').slice(0, 12);
// Every candidate the @-mention picker can offer, with the sentence the model reads when one is mentioned. Pure.
export function mentionCandidates(pool = {}, { abs = (u) => u } = {}) {
  const out = [];
  for (const b of pool.brands || []) if (b && b.id != null) out.push({ kind: 'brand', id: String(b.id), name: b.name || String(b.id), text: `Hermoso profile "${b.name || b.id}" (profile id ${b.id})${b.active ? ', the active profile' : ''}. To work on it, switch with use_brand("${b.id}").` });
  for (const c of pool.creators || []) if (c && c.id != null) out.push({ kind: 'creator', id: String(c.id), name: c.name || 'Creator', thumb: c.image ? abs(c.image) : '', text: `Saved Hermoso creator "${c.name || c.id}" (creator id ${c.id}). Cast them in an ad with render_ad creator "${c.id}".` });
  for (const a of pool.assets || []) if (a && a.url) { const url = abs(a.url); out.push({ kind: 'asset', id: assetId(url), name: `${a.kind === 'video' ? 'Video' : 'Image'}${a.model ? ' · ' + a.model : ''}${a.ageHours != null ? ' · ' + ageText(a.ageHours) : ''}`, thumb: VIDEO_RE.test(url) ? '' : url, text: `Hermoso Library ${a.kind || 'asset'}: ${url}${a.model ? ` (made with ${a.model})` : ''}. Use this exact URL to post, schedule, edit or reuse it.` }); }
  for (const ad of pool.ads || []) if (ad && ad.key) out.push({ kind: 'ad', id: String(ad.key), name: clip(`${ad.advertiser || 'Saved ad'}${ad.title ? ': ' + ad.title : ''}`, 80), thumb: ad.image ? abs(ad.image) : '', text: clip(`Saved swipefile ad from ${ad.advertiser || 'an advertiser'}${ad.platform ? ` on ${ad.platform}` : ''}: "${ad.title || ''}" ${ad.body || ''} Media: ${ad.video || ad.image || 'none'}.${ad.link ? ` Link: ${ad.link}.` : ''}`, 600) });
  for (const p of pool.posts || []) if (p && p.id) out.push({ kind: 'post', id: String(p.id), name: clip(`Scheduled ${p.at ? new Date(p.at).toUTCString().slice(0, 22) : ''} · ${(p.channels || []).join(', ')}`, 80), text: clip(`Scheduled post ${p.id}: ${p.status || 'queued'} at ${p.at || 'no time'} to ${(p.channels || []).join(', ') || 'no channel'}. Caption: ${p.message || ''}${p.mediaUrl ? ` Media: ${p.mediaUrl}.` : ''} Change it with reschedule_post or cancel_scheduled (id ${p.id}).`, 600) });
  return out;
}
export function mentionItems(cands, query = '', max = 20) {
  const q = String(query || '').trim().toLowerCase();
  const hit = q ? cands.filter((c) => c.name.toLowerCase().includes(q) || c.kind.includes(q)) : (() => { const per = {}; return cands.filter((c) => (per[c.kind] = (per[c.kind] || 0) + 1) <= 4); })();
  const LABEL = { brand: 'Profile', creator: 'Creator', asset: 'Library', ad: 'Swipefile ad', post: 'Scheduled post' };
  return hit.slice(0, max).map((c) => ({ type: 'resource_link', uri: `hermoso://${c.kind}/${encodeURIComponent(c.id)}`, name: c.name, title: `${LABEL[c.kind]}: ${c.name}`.slice(0, 100), description: c.text.slice(0, 300), mimeType: 'text/plain', ...(c.thumb && /^https:\/\//.test(c.thumb) ? { icons: [{ src: c.thumb }] } : {}) }));
}

// Which existing tool answers which section, and with what arguments. They are called IN-PROCESS through their own
// registered handlers (same auth, same workspace pin, same error ledger), never re-implemented here.
const SECTION_SOURCE = {
  library: ['list_library', { kind: 'all', limit: 24 }],
  jobs: ['list_jobs', {}],
  brands: ['list_brands', {}],
  calendar: ['list_scheduled', { upcoming: 40, fired: 6 }],
  brand: ['get_brand', {}],
  connectors: ['list_connectors', {}],
  creators: ['list_creators', { limit: 24 }],
  products: ['list_product_photos', {}],
};
const textOfResult = (r) => (r?.content || []).find((c) => c?.type === 'text')?.text || '';
async function callRead(call, tool, args, extra) {
  try {
    const r = await call(tool, args, extra);
    if (!r) return { error: 'This is not available on this connection.' };
    if (r.isError) return { error: textOfResult(r) || 'Could not load this right now.' };
    return { data: r.structuredContent || {} };
  } catch (e) { return { error: String(e?.message || e).slice(0, 240) }; }
}
async function readPrefs(prefs) {
  if (!prefs || typeof prefs.read !== 'function') return {};
  const v = await prefs.read();
  return v && typeof v === 'object' ? v : {};
}
async function readSections(sections, call, extra, deps = {}) {
  const reads = {};
  await Promise.all(sections.map(async (s) => {
    if (s === 'prefs') {
      const [st, pr] = await Promise.all([callRead(call, 'get_settings', {}, extra), readPrefs(deps.prefs).then((v) => ({ v }), (e) => ({ e }))]);
      if (st.error) reads.prefs = { error: st.error };
      else if (pr.e) reads.prefs = { error: String(pr.e?.message || pr.e) };
      else reads.prefs = { data: { language: st.data.language, ...pr.v } };
      return;
    }
    if (s === 'ads') { reads.ads = await readAds(call, extra); return; }
    const src = SECTION_SOURCE[s]; if (!src) return;
    reads[s] = await callRead(call, src[0], src[1], extra);
  }));
  return reads;
}
// The Ads section: which ad platforms are connected (list_connectors), then each one's shared accounts and campaigns
// through its own list tools. A platform that could not be read is a note on that platform, never "no campaigns".
const ADS_ACCOUNTS_MAX = 3;
async function readAds(call, extra) {
  const conn = await callRead(call, 'list_connectors', {}, extra);
  if (conn.error) return { error: conn.error };
  const on = new Set((conn.data?.connectors || []).filter((c) => c && c.provider && c.status !== 'revoked').map((c) => c.provider));
  const keys = Object.keys(ADS_PLATFORMS).filter((k) => on.has(ADS_PLATFORMS[k].provider));
  const groups = await Promise.all(keys.map(async (platform) => {
    const P = ADS_PLATFORMS[platform];
    let accounts = [null];
    if (P.accounts) {
      const a = await callRead(call, P.accounts.tool, P.accounts.args, extra);
      if (a.error) return [{ platform, account: null, error: a.error }];
      accounts = P.accounts.pick(a.data || {}).filter((x) => x.id).slice(0, ADS_ACCOUNTS_MAX);
      if (!accounts.length) return [{ platform, account: null, error: 'No ad account is shared with this profile yet. Pick one in Hermoso under Connections.' }];
    }
    return Promise.all(accounts.map(async (account) => {
      const r = await callRead(call, P.list.tool, P.list.args(account || {}), extra);
      return r.error ? { platform, account, error: r.error } : { platform, account, data: r.data };
    }));
  }));
  return { data: { platforms: groups.flat() } };
}
async function readResults(jobIds, urls, call, extra) {
  const items = await Promise.all(jobIds.map(async (id) => { const r = await callRead(call, 'get_job', { id }, extra); return r.error ? { id, error: r.error } : { id, data: r.data }; }));
  return { items: [...items, ...urls.map((url) => ({ url }))] };
}

// Every hint is explicit (OpenAI's review rule); the reasons live in tools/lib/chatgpt-tool-annotations.json.
const READ_ONLY_HINTS = Object.freeze({ readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false });
const appMeta = () => ({ ui: { resourceUri: LIBRARY_APP_URI } });
const APP_ONLY = Object.freeze({ ui: { visibility: ['app'] } });

export function libraryToolDefs() {
  const view = z.enum(['library', 'jobs', 'calendar']).optional().describe("which tab to open: 'library' (default), 'jobs' (renders in progress) or 'calendar' (scheduled posts)");
  const ext = z.string().max(80);
  return {
    [EXT_HOME_TOOL]: {
      title: 'Home',
      description: "Open Hermoso's home screen: a composer that sends the user's request to this chat (they can type @ to add a profile, saved creator, product photo or Library item), quick starts, and shortcuts to the Library, a new ad, Ad Spy, the posting calendar, connections and profile setup. Use it when the user wants to start something in Hermoso or look around. Read-only: it reads the active profile, its Library and renders in progress, and changes nothing.",
      inputSchema: {},
      annotations: { title: 'Home', ...READ_ONLY_HINTS },
      _meta: { ...appMeta(), 'openai/ui': { entrypoints: [{ type: 'global' }] } },
    },
    [EXT_ENTRY_TOOL]: {
      title: 'Library',
      description: "Open the Hermoso Library as an interactive panel: this profile's finished images and videos, renders in progress and scheduled posts. The user can pick an asset to add it to the chat, and move or cancel a scheduled post from the calendar after confirming. Use it when the user wants to SEE or choose from their creative or calendar; for a plain list of URLs use list_library. Opening it changes nothing.",
      inputSchema: { view },
      annotations: { title: 'Library', ...READ_ONLY_HINTS },
      _meta: { ...appMeta(), 'openai/ui': { entrypoints: [{ type: 'thread' }] } },
    },
    [EXT_DATA_TOOL]: {
      title: 'Hermoso panel data',
      description: "Refreshes the Hermoso panel's data (Library assets, renders, profiles, scheduled posts, the saved profile, connected accounts, saved creators, product photos, defaults, render status for a gallery, one scheduled post in full). Called by the panel itself, never by the model. Read-only.",
      inputSchema: {
        view: z.enum([...EXT_VIEWS]).optional().describe('which screen is asking'),
        sections: z.array(z.enum([...EXT_SECTIONS])).optional().describe('which parts to read (default: none beyond jobIds / postId)'),
        jobIds: z.array(ext).max(12).optional().describe('render job ids to read the status of'),
        postId: ext.optional().describe('one scheduled post to read in full'),
      },
      annotations: { title: 'Hermoso panel data', ...READ_ONLY_HINTS },
      _meta: { ...APP_ONLY },
    },
    [EXT_CONCEPTS_TOOL]: {
      title: 'Ad concepts',
      description: "Show ad concepts as cards so the user picks which ONE to render before anything is rendered. Pass the concepts you already have (from plan_ad, or ones you wrote: a title, hook, headline and what it shows), or leave out `concepts` and this comes up with `count` distinct concepts for `product` itself, which spends a few credits like any planning call. Showing the cards renders nothing: each card has a Render button that asks the user to confirm the format, size and length, and only then renders that one concept on their account and shows it in place (do not render it again from the chat), plus a More ideas button. Use it when the user asks for an ad and has not settled on one idea, wants options, or wants to choose before rendering.",
      inputSchema: {
        product: z.string().max(600).describe("what the ad is for: the product, offer or brief in the user's words"),
        concepts: z.array(z.object({
          title: z.string().max(120).optional().describe('the angle in a few words'),
          hook: z.string().max(80).optional().describe('the opening hook'),
          headline: z.string().max(200).optional().describe('the headline'),
          description: z.string().max(600).optional().describe('what the ad shows'),
        })).max(8).optional().describe('concepts you already planned; omit to have Hermoso come up with them'),
        count: z.number().int().min(2).max(8).optional().describe('how many concepts to come up with when `concepts` is omitted (default 4)'),
        format: z.enum(['image', 'video']).optional().describe('the format the user asked for, if they said; they can change it on the card'),
        aspectRatio: z.enum(['9:16', '1:1', '4:5', '16:9']).optional().describe('the size the user asked for, if they said'),
        durationSeconds: z.number().int().min(4).max(180).optional().describe('video length the user asked for, if they said'),
        productImage: z.string().max(600).optional().describe('a product photo URL the user picked, carried into the render request'),
        creator: z.string().max(120).optional().describe('a saved creator id or name the user picked, carried into the render request'),
        reference: z.string().max(600).optional().describe('a reference image or ad URL the user picked, carried into the render request'),
        language: z.string().max(40).optional().describe('language for the concepts (default: the account language)'),
      },
      annotations: { title: 'Ad concepts', readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
      _meta: appMeta(),
    },
    [EXT_RESULTS_TOOL]: {
      title: 'Ad results',
      description: "Show a batch of ads the user already asked for as a gallery: pass the job ids the renders returned (render_ad, generate_image, generate_video, multiply_ad and the like) and/or finished media URLs. Renders still in progress update in place. The user can add any item to the chat, hand it back with a request to post it, or schedule it to their connected channels from the gallery after confirming on screen. Opening it is read-only: it starts no render and posts nothing.",
      inputSchema: {
        jobIds: z.array(ext).max(12).optional().describe('render job ids'),
        urls: z.array(z.string().max(1000)).max(12).optional().describe('finished image or video URLs'),
        title: z.string().max(80).optional().describe('a short title for the gallery'),
      },
      annotations: { title: 'Ad results', ...READ_ONLY_HINTS },
      _meta: appMeta(),
    },
    [EXT_BRIEF_TOOL]: {
      title: 'New ad',
      description: "Open a form where the user sets up an ad by picking options: what it is for, image or video, size, length, a saved product photo, a saved creator and a Library item as reference, and how many concepts. After the user reviews it, the form sends the brief to this chat and asks for concepts first. Opening it renders nothing and spends nothing. Use it when the user wants to make an ad by choosing options rather than describing everything.",
      inputSchema: {
        format: z.enum(['image', 'video']).optional().describe('preselect image or video'),
        product: z.string().max(600).optional().describe('prefill what the ad is for'),
      },
      annotations: { title: 'New ad', ...READ_ONLY_HINTS },
      _meta: appMeta(),
    },
    [EXT_SETUP_TOOL]: {
      title: 'Set up Hermoso',
      description: "Open the setup flow: check or draft the profile from a website or a description, see every social channel and ad platform with whether it is connected and open its sign-in page in the browser, then start a first ad. Opening it changes nothing; drafting the profile and connecting accounts happen only when the user clicks them. Use it when the user wants to set up Hermoso, onboard a brand or creator, or connect accounts.",
      inputSchema: { step: z.enum(['brand', 'connections']).optional().describe("start at 'brand' (default) or 'connections'") },
      annotations: { title: 'Set up Hermoso', ...READ_ONLY_HINTS },
      _meta: appMeta(),
    },
    [EXT_SETTINGS_READ_TOOL]: {
      title: 'Hermoso settings',
      description: "Read Hermoso's settings: which profile Hermoso works on, the language ads are written in, whether new videos get captions and a brand end card by default, and which connected channels new posts go to by default. Read-only.",
      inputSchema: {},
      outputSchema: {
        schema: z.object({ type: z.literal('object'), properties: z.record(z.string(), z.any()), required: z.array(z.string()).optional() }).describe('the settings and their types'),
        values: z.record(z.string(), z.any()).describe('the current value of every setting'),
        layout: z.array(z.any()).optional().describe('how the settings are grouped'),
      },
      annotations: { title: 'Hermoso settings', ...READ_ONLY_HINTS },
    },
    [EXT_SETTINGS_UPDATE_TOOL]: {
      title: 'Change Hermoso settings',
      description: "Change Hermoso's settings. `set` holds only what changes, keyed as read_hermoso_settings names them: brand (a profile name from its list; switches the profile every Hermoso tool works on), language (applies to every ad from now on), captions and endCard (true or false, the defaults for new videos on this profile), and channel_<channel> (true or false) for each connected channel. Overwrites the values it is given.",
      inputSchema: { set: z.record(z.string().max(60), z.union([z.string().max(80), z.number(), z.boolean()])).describe('the settings to change, and their new values') },
      outputSchema: { values: z.record(z.string(), z.any()).describe('every setting after the change') },
      annotations: { title: 'Change Hermoso settings', readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    },
    [EXT_MENTIONS_TOOL]: {
      title: 'Find Hermoso items',
      description: 'Typeahead for @-mentions in the ChatGPT composer: finds profiles, saved creators, Library images and videos, saved swipefile ads and scheduled posts by name. Called by ChatGPT, never by the model. Read-only.',
      inputSchema: { query: z.string().max(80).describe('what the user typed after @, may be empty') },
      annotations: { title: 'Find Hermoso items', ...READ_ONLY_HINTS },
      _meta: { 'openai/extensions': { 'mentions/search': {} }, ...APP_ONLY },
    },
    [EXT_RESCHEDULE_TOOL]: {
      title: 'Move a scheduled post',
      description: 'Moves one queued post to a new time, from the Calendar after the user confirmed the new time on screen. App-only. Same rules as reschedule_post: only a post that is still queued can move, and the new time must be in the future.',
      inputSchema: { id: ext.describe('the scheduled post id'), at: z.string().max(40).describe('the new time, ISO 8601') },
      annotations: { title: 'Move a scheduled post', readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
      _meta: { ...APP_ONLY },
    },
    [EXT_CANCEL_TOOL]: {
      title: 'Cancel a scheduled post',
      description: 'Cancels one queued post so it is never published, from the Calendar after the user confirmed on screen. App-only. It cannot be undone, and a post that already went out cannot be unsent.',
      inputSchema: { id: ext.describe('the scheduled post id') },
      annotations: { title: 'Cancel a scheduled post', readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
      _meta: { ...APP_ONLY },
    },
    [EXT_DRAFT_TOOL]: {
      title: 'Draft the profile in setup',
      description: 'Drafts the profile from a website or a description during setup, after the user asked for it on screen. App-only. It saves the draft onto the active profile when none is saved, and replaces a saved profile only when the user confirmed a replace. Free.',
      inputSchema: {
        domain: z.string().max(200).optional().describe('the brand website'),
        description: z.string().max(2000).optional().describe('a description of the brand, when there is no website'),
        replace: z.boolean().optional().describe('replace the saved profile (the user confirmed)'),
      },
      annotations: { title: 'Draft the profile in setup', readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
      _meta: { ...APP_ONLY },
    },
    [EXT_RENDER_TOOL]: {
      title: 'Render the picked concept',
      description: "Renders the ONE ad concept the user picked on a concept card, after they confirmed the format, size and length on screen. App-only. It writes the full ad for that concept with plan_ad, then starts the render (render_ad for a video, generate_image for an image) and returns the render's job id at once; the card shows its progress. Spends credits on the user's Hermoso account like any render.",
      inputSchema: {
        product: z.string().max(600).optional().describe('what the ad is for, as the concept card holds it'),
        concept: z.object({
          title: z.string().max(120).optional(), hook: z.string().max(80).optional(), hookId: z.string().max(60).optional(),
          headline: z.string().max(200).optional(), line: z.string().max(300).optional(), visual: z.string().max(600).optional(),
        }).describe('the concept the user picked'),
        format: z.enum(['image', 'video']).describe('the format the user confirmed'),
        aspectRatio: z.enum(['9:16', '1:1', '4:5', '16:9']).describe('the size the user confirmed'),
        durationSeconds: z.number().int().min(4).max(180).optional().describe('video length the user confirmed'),
        productImage: z.string().max(600).optional().describe('the product photo URL the user picked'),
        creator: z.string().max(120).optional().describe('the saved creator id or name the user picked (video)'),
        reference: z.string().max(600).optional().describe('the reference URL the user picked'),
        captions: z.boolean().optional().describe('burn captions into a video (default off)'),
        endCard: z.boolean().optional().describe('add the brand end card to a video (default off)'),
      },
      annotations: { title: 'Render the picked concept', readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
      _meta: { ...APP_ONLY },
    },
    [EXT_SCHEDULE_TOOL]: {
      title: 'Schedule a post from the app',
      description: 'Schedules one finished image or video to the connected channels the user picked, at the time they picked, after they confirmed on screen. App-only. Same rules as schedule_post (per-channel limits, media kinds, a future time); its refusal comes back word for word. The post appears in the Calendar, where it can be moved or cancelled.',
      inputSchema: {
        channels: z.array(z.enum([...ALL_CHANNELS])).min(1).max(11).describe('the channels to post to'),
        at: z.string().max(40).describe('when to post, ISO 8601, in the future'),
        message: z.string().max(5000).optional().describe('the caption'),
        imageUrl: z.string().max(1000).optional().describe('the finished image (a Hermoso URL)'),
        videoUrl: z.string().max(1000).optional().describe('the finished video (a Hermoso URL)'),
      },
      annotations: { title: 'Schedule a post from the app', readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
      _meta: { ...APP_ONLY },
    },
    [EXT_ADS_STATUS_TOOL]: {
      title: 'Pause or turn on a campaign',
      description: 'Pauses an ad campaign, or turns one on, from the Ads view after the user confirmed that exact change on screen (turning one on starts spending on that platform). App-only. Runs the platform\'s own status tool (set_meta_campaign_status, set_google_ads_status and so on) and answers with what the platform stored.',
      inputSchema: {
        platform: z.enum(Object.keys(ADS_PLATFORMS)).describe('the ad platform'),
        accountId: z.string().max(80).optional().describe('the ad account the campaign is on'),
        campaignId: z.string().max(80).describe('the campaign id'),
        status: z.enum(['active', 'paused']).describe("'paused' stops it; 'active' turns it on and starts spending"),
      },
      annotations: { title: 'Pause or turn on a campaign', readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
      _meta: { ...APP_ONLY },
    },
  };
}

// Registers the app resource, the mention resources, the settings capability and every extension tool. `deps`:
// resourceMeta(description, origins) and origins (the widget CSP builder and allowlist tools.mjs already uses),
// proxyBase (our /api/img), abs (absolute asset URLs), call(name, args, extra), which runs an EXISTING tool's handler
// for this session, and prefs {read, write} for the per-brand defaults this app adds.
export function registerLibraryApp(server, deps) {
  const { resourceMeta, origins = [], proxyBase = '', abs = (u) => u, call = async () => null, prefs = null } = deps || {};
  const meta = libraryResourceMeta(resourceMeta, origins);
  const description = meta['openai/widgetDescription'];
  server.registerResource('hermoso-library-app', LIBRARY_APP_URI, { description, mimeType: LIBRARY_APP_MIME, _meta: meta },
    async () => ({ contents: [{ uri: LIBRARY_APP_URI, mimeType: LIBRARY_APP_MIME, text: LIBRARY_APP_HTML, _meta: meta }] }));
  // Any earlier build's hash resolves to the current app (unlisted), the lesson the three cards learned on 2026-08-24.
  server.registerResource('hermoso-library-app-any-hash', new ResourceTemplate(LIBRARY_ANY_HASH, { list: undefined }),
    { description, mimeType: LIBRARY_APP_MIME, _meta: meta },
    async (uri) => ({ contents: [{ uri: String(uri), mimeType: LIBRARY_APP_MIME, text: LIBRARY_APP_HTML, _meta: meta }] }));

  // THE SETTINGS CAPABILITY. On the initialize revisions we speak (2025-11-25), the spec reads it from `extensions` or
  // the legacy `experimental`; both are declared. Before connect, and only here, so a flag-off server is unchanged.
  try {
    const low = server.server;
    if (low && typeof low.registerCapabilities === 'function') low.registerCapabilities({ experimental: { 'openai/settings': { ...EXT_SETTINGS_CAPABILITY } }, extensions: { 'openai/settings': { ...EXT_SETTINGS_CAPABILITY } } });
  } catch {}

  const payloadOpts = { origins, proxyBase, abs };
  const picture = (u) => { try { return origins.includes(new URL(u).origin) ? u : (proxyBase ? proxyBase + encodeURIComponent(u) : ''); } catch { return ''; } };
  const defs = libraryToolDefs();
  const answer = async (args, extra, sections, view, more = {}) => {
    const reads = await readSections(sections, call, extra, { prefs });
    const payload = { ...libraryPayload(reads, { view, ...payloadOpts }), surface: more.surface || 'panel', ...(more.payload || {}) };
    return { content: [{ type: 'text', text: libraryText(payload) }], structuredContent: payload };
  };
  const fail = (text) => ({ content: [{ type: 'text', text }], isError: true });
  const handles = {};
  const reg = (name, fn) => { handles[name] = server.registerTool(name, defs[name], fn); };

  reg(EXT_HOME_TOOL, async (args, extra) => answer(args, extra, ['brand', 'brands', 'library', 'jobs', 'prefs'], 'home'));
  reg(EXT_ENTRY_TOOL, async (args, extra) => answer(args, extra, ['library', 'jobs', 'brands', 'calendar'], PANEL_VIEWS.includes(args?.view) ? args.view : 'library'));
  reg(EXT_BRIEF_TOOL, async (args, extra) => answer(args, extra, ['brand', 'brands', 'library', 'creators', 'products', 'prefs'], 'create', { surface: 'card', payload: { brief: { format: args?.format === 'video' ? 'video' : args?.format === 'image' ? 'image' : '', product: clip(args?.product, 600) } } }));
  reg(EXT_SETUP_TOOL, async (args, extra) => answer(args, extra, ['brand', 'brands', 'connectors'], 'setup', { surface: 'card', payload: { step: args?.step === 'connections' ? 'connections' : 'brand' } }));

  reg(EXT_DATA_TOOL, async (args, extra) => {
    const asked = Array.isArray(args?.sections) ? [...new Set(args.sections)].filter((s) => EXT_SECTIONS.includes(s)) : [];
    const jobIds = (Array.isArray(args?.jobIds) ? args.jobIds : []).map(String).slice(0, 12);
    const reads = await readSections(asked, call, extra, { prefs });
    if (jobIds.length) reads.results = await readResults(jobIds, [], call, extra);
    if (args?.postId) reads.post = await callRead(call, 'list_scheduled', { id: String(args.postId) }, extra);
    const v = EXT_VIEWS.includes(args?.view) ? args.view : 'library';
    const payload = libraryPayload(reads, { view: v, ...payloadOpts });
    return { content: [{ type: 'text', text: libraryText(payload) }], structuredContent: payload };
  });

  reg(EXT_CONCEPTS_TOOL, async (args, extra) => {
    const product = clip(args?.product, 600);
    let concepts = normalizeConcepts(args?.concepts);
    let note = '';
    if (!concepts.length) {
      if (!product) return fail('Pass `product` (what the ad is for), or the `concepts` you already have.');
      const n = Math.max(2, Math.min(8, Math.round(+args?.count || 4)));
      const r = await callRead(call, 'plan_variations', { product, count: n, ...(args?.language ? { language: String(args.language) } : {}) }, extra);
      if (r.error) note = neutralNote(r.error);
      else { concepts = normalizeConcepts(r.data?.variants || r.data?.angles || []); if (!concepts.length) note = 'No concepts came back. Try again with a little more about the product.'; }
    }
    const reads = await readSections(['prefs', 'brands'], call, extra, { prefs });
    const base = libraryPayload(reads, { view: 'concepts', ...payloadOpts });
    const safeUrl = (u) => (/^https:\/\//.test(String(u || '')) ? String(u).slice(0, 600) : '');
    const payload = {
      ...base, surface: 'card', product, concepts,
      format: args?.format === 'video' ? 'video' : args?.format === 'image' ? 'image' : '',
      aspectRatio: args?.aspectRatio || '', durationSeconds: Number.isFinite(+args?.durationSeconds) ? Math.round(+args.durationSeconds) : 0,
      productImage: safeUrl(args?.productImage), creator: clip(args?.creator, 120), reference: safeUrl(args?.reference),
      ...(note ? { note } : {}),
    };
    return { content: [{ type: 'text', text: conceptsText(payload) }], structuredContent: payload };
  });

  reg(EXT_RESULTS_TOOL, async (args, extra) => {
    const jobIds = [...new Set((Array.isArray(args?.jobIds) ? args.jobIds : []).map(String).filter(Boolean))].slice(0, 12);
    const urls = [...new Set((Array.isArray(args?.urls) ? args.urls : []).map(String).filter((u) => /^https?:\/\/|^\/generated\//.test(u)))].slice(0, 12);
    if (!jobIds.length && !urls.length) return fail('Pass `jobIds` (from the renders) or `urls` (finished media) to show.');
    const reads = await readSections(['prefs'], call, extra, { prefs });
    reads.results = await readResults(jobIds, urls, call, extra);
    const payload = { ...libraryPayload(reads, { view: 'results', ...payloadOpts }), surface: 'card', title: clip(args?.title, 80) };
    const done = payload.results.filter((r) => r.status === 'done').length;
    const live = payload.results.filter((r) => r.status === 'queued' || r.status === 'running').length;
    const said = payload.results.filter((r) => r.notices?.length).map((r) => noticesText(r.notices, `The app shows the user this note about ${r.id ? `job ${r.id}` : 'one of them'}`));
    return { content: [{ type: 'text', text: `Showing ${payload.results.length} ad${payload.results.length === 1 ? '' : 's'} as a gallery: ${done} ready, ${live} still rendering (they update in place). The user can add one to the chat or ask to post or schedule it. Nothing new was rendered.${said.length ? ` ${said.join(' ')}` : ''}` }], structuredContent: payload };
  });

  // ── settings ──
  const settingsState = async (extra) => {
    const [brandsR, settingsR, connR] = await Promise.all([callRead(call, 'list_brands', {}, extra), callRead(call, 'get_settings', {}, extra), callRead(call, 'list_connectors', {}, extra)]);
    if (settingsR.error) throw new Error(neutralNote(settingsR.error));
    const pr = await readPrefs(prefs).catch(() => ({}));
    const brands = brandsR.error ? [] : (brandsR.data?.brands || []).filter((b) => b && b.id != null);
    const conns = connR.error ? [] : libraryPayload({ connectors: connR }, payloadOpts).connections || [];
    return { model: settingsModel({ brands, language: settingsR.data?.language || 'English', prefs: pr, connectors: conns }), prefs: pr };
  };
  reg(EXT_SETTINGS_READ_TOOL, async (args, extra) => {
    try {
      const { model } = await settingsState(extra);
      const { brandIdOf, ...sc } = model;
      return { content: [{ type: 'text', text: `Hermoso settings: ${Object.entries(sc.values).map(([k, v]) => `${k} ${v}`).join(', ')}.` }], structuredContent: sc };
    } catch (e) { return fail(`Could not read the settings: ${String(e?.message || e)}`); }
  });
  reg(EXT_SETTINGS_UPDATE_TOOL, async (args, extra) => {
    const set = args?.set && typeof args.set === 'object' ? args.set : {};
    if (!Object.keys(set).length) return fail('Pass at least one setting in `set`.');
    const errs = [];
    try {
      let st = await settingsState(extra);
      if ('brand' in set) {
        const id = st.model.brandIdOf(String(set.brand));
        if (!id) errs.push(`No profile called "${set.brand}".`);
        else { const r = await callRead(call, 'use_brand', { brand: id }, extra); if (r.error) errs.push(neutralNote(r.error)); else st = await settingsState(extra); }
      }
      if ('language' in set) {
        const lang = String(set.language || '').trim();
        if (!lang) errs.push('language cannot be empty.');
        else { const r = await callRead(call, 'update_settings', { language: lang }, extra); if (r.error) errs.push(neutralNote(r.error)); }
      }
      const next = { ...st.prefs }; let touched = false;
      for (const [k, v] of Object.entries(set)) {
        if (k === 'brand' || k === 'language') continue;
        if (k === 'captions' || k === 'endCard') { next[k] = v === true || v === 'true'; touched = true; continue; }
        const m = /^channel_([a-z_]+)$/.exec(k);
        if (m && ALL_CHANNELS.includes(m[1])) { const cur = new Set(Array.isArray(next.channels) ? next.channels : []); if (v === true || v === 'true') cur.add(m[1]); else cur.delete(m[1]); next.channels = [...cur].filter((c) => ALL_CHANNELS.includes(c)); touched = true; continue; }
        errs.push(`Unknown setting "${k}".`);
      }
      if (touched) {
        if (!prefs || typeof prefs.write !== 'function') errs.push('These defaults cannot be saved on this connection.');
        else { try { await prefs.write({ ...next, updatedAt: Date.now() }); } catch (e) { errs.push(`Could not save: ${neutralNote(e?.message || e)}`); } }
      }
      const after = await settingsState(extra);
      if (errs.length) return fail(`Some settings were not changed: ${errs.join(' ')}`);
      return { content: [{ type: 'text', text: `Settings saved: ${Object.keys(set).join(', ')}.` }], structuredContent: { values: after.model.values } };
    } catch (e) { return fail(`Could not change the settings: ${String(e?.message || e)}`); }
  });

  // ── mentions: a short per-session cache, so a typeahead does not re-read five lists on every keystroke ──
  let poolCache = null;
  const mentionPoolRead = async (extra) => {
    if (poolCache && poolCache.exp > Date.now()) return poolCache.v;
    const [brands, creators, library, swipe, cal] = await Promise.all([
      callRead(call, 'list_brands', {}, extra), callRead(call, 'list_creators', { limit: 24 }, extra), callRead(call, 'list_library', { kind: 'all', limit: 40 }, extra),
      callRead(call, 'list_swipefile', { limit: 60 }, extra), callRead(call, 'list_scheduled', { upcoming: 25, fired: 0 }, extra),
    ]);
    const firstErr = [brands, creators, library, swipe, cal].find((r) => r.error);
    if ([brands, creators, library, swipe, cal].every((r) => r.error)) throw new Error(neutralNote(firstErr.error));
    const v = mentionCandidates({ brands: brands.data?.brands, creators: creators.data?.creators, assets: library.data?.assets, ads: swipe.data?.ads, posts: cal.data?.scheduled }, { abs });
    poolCache = { v, exp: Date.now() + 30_000 };
    return v;
  };
  reg(EXT_MENTIONS_TOOL, async (args, extra) => {
    try {
      const items = mentionItems(await mentionPoolRead(extra), args?.query).map((it) => (it.icons ? { ...it, icons: it.icons.map((i) => ({ src: picture(i.src) })).filter((i) => i.src) } : it));
      return { content: [{ type: 'text', text: `${items.length} match${items.length === 1 ? '' : 'es'}.` }], structuredContent: { items } };
    } catch (e) { return fail(`Could not search: ${String(e?.message || e)}`); }
  });
  // What the model reads when the user mentions one: the same sentence the picker carried, fresh.
  server.registerResource('hermoso-mentions', new ResourceTemplate(MENTION_URI_TEMPLATE, { list: undefined }),
    { description: 'A Hermoso item the user @-mentioned: a profile, saved creator, Library asset, swipefile ad or scheduled post.', mimeType: 'text/plain' },
    async (uri, vars, extra) => {
      const kind = String(vars?.kind || ''); const id = decodeURIComponent(String(vars?.id || ''));
      poolCache = null;
      let text = `No Hermoso ${kind} with id ${id} on this account.`;
      try { const hit = (await mentionPoolRead(extra)).find((c) => c.kind === kind && c.id === id); if (hit) text = hit.text; } catch (e) { text = `Could not read it: ${String(e?.message || e)}`; }
      return { contents: [{ uri: String(uri), mimeType: 'text/plain', text }] };
    });

  // ── the three writes the app makes itself, each after a confirm on screen, each through the existing tool ──
  reg(EXT_RESCHEDULE_TOOL, async (args, extra) => {
    const t = Date.parse(String(args?.at || ''));
    if (!Number.isFinite(t)) return fail('`at` must be an ISO time, like 2026-10-09T09:00:00Z.');
    if (t < Date.now() + 30_000) return fail('Pick a time in the future.');
    const r = await call(EXT_DELEGATES[EXT_RESCHEDULE_TOOL], { id: String(args.id), at: new Date(t).toISOString() }, extra);
    return r || fail('Moving posts is not available on this connection.');
  });
  reg(EXT_CANCEL_TOOL, async (args, extra) => {
    const r = await call(EXT_DELEGATES[EXT_CANCEL_TOOL], { id: String(args?.id || '') }, extra);
    return r || fail('Cancelling posts is not available on this connection.');
  });
  reg(EXT_DRAFT_TOOL, async (args, extra) => {
    const domain = String(args?.domain || '').trim(); const description = String(args?.description || '').trim();
    if (!domain && !description) return fail('Pass a website (`domain`) or a `description`.');
    const r = await call(EXT_DELEGATES[EXT_DRAFT_TOOL], { ...(domain ? { domain } : { description }), ...(args?.replace === true ? { save: true } : {}) }, extra);
    if (!r) return fail('Drafting a profile is not available on this connection.');
    if (r.isError) return { ...r, content: [{ type: 'text', text: neutralNote(textOfResult(r)) }] };
    const p = r.structuredContent || {};
    const saved = /Saved as the workspace brand/i.test(textOfResult(r));
    return { content: [{ type: 'text', text: textOfResult(r) }], structuredContent: { saved, brand: { name: p.name || '', domain: p.domain || '', category: p.category || '', summary: clip(p.summary, 240), logo: p.logo ? picture(abs(p.logo)) : '' } } };
  });

  // ── RENDER IT: the concept the user picked, at the format they confirmed, through plan_ad then render_ad /
  // generate_image. `noWait` asks the render tool for its job handle the moment the job is queued (the same `waitMs:0`
  // the /v1 `?wait=0` path uses), so the card gets a job id fast and polls it; the job itself goes through the
  // ordinary queue (spend gate, balance check, reserve and settle) exactly as a render the model starts.
  reg(EXT_RENDER_TOOL, async (args, extra) => {
    const c = args?.concept && typeof args.concept === 'object' ? args.concept : {};
    const format = args?.format === 'video' ? 'video' : 'image';
    const product = clip(args?.product, 600);
    if (!c.title && !c.headline && !c.visual) return fail('Pass the `concept` the user picked.');
    const reference = /^https:\/\//.test(String(args?.reference || '')) ? String(args.reference) : '';
    const watchable = /\.(mp4|webm|mov|m4v)([?#]|$)|facebook\.com\/ads\/library|linkedin\.com\/ad-library|adstransparency\.google|tiktok\.com\/|instagram\.com\/(reel|p)\/|youtube\.com\/|youtu\.be\/|(^|\/\/)(www\.)?(x|twitter)\.com\//i.test(reference);
    const brief = [product || 'my brand', 'Make exactly this concept, which the user picked:',
      c.title && `Angle: ${clip(c.title, 120)}`, c.hook && `Hook: ${clip(c.hook, 80)}`, c.headline && `Headline: ${clip(c.headline, 200)}`,
      c.line && `Supporting line: ${clip(c.line, 300)}`, c.visual && `What it shows: ${clip(c.visual, 600)}`,
      reference && !watchable && `Reference the user picked: ${reference}`].filter(Boolean).join('\n');
    const len = Number.isFinite(+args?.durationSeconds) && +args.durationSeconds > 0 ? Math.round(+args.durationSeconds) : 0;
    const [planTool, renderTool, imageTool] = EXT_DELEGATES[EXT_RENDER_TOOL];
    const plan = await call(planTool, { product: brief, format, ...(format === 'video' && len ? { durationSeconds: len } : {}), ...(c.hookId ? { hook: String(c.hookId) } : {}), ...(watchable ? { reference } : {}) }, extra);
    if (!plan) return fail('Rendering is not available on this connection.');
    if (plan.isError) return fail(friendly(textOfResult(plan)));
    const creative = plan.structuredContent || {};
    const productImage = /^https:\/\//.test(String(args?.productImage || '')) ? String(args.productImage) : '';
    let r;
    if (format === 'video') {
      if (!creative.video_storyboard) return fail('The concept came back without a video script, so nothing was rendered. Try again, or ask in the chat.');
      // The product photo the user picked becomes the packshot the render binds (the brand embedded in the plan).
      const cr = productImage && creative.brand && typeof creative.brand === 'object' && creative.brand.name ? { ...creative, brand: { ...creative.brand, product: productImage, productImages: [productImage] } } : creative;
      r = await call(renderTool, { creative: cr, aspectRatio: args.aspectRatio, ...(len ? { durationSeconds: len } : {}), ...(args?.creator ? { creator: String(args.creator) } : {}), captions: args?.captions === true, endCard: args?.endCard === true }, extra, { noWait: true });
    } else {
      const prompt = creative.image_concept?.prompt;
      if (!prompt) return fail('The concept came back without an image to make, so nothing was rendered. Try again, or ask in the chat.');
      r = await call(imageTool, { prompt: String(prompt), aspectRatio: args.aspectRatio, ...(productImage ? { refImages: [productImage] } : {}) }, extra, { noWait: true });
    }
    if (!r) return fail('Rendering is not available on this connection.');
    if (r.isError) return fail(friendly(textOfResult(r)));
    const sc = r.structuredContent || {};
    if (sc.needsProductPhoto) return fail('Nothing was rendered: Hermoso has no photo of this product yet, so the packaging would be made up. Add a product photo in Hermoso, or ask in the chat to go ahead without one.');
    const jobId = String(sc.jobId || '');
    const url = sc.url || sc.image || '';
    if (!jobId && !url) return fail(friendly(textOfResult(r)) || 'The render did not start. Try again, or ask in the chat.');
    // What the render says to the person (a person's photo left out as the product, a label or product finding) rides
    // the reply: the card shows it under the render, and the text tells the model the same thing.
    const notices = renderNotices(sc);
    return { content: [{ type: 'text', text: `Rendering the picked concept (${format}, ${args.aspectRatio}${format === 'video' && len ? `, ${len}s` : ''})${jobId ? ` as job ${jobId}` : ''}. It shows in the app when it is done.${notices.length ? ` ${noticesText(notices)}` : ''}` }], structuredContent: { jobId, format, status: url ? 'done' : 'queued', ...(url ? { url: abs(String(url)) } : {}), ...(notices.length ? { notices } : {}) } };
  });

  // ── SCHEDULE: one finished result to the channels the user picked, through schedule_post ──
  reg(EXT_SCHEDULE_TOOL, async (args, extra) => {
    const channels = [...new Set((Array.isArray(args?.channels) ? args.channels : []).filter((c) => ALL_CHANNELS.includes(c)))];
    if (!channels.length) return fail('Pick at least one channel.');
    const t = Date.parse(String(args?.at || ''));
    if (!Number.isFinite(t)) return fail('`at` must be an ISO time, like 2026-10-09T09:00:00Z.');
    if (t < Date.now() + 60_000) return fail('Pick a time in the future.');
    const media = (u) => (/^https:\/\/|^\/generated\//.test(String(u || '')) ? String(u) : '');
    const imageUrl = media(args?.imageUrl), videoUrl = media(args?.videoUrl);
    if (!imageUrl && !videoUrl) return fail('Pass the finished image or video to post.');
    const r = await call(EXT_DELEGATES[EXT_SCHEDULE_TOOL], { channels, at: new Date(t).toISOString(), ...(args?.message ? { message: String(args.message) } : {}), ...(videoUrl ? { videoUrl } : { imageUrl }) }, extra);
    if (!r) return fail('Scheduling is not available on this connection.');
    if (r.isError) return fail(friendly(textOfResult(r)));
    return r;
  });

  // ── ADS: pause or turn on one campaign through that platform's own status tool ──
  reg(EXT_ADS_STATUS_TOOL, async (args, extra) => {
    const P = ADS_PLATFORMS[args?.platform];
    if (!P) return fail('Unknown ad platform.');
    const id = String(args?.campaignId || '').trim();
    if (!id) return fail('Pass the `campaignId`.');
    if (args?.status !== 'active' && args?.status !== 'paused') return fail("`status` is 'active' or 'paused'.");
    if (P.accounts && !args?.accountId) return fail('Pass the `accountId` the campaign is on.');
    const r = await call(P.status.tool, P.status.args({ id: String(args?.accountId || '') }, id, args.status === 'active'), extra);
    if (!r) return fail('Changing campaigns is not available on this connection.');
    if (r.isError) return fail(friendly(textOfResult(r)));
    return r;
  });
  return handles;
}
// A refusal shown in the app: a lack of credits is the one neutral sentence (no buy step), everything else is the
// existing tool's own words, long enough to keep a per-channel reason whole.
const friendly = (t) => { const n = neutralNote(t); return n === NEUTRAL_CREDIT_NOTE ? n : String(t ?? '').replace(/^Error:\s*/, '').trim().slice(0, 800); };

// SDK 1.29's McpServer drops `icons` from tools/list (it emits name/title/description/schemas/annotations/_meta),
// so the entrypoint icon is added on the way out. Installed only when the app is registered, so a flag-off roster is
// untouched. Returns false when there is no request-handler map to wrap (a stub server in a check).
export function installEntrypointIcons(mcp, names = [EXT_HOME_TOOL, EXT_ENTRY_TOOL], icon = ENTRY_ICON) {
  try {
    const map = mcp && mcp.server && mcp.server._requestHandlers;
    if (!map || typeof map.get !== 'function') return false;
    const orig = map.get('tools/list');
    if (typeof orig !== 'function' || orig._hermosoIcons) return false;
    const want = new Set(names);
    const wrapped = async (request, extra) => {
      const r = await orig(request, extra);
      for (const t of (r && Array.isArray(r.tools) ? r.tools : [])) if (t && want.has(t.name) && !t.icons) t.icons = [{ ...icon }];
      return r;
    };
    wrapped._hermosoIcons = true;
    map.set('tools/list', wrapped);
    return true;
  } catch { return false; }
}
