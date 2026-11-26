---
name: hermoso-approval-checkpoints
description: >-
  Run any paid Hermoso job in three approved steps: the user signs off the script, then the pictures, then the
  render and its price, and nothing paid runs before the yes for that step. Use when the user says "check with me
  before you render", "show me the script first", "don't spend anything until I approve", or for any job that ends
  in a paid video, explainer, thumbnail set or batch of images. Other Hermoso skills follow the same three steps.
  NOT for: free reads, research, or posting and scheduling (those ask for a yes on the exact post instead).
argument-hint: "[the job to run with checkpoints, e.g. 'a 30-second video ad for our new flavour']"
allowed-tools: Bash(hermoso *) Bash(npx -y hermoso@0.1.685 *)
---

# Hermoso: approval checkpoints

Paid work happens in three steps, and each step waits for the user. The point is simple: the user sees the words
before any picture is made, sees the pictures before any video is made, and sees the price before anything is
billed. A change at step one costs a rewrite. The same change after the render costs a whole new render.

## Setup (once)
- Install the CLI once: `npm install -g hermoso@0.1.685`, then run every command as `hermoso …`, as written below. If you cannot install packages, run each one as `npx -y hermoso@0.1.685 …` instead (always with the version), but know that npx asks the npm registry on every single call, so an agent making many calls can be rate-limited by npm (an HTTP 429 from npm, before Hermoso is ever reached). No MCP server is needed.
- Sign in once: `npx -y hermoso@0.1.685 auth login` (opens a browser; nothing to paste). On a machine with no browser (a server, chatted over Telegram, Discord or WhatsApp): run `npx -y hermoso@0.1.685 auth login --device --no-wait`, send the user the link and short code it prints, and once they approve run `npx -y hermoso@0.1.685 auth login --device --resume`. No key needed. Only if nobody can open a link: the user creates a key at app.hermoso.ai under **MCP & CLI** and either sets it as the `HERMOSO_TOKEN` environment variable (nothing is stored) or pipes it to `npx -y hermoso@0.1.685 auth login --token -` (it reads the key from stdin, or asks for it without showing it). Never put the key itself on the command line, where it stays in shell history. No account yet? The user signs up at app.hermoso.ai (free to start). Never create an account, choose a plan or pay on the user's behalf unless they explicitly ask you to and approve the plan and its price.
- Every tool is reachable, including the ones this file does not name: `hermoso tools --search <what you want>` finds the tool, `hermoso tools <name>` prints its arguments, `hermoso call <name> --json '{...}'` runs it. A tool you cannot see is still callable, so a name you do not recognise never means a missing feature.
- Every tool named below runs as `hermoso call <name> --json '{...}'`, for example `hermoso call list_connectors --json '{}'`. `hermoso tools <name>` prints a tool's arguments before you call it.

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

## The three checkpoints

### Checkpoint 1: the script
Write the words first and show all of them: the spoken lines, the on-screen text, the caption, and for a video
the shot list with timings.
- `plan_ad` writes the concept, the copy and a timed storyboard for an ad (it bills a small writing cost). For a
  short in a known format, `make_short` plans it without rendering. For any other writing, `generate_text`.
- Show the script in full, not a summary of it. Ask: "Happy with this script, or what should change?"
- An edit comes back to this checkpoint with the new version shown in full. Never carry an unapproved line forward.

### Checkpoint 2: the pictures
Make or pick the stills the render will be built from, and show them before any video is made.
- An ad: `render_ad` with `foundations: "choose"` paints only the foundations (the look and the setting) and
  returns them without a video. The user picks one; pass `moodboardPick` and `foundationImages` on the real render
  so the approved pictures are reused rather than painted again.
- A slideshow, carousel or picture film: render the stills with `generate_image` (or take the user's own photos
  and the brand's saved product photos from `list_product_photos`) and show them as a numbered list.
- A thumbnail: `make_thumbnail` returns its variants. The user picks one before it goes anywhere.
- A presenter episode: `make_explainer` with `format: "host_episode"` returns a low-resolution draft first. The HD
  version is a separate call with `fromDraft`, made only after the user approves the draft.
- Ask the user to pick or change by number. A change means a new still of that one picture, not the whole set.

### Checkpoint 3: the render and its price
Quote, show the number, wait for a yes, then render with the quote attached.
- Get the price without spending: `get_cost: true` on any paid tool returns its price and runs nothing. On
  `render_ad`, `generate_video`, `make_explainer`, `make_thumbnail` and `post_edit`, `dryRun: true` also shows
  what the render will be (single take or several, the model, the act lengths). Quote every paid call in the job
  and show the total.
- Say what the price buys: the length, the size, how many takes.
- After the yes, send each call with `expected_credits` set to the price `get_cost` returned. If the live price
  moved, the call is refused and nothing is billed, so you come back to the user instead of spending a different
  amount. A step billed at its actual cost (a writing step, subtitles) answers `get_cost` with "no fixed price":
  say so, and run it without `expected_credits`.
- Send an `idempotency_key` chosen once per render and resent unchanged on any retry: the same key never buys twice.
- Renders run in the background: poll `get_job` until it is done and show the result as it came back.

## What counts as a yes
- An explicit yes to THIS checkpoint ("yes", "go", "approved", "render it"). A yes to the script is not a yes to
  the price.
- Silence, "nice", or a question is not a yes. Answer the question and ask again.
- The user may approve two checkpoints in one message ("script is fine, go ahead and render at that price"). Then
  run both, and still show the quote first if they have not seen it.
- The user may also say to skip the checkpoints for this job, or set a budget ("anything under the quote you gave
  me last time is fine"). That is their call: honour it, and still state the price you are spending.

## When nobody is watching
In a scheduled run, or any run nobody is watching, there is nobody to say yes. Do checkpoint 1 (and checkpoint 2 when it is free),
then stop and report what is waiting for approval with its quote. Render only inside a budget the user set for
the schedule.

## After the render
- Show the finished file as it came back. Do not review, critique or re-render it on your own: the user watches it
  and decides. If they ask for a change, the smallest fix wins (`post_edit`, `fix_beat`, `edit_image`) and it goes
  through checkpoint 3 again with its own quote.
- Publishing is a separate yes. Show the exact caption, the account and the time before `schedule_post` or any
  `post_to_*` call.
