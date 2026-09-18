# Hermoso

Hermoso is marketing on autopilot, run from your own AI agent. This extension adds four Hermoso skills to Gemini CLI, and they drive the `hermoso` CLI so you can run a brand's marketing from the terminal.

## What it does

- Research the ads already winning: competitor teardowns, ad libraries across Meta, Google, LinkedIn and TikTok, organic search on TikTok, Instagram, YouTube, Reddit and Threads, creator search.
- Create on-brand image and video ads: plan, render, remix, dub, reframe, upscale, stitch.
- Publish and schedule to the user's own channels: Facebook, Instagram, Threads, TikTok, YouTube, X, LinkedIn, Pinterest, Bluesky and Telegram. Message people on WhatsApp.
- Build and manage paid campaigns on Meta, Google Ads, TikTok, LinkedIn, Reddit, X, Pinterest, Snapchat, Microsoft Advertising, Apple Search Ads and ChatGPT Ads. Everything is created paused and read back before it is reported.

## Setup

Everything runs through the `hermoso` CLI in the shell, so no tool list is loaded into the session and nothing costs context until it runs.

1. Sign in once: `npx -y hermoso auth login` opens a browser. On a machine with no browser, create a key in the app under MCP & CLI and run `npx -y hermoso auth login --token <key>`.
2. No account yet? Sign up at https://app.hermoso.ai and onboard a brand (one website is enough).

## How to work

- Run commands as `npx -y hermoso <command>`, or `hermoso <command>` after `npm install -g hermoso`.
- `hermoso capabilities` lists model ids, exact credit costs and live durations.
- Every tool is reachable: `hermoso tools --search <what you want>` finds one, `hermoso tools <name>` prints its arguments, `hermoso call <name> --json '{...}'` runs it.
- Always show the exact copy and target before publishing anything, and state the credit cost before any render.
- A tool for a channel that is not connected means the channel is not connected yet; say to connect it under Settings, Connectors in the app.

Full tool reference: https://hermoso.ai/mcp
