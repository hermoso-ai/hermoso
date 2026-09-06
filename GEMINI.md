# Hermoso

Hermoso is an AI ad studio you drive over MCP. This extension adds its tools to Gemini CLI so you can run a brand's marketing from the terminal.

## What it does

- Research the ads already winning: competitor teardowns, ad libraries across Meta, Google, LinkedIn and TikTok, organic search on TikTok, Instagram, YouTube, Reddit and Threads, creator search.
- Create finished, on-brand image and video ads: plan, render, remix, dub, reframe, upscale, stitch.
- Publish and schedule to the user's own channels: Meta, Instagram, Threads, X, LinkedIn, TikTok, YouTube, Pinterest, Bluesky, Telegram, Google Business, WhatsApp.
- Manage paid ads on nine platforms. Everything is created paused and read back before it is reported.

## Setup

1. Sign up at https://app.hermoso.ai and onboard a brand (one website is enough).
2. In the app, open Settings, then Agents and API, and create an agent key.
3. Install this extension. When Gemini CLI asks for the Hermoso agent key, paste it. It is stored as `HERMOSO_TOKEN` for the MCP server only.

## How to work

- Call `hermoso_capabilities` first when you need a model id, an exact credit cost or a live duration.
- Tools not in your list are one call away: `find_tools` to search by task, then `call_tool` to run one.
- Always show the exact copy and target before publishing anything, and state the credit cost before any render.
- A tool for a channel that is not connected means the channel is not connected yet; say to connect it under Settings, Connectors in the app.

Full tool reference: https://hermoso.ai/mcp
