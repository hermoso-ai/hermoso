# Hermoso — MCP, CLI & Skills

Drive [Hermoso](https://hermoso.ai) — the AI ad studio — from **any AI agent**: Claude Code, Claude.ai, Cursor,
Codex, or your own scripts. Research the ads already winning in a market, plan a creative, and generate finished
image & video ads (your real product composited in, copy + CTA included) — all over
[MCP](https://modelcontextprotocol.io) tools, a CLI, or installable Claude skills.

## Instant: the hosted Claude.ai connector

Paste **`https://app.hermoso.ai/mcp`** into Claude → Settings → Connectors → *Add custom connector*, approve with
your Hermoso account, done — the full studio toolset with your saved brand context, billed to your plan.

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

`hermoso mcp` runs a stdio MCP server exposing the full studio toolset (40+ tools). The published `hermoso`
package means no clone — `npx -y hermoso mcp` fetches and runs it:

```bash
claude mcp add hermoso -e HERMOSO_TOKEN=hmk_… -- npx -y hermoso mcp
```

Cursor / Codex — add to `mcp.json` (Codex uses the TOML equivalent):

```json
{ "mcpServers": { "hermoso": { "command": "npx", "args": ["-y", "hermoso", "mcp"],
  "env": { "HERMOSO_API_BASE": "https://app.hermoso.ai", "HERMOSO_TOKEN": "<your token>" } } } }
```

Then ask your agent: *“Generate an image ad with Hermoso.”*

**Tools (40+):** research/ad-spy (`find_competitors`, `pull_competitor_ads`, `research_ads`, `search_meta_ads`,
`search_google_ads`, `search_linkedin_ads`, `search_tiktok`, `search_instagram`, `search_youtube`, `search_reddit`,
`search_threads`, `scrapecreators_fetch`), plan → generate → finish (`plan_ad`, `plan_variations`, `generate_image`,
`generate_video`, `generate_avatar`, `render_ad`, `make_template_ad`, `stitch_video`, `reframe_video`,
`upscale_video`, `dub_video`, `change_voice`, `recast_motion`, `remix_static`, `finish_video`, `fix_beat`),
brand + account (`get_brand`, `list_brands`, `use_brand`, `draft_brand`, `list_product_photos`, `set_product_image`,
`hermoso_capabilities`, `hermoso_credits`, `buy_credits`), and analysis/jobs (`analyze_video`, `score_ad`,
`check_ad_policy`, `competitor_teardown`, `mine_angles`, `get_job`, `list_jobs`, `get_skill`, `list_skills`,
`fetch_asset`). Call `hermoso_capabilities` first — it returns valid model ids and per-render credit costs;
`tools/list` is the authoritative current set. Render jobs queue server-side and poll to completion, returning a
served URL.

## 2. CLI — the token-cheap path for terminal agents

`bin/hermoso.mjs` mirrors the tools as subprocess commands, so an agent can shell out instead of carrying a fat
tool manifest.

```bash
npm install -g .                                   # installs `hermoso`
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
| `HERMOSO_TOKEN` | Bearer token — required against the hosted app (rolling out) |
| `HERMOSO_PROFILE` | Brand-workspace id, for accounts with multiple brand profiles |

`mcp/http.mjs` is the hosted remote-connector transport (paste-a-URL into Claude.ai → Connectors). It ships in
this repo for transparency and refuses to mount without authenticated identity — no anonymous spend, ever.

## License

MIT © Hermoso
