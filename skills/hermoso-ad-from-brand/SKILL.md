---
name: hermoso-ad-from-brand
description: >-
  Make an on-brand ad for a company end-to-end with Hermoso: onboard the brand, write the concept +
  copy, then render the image or video. Use when the user says "make an ad for <company/website>", "build a
  launch ad for my brand", or gives a domain/brand and wants a complete ad, not just research. NOT for: just
  pulling competitor ads (use hermoso-research) or rendering from a prompt you already have (use hermoso-generate).
argument-hint: "[brand or website + what to advertise, e.g. 'an ad for yourbrand.com, our best-selling olive oil']"
allowed-tools: Bash(hermoso *) Bash(npx -y hermoso@0.1.683 *)
---

# Hermoso: full ad from a brand

Drive the **Hermoso CLI** to go from a brand to an on-brand ad in three steps. Report the final media URL.

## Setup (once)
- Install the CLI once: `npm install -g hermoso@0.1.683`, then run every command as `hermoso …`, as written below. If you cannot install packages, run each one as `npx -y hermoso@0.1.683 …` instead (always with the version), but know that npx asks the npm registry on every single call, so an agent making many calls can be rate-limited by npm (an HTTP 429 from npm, before Hermoso is ever reached). No MCP server is needed.
- Sign in once: `npx -y hermoso@0.1.683 auth login` (opens a browser; nothing to paste). On a machine with no browser (a server, chatted over Telegram, Discord or WhatsApp): run `npx -y hermoso@0.1.683 auth login --device --no-wait`, send the user the link and short code it prints, and once they approve run `npx -y hermoso@0.1.683 auth login --device --resume`. No key needed. Only if nobody can open a link: the user creates a key at app.hermoso.ai under **MCP & CLI** and either sets it as the `HERMOSO_TOKEN` environment variable (nothing is stored) or pipes it to `npx -y hermoso@0.1.683 auth login --token -` (it reads the key from stdin, or asks for it without showing it). Never put the key itself on the command line, where it stays in shell history. No account yet? The user signs up at app.hermoso.ai (free to start). Never create an account, choose a plan or pay on the user's behalf unless they explicitly ask you to and approve the plan and its price.
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
1. **Onboard the brand** (skip if the user already gave full brand details):
   - From a website: `hermoso brand draft --domain <domain> --json`
   - No website: `hermoso brand draft --description "<what they sell, audience, voice>" --json`
   - Influencer/social: `hermoso brand draft --social <handle> --platform instagram --json`
   Keep the returned brand name/category for the next steps.
2. **Plan the concept + copy:** `hermoso create --brand "<name>" --product "<what to advertise + angle>" --format <auto|image|video> --json`
   - Read the result: it has the `concept`, `copy[]` (headline/primary/cta), and the resolved **render model id** (`imodel` for images, `vmodel` for video). Tell the user the concept + headline.
3. **Render**, using the model the create step resolved (or run `hermoso capabilities` for options):
   - Image: `hermoso generate image --prompt "<image_concept.prompt from step 2, it already bakes in the copy>" --model <imodel> --aspect 1:1`
   - Video: `hermoso generate video --prompt "<from the storyboard>" --model <vmodel> --aspect 9:16 --duration 8 --wait`
4. **Report the served URL.** Offer one concrete next step (a punchier hook, a different aspect ratio, or a variation).

## Checkpoints before anything paid
Every paid render waits for three yeses, one at a time (the hermoso-approval-checkpoints skill has the detail):
1. **The script.** Show the concept, the copy and, for a video, the timed shot list in full. Edits come back here.
2. **The pictures.** Show what the render will be built from (the image prompt and the product photo, or the
   stills) and let the user pick.
3. **The price.** Quote the tool that renders with `hermoso call <name> --json '{..., "get_cost": true}'`, show the
   number, and run only after a yes, adding `"expected_credits"` (the quote) and an `"idempotency_key"` you reuse
   on any retry.
If the user says to skip a checkpoint or gives a budget, do that, and still say what you are spending.

## Notes
- **Test hooks before formats.** For a test batch, try four different hooks in one format before one hook in four formats: the opening decides performance more than the format does.
- **Copy a reference ad OR compose from a hook and a setting, never both at once.** When the user hands you an ad to model (a link or a file), follow its structure; when they pick a hook and a scene, build from those; mixing the two blurs both.
- Formats are not interchangeable: a phone-shot UGC clip and a polished broadcast-style spot read as different brands, so do not mix them in one campaign unless that is the intent.
- If the brand has a real product photo and the ad features that product, pass it with `--ref ./product.png` on the image step so the packaging is accurate.
- Quality over cost: prefer the resolved/best model unless the user asks for cheap/fast.
- Renders run on Hermoso's hosted API and come back as served URLs; `hermoso fetch <url> --out <file>` saves one to disk.
