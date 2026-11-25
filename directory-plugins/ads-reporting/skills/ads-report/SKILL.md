---
name: ads-report
description: >-
  Pull one honest performance report across the user's own connected ad accounts with Hermoso: Meta, Google Ads,
  LinkedIn, TikTok, Microsoft Advertising, Reddit, Pinterest, X and ChatGPT Ads, side by side in one table, in each
  account's own currency and dates. Use when the user asks "how are my ads doing", "weekly ads report", "spend and
  results across platforms", "which campaign is best", or "why is this campaign not delivering". NOT for: changing a
  budget, status or ad (nothing here changes anything), or website traffic (use site-analytics).
argument-hint: "[the window and the platforms, e.g. 'last 14 days, Meta and Google']"
---

# Cross-platform ads report

Every tool here only reads. Nothing is created, edited, activated, paused or deleted, and no budget is changed.

## Before you start
- This plugin connects the Hermoso Ads Reporting server (`https://app.hermoso.ai/mcp?tools=directory-reports`). The
  first time one of its tools runs, sign in with your Hermoso account in the browser page that opens (in Claude
  Code, `/mcp` and then `hermoso-ads-reporting`). No account yet: create one free at https://app.hermoso.ai.
- Ad accounts are connected in the Hermoso app (https://app.hermoso.ai/?tab=connectors), and each brand is allowed
  to read only the accounts ticked for it there. Every read here is free.

## Step 1. Which accounts can be read
- `list_connectors`: what is connected, and any connection whose permissions are out of date (the user reconnects
  it in the app; no retry fixes that).
- `list_connector_accounts` with `provider` (for example meta, google_ads, linkedin_ads, tiktok_ads, reddit_ads,
  microsoft_ads) lists the ad accounts the brand may read.
- The id each report needs comes from its list tool: `list_meta_pages` for the Meta ad account id,
  `list_google_ads_campaigns` with no `customerId` for the Google Ads account ids, and the list tool without an
  account id for Microsoft, Reddit and Pinterest. When the brand has several accounts on one platform, let the user
  pick; never choose for them.

## Step 2. Read each platform
Use the same window everywhere the platform allows it, and say which window each platform actually used.

| platform | campaigns and status | performance |
|---|---|---|
| Meta | `list_meta_ads` with `adAccountId` and `level` | `meta_insights` with `adAccountId` (or `objectId` and `level`), `datePreset` or `since` and `until`, optional `breakdowns` |
| Google Ads | `list_google_ads_campaigns` with `customerId` (it carries metrics too) | `google_ads_report` with a GAQL `query` for ad groups, ads, keywords or search terms |
| LinkedIn | `list_linkedin_ads_campaigns` | `linkedin_ads_report` with `adAccountId`, `since`, `until` and `pivot` |
| TikTok | `list_tiktok_ads_campaigns` | `tiktok_ads_report` with `level`, `startDate` and `endDate` |
| Microsoft Advertising | `list_microsoft_ads_campaigns` | `microsoft_ads_report` with `reportType` and `timePeriod`; a pending reply carries `reportRequestId`, so call again with it |
| Reddit | `list_reddit_ads_campaigns` | `reddit_ads_report` with `adAccountId`, `since` and `until` |
| Pinterest | `list_pinterest_ads_campaigns` | `pinterest_ads_report` with `adAccountId`, `level`, `since` and `until` |
| X | `list_x_ads_campaigns` | `x_ads_report` with `entity`, `entityIds`, `startTime` and `endTime` |
| ChatGPT Ads | `list_openai_ads_campaigns` | `openai_ads_report` with `since` and `until` |

Organic numbers for a Facebook Page or an Instagram business account come from `meta_page_insights` and
`instagram_insights`, when the user asks for them next to the ads.

## Step 3. The report
- One table, one row per campaign (or ad set, or ad), with the same columns for every platform: spend, impressions,
  clicks, CTR, CPC, conversions, cost per conversion, and ROAS where the platform reports revenue.
- Recompute every ratio from its parts. Google reports cost in millionths of the currency (cost_micros), and
  platforms disagree on whether CTR is a fraction or a percent.
- A metric the platform did not report is "not reported", never zero. A report with no rows means no delivery in
  that window. A platform that failed to read is named as unreadable, not left out.
- Keep each platform in its own currency and its own day boundaries, and never add up conversions across
  platforms that count them differently. Write each platform's conversion definition next to its rows.
- Close with the three things that stand out (the best and worst cost per result, a campaign that stopped
  delivering and why its status says so). For what to change, the campaign-analyst skill has the method; any change
  itself is made by the user in the ad platform or the Hermoso app.
