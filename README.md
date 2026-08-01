# Hermoso — MCP, CLI & Skills

[![smithery badge](https://smithery.ai/badge/hermoso/hermoso)](https://smithery.ai/servers/hermoso/hermoso) [![npm version](https://img.shields.io/npm/v/hermoso.svg)](https://www.npmjs.com/package/hermoso) [![MCP registry](https://img.shields.io/badge/MCP_registry-io.github.hermoso--ai%2Fhermoso-cc4f33)](https://registry.modelcontextprotocol.io/v0/servers?search=hermoso)


Run your whole marketing operation from **any AI agent**: Claude Code, Claude.ai, Cursor, Codex, or your own
scripts. Research the ads already winning in a market, generate finished image & video ads (your real product
composited in, copy + CTA included), publish them to your own social channels, and build & manage the ad
campaigns behind them — all over [MCP](https://modelcontextprotocol.io) tools, a CLI, or installable Claude skills.

**247 tools.** `tools/list` is always the authoritative set; `hermoso_capabilities` (free) returns the live model
catalog with exact per-render credit costs plus the full capability map.

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

### What the 247 tools cover

**Ad spy / research** — `find_competitors`, `competitor_teardown`, `pull_competitor_ads`, `research_ads`; the
Meta / Google / LinkedIn ad libraries (`search_meta_ads`, `search_google_ads`, `search_linkedin_ads`); organic
social (`search_tiktok`, `search_instagram`, `search_youtube`, `search_reddit`, `search_threads`);
`scrapecreators_fetch`, `mine_angles`, `analyze_video`, `check_ad_policy`, `list_skills` / `get_skill`.

**Create** — `draft_brand` → `plan_ad` → `render_ad` (the Studio quality pipeline: composited text, clean speech,
music, brand end card), or `generate_image` / `generate_video` / `generate_avatar` (UGC creators + lip-sync).
Also `make_template_ad` (native HTML ad formats), `make_explainer`, `product_sizzle`, `make_thumbnail`,
`remix_static`, `recast_motion`, `reframe_video`, `upscale_video`, `dub_video`, `change_voice`, `finish_video`,
`fix_beat`, `stitch_video`, `clip_video`, `post_edit`, plus `plan_variations` + `score_ad` to fan out and rank.
**Length is yours to set:** pass `durationSeconds` to `plan_ad` and the storyboard is *authored* to it — ≤15s
renders as one continuous clip, longer is stitched from acts (40s = 15+15+10), never time-compressed.

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
change confirm-gated, on **Meta**, **Google Ads**, **LinkedIn Ads**, **Pinterest Ads**, **Microsoft Advertising**
and **ChatGPT Ads** (OpenAI's Advertiser API). Each has list + report + create + budget/status tools
(e.g. `list_google_ads_campaigns`, `google_ads_report`, `create_google_ads_campaign`, `set_google_ads_budget`,
`set_google_ads_status`). *X Ads are not supported — X posting only.*

**Files** — Google Drive CRUD (`save_to_drive`, `list_drive_files`, `update_drive_file`, `delete_drive_file`,
`create_drive_folder`), Google Sheets (`create_sheet`, `append_to_sheet`, `read_sheet`), Google Docs
(`create_doc`, `append_to_doc`), and OneDrive (`save_to_onedrive` + full CRUD).

**Workspace & account** — brand workspaces (`list_brands`, `create_brand`, `use_brand`, `update_brand`,
`delete_brand` — one account holds many brands, so an agency runs every client through here), memory
(`remember`, `forget`, `list_memory`), custom skills (`save_skill`, `delete_skill`), AI employees
(`save_employee`, `list_employees`, `set_active_employee`), team (`list_team`, `invite_member`, `remove_member`,
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
