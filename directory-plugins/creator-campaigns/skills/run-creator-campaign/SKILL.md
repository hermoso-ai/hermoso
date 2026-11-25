---
name: run-creator-campaign
description: >-
  Set up and run a creator campaign with Hermoso, where the brand pays creators for posts about it: write the brief,
  pick the payout model (per 1,000 verified views, per approved post, or a pool), create it as a draft, preview what
  creators see, go live with the user's yes, and invite creators with personal links. Use when the user says "start
  a creator campaign", "pay creators per view", "set up a UGC program", "invite these creators", or "pause / close
  my campaign". NOT for: finding creators (use find-creators) or reviewing submitted posts (use
  review-campaign-posts).
argument-hint: "[the product, platforms and budget, e.g. 'TikTok and Reels for our new flavour, $2,000 at $3 CPM']"
---

# Run a creator campaign

Creators join by link without a Hermoso account, post on their own channels and submit the links. The brand
approves each post, and approved posts earn under the campaign's payout model. Payouts are made in the Hermoso app
and paid through Stripe; nothing on this connection charges a card or sends money.

## Before you start
- This plugin connects the Hermoso Creator Campaigns server
  (`https://app.hermoso.ai/mcp?tools=directory-creators`). The first time one of its tools runs, sign in with your
  Hermoso account in the browser page that opens (in Claude Code, `/mcp` and then `hermoso-creator-campaigns`). No
  account yet: create one free at https://app.hermoso.ai.
- `read_creator_campaigns` lists the brand's campaigns and says whether payouts through Hermoso are switched on and
  the fee. Read it first, so you do not create a second campaign for the same thing.

## Step 1. The brief and the terms
Agree these with the user, in their words:
- the name, what the product is and what a good post shows (the brief), and the `platforms`;
- the payout model in `economics`: cpm (per 1,000 verified views, with a `budgetUsd`), flat (per approved post) or
  pool (a fixed amount split by views at close);
- the requirements: an ad disclosure (posts made for a campaign are paid partnerships), any hashtag or mention;
- the hold before earnings become payable (`holdDays`), the dates, any caps and the usage rights.
Show the whole set back as a short summary and get a yes.

## Step 2. Create it as a draft
`create_creator_campaign` with those fields. A draft is not live, nobody can join, and it commits no money.
`preview_creator_campaign` with `campaignId` returns 30-minute preview links for each screen a creator sees (the
join page, an invited creator's page, their campaign view). Share them so the user sees the campaign as a creator
will.

## Step 3. Go live, only with a yes
Say what going live means: creators can join and submit, and approved posts earn under the terms. Then, after an
explicit yes, `update_creator_campaign` with `campaignId` and `status` active.
- Later changes use the same tool. Once live, the budget can only go up. A change to pay, the hold or usage rights
  becomes a new terms version, and the reply says who it applies to: tell the user.
- Pausing stops new posts (tracking continues). Closing stops the join link (approved earnings stay payable).
  Closing and reopening need `confirm`: call once without it, show the user what the step does, and send
  `confirm` true only after their yes.

## Step 4. Invite creators
Hermoso sends nothing by itself unless the user asks; the user shares the links.
- An open join link: `creator_campaign_link` with `campaignId` (anyone with it can join; the previous open link
  stops working, so say so).
- Named creators: `creator_campaign_link` with `creators` (up to 25 rows, for example the saved shortlist from
  `list_swipefile`) or `bulk_invite_creators` (up to 100 names). Each gets a personal link and a ready-to-send
  message. Show the messages before the user sends them.
- Only when the user asks for Hermoso to email one creator: `email_campaign_creator` with `participantId` and
  `kind` (invite or link). At most three emails a day go to one creator.

## Step 5. Report
`read_creator_campaigns` with `campaignId` shows the creators, the posts waiting for review and the money held,
payable and paid. `creator_campaign_report` gives spend against budget, approved views, cost per 1,000 views and
each creator's earnings and payout status (`format` csv for a file). Report amounts exactly as returned.
