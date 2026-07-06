# Hermoso — MCP, CLI & Skills

Drive [Hermoso](https://hermoso.ai) — the AI ad studio — from **any AI agent**: Claude Code, Claude.ai, Cursor,
Codex, or your own scripts. Research the ads already winning in a market, plan a creative, and generate finished
image & video ads (your real product composited in, copy + CTA included) — all over
[MCP](https://modelcontextprotocol.io) tools, a CLI, or installable Claude skills.

## Instant: the hosted Claude.ai connector

Paste **`https://app.hermoso.ai/mcp`** into Claude → Settings → Connectors → *Add custom connector*, approve with
your Hermoso account, done — all 22 tools with your saved brand context, billed to your plan.

## Quickstart for Claude Code / Cursor / scripts (2 minutes)

1. **Get an account** at [app.hermoso.ai](https://app.hermoso.ai) — free tier included; plans & credits are the
   same ones the web Studio uses.
2. **Create an agent key**: app.hermoso.ai → **Settings → Agents & API** → Create API key (`hmk_…`).
3. **Connect** (Claude Code shown; any MCP client works):

```bash
git clone https://github.com/hermoso-ai/hermoso.git && cd hermoso && npm install
claude mcp add hermoso -e HERMOSO_TOKEN=hmk_… -- node "$(pwd)/mcp/hermoso-mcp.mjs"
```

Your agent now has the full studio **with your workspace's context**: the brand profile, products, logos and
learned memory you set up in the web app apply automatically (`get_brand` shows what's saved; omit `brand` in
`plan_ad`/`plan_variations` to use it). Renders bill your Hermoso credits — same prices as the Studio.

## 1. MCP server (stdio) — Claude Code / Cursor / Codex

`mcp/hermoso-mcp.mjs` is a stdio MCP server exposing 22 tools.

```bash
npm install
claude mcp add hermoso -- node "$(pwd)/mcp/hermoso-mcp.mjs"
```

Cursor / Codex — add to `mcp.json` (Codex uses the TOML equivalent):

```json
{ "mcpServers": { "hermoso": { "command": "node", "args": ["<repo>/mcp/hermoso-mcp.mjs"],
  "env": { "HERMOSO_API_BASE": "https://app.hermoso.ai", "HERMOSO_TOKEN": "<your token>" } } } }
```

Then ask your agent: *“Generate an image ad with Hermoso.”*

**Tools (22):** `hermoso_capabilities`, `hermoso_credits`, `get_brand`, `plan_ad`, `plan_variations`, `generate_image`,
`generate_video`, `generate_avatar`, `stitch_video`, `reframe_video`, `upscale_video`, `dub_video`,
`recast_motion`, `analyze_video`, `score_ad`, `get_job`, `list_jobs`, `find_competitors`,
`pull_competitor_ads`, `research_ads`, `draft_brand`, `fetch_asset`. Call `hermoso_capabilities` first — it
returns valid model ids and per-render credit costs. Render jobs queue server-side and poll to completion,
returning a served URL.

## 2. CLI — the token-cheap path for terminal agents

`bin/hermoso.mjs` mirrors the tools as subprocess commands, so an agent can shell out instead of carrying a fat
tool manifest.

```bash
npm install -g .                                   # installs `hermoso`
hermoso capabilities                               # valid model ids + costs (run first)
hermoso create --brand "Flourish" --product "protein pancakes" --format image
hermoso generate image --prompt "…" --ref ./product.png --wait
hermoso generate video --prompt "…" --duration 8 --wait
hermoso competitors flourish.com
hermoso research "longest-running protein-pancake ads"
```

Add `--json` to any command for machine output.

## 3. Claude skills — slash commands that wrap the CLI

`skills/` holds four installable skills: `hermoso-generate`, `hermoso-ad-from-brand`,
`hermoso-product-photoshoot`, `hermoso-research`.

```bash
cp -r skills/* ~/.claude/skills/
```

Then invoke `/hermoso-ad-from-brand an ad for flourish.com protein pancakes`.

## Configuration

| Env | Meaning |
| --- | --- |
| `HERMOSO_API_BASE` | The Hermoso API origin (default `http://localhost:3000` for development) |
| `HERMOSO_TOKEN` | Bearer token — required against the hosted app (rolling out) |
| `HERMOSO_PROFILE` | Brand-workspace id, for accounts with multiple brand profiles |

`mcp/http.mjs` is the hosted remote-connector transport (paste-a-URL into Claude.ai → Connectors). It ships in
this repo for transparency and refuses to mount without authenticated identity — no anonymous spend, ever.

## License

MIT © Hermoso
