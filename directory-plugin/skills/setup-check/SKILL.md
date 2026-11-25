---
name: setup-check
description: >-
  Check that a Hermoso workspace is ready to post before a job starts: the brand profile, the connected channels and
  which accounts this brand may post to, the boards, Pages and TikTok posting options each channel needs, and what is
  already on the calendar. Reads only, changes nothing, and ends with a short list of exactly what to fix and where.
  Use when the user says "is my Hermoso set up", "check my setup", "why did my post fail to schedule", "what do I
  still need to connect", or before a first run of any other skill in this plugin. NOT for: posting anything (use
  approval-checkpoints and the posting tools once this one is clean).
argument-hint: "[optional: the job you are about to run, e.g. 'a week of posts on LinkedIn and Instagram']"
---

# Setup check

A read-only health check. It tells the user, in plain words, what is ready and what to fix first. Every call in it
is free and none of them changes anything.

## Before you start
- This plugin connects the Hermoso Social Scheduler server (`https://app.hermoso.ai/mcp?tools=directory-scheduler`).
  The first time one of its tools runs, sign in with your Hermoso account in the browser page that opens (in Claude
  Code, `/mcp` and then `hermoso-social-scheduler`). No account yet: create one free at https://app.hermoso.ai.

## What it checks, in this order
Run every read below, even when an early one finds a problem, so the user gets the whole list at once.

### 1. The brand
- `get_brand`: hasBrand false means no brand profile is saved yet. Otherwise note the name, website, voice and
  audience, which every caption leans on.

### 2. Channels and accounts
- `list_connectors`: what is connected and what is not. It also flags a connection whose permissions are out of
  date, which no retry fixes: the user reconnects it.
- `list_connector_accounts` with `provider` for each connected channel: every account it can act as, and which of
  them THIS brand may use. A connected account that is not ticked for the brand cannot be posted to.
- What each channel needs before a post can go out:
  - Facebook, Instagram, Threads: `list_meta_pages` for the Page ids (with several Pages, a post needs `pageId`).
  - LinkedIn company Page: `list_linkedin_pages` for the id (without it a post goes to the person's own profile).
  - Pinterest: `list_pinterest_boards`, since every Pin needs a board the user picked.
  - TikTok: `tiktok_creator_info` for the privacy levels the account may use and its maximum video length.

### 3. The calendar
- `list_scheduled`: what is queued and what already went out, with any channel that failed on a past post and why.
- A post with `useQueue` takes the brand's next saved posting time. Posting times are saved in the Hermoso app
  (https://app.hermoso.ai/?tab=schedule); if a queued post was refused for having no free slot, that is the fix.

## The report
One short message, in this shape:

```
Ready: brand profile, Instagram, X, LinkedIn (personal profile)
Fix first:
1. LinkedIn is connected but no company Page is ticked for this brand.
   Fix: open https://app.hermoso.ai/?tab=connectors, LinkedIn, and tick the Page.
2. Pinterest has no board yet, so a Pin has nowhere to go.
   Fix: create a board on Pinterest, then run this check again.
Could not read: TikTok posting options (the read failed, so this says nothing either way).
```

- Order the fixes by what blocks the user's job first, then by how quick they are.
- Every fix carries one exact action: a link or a step.
- A read that failed is "could not read", never "missing" and never zero. Try it once more before reporting it.
- Keep secrets out of the report: never print a key or a token, even if a tool returned one.

## Links for fixes
- Brand profile: https://app.hermoso.ai/?tab=brand
- Connections and which accounts a brand may use: https://app.hermoso.ai/?tab=connectors
- Posting times: https://app.hermoso.ai/?tab=schedule
