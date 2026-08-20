# Hermoso — MCP, CLI & Skills

Run your whole marketing operation from **any AI agent**: Claude Code, Claude.ai, Cursor, Codex, or your own
scripts. Research the ads already winning in a market, generate finished image & video ads (your real product
composited in, copy + CTA included), publish them to your own social channels, and build & manage the ad
campaigns behind them — all over [MCP](https://modelcontextprotocol.io) tools, a CLI, or installable Claude skills.

**681 tools.** `tools/list` is always the authoritative set; `hermoso_capabilities` (free) returns the live model
catalog with exact per-render credit costs plus the full capability map.

**What it connects to.** Ad platforms: Meta, Google Ads, TikTok Ads, LinkedIn Ads, Reddit Ads, X Ads,
Pinterest Ads, Snapchat Ads, Microsoft Advertising, Apple Search Ads and ChatGPT Ads, plus product feeds in
Google Merchant Center. Publishing and scheduling: Facebook, Instagram, Threads, TikTok, YouTube, X, LinkedIn,
Pinterest, Bluesky and Telegram. Ad research: the Meta, Google and LinkedIn ad libraries plus organic TikTok,
Instagram, YouTube, Threads and Reddit. Analytics: Google Analytics 4, Google Search Console and every
connected platform's own post and campaign insights. Files: Google Drive, Sheets, Docs and OneDrive.

**It is not all-or-nothing.** Research, creation, publishing/scheduling and ads management are four *independent*
areas — no tool requires that you used another one first. Publish or schedule creative you already have and
generate nothing here (`upload_file` turns any local or external file into a URL every publish, schedule and
ad-build tool accepts); build and read campaigns on your own ad accounts with your own creative; research
competitors with no brand drafted and no channel connected; or generate a file with nothing connected at all and
just download it. Use the one piece you need, or all of it together.

## Instant: the hosted Claude.ai connector

Paste **`https://app.hermoso.ai/mcp`** into Claude → Settings → Connectors → *Add custom connector*, approve with
your Hermoso account, done — the full toolset with your saved brand context, billed to your plan.

## Quickstart for Claude Code / Cursor / scripts (2 minutes)

1. **Get an account** at [app.hermoso.ai](https://app.hermoso.ai) — free tier included; plans & credits are the
   same ones the web Studio uses.
2. **Create an agent key**: app.hermoso.ai → **Settings → Agents & API** → Create API key (`hmk_…`).
3. **Connect** — no clone needed, `npx` runs the published `hermoso` package (Claude Code shown; any MCP client works):

```bash
claude mcp add hermoso -e HERMOSO_TOKEN=hmk_… -- npx -y hermoso mcp
```

Your agent now has the full studio **with your workspace's context**: the brand profile, products, logos and
learned memory you set up in the web app apply automatically (`get_brand` shows what's saved; omit `brand` in
`plan_ad`/`plan_variations` to use it). Renders bill your Hermoso credits — same prices as the Studio.

## 1. MCP server (stdio) — Claude Code / Cursor / Codex

`hermoso mcp` runs a stdio MCP server exposing the full toolset. The published `hermoso` package means no clone —
`npx -y hermoso mcp` fetches and runs it:

```bash
claude mcp add hermoso -e HERMOSO_TOKEN=hmk_… -- npx -y hermoso mcp
```

Cursor / Codex — add to `mcp.json` (Codex uses the TOML equivalent):

```json
{ "mcpServers": { "hermoso": { "command": "npx", "args": ["-y", "hermoso", "mcp"],
  "env": { "HERMOSO_API_BASE": "https://app.hermoso.ai", "HERMOSO_TOKEN": "<your token>" } } } }
```

Then ask your agent: *“Generate an image ad with Hermoso.”*

### What the 681 tools cover

**Ad spy / research** — `find_competitors`, `competitor_teardown`, `pull_competitor_ads`, `research_ads`; the
Meta / Google / LinkedIn ad libraries (`search_meta_ads`, `search_google_ads`, `search_linkedin_ads`); organic
social (`search_tiktok`, `search_instagram`, `search_youtube`, `search_reddit`, `search_threads`);
`scrapecreators_fetch`, `mine_angles`, `analyze_video`, `check_ad_policy`, `list_skills` / `get_skill`.

**Create** — `draft_brand` → `plan_ad` → `render_ad` (the Studio quality pipeline: composited text, clean speech,
music, brand end card), or `generate_image` / `generate_video` / `generate_avatar` (UGC creators + lip-sync).
The workspace's **saved cast** is reusable: `list_creators` returns every saved creator with their portrait url,
`save_creator` adds one, `delete_creator` drops one — re-pass a portrait to `generate_avatar` / `generate_video` /
`recast_motion` and the SAME person stars in every ad, instead of a new face each render.
Also `make_template_ad` (native HTML ad formats), `make_explainer`, `product_sizzle`, `make_thumbnail`,
`remix_static`, `recast_motion`, `reframe_video`, `upscale_video`, `dub_video`, `change_voice`, `finish_video`,
`fix_beat`, `stitch_video`, `clip_video`, `post_edit`, plus `plan_variations` + `score_ad` to fan out and rank.
**Length is yours to set:** pass `durationSeconds` to `plan_ad` and the storyboard is *authored* to it — a length
that fits one clip of the render model renders as a single continuous take, longer is stitched from acts (on a
15s-clip model, 40s = 15+15+10), never time-compressed. What fits one clip is the model's own maximum, not a fixed
number: most video models cap a clip at 15 seconds and the longest-clip one takes **30 seconds in one unbroken
take** with native synchronized audio. `hermoso_capabilities` is the live list — durations, resolutions and the
exact credit cost of every tier — and naming that model in `model` is how you get it, since an unnamed render is
routed by a narrower auto-pool.

**Raw model playground** — the full catalog (30+ image / video / voice / writing models, each with its exact
per-render credit cost) with no ad framing: `generate_image` / `generate_video` with `useBrand:false`,
`generate_voice`, `generate_text`.

**Publish to your own channels** — Facebook, Instagram and Threads (`post_to_meta`), TikTok (`post_to_tiktok`),
YouTube (`post_to_youtube` + `update_youtube_video`, `youtube_video_insights`, comments read/reply), X
(`post_to_x`, `x_post_metrics`, `x_post_insights`, `x_mentions`), LinkedIn profile **and** company Pages
(`post_to_linkedin`, `post_to_linkedin_page`), Pinterest (`post_to_pinterest` + boards), and Google Business
Profile (`post_to_google_business` — Google grants this API per project, so access must be approved before Posts
publish). `schedule_post` / `list_scheduled` / `cancel_scheduled` give you one content calendar across channels.
`upload_file` brings in any external or local media, not just Hermoso renders.
*X posting bills credits per API call (X charges per request); a post containing a link costs 13× one without.*

**Run the ads** — full campaign trees, built paused and read back before anything is reported, with every spend
change confirm-gated, on **eleven** platforms: **Meta**, **Google Ads**, **LinkedIn Ads**, **Reddit Ads**,
**Pinterest Ads**, **Microsoft Advertising**, **ChatGPT Ads** (OpenAI's Advertiser API), **X Ads**, **TikTok Ads**,
**Snapchat Ads** and **Apple Ads** (Apple Search Ads on the App Store). Each has list + report + create + budget/status tools
(e.g. `list_google_ads_campaigns`, `google_ads_report`, `create_google_ads_campaign`, `set_google_ads_budget`,
`set_google_ads_status`). *Snapchat needs one extra step the others do not: an ad points at a CREATIVE, and every
Snapchat creative must carry a Public Profile id — build it with `upload_snapchat_ads_creative`.*

**Feed the shopping surfaces** — **Google Merchant Center** is the catalog a retail Performance Max or Shopping
campaign advertises (`create_google_ads_performance_max_campaign` takes a `merchantCenterId`), and you manage it
from here: accounts and account status, data sources, product upsert / update / delete, per-region inventory,
quota, `merchant_report` for product-level performance, notifications and conversion sources, plus the disapproval
loop — `list_merchant_issues` says what is wrong and `merchant_issue_help` returns Google's own documented fix.
*Promotions need the merchant's own enrolment in Google's promotions program; without it Google refuses that
sub-API outright.* **Microsoft Merchant Center** is covered on the same shape (stores, catalogs, products, issues)
for Bing Shopping.

**Measure what the ads achieved** — Google Analytics 4 closes the loop. Every other connector here reports what an
ad *cost*; this is the one that reports what it *did*. `analytics_report` breaks sessions, users, conversions and
revenue down by channel, source/medium, campaign, landing page, country, device or date, so the campaign Hermoso
built and the revenue it drove sit in one conversation. `analytics_realtime` shows who is on the site right now.
Start at `list_analytics_properties` — the tools take a numeric property id, not the `G-XXXXXXXXX` Measurement ID
from your tracking snippet, and this is what resolves one from the other. It writes as well as reads:
`create_analytics_key_event` marks an event GA4 already collects as a key event — which is what makes it importable
into Google Ads as a conversion — and `create_analytics_custom_dimension` registers an event parameter so reports
can break down by it, with `list_analytics_definitions` showing what the property already measures. It signs in
with the same Google account as Google Ads, YouTube and Drive, but it is its own connection.
*GA4 only — the API has no Universal Analytics surface. A custom dimension can be archived but never deleted, and a
property holds 50 event-scoped ones.*

**Files** — Google Drive CRUD (`save_to_drive`, `list_drive_files`, `update_drive_file`, `delete_drive_file`,
`create_drive_folder`), Google Sheets (`create_sheet`, `append_to_sheet`, `read_sheet`), Google Docs
(`create_doc`, `append_to_doc`), and OneDrive (`save_to_onedrive` + full CRUD).

**Workspace & account** — brand workspaces (`list_brands`, `create_brand`, `use_brand`, `update_brand`,
`delete_brand` — one account holds many brands, so an agency runs every client through here), memory
(`remember`, `forget`, `list_memory`), custom skills (`save_skill`, `get_skill`, `list_skills`,
`delete_skill` — the one library, which absorbed the old AI-Employee personas), team (`list_team`, `invite_member`, `remove_member`,
`set_role`), settings (`get_settings`, `update_settings` — including the **language** every ad, script and plan
is written in), connectors (`list_connectors`, `list_connector_accounts`, `set_connector_accounts`,
`disconnect_connector`), and billing (`hermoso_credits`, `billing_status`, `buy_credits`, `upgrade_plan`,
`set_auto_reload`), plus `list_jobs` / `get_job` for async renders.

**Connector accounts are picked, not guessed.** One person often administers several Facebook Pages, Google Ads
customers or LinkedIn company Pages. Only the accounts ticked for a brand are usable — enforced server-side, and
an empty selection shares nothing. Linking a *new* account is the one step that is not headless (it is an OAuth
consent screen, so the user does it in the app).

Render jobs queue server-side and poll to completion, returning a served URL.

## 2. CLI — the token-cheap path for terminal agents

`bin/hermoso.mjs` mirrors the core tools as subprocess commands, so an agent can shell out instead of carrying a
fat tool manifest.

```bash
npm install -g hermoso                             # installs `hermoso`
hermoso capabilities                               # valid model ids + costs (run first)
hermoso create --brand "YourBrand" --product "your best-selling product" --format image
hermoso generate image --prompt "…" --ref ./product.png --wait
hermoso generate video --prompt "…" --duration 8 --wait
hermoso competitors yourbrand.com
hermoso research "Liquid Death’s longest-running ads"
```

Add `--json` to any command for machine output.

## 3. Claude skills — slash commands that wrap the CLI

`skills/` holds four installable skills: `hermoso-generate`, `hermoso-ad-from-brand`,
`hermoso-product-photoshoot`, `hermoso-research`.

```bash
cp -r skills/* ~/.claude/skills/
```

Then invoke `/hermoso-ad-from-brand an ad for yourbrand.com — our hero product`.

## Configuration

| Env | Meaning |
| --- | --- |
| `HERMOSO_API_BASE` | The Hermoso API origin (default `https://app.hermoso.ai` — set `http://localhost:3000` if you run the app yourself) |
| `HERMOSO_TOKEN` | Bearer agent key (`hmk_…`) — required against the hosted app |
| `HERMOSO_PROFILE` | Brand-workspace id, for accounts with multiple brand profiles |
| `HERMOSO_OWNER` | Only for a brand **another account shared with you** (a team workspace): the owning account id. Set it together with `HERMOSO_PROFILE`, and set `HERMOSO_PROFILE` to that workspace's **profileUuid** — a brand's short slug is refused. Run `list_brands` (or `hermoso brands`) to print both values for every workspace you can enter. The server re-authorizes the pair on every request, so a wrong value is refused, never trusted. |

`mcp/http.mjs` is the hosted remote-connector transport (paste-a-URL into Claude.ai → Connectors). It ships in
this repo for transparency and refuses to mount without authenticated identity — no anonymous spend, ever.

## License

MIT © Hermoso
