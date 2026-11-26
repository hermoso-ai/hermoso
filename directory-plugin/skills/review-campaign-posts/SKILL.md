---
name: review-campaign-posts
description: >-
  Review what creators submitted to a Hermoso creator campaign: the creators waiting to join, the posts waiting for
  a decision with their views, authenticity score and flags (missing disclosure, hashtag or mention, hidden views),
  and an approve, reject or request-changes decision on each, made only by the user. Use when the user asks "any
  posts to review", "approve the good ones", "who wants to join my campaign", or "how is my creator campaign doing".
  NOT for: creating or changing the campaign (use run-creator-campaign).
argument-hint: "[optional: the campaign, e.g. 'the summer flavour campaign']"
---

# Review creators and posts

Approving a post makes it earn under the campaign's payout model (held, then payable after the hold). Rejecting it
cancels its unpaid earnings. The creator sees every decision and comment, and is emailed. So every decision is the
user's, made on the evidence shown here; Hermoso never approves or rejects on its own.

## How the server confirms a change
Every tool here that approves, rejects, removes, invites, emails a creator or changes a campaign runs in two steps.
The first call changes nothing and returns a preview of exactly what will change with a single-use confirmation code;
show it to the user, and after their yes call the same tool again with the same arguments plus `confirmationCode`. In
a client that supports confirmation forms the server asks the user in a form instead. Any change needs a new preview,
and a code works once and expires after 10 minutes.

## Before you start
- This plugin connects the Hermoso Creator Campaigns server
  (`https://app.hermoso.ai/mcp?tools=directory-creators`). The first time one of its tools runs, sign in with your
  Hermoso account in the browser page that opens (in Claude Code, `/mcp` and then `hermoso-creator-campaigns`). No
  account yet: create one free at https://app.hermoso.ai.
- `read_creator_campaigns` lists the campaigns with the number of posts waiting; with `campaignId` it lists the
  creators with the participant ids the creator review takes.

## Creators waiting to join
For a campaign with join approval, show each waiting creator (handle, platforms, followers or views as returned)
and let the user decide. Then `review_campaign_creator` with `participantId` and `action` (approve or deny). The
same tool suspends a creator (their posts stop counting), reinstates one, or removes one (earnings already approved
stay theirs); each is the user's call, stated back before you send it.

## Posts waiting for a decision
1. `list_campaign_posts` with `campaignId` and `status` set to pending_review.
2. Show each post: creator, platform, link, views as the platform reported them, the authenticity score with the
   reasons points were taken off, and every flag. A post with no ad disclosure is a paid partnership that does not
   say so: put that first, since the brand is responsible for it.
3. Recommend if asked, but let the user decide each one. Then `review_campaign_post` with `submissionId` and
   `action`:
   - approve: it earns under the payout model;
   - reject, with a `reason` the creator will read;
   - request_changes, with what to change (`atSecond` points at a moment in the video);
   - comment, for a note that changes nothing.
4. A post that came down early can be recorded as taken down, which cancels its unpaid earnings: call it once
   without `confirm` to see the preview, show it, and send `confirm` true only after the user's yes.

## Report
`creator_campaign_report` with `campaignId`: spend against budget, approved views, cost per 1,000 views, each
creator's posts, earnings and payout status, and the spread of authenticity scores. Report amounts exactly as
returned. Payouts themselves are made in the Hermoso app (https://app.hermoso.ai), not from here.
