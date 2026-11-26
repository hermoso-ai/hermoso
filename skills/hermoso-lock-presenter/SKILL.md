---
name: hermoso-lock-presenter
description: >-
  Keep the same person and the same voice across a whole Hermoso job: pick one saved presenter and one voice at the
  start, then pass exactly those to every render, voiceover, thumbnail and edit in the job, so a series, a week of
  posts or a set of ad variants never swaps the face or the voice halfway. Use when the user says "use the same
  person in all of them", "keep Sarah", "same voice as last time", "our spokesperson", or runs any multi-piece job
  that shows or voices a person. NOT for: a one-off clip with no person in it, or choosing who to cast in the first
  place when the user wants new options (generate them, then come back here to lock the pick).
argument-hint: "[who and what, e.g. 'Sarah in all five videos this week, same voice']"
allowed-tools: Bash(hermoso *) Bash(npx -y hermoso@0.1.684 *)
---

# Hermoso: lock the presenter

Pick the presenter and the voice once. Write them down. Pass the same two things to every call in the job. A job
that leaves the choice to each tool gets a new face from every render that casts its own, and a new voice from
every step that picks its own.

## Setup (once)
- Install the CLI once: `npm install -g hermoso@0.1.684`, then run every command as `hermoso …`, as written below. If you cannot install packages, run each one as `npx -y hermoso@0.1.684 …` instead (always with the version), but know that npx asks the npm registry on every single call, so an agent making many calls can be rate-limited by npm (an HTTP 429 from npm, before Hermoso is ever reached). No MCP server is needed.
- Sign in once: `npx -y hermoso@0.1.684 auth login` (opens a browser; nothing to paste). On a machine with no browser (a server, chatted over Telegram, Discord or WhatsApp): run `npx -y hermoso@0.1.684 auth login --device --no-wait`, send the user the link and short code it prints, and once they approve run `npx -y hermoso@0.1.684 auth login --device --resume`. No key needed. Only if nobody can open a link: the user creates a key at app.hermoso.ai under **MCP & CLI** and either sets it as the `HERMOSO_TOKEN` environment variable (nothing is stored) or pipes it to `npx -y hermoso@0.1.684 auth login --token -` (it reads the key from stdin, or asks for it without showing it). Never put the key itself on the command line, where it stays in shell history. No account yet? The user signs up at app.hermoso.ai (free to start). Never create an account, choose a plan or pay on the user's behalf unless they explicitly ask you to and approve the plan and its price.
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

## 1. Choose the presenter, once
- `list_creators` returns the brand's saved cast: each person's id, name, portrait link, whether consent for a real
  person is on file, extra pose plates, and their chosen or cloned voice. It also lists ready-made preset creators.
- The user picks one by name. Never pick for them when the cast has more than one person, and never generate a new
  person when a saved one fits.
- Nobody saved yet: offer the choices and let the user decide.
  - Their own face or a real person they have permission to use: `save_creator` with the photo's link, a `name`
    and `source: "upload"`. Using a real person's likeness needs their consent and a paid plan or credit pack.
  - A made-up person: render a portrait with `generate_image`, show it, then `save_creator` with `source:
    "generated"` after the user likes it.
  - A preset creator from `list_creators`: free to cast, nothing to save.
- `save_creator` also takes `voice` (the person's default voice name) and `look` (their usual wardrobe in words),
  which keeps the outfit steady between renders. `makeSheet: true` makes a character sheet so wide shots keep their
  full figure; it is paid, so quote it first.

## 2. Choose the voice, once
- If the creator has a saved voice, that is the voice. Otherwise pick one with the user:
  `hermoso_capabilities` lists the voice engines and their voices, and `generate_voice` with a single short line,
  the `engine` and the `voice` plays a sample (quote it with `dryRun: true`).
- Write the lock down where you will see it for the rest of the job:

```
PRESENTER LOCK
creator: <id from list_creators>   name: <name>
portrait: <portrait link>
voice: <voice name>   engine: <engine id, for generate_voice>
```

- For a lock that should outlast this conversation, `remember` it on the brand ("Our presenter is Sarah, voice
  Aria"). When you save a new creator, pass `voice` too, so `list_creators` shows it next time.

## 3. Pass the lock to every call
| step | what carries the lock |
|---|---|
| a finished video ad | `render_ad` with `creator` = the locked id, and `ttsVoice` = the locked voice when the plan has a voiceover |
| a talking clip on a video model | `generate_video` with `creator` and `speak` |
| an animated talking photo | `generate_avatar` with `image` = the portrait link and `voice` = the locked voice |
| a presenter episode | `make_explainer` with `format: "host_episode"` and `creator` |
| a narrated explainer or picture film | `make_explainer` with `voice` |
| a stitched multi-scene spot | `stitch_video` with `voice` |
| a voiceover on its own | `generate_voice` with the locked `engine` and `voice` |
| a voice laid over a finished video | `generate_voice` as above, then `post_edit` with a `music` op whose `track` is that audio link and `replace: true` |
| a thumbnail with the presenter in it | `make_thumbnail` with `faceImages` = [the portrait link] |
| a short in a ready format | `make_short` plans it, then `render_ad` with `creator` |

- A person filmed speaking on a video model speaks in a voice the model makes for them, which can differ between
  clips. If the user wants every clip in the locked voice, `change_voice` with the locked voice re-voices a
  finished clip and keeps the lip-sync. It is paid: quote it with `get_cost: true` and ask.

## 4. The lock holds until the user changes it
- A later instruction in the same job ("make this one a man", "try a different voice") is a change of presenter,
  not a detail of one render. Stop, confirm the new choice, write a new lock, and say which pieces already used the
  old one.
- A render that refuses the locked face (a model that cannot take a real person, a photo too unclear to cast)
  stops the job with the reason and nothing charged. Bring the choice to the user. Never cast someone else in
  their place to get past it.
- Before a render with a real person's photo, `face_check` with the portrait link says which video models take
  that face. It is free for a file or a Library item.

## 5. Report the lock with the results
End with the lock and where it was used, so the user can see nothing drifted:

```
Presenter: Sarah (saved creator), voice Aria
Used in: ad 1, ad 2, ad 3, the thumbnail. Not used in: the product-only slideshow (no person in it).
```
