# Hermoso — MCP, CLI & Skills

Run your whole marketing operation from **any AI agent**: Claude Code, Claude.ai, Cursor, Codex, or your own
scripts. Research the ads already winning in a market, generate finished image & video ads (your real product
composited in, copy + CTA included), publish them to your own social channels, and build & manage the ad
campaigns behind them — all over [MCP](https://modelcontextprotocol.io) tools, a CLI, or installable Claude skills.

**789 tools.** `tools/list` is always the authoritative set; `hermoso_capabilities` (free) returns the live model
catalog with exact per-render credit costs plus the full capability map.

**What it connects to.** Ad platforms: Meta, Google Ads, TikTok Ads, LinkedIn Ads, Reddit Ads, X Ads,
Pinterest Ads, Snapchat Ads, Microsoft Advertising, Apple Search Ads and ChatGPT Ads, plus product feeds in
Google Merchant Center. Publishing and scheduling — **ten** channels: Facebook, Instagram, Threads, TikTok,
YouTube, X, LinkedIn, Pinterest, Bluesky and Telegram. Messaging: WhatsApp (you message a person, so it is not an
eleventh publishing channel). Ad research: the Meta, Google and LinkedIn ad libraries plus organic TikTok,
Instagram, YouTube, Threads and Reddit. Analytics: Google Analytics 4, Google Search Console and every
connected platform's own post and campaign insights. Files: Google Drive, Sheets, Docs and OneDrive.

**It is not all-or-nothing.** Research, creation, publishing/scheduling and ads management are four *independent*
areas — no tool requires that you used another one first. Publish or schedule creative you already have and
generate nothing here (`upload_file` turns any local or external file into a URL every publish, schedule and
ad-build tool accepts); build and read campaigns on your own ad accounts with your own creative; research
competitors with no brand drafted and no channel connected; or generate a file with nothing connected at all and
just download it. Use the one piece you need, or all of it together.

## Which surface should your agent use?

Two shapes, and the right one is decided by **what your client can do**, not by which we prefer.

| Your client | Use | Why |
| --- | --- | --- |
| **Runs in a browser** — Claude.ai, ChatGPT, Claude Desktop | the hosted connector `https://app.hermoso.ai/mcp` | It cannot spawn a local process, so a URL is the only shape it has. Nothing to install, no key to paste, and the full toolset arrives with your saved brand context. This is the right answer for these clients, not a lesser one. |
| **Can run a shell** — Claude Code, Cursor, Codex, Cline, OpenClaw, Hermes, your own scripts | the CLI, `npm install -g hermoso` | A tool manifest is loaded into every session whether or not a tool is called. A shell command costs nothing until it runs, and it reaches **every** tool rather than the default roster. |

**The measured difference** (2026-08-27, counted as real tool definitions rather than estimated from bytes):

| | tools in range | loaded per session |
| --- | --- | --- |
| Hosted connector, default roster | 306 | **181,713 tokens** |
| Hosted connector, `?tools=all` | 718 | **472,062 tokens** |
| stdio server (`npx -y hermoso mcp`) | 306 | **181,713 tokens** |
| **CLI** | **all 718** | **0** |

The CLI answers the same questions on demand instead, and only when asked:

```bash
npx -y hermoso tools --search reddit   # every matching tool, name + one line   2,459 tokens
npx -y hermoso tools plan_ad           # one tool's full argument schema           633 tokens
npx -y hermoso call plan_ad --json '{"product":"…"}'   # run it
```

So a terminal agent reaches its first call in roughly **3.4K tokens with the whole roster in range**, against
**182K for a fraction of it**. `tools` and `tools <name>` read a registry bundled in the package — no key, no
network, no sign-in — so an agent can browse the entire product before anyone signs in. Only `call` spends, and
only that needs `hermoso auth login` once.

**Both at once is fine, and is what we suggest for Claude Code.** One `hermoso auth login` covers the CLI *and*
lets `claude mcp add hermoso -- npx -y hermoso mcp` pick the key up with no `env` block, so the agent can reach for
a native tool when it wants structured results and shell out when it wants breadth. If you only want one, take the
CLI: it covers strictly more.

**When the connector is still the better trade on a shell-capable client:** a session that is going to make many
calls into one area. `enable_tools({groups:['ads']})` turns campaign management on in a single free call and the
tools are then native — no shell quoting, structured results. One shell round trip beats loading a 221K-token
group for a single tool; the reverse is true once a session settles into that area.

## Your agent can sign itself up

An agent with no Hermoso account can provision one, get its own key, and be rendering ads in the same session.
No human at a browser, no ticket, no waiting.

```bash
# 1. Start a signup. This call takes no credential, because the credential is what it creates.
curl -sX POST https://app.hermoso.ai/v1/signup \
  -H 'content-type: application/json' \
  -d '{"plan":"pro","period":"mo","email":"you@yourcompany.com"}'
# -> { "id": "cs_...", "checkout_url": "https://checkout.stripe.com/...", "claim_token": "hsc_...", "email": { "address": "you@yourcompany.com", "verified": false } }
# email = the human behind the account. A verification link goes there; the account works before it is clicked.
# It is a contact mailbox only, never a sign-in. GET /v1/account/email reports the state; POST /v1/account/email/resend re-sends or changes it.

# 2. Pay at checkout_url. Store claim_token first: it is returned only in that response.

# 3. Claim it. Poll until status is "ready".
curl -sX POST https://app.hermoso.ai/v1/signup/cs_.../claim \
  -H 'content-type: application/json' \
  -d '{"claim_token":"hsc_..."}'
# -> { "status": "ready", "api_key": "hmk_...", "credits": 3000 }
```

That `hmk_` key is the same credential everything else on this page takes: `/v1`, the MCP server, the CLI. Point
your client at it and the full surface is open.

**Paying is something a browser-capable agent can already do itself.** Checkout is Stripe's own hosted page, so
Claude in Chrome and clients like it complete it unattended today. Everything else is a one-click handoff: send
`checkout_url` to whoever holds the card. The same shape covers you later, once you are running: `buy_credits`
and `upgrade_plan` mint a ready-to-pay link for more credits or a bigger plan, and `billing_status` reads the
balance any time.

**An agent with its own payment credential can pay with no human at all.** `POST /api/billing/machine-payment`
with `{"packId": "pack-1k"}` answers HTTP 402 carrying a `WWW-Authenticate: Payment` challenge (Stripe, through the
Machine Payments Protocol); pay the challenge and retry, and the same credit pack lands on the same balance.
`GET /api/billing/config` lists the packs under `machinePayments`. Same packs, same prices, no per-call billing.

**The agentic path takes a paid plan.** Any of them. The free plan is there for a person signing up at
[app.hermoso.ai](https://app.hermoso.ai), and asking for it here returns a refusal that says so. Nothing is
created until the payment completes, so an unpaid signup leaves no account behind and charges nothing.

**One thing still wants a person, and it is worth knowing up front.** Connecting a social or ad account means an
OAuth consent screen, and a consent screen cannot be completed headlessly on any platform. `list_connectors`
shows what is already connected and what is not. Everything else runs with no browser at all: research,
generation, publishing to a channel that is already connected, campaign builds, reporting.

Full request and response shapes, plus every other endpoint, are in the OpenAPI document at
[app.hermoso.ai/openapi.json](https://app.hermoso.ai/openapi.json), served live from the same table that mounts
the routes.

## Instant: the hosted Claude.ai connector

Paste **`https://app.hermoso.ai/mcp?src=readme`** into Claude → Settings → Connectors → *Add custom connector*, pick
**Always required** when Claude asks about authentication (its detector suggests "None" because our discovery
handshake is open; "None" would leave every tool call unauthenticated), approve with your Hermoso account, done — the full toolset with your saved brand context, billed to your plan.

## Quickstart for Claude Code (one line)

1. **Get an account** at [app.hermoso.ai](https://app.hermoso.ai) — free tier included; plans & credits are the
   same ones the web Studio uses. Or skip the browser entirely and let your agent sign itself up on a paid plan
   with `POST /v1/signup` (above).
2. **Run one line.** Your browser opens once to sign in. Nothing to paste, and no key lands in `.claude.json`:

```bash
npm install -g hermoso && hermoso auth login && claude mcp add hermoso -- npx -y hermoso mcp
```

3. **Ask for what you want**, in your normal prompts. Claude Code reaches for a tool, or runs the `hermoso`
   command in your terminal, whichever the job needs. You type neither.

Ad campaign and analytics tools stay out of the tool list until you switch them on with `enable_tools`, which
keeps it small. On a machine with no browser, sign in with `hermoso auth login --token hmk_…` using a key from
**Settings → Agents & API**, or skip the sign-in and pass the key to the client instead:

```bash
claude mcp add hermoso -e HERMOSO_TOKEN=hmk_… -- npx -y hermoso mcp
```

The hosted URL works in Claude Code too, but it is the worse path there and it is worth knowing why:
`claude mcp add --transport http hermoso "https://app.hermoso.ai/mcp?src=readme"` is accepted, and then `claude mcp list`
reports `! Needs authentication` because the client will not start the OAuth flow by itself — you have to open a
session, run `/mcp`, find the server and press Authenticate. Measured against Claude Code 2.1.241 on 2026-08-23.

Your agent now has the full studio **with your workspace's context**: the brand profile, products, logos and
learned memory you set up in the web app apply automatically (`get_brand` shows what's saved; omit `brand` in
`plan_ad`/`plan_variations` to use it). Renders bill your Hermoso credits — same prices as the Studio. Only AI model runs and Ad Spy research spend credits; publishing, scheduling, ads management and analytics are free on every plan (X is the one per-call exception).

## 1. MCP server (stdio) — Claude Code / Cursor / Codex

`hermoso mcp` runs a stdio MCP server exposing the full toolset. The published `hermoso` package means no clone —
`npx -y hermoso mcp` fetches and runs it. Sign in once with the CLI and no key goes into any client config,
because `hermoso mcp` reads the bearer `hermoso auth login` stored:

```bash
npm install -g hermoso && hermoso auth login && claude mcp add hermoso -- npx -y hermoso mcp
```

Cursor / Codex — sign in the same way, then add to `mcp.json` (Codex uses the TOML equivalent). Drop the `env`
block entirely if you signed in above; it is there for CI, where the process cannot read your home directory:

```json
{ "mcpServers": { "hermoso": { "command": "npx", "args": ["-y", "hermoso", "mcp"],
  "env": { "HERMOSO_API_BASE": "https://app.hermoso.ai", "HERMOSO_TOKEN": "<your token>" } } } }
```

Then ask your agent: *“Generate an image ad with Hermoso.”*

### What the 789 tools cover

**Ad spy / research** — `find_competitors`, `competitor_teardown`, `pull_competitor_ads`, `research_ads`; the
Meta / Google / LinkedIn ad libraries (`search_meta_ads`, `search_google_ads`, `search_linkedin_ads`); organic
social (`search_tiktok`, `search_instagram`, `search_youtube`, `search_reddit`, `search_threads`);
`fetch_social_data`, `mine_angles`, `analyze_video`, `check_ad_policy`, `list_skills` / `get_skill`.

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

**Publish to your own channels** — **ten** of them: Facebook, Instagram and Threads (`post_to_meta`), TikTok
(`post_to_tiktok`), YouTube (`post_to_youtube` + `update_youtube_video`, `youtube_video_insights`, comments
read/reply), X (`post_to_x`, `x_post_metrics`, `x_post_insights`, `x_mentions`, `list_x_dms`, `send_x_dm`),
LinkedIn profile **and** company Pages (`post_to_linkedin`, `post_to_linkedin_page`), Pinterest
(`post_to_pinterest` + boards), Bluesky (`post_to_bluesky`, `delete_bluesky_post`, `bluesky_post_metrics`, plus
`list_bluesky_convos` / `read_bluesky_dm` / `send_bluesky_dm`) and Telegram (`post_to_telegram`,
`delete_telegram_message`, `list_telegram_chats`). `schedule_post` / `list_scheduled` / `cancel_scheduled` give
you one content calendar over exactly that set. `upload_file` brings in any external or local media, not just
Hermoso renders.
*X posting bills credits per API call (X charges per request); a post containing a link costs 13× one without.*
*Held back, and named rather than hidden:* **Google Business Profile** is built (`post_to_google_business`,
reviews, Q&A, insights) and is not offered — Google allowlists that API per project and ours reads 0 QPM, so
every call would 403 for every user. It is in `schedule_post`'s channel enum and refused at enqueue.

**Message customers on WhatsApp** — messaging, not an eleventh publishing channel: you message a person, and
nothing here posts to a feed. `list_whatsapp_accounts` finds the Business Account and its
numbers, `list_whatsapp_templates` / `create_whatsapp_template` / `delete_whatsapp_template` manage the templates
Meta reviews, and `send_whatsapp_message` sends one — confirm-gated, because it reaches a real phone and Meta
bills the business for the conversation. Two limits that are permanent facts about Meta's API rather than
anything pending: **Hermoso does not receive WhatsApp webhooks, so there is no message history to read** — it is
not an inbox surface and `list_inbox` does not cover it — and **outside the 24-hour window that opens when the
customer messages first, WhatsApp accepts an APPROVED template and nothing else.**

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

`bin/hermoso.mjs` exposes the full MCP toolset as subprocess commands, so an agent can shell out instead of carrying a
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

**Those shortcuts are the common path, not the limit.** Every tool the MCP server has is reachable here too,
including the ad-campaign and analytics groups a connector leaves out of its default roster:

```bash
hermoso tools                          # every tool, grouped, name + one line
hermoso tools --group ads --search reddit   # narrow it
hermoso tools create_meta_campaign     # that tool's full argument schema
hermoso call create_meta_campaign --json '{"name":"…"}'   # run it
hermoso create_meta_campaign --name "…"                   # same thing, shorter
```

`call` goes through the same handler, the same argument validation and the same confirm/spend gates the MCP
server uses — there is no second implementation to drift. `tools` and `tools <name>` read a registry bundled in
the package, so they need no key, no network and no sign-in.

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
| `HERMOSO_OWNER` | Only for a brand **another account shared with you** (a team workspace): the owning account id. Set it together with `HERMOSO_PROFILE`, and set `HERMOSO_PROFILE` to that workspace's **profileUuid** — a brand's short slug is refused. Run `list_brands` (or `hermoso list_brands` from the CLI) to print both values for every workspace you can enter. The server re-authorizes the pair on every request, so a wrong value is refused, never trusted. |

`mcp/http.mjs` is the hosted remote-connector transport (paste-a-URL into Claude.ai → Connectors). It ships in
this repo for transparency and refuses to mount without authenticated identity — no anonymous spend, ever.

## License

MIT © Hermoso
