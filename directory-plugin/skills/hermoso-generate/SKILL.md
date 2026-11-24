---
name: hermoso-generate
description: >-
  Generate on-brand ad creative with Hermoso (images, videos, talking-photo clips and multi-scene stitched videos)
  from a prompt, returning a served media URL. Use when the user asks to "generate / make / render an image or
  video ad", "create an ad", "make a product shot", "make a UGC video", or to turn a concept into finished creative
  with Hermoso. NOT for: pure research or competitor lookups (use hermoso-research), or editing a local image with
  another tool.
argument-hint: "[what to generate, e.g. 'a 9:16 video ad for our protein pancakes']"
---

# Hermoso: generate ad creative

Render images and videos with the Hermoso MCP tools. Always report the final **media URL**.

## Before you start
- This plugin connects the Hermoso MCP server (`https://app.hermoso.ai/mcp`). The first time a Hermoso tool runs,
  sign in with your Hermoso account in the browser page that opens (in Claude Code, `/mcp` and then `hermoso` shows
  the sign-in). No account yet: create one free at https://app.hermoso.ai.
- A tool this file does not name still exists: `find_tools` searches every Hermoso tool and `call_tool` runs any of
  them by name.
- The server cannot read files on the user's computer. Pass a public link, or turn a file into a link with
  `upload_file` (`url` for a public link, `dataUri` for a small file). Otherwise ask the user to upload it to their
  Library at app.hermoso.ai and share the link.

## Procedure
1. **When you need a specific model, run `hermoso_capabilities` first** (free). It lists the valid image and video
   model ids, their credit costs, aspect ratios, video durations and the recipe ids. Never guess a model id. To
   simply make something, skip it: the create tools pick a sound default when you name no model.
2. Pick a **high-quality default** (quality over cost is the house rule): for images prefer the model marked best;
   for product composites pass the real product image in `refImages`. For video, use a featured model and a
   sensible duration.
3. Generate:
   - Image: `generate_image` with `prompt` (the full prompt, including any on-image text), optional `refImages`,
     `model` and `aspectRatio` (for example `1:1`).
   - Video: `generate_video` with `prompt` (the shot), optional `refImage`, `durationSeconds`, `aspectRatio`
     (for example `9:16`), `model`, and `ttsScript` + `ttsVoice` for a voiceover. A person filmed saying a line:
     `speak`.
   - A finished video ad on the brand (timed shots, real product): `render_ad`, usually from `plan_ad`'s output.
   - Talking photo (a still that lip-syncs a script), only when the user asks for that look by name:
     `generate_avatar` with `image` and `script`.
   - Several scenes joined into one video: `stitch_video` with `scenes`.
4. Video, avatar and stitch renders are **jobs** that take a few minutes. When a tool returns a job id, poll
   `get_job` until it finishes, and never call the render done before then.
5. **Report the served URL** (for example `https://assets.hermoso.ai/...`), never a raw job id.

## Prompt craft
- Write concrete, sensory prompts: subject + setting + style, then the camera (lens such as 35mm or 85mm, the angle,
  the move), the light (rim light, soft window light, neon glow) and the medium (photograph, watercolour, 3D render).
- **Image to video:** the reference frame is already the first picture, so the prompt describes only the MOTION
  (the camera dollies in, steam rises, she turns to the window); never describe the still frame again.
- **Editing an image:** `edit_image`, or pass it in `refImages` and describe only what CHANGES ("make it a winter
  evening, warm window light"), never the whole picture again.
- Phrase what you want rather than what you do not: "tack sharp" instead of "no blur", "an empty beach" instead of
  "no people".
- **Confirm what each supplied image is for** before you use it: the product, a person to keep, or only a style to
  borrow. A style reference is studied, never copied: do not reproduce its people, logos or composition.
- **A model the user names stays in use** for follow-ups on the same piece of work. Do not switch to a cheaper or
  faster model unless the user asks for one.

## Notes
- A real product or logo reference makes the output product-accurate.
- Most render tools take `dryRun: true` (or `get_cost: true`) to quote the exact credits before spending. Say the
  cost before a paid render.
- If a render fails or times out, the error explains why; surface it plainly and offer to retry or pick a cheaper or
  faster model from `hermoso_capabilities`.
