---
name: hermoso-research
description: >-
  Competitor and ad-library intelligence with Hermoso: find a brand's competitors, pull their real running ads
  across Meta, Google and LinkedIn, and surface the winning hooks and angles worth copying. Use when the user asks
  to "find my competitors", "pull <brand>'s ads", "what ads are working in my niche", "research the longest-running
  ads", or wants proven creative to remix. NOT for: generating creative (use hermoso-generate or hermoso-ad-from-brand).
argument-hint: "[a brand/domain or a research question, e.g. 'longest-running protein-pancake ads']"
---

# Hermoso: competitor and ad research

This is Hermoso's discovery half, which most generators do not have. It runs on the Hermoso MCP tools.

## Before you start
- This plugin connects the Hermoso MCP server (`https://app.hermoso.ai/mcp`). The first time a Hermoso tool runs,
  sign in with your Hermoso account in the browser page that opens (in Claude Code, `/mcp` and then `hermoso` shows
  the sign-in). No account yet: create one free at https://app.hermoso.ai.
- A tool this file does not name still exists: `find_tools` searches every Hermoso tool and `call_tool` runs any of
  them by name. Organic search on TikTok, Instagram, YouTube, Reddit or Threads, creator search and a competitor
  teardown are all reachable that way.

## Procedure
Pick the tool that fits the ask:
1. **Find competitors** for a domain: `find_competitors` with `domain` and `mode`.
   - `competitors` = head-to-head rivals; `inspiration` = the best relevant ads, including the brand itself;
     `company` = the company's own.
2. **Pull one brand's real running ads**: `pull_competitor_ads` with `companyName` (and `domain` when you have it,
   `country` when the user names one). It reads Meta's library, the richest one. For the Google or LinkedIn
   libraries use `search_google_ads` or `search_linkedin_ads`, only when asked (a detailed Google pull costs more).
   For one keyword or one advertiser on Meta, `search_meta_ads` is a single quick call.
3. **Open research questions** across brands and platforms ("which angles are working for protein pancakes"):
   `research_ads` with `query`. It runs several library pulls plus a written summary, takes 30 to 60 seconds, and
   returns the ads it found with their links.
4. **Synthesize**: report the strongest hooks, angles and formats, and what is worth copying. Be specific: quote the
   actual headlines and angles. If the user then wants to build one, hand off to `hermoso-ad-from-brand` or
   `hermoso-generate`.
5. **What to post on TikTok**, from posts working this month: `tiktok_ideas` with `category` and `dryRun: true`
   prices it (nothing runs); run it without `dryRun` after the user agrees. Up to 6 ideas, each backed by linked
   TikTok posts with their views. To make one, call `tiktok_ideas` again with `pick` set to that idea and
   `to: "render_ad"`: it returns the brief for `plan_ad` with the claims the ad may make, and nothing renders until
   that next call.

## Notes
- Research spends credits, so keep the platform scope to what was asked.
- When the user wants the data rather than a summary, give the raw ads: links, copy and run dates.
