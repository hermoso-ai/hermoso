---
name: hermoso-generate
description: >-
  Generate on-brand ad creative with Hermoso (images, videos, talking-avatar clips, and multi-scene
  stitched videos) from a prompt, returning a served media URL. Use when the user asks to "generate /
  make / render an image or video ad", "create an ad", "make a product shot", "make a UGC video", or to
  turn a concept into finished creative with Hermoso. NOT for: pure research/competitor lookups (use
  hermoso-research), or editing an existing local image with a non-Hermoso tool.
argument-hint: "[what to generate, e.g. 'a 9:16 video ad for our protein pancakes']"
allowed-tools: Bash(hermoso *) Bash(npx -y hermoso@0.1.690 *)
---

# Hermoso: generate ad creative

You drive the **Hermoso CLI** (`hermoso`) to render images and videos. Always report the final **media URL**.

## Setup (once)
- Install the CLI once: `npm install -g hermoso@0.1.690`, then run every command as `hermoso …`, as written below. If you cannot install packages, run each one as `npx -y hermoso@0.1.690 …` instead (always with the version), but know that npx asks the npm registry on every single call, so an agent making many calls can be rate-limited by npm (an HTTP 429 from npm, before Hermoso is ever reached). No MCP server is needed.
- Sign in once: `npx -y hermoso@0.1.690 auth login` (opens a browser; nothing to paste). On a machine with no browser (a server, chatted over Telegram, Discord or WhatsApp): run `npx -y hermoso@0.1.690 auth login --device --no-wait`, send the user the link and short code it prints, and once they approve run `npx -y hermoso@0.1.690 auth login --device --resume`. No key needed. Only if nobody can open a link: the user creates a key at app.hermoso.ai under **MCP & CLI** and either sets it as the `HERMOSO_TOKEN` environment variable (nothing is stored) or pipes it to `npx -y hermoso@0.1.690 auth login --token -` (it reads the key from stdin, or asks for it without showing it). Never put the key itself on the command line, where it stays in shell history. No account yet? The user signs up at app.hermoso.ai (free to start). Never create an account, choose a plan or pay on the user's behalf unless they explicitly ask you to and approve the plan and its price.
- For anything these steps do not cover: `hermoso tools --search <what you want>` finds the tool, `hermoso tools <name>` prints its arguments, `hermoso call <name> --json '{...}'` runs it. The CLI reaches every tool and costs no context until it runs.

## Ask first: purchases, payments, publishing and plan changes
`hermoso call` reaches every Hermoso tool, including tools that spend real money or put something in public. Before
any of these, show the user exactly what will happen (what, how much, which account) and wait for their explicit yes
in this conversation to that specific action:
- **Domains and purchases:** buying or renewing a domain (`buy_domain`), or anything else charged to a card.
- **Payments and refunds:** charges, subscriptions, payment links and payouts through the user's own payment accounts
  (`create_stripe_subscription`, `create_stripe_payment_link`, `pay_campaign_creators`, `creator_campaign_funds`),
  and every refund (`refund_stripe_charge`).
- **Publishing:** putting a page or site live (`publish_page`, `deploy_vercel_page`), and posting or scheduling
  anything to the user's accounts.
- **Credits and plans:** a paid render, generation or batch (quote it with `"get_cost": true` and run it with that
  price as `expected_credits`, as in the hermoso-approval-checkpoints skill); buying credits, upgrading the plan or
  turning on auto-reload (`buy_credits`, `upgrade_plan`, `set_auto_reload`). A search or lookup the user asked for is
  approved by the request itself; say what it cost when you report it.
- **Ad spend:** activating a campaign, ad set or ad, or raising a budget.

A yes covers only the action it answered, so the next purchase, payment or publish asks again. A budget or a skipped
checkpoint the user gave for a render never covers a purchase, a payment, a refund, a plan change or a publish. When
nobody is there to answer (a scheduled run), do none of these beyond what the user set up in advance for that
schedule: stop and report what is waiting for a yes.

## Procedure
1. **Always run `hermoso capabilities` first.** It lists the valid image/video **model ids**, their credit costs, aspect ratios, video durations, and the recipe ids. Never guess a model id.
2. Pick a **high-quality default** (quality over cost is the house rule): for images prefer the model marked `★best` (e.g. `nano-banana-2.1`); for product composites pass the real product image with `--ref`. For video, use a featured model and a sensible duration.
3. Generate:
   - Image: `hermoso generate image --prompt "<full prompt incl. any on-image text>" [--ref ./product.png] [--model <id>] [--aspect 1:1]`
   - Video: `hermoso generate video --prompt "<shot description>" [--ref ./frame.png] [--duration 8] [--aspect 9:16] [--model <id>] [--tts "<voiceover>"] [--voice Rachel] --wait`
   - Avatar (lip-sync): `hermoso generate avatar --image ./face.png --script "<words>" [--voice George] --wait`
   - Stitch (≥2 scenes): `hermoso generate stitch --scenes scenes.json --wait`
4. Video/avatar/stitch are **job-based**: keep `--wait` (default) so the command blocks and prints the final URL. If you don't wait, poll with `hermoso jobs get <id> --wait`.
5. **Report the served URL** (e.g. `https://assets.hermoso.ai/…`), never a raw job id. If the user wants the file, `hermoso fetch <url> --out name.png`.

## Prompt craft
- Write concrete, sensory prompts: subject + setting + style, then the camera (lens such as 35mm or 85mm, the angle, the move), the light (rim light, soft window light, neon glow) and the medium (photograph, watercolour, 3D render).
- **Image to video:** the `--ref` frame is already the first picture, so the prompt describes only the MOTION (the camera dollies in, steam rises, she turns to the window); never describe the still frame again.
- **Editing an image:** pass it as `--ref` and describe only what CHANGES ("make it a winter evening, warm window light"), never the whole picture again.
- Phrase what you want rather than what you do not: "tack sharp" instead of "no blur", "an empty beach" instead of "no people".
- **Confirm what each supplied image is for** before you use it: the product, a person to keep, or only a style to borrow. A style reference is studied, never copied: do not reproduce its people, logos or composition.
- **A model the user names stays in use** for follow-ups on the same piece of work. Do not switch to a cheaper or faster model unless the user asks for one, and do not downgrade because another model's options look simpler.

## Notes
- `--ref` accepts local file paths (read + sent as data) or URLs; a real product/logo ref makes the output product-accurate.
- Add `--json` to any command for machine-readable output.
- If a render fails or times out, the error explains why; surface it plainly and offer to retry or pick a cheaper/faster model from `hermoso capabilities`.
