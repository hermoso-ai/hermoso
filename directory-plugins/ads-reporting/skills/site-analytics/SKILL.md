---
name: site-analytics
description: >-
  Read the user's website analytics with Hermoso: Google Analytics 4 traffic and conversions by source, campaign and
  landing page, Google Search Console queries and pages, and Keyword Planner search volumes, so ad results can be
  checked against what reached the site. Use when the user asks "where does my traffic come from", "which campaign
  drove sales on the site", "what do people search to find us", or "how many people search for <keyword>". NOT for:
  ad-platform numbers (use ads-report).
argument-hint: "[the question and the window, e.g. 'which sources converted last month']"
---

# Website analytics

Every tool here only reads. Nothing on the site, the property or any account changes, and every read is free.

## Before you start
- This plugin connects the Hermoso Ads Reporting server (`https://app.hermoso.ai/mcp?tools=directory-reports`). The
  first time one of its tools runs, sign in with your Hermoso account in the browser page that opens (in Claude
  Code, `/mcp` and then `hermoso-ads-reporting`). No account yet: create one free at https://app.hermoso.ai.
- Google Analytics and Search Console are connected in the Hermoso app (https://app.hermoso.ai/?tab=connectors),
  where the user also picks which property each brand may read. An empty list below means no property has been
  picked for this brand yet: send the user to that link rather than reporting "no traffic".

## Google Analytics 4
1. `list_analytics_properties` gives the numeric property id each report needs (not the G- measurement id).
2. `analytics_report` with `property`, `metrics` and `dimensions`. Useful pairs:
   - where visits come from: sessions and conversions by sessionSource and sessionMedium;
   - which ad campaign drove results: conversions and totalRevenue by sessionCampaignName;
   - which pages land people: sessions and conversions by landingPage.
   Dates default to the last 28 days; `compare` set to previous_period adds the earlier period and the change.
3. Sampled or thresholded data is noted in the reply; say so next to the numbers it affects.

## Google Search Console
1. `list_search_console_sites` gives the exact `siteUrl` (sc-domain:example.com or https://example.com/).
2. `search_console_performance` with `siteUrl`, `startDate`, `endDate` and `dimensions` (query for the words people
   searched, page for the pages that won the clicks). Final data lags 2 to 3 days and anonymised queries are
   withheld, so the rows are the top ones, not the total.

## Search volume
`google_ads_keyword_ideas` with `keywords` (or a page `url`) returns average monthly searches, competition and
top-of-page bid estimates. It needs a connected Google Ads account. Never quote a volume you did not read.

## Report
- Answer the question first, then the table it came from, with the window and the property or site named.
- Ad platforms and analytics count conversions differently (attribution windows, view-through, cross-device). Show
  both numbers side by side and say why they differ; never add them together.
- A read that failed is "could not read", never zero.
