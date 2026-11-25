---
name: competitor-research
description: >-
  Competitor and ad-library research with Hermoso: find a brand's competitors, read the ads they are really running
  in the Meta, Google and LinkedIn ad libraries, break down how one competitor advertises, and report the hooks and
  angles worth learning from, with the real headlines and run dates. Use when the user asks to "find my
  competitors", "pull <brand>'s ads", "what ads are working in my niche", "research the longest-running ads", or
  "how does <brand> advertise". NOT for: organic posts on TikTok, Instagram or YouTube (use trend-research) or
  checking a draft against ad policy (use ad-policy-check).
argument-hint: "[a brand, a domain or a research question, e.g. 'longest-running protein-pancake ads']"
---

# Competitor and ad-library research

Every tool here only reads. Nothing is posted, published or changed on any account.

## Before you start
- This plugin connects the Hermoso Ad Research server (`https://app.hermoso.ai/mcp?tools=directory-research`). The
  first time one of its tools runs, sign in with your Hermoso account in the browser page that opens (in Claude
  Code, `/mcp` and then `hermoso-ad-research`). No account yet: create one free at https://app.hermoso.ai.
- Searches use Hermoso credits. `hermoso_credits` shows the balance and the recent charges, for free. Keep each
  search to the platforms and brands the user asked about.
- `get_brand` returns the brand profile saved in the user's Hermoso workspace, if there is one. Use it for context
  ("my competitors" means the saved brand's), and never ask for what it already says.

## Procedure
Pick the tool that fits the ask:
1. **Find competitors** for a website: `find_competitors` with `domain` and `mode`.
   - "competitors" (the default) lists head-to-head rivals and similar brands, without the searched company;
     "inspiration" lists relevant brands known for strong advertising, with the searched company included.
   - Show each brand with its domain and the one-line reason, and let the user pick which ones to pull.
2. **Read one brand's running ads**: `pull_competitor_ads` with `companyName`, plus `domain` when you have it (it
   helps pick the right Facebook Page) and `country` when the user names one. This is the Meta Ad Library
   (Facebook, Instagram, Messenger and Threads), the richest library. For a keyword or a single advertiser on Meta,
   `search_meta_ads` with `query` or `companyName` is one quick call.
3. **Other libraries, only when asked**: `search_google_ads` with `domain` (the Google Ads Transparency Center) and
   `search_linkedin_ads` with `company` or `keyword` (LinkedIn, with LinkedIn's impression counts).
4. **How one competitor advertises**: `competitor_teardown` with `competitor` as its name and domain. Pass `ads`
   with the ads you already pulled in step 2, which makes the teardown free and keeps it to exactly those ads.
   It returns the mix of opening hooks, the themes of the longest-running ads, the gaps nobody covers and the
   positions the competitor owns.
5. **An open question across brands and platforms** ("which angles are working for protein pancakes"):
   `research_ads` with `query`. It runs several searches, takes 30 to 60 seconds, and returns a written summary
   with the ads it is based on. A question about one brand or one keyword is faster as a single search above.
6. **A video ad worth studying**: `analyze_video` with the video's public `url` returns the transcript, the beats
   with timestamps and the length.

## Report
- Lead with what is worth learning from: the strongest hooks, angles and formats, each with the actual headline or
  opening line quoted, the advertiser, the link and how long the ad has run. An ad that has run for 60 days or more
  is usually paying for itself, so sort by run length, not by date.
- Group the angles: five ads on one promise and one ad on another tell the user which angle the market has proven
  and which is open. The ad-hooks skill names the opening mechanics, so call each hook by its name.
- Ad-library results are public records: report advertisers, copy and dates as returned. When a search comes back
  empty, say so and suggest the next search (a different spelling, the domain, another country); never fill the
  gap with a guess.
- When the user wants the data rather than a summary, give the raw rows: links, copy and run dates.
- `list_swipefile` shows ads the user already saved in Hermoso, if they want to compare against them.
