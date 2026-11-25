---
name: find-creators
description: >-
  Find creators for a brand with Hermoso: search organic TikTok, Instagram Reels and YouTube for a niche, rank the
  creators who keep doing well there by median views and engagement, save the good ones to a shortlist, and track
  outreach (new, contacted, replied, booked, passed). Use when the user asks "find creators in <niche>", "who should
  we work with", "build me an influencer shortlist", or "mark @handle as contacted". NOT for: running the campaign
  itself (use run-creator-campaign).
argument-hint: "[a niche, product category or hashtag, e.g. 'home espresso' or '#skincareroutine']"
---

# Find and shortlist creators

Searching uses Hermoso credits; saving and updating the shortlist is free. Nothing is sent to any creator from here.

## Before you start
- This plugin connects the Hermoso Creator Campaigns server
  (`https://app.hermoso.ai/mcp?tools=directory-creators`). The first time one of its tools runs, sign in with your
  Hermoso account in the browser page that opens (in Claude Code, `/mcp` and then `hermoso-creator-campaigns`). No
  account yet: create one free at https://app.hermoso.ai.
- `get_brand` gives the saved brand (what it sells, its audience), and `hermoso_credits` the balance, both free.

## Procedure
1. **Agree the niche.** Use the words creators put in captions and hashtags, not the brand's own category name.
   Ask which platforms matter and any floor ("at least 20k median views").
2. **Search**: `find_creators` with `niche`, and `platforms`, `limit`, `minAvgViews` or `minEngagement` when the user
   gave them. Pass `get_cost` first to quote a large search. It returns each creator's handle, platform, post
   count, median views, engagement, a score and sample posts; the top rows also carry the public profile details
   the creator lists (bio link, business email or category).
3. **Show a shortlist**: a table of handle, platform, median views, engagement, how often they appear for the niche,
   and one sample post link. Say why each fits. Never pick for the user; they choose who goes on the list.
4. **Save the chosen ones**: `save_to_swipefile` with `collection` (for example "Creators: home espresso") and
   `items` set to the creator rows the user picked, as the search returned them. Saving again moves a row rather
   than duplicating it.
5. **Track outreach**: `list_swipefile` shows the saved creators with their key (for example tiktok:handle) and
   status. `update_saved_creator` with `key`, and `status` and/or `note` (deal terms, rate, what was sent), when
   the user tells you what happened. A note replaces the previous one.

## Notes
- Report views and engagement as returned. A number the platform hides is "not shown", never zero.
- Contact details are only what the creator published. Do not look for or guess private ones.
- When the user is ready to pay creators for posts, hand off to run-creator-campaign; its invite links can take
  these saved rows directly.
