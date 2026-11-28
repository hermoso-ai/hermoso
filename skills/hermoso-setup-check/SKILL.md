---
name: hermoso-setup-check
description: >-
  Check that a Hermoso account is ready to work before a job starts: the brand profile, the connected channels and
  which accounts this brand may post to, the credit balance and plan, and the default settings (language, posting
  times and time zone, saved presenter). Reads only, spends nothing, and ends with a short list of exactly what to
  fix and where. Use when the user says "is my Hermoso set up", "check my setup", "why did my post fail to schedule",
  "what do I still need to connect", or before a first run of any other Hermoso skill. NOT for: making or posting
  anything (use the skill for that job once this one is clean).
argument-hint: "[optional: the job you are about to run, e.g. 'blog plus YouTube for this week']"
allowed-tools: Bash(hermoso *) Bash(npx -y hermoso@0.1.692 *)
---

# Hermoso: setup check

A read-only health check. It looks at the four things every Hermoso job leans on and tells the user, in plain
words, what is ready and what to fix first. It never changes anything on its own, and every call in it is free.

## Setup (once)
- Install the CLI once: `npm install -g hermoso@0.1.692`, then run every command as `hermoso …`, as written below. If you cannot install packages, run each one as `npx -y hermoso@0.1.692 …` instead (always with the version), but know that npx asks the npm registry on every single call, so an agent making many calls can be rate-limited by npm (an HTTP 429 from npm, before Hermoso is ever reached). No MCP server is needed.
- Sign in once: `npx -y hermoso@0.1.692 auth login` (opens a browser; nothing to paste). On a machine with no browser (a server, chatted over Telegram, Discord or WhatsApp): run `npx -y hermoso@0.1.692 auth login --device --no-wait`, send the user the link and short code it prints, and once they approve run `npx -y hermoso@0.1.692 auth login --device --resume`. No key needed. Only if nobody can open a link: the user creates a key at app.hermoso.ai under **MCP & CLI** and either sets it as the `HERMOSO_TOKEN` environment variable (nothing is stored) or pipes it to `npx -y hermoso@0.1.692 auth login --token -` (it reads the key from stdin, or asks for it without showing it). Never put the key itself on the command line, where it stays in shell history. No account yet? The user signs up at app.hermoso.ai (free to start). Never create an account, choose a plan or pay on the user's behalf unless they explicitly ask you to and approve the plan and its price.
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

## What it checks, in this order

Run the reads below, then write one report. Run every read even when an early one finds a problem, so the user
gets the whole list at once instead of one fix per run.

### 1. Which brand you are working in
- `list_brands`: every brand on the account and which one is active. An agency account holds many, so say which
  brand this check is about. If the user meant another one, `use_brand` switches only after they name it.
- `get_brand`: `hasBrand` false means nothing is saved yet. Otherwise look for the fields every job reads: name,
  website, what they sell, audience, voice, logo, colours and fonts.
- For a brand that sells a physical product, `list_product_photos`: no real product photo means a render has to
  invent the packaging.

### 2. Channels
- `list_connectors`: what is connected and what is not. It also flags a connection whose permissions are out of
  date, which no retry can fix: the user reconnects it.
- `list_connector_accounts` with no `provider`: every account each connection can act as, and which of them THIS
  brand is allowed to use. A connected account that is not ticked for the brand cannot be posted to or spent from.
- If the user named a job, check the channels that job needs. A blog needs WordPress, dev.to, Hashnode, or a
  Shopify, Webflow or Wix blog. A LinkedIn company Page also needs a Page id (`list_linkedin_pages`).

### 3. Credits and plan
- `hermoso_credits`: the balance, the posting allowance on this plan and how much of it is used, and the
  one-sentence rule of what costs credits.
- `billing_status`: the plan, whether auto-reload is on, and whether this login may change billing (a team member
  sees the plan and the balance only, so never tell a member there is no card on file).
- `get_credit_limits`: a monthly cap on this brand or this person can stop a job that the balance would cover.
- Compare against the job, if one was named: quote the paid steps with `dryRun: true` or `get_cost: true` on the
  tools that will run, never from memory, and say whether the balance covers them.

### 4. Defaults
- `get_settings`: the language every ad and caption is written in, the theme, which emails are on, and zero
  content retention.
- `manage_post_queues` with `action: "list"`: the brand's posting times and time zone. With no times saved,
  `schedule_post` with `useQueue: true` has no slot to fill, and an `at` time with no time zone is read as UTC.
- `list_creators`: the saved presenter and their voice, if the brand uses one. Optional, so list it as a choice,
  not a problem.

## The report

One short message, in this shape:

```
Ready: brand profile, Instagram, X, 1 posting queue (Mon to Fri 09:00 New York)
Fix first:
1. LinkedIn is connected but no company Page is ticked for this brand.
   Fix: open https://app.hermoso.ai/?tab=connectors, LinkedIn, tick the Page. (Or tell me which Page and I will tick it.)
2. No posting times saved, so "just queue it" has nowhere to go.
   Fix: tell me the days and times and I will save them, or set them at https://app.hermoso.ai/?tab=schedule.
Could not read: Search Console (the read failed, so this says nothing either way).
```

- Order the fixes by what blocks the user's job first, then by how quick they are.
- Every fix carries one exact action: a link, or the one call you will make once they say yes.
- A read that failed is "could not read", never "missing" and never "zero". Say which read and try it once more
  before reporting it.
- Keep secrets out of the report: never print a key, a token, an app password or a card number, even if a tool
  returned one.

## Links for fixes
- Brand profile: https://app.hermoso.ai/?tab=brand
- Connections and which accounts a brand may use: https://app.hermoso.ai/?tab=connectors
- Plan, credits and auto-reload: https://app.hermoso.ai/?tab=billing
- Language and emails: https://app.hermoso.ai/?tab=settings
- Posting times: https://app.hermoso.ai/?tab=schedule
- Saved presenters: https://app.hermoso.ai/?tab=creators
- Agent keys for the CLI: https://app.hermoso.ai/?tab=api-keys

## Fixing, only with a yes
This check changes nothing by itself. When the user says yes to a fix you can make from here, make exactly that one:
- No brand saved: `draft_brand` with `domain` (or `description`, or `socialHandle` and `platform`).
- A brand field is wrong or empty: `update_brand` with only that field.
- A real product photo: `set_product_image` with the photo's link.
- A connection that signs in with a key (WordPress, dev.to, Hashnode, Bluesky, Telegram and others):
  `connect_connector` with the fields the user gives you. A connection that signs in with a browser (Meta, Google,
  LinkedIn, X, TikTok, YouTube) is the user's click at the connectors link.
- Which account a brand uses: `set_connector_accounts`, with the account the user picked, never a guess.
- Posting times: `manage_post_queues` with `action: "save"`, `name: "Default"`, `slots` and `timezone`.
- Language: `update_settings`.
- Then run the reads that changed again and show the new result, so "fixed" is something the user saw.
