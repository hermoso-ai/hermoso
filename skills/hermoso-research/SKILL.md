---
name: hermoso-research
description: >-
  Competitor + ad-library intelligence with Hermoso: find a brand's competitors, pull their real running ads
  across Meta/Google/LinkedIn, and surface the winning hooks/angles worth copying. Use when the user asks to
  "find my competitors", "pull <brand>'s ads", "what ads are working in my niche", "research the longest-running
  ads", or wants proven creative to remix. NOT for: generating creative (use hermoso-generate / hermoso-ad-from-brand).
argument-hint: "[a brand/domain or a research question — e.g. 'longest-running protein-pancake ads']"
allowed-tools: Bash
---

# Hermoso — competitor & ad research

This is Hermoso's discovery half (which most generators don't have). Drive the **Hermoso CLI**.

## Setup
- `hermoso auth login --url https://app.hermoso.ai --token <your agent key>` (key from the app’s MCP & CLI page).

## Procedure
Pick the tool that fits the ask:
1. **Find competitors** for a domain: `hermoso competitors <domain> [--mode competitors|inspiration|company] --json`
   - `competitors` = head-to-head rivals; `inspiration` = best relevant ads incl. the brand itself; `company` = the company's own.
2. **Pull a brand's real ads** across ad libraries: `hermoso ads pull --company "<name>" [--domain <d>] [--platforms facebook,google,linkedin] [--country US] --json`
   - Defaults to Meta (richest library). Add google/linkedin only if asked (Google detailed pulls cost more).
3. **Natural-language research** (Claude tool-use over ad libraries + organic TikTok): `hermoso research "<request>"`
   - e.g. `hermoso research "the longest-running protein-pancake ads on Meta and what hooks they use"`. Prints a summary + the found ads with their URLs.
4. **Synthesize**: report the strongest hooks, angles, formats, and what's worth copying — be specific (quote the actual headlines/angles). If the user then wants to build one, hand off to `hermoso-ad-from-brand` / `hermoso-generate`.

## Notes
- Research spends ScrapeCreators credits (ad-library calls) + LLM tokens; keep platform scope to what's asked.
- Add `--json` for the raw ad objects (URLs, copy, run dates) when the user wants the data, not a summary.
