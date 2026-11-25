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
---

# Hermoso: setup check

A read-only health check. It looks at the four things every Hermoso job leans on and tells the user, in plain
words, what is ready and what to fix first. It never changes anything on its own, and every call in it is free.

## Before you start
- This plugin connects the Hermoso MCP server (`https://app.hermoso.ai/mcp`). The first time a Hermoso tool runs,
  sign in with your Hermoso account in the browser page that opens (in Claude Code, `/mcp` and then `hermoso` shows
  the sign-in). No account yet: create one free at https://app.hermoso.ai.
- A tool this file does not name still exists: `find_tools` searches every Hermoso tool and `call_tool` runs any of
  them by name.
- The server cannot read files on the user's computer. Pass a public link, or turn a file into a link with
  `upload_file` (`url` for a public link, `dataUri` for a small file). Otherwise ask the user to upload it to their
  Library at app.hermoso.ai and share the link.

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
