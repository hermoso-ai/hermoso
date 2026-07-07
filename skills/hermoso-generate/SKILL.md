---
name: hermoso-generate
description: >-
  Generate on-brand ad creative with Hermoso — images, videos, talking-avatar clips, and multi-scene
  stitched videos — from a prompt, returning a served media URL. Use when the user asks to "generate /
  make / render an image or video ad", "create an ad", "make a product shot", "make a UGC video", or to
  turn a concept into finished creative with Hermoso. NOT for: pure research/competitor lookups (use
  hermoso-research), or editing an existing local image with a non-Hermoso tool.
argument-hint: "[what to generate — e.g. 'a 9:16 video ad for our protein pancakes']"
allowed-tools: Bash
---

# Hermoso — generate ad creative

You drive the **Hermoso CLI** (`hermoso`) to render images and videos. Always report the final **media URL**.

## Setup (once)
1. Ensure the CLI is available. From the Hermoso repo: `node bin/hermoso.mjs version` (or `hermoso version` if globally installed via `npm i -g`).
2. `hermoso auth login --url https://app.hermoso.ai --token <your agent key>` — create a key in the app under **MCP & CLI**. (Self-running the app? Use `--url http://localhost:3000`, no token.)

## Procedure
1. **Always run `hermoso capabilities` first.** It lists the valid image/video **model ids**, their credit costs, aspect ratios, video durations, and the recipe ids. Never guess a model id.
2. Pick a **high-quality default** (quality over cost is the house rule): for images prefer the model marked `★best` (e.g. `nano-banana-pro`); for product composites pass the real product image with `--ref`. For video, use a featured model and a sensible duration.
3. Generate:
   - Image: `hermoso generate image --prompt "<full prompt incl. any on-image text>" [--ref ./product.png] [--model <id>] [--aspect 1:1]`
   - Video: `hermoso generate video --prompt "<shot description>" [--ref ./frame.png] [--duration 8] [--aspect 9:16] [--model <id>] [--tts "<voiceover>"] [--voice Rachel] --wait`
   - Avatar (lip-sync): `hermoso generate avatar --image ./face.png --script "<words>" [--voice George] --wait`
   - Stitch (≥2 scenes): `hermoso generate stitch --scenes scenes.json --wait`
4. Video/avatar/stitch are **job-based** — keep `--wait` (default) so the command blocks and prints the final URL. If you don't wait, poll with `hermoso jobs get <id> --wait`.
5. **Report the served URL** (e.g. `https://assets.hermoso.ai/…`), never a raw job id. If the user wants the file, `hermoso fetch <url> --out name.png`.

## Notes
- `--ref` accepts local file paths (read + sent as data) or URLs; a real product/logo ref makes the output product-accurate.
- Add `--json` to any command for machine-readable output.
- If a render fails or times out, the error explains why; surface it plainly and offer to retry or pick a cheaper/faster model from `hermoso capabilities`.
