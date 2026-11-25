---
name: campaign-analyst
description: >-
  Read a paid-ads account like an analyst with Hermoso: turn the last 14 days of campaign results from the user's
  connected ad accounts into what to scale, what to pause, what to fix and what to test next, with a data floor
  that refuses a verdict on too little delivery. Use when the user asks "what should I change in my ads", "which
  campaigns should I pause", "where should I move budget", or "what should I test next". NOT for: making the
  change (nothing here changes an account; the user applies it in the ad platform or the Hermoso app).
argument-hint: "[the goal and window, e.g. 'lowest cost per purchase, last 14 days']"
---


# Campaign analyst — scale, pause, fix, test next

Most ad reporting answers "what happened". The only useful question is "what do I change on Monday". This is the
method, and the rules that stop it producing confident nonsense.

## The table comes first
Put every campaign (or ad set, or ad) in ONE table, whatever platform it came from, with the same columns:
spend · impressions · clicks · CTR · CPC · conversions · CPA · ROAS · frequency. Two rules make the table honest:

1. **Recompute every ratio from its parts.** Platforms disagree about whether CTR is a fraction or a percentage
   and whether spend is in whole currency or millionths. CPA is spend ÷ conversions, computed by you, every time.
2. **A metric the platform does not publish is UNMEASURED, never 0.** Write it as unmeasured and say so in the
   summary. A zero in a column nobody measured is the single most common way an ad report lies.

Write the platform's own conversion definition next to its rows. "48 conversions" means something different on
each platform, and a cross-platform CPA comparison is only honest when both definitions are on the page.

## The data floor — the rule that separates analysis from noise
Decide the minimums BEFORE you look, state them in the answer, and hold to them. A workable set:

- 1,000 impressions, 50 clicks and a floor of real spend before a row can be judged at all.
- 10 conversions before you compare its CPA to anything.
- A row with **zero** conversions is only a loser once it has spent about two account CPAs; a row with a few
  conversions, once it has spent about two account CPAs for each conversion it produced, plus one.

Everything below the floor goes in an **insufficient data** bucket with what it lacks and what to wait for. It is
never "pause it" — killing an under-delivered row is how a winner gets buried before it ever gets a chance.

**The asymmetry that matters:** the evidence needed to STOP spending is not the evidence needed to spend MORE. A
row that has burned five account CPAs for one conversion is a measured loser at any conversion count. The same row
can never be called a winner on that data.

## The other four rules
- **A platform you could not read is named as unreadable.** Its numbers are missing, not zero, and no budget moves
  away from it on the strength of an absence.
- **Learning phase.** A Meta ad set still calibrating is not a verdict, and editing it restarts the learning. Leave
  it alone and say when to look again.
- **Days are the account's own days.** Every platform cuts its window on its own midnights. Never present two
  platforms' windows as hour-aligned.
- **Do not pause what is already paused,** and if the best row in the table is switched off, say plainly that the
  recommendation is to switch it back on.

## What a recommendation must contain
The row, its own numbers as evidence, the reason in one or two sentences, and the concrete next move with the
number in it ("raise the daily budget from 25 to 40 and re-read CPA in 3 days"). A recommendation that cites a
number not in the table is the failure mode to watch for — check each one back against the row before you send it.

## What a test must contain
One variable (creative, audience, bid, budget, placement, landing page or offer), a hypothesis the numbers already
support, a success metric WITH a number, a budget and a duration. "Test new creative" is not a test.

## Doing it with Hermoso
Every tool on this connection only reads, so the analysis never touches the account.

- This plugin connects the Hermoso Ads Reporting server (`https://app.hermoso.ai/mcp?tools=directory-reports`). The
  first time one of its tools runs, sign in with your Hermoso account in the browser page that opens (in Claude
  Code, `/mcp` and then `hermoso-ads-reporting`). No account yet: create one free at https://app.hermoso.ai.
- Build the table with the ads-report skill: `list_connector_accounts` for the accounts this brand may read, then
  each platform's list tool for statuses and its report tool for the numbers (`meta_insights`, `google_ads_report`,
  `linkedin_ads_report`, `tiktok_ads_report`, `microsoft_ads_report`, `reddit_ads_report`, `pinterest_ads_report`,
  `x_ads_report`, `openai_ads_report`). Read at the level the decision is made: campaign for budget, ad set or ad
  group for audience, ad for creative.
- The status columns come from the list tools (`list_meta_ads`, `list_google_ads_campaigns` and the others), so a
  paused or rejected row is shown as paused or rejected, and a row the platform says is not serving says why.
- For a search campaign, `google_ads_keyword_ideas` gives monthly search volume for the next keywords to test.
- Then write the four lists (scale, pause, fix, test next) plus the insufficient-data bucket, with each row's own
  numbers as the evidence. Applying a recommendation is the user's call, made in the ad platform or at
  https://app.hermoso.ai. Say exactly what to change and where, with the number in it.
