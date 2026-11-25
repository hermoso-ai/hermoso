---
name: ad-policy-check
description: >-
  Check ad copy against Meta's Advertising Standards with Hermoso before it runs: get a pass, fix or block verdict,
  the policy text behind each flagged line, and compliant wording to use instead. Use when the user asks "will Meta
  approve this ad", "is this copy compliant", "why was my ad rejected", or wants a draft checked before launch.
  NOT for: running or editing ads (this only reports).
argument-hint: "[the ad copy, plus the product category and any claims, e.g. 'Lose 10 lbs in 10 days - supplement']"
---

# Ad policy check

The check only reports. Nothing is changed or submitted to Meta.

## Before you start
- This plugin connects the Hermoso Ad Research server (`https://app.hermoso.ai/mcp?tools=directory-research`). The
  first time one of its tools runs, sign in with your Hermoso account in the browser page that opens (in Claude
  Code, `/mcp` and then `hermoso-ad-research`). No account yet: create one free at https://app.hermoso.ai.
- One check uses one Hermoso credit.

## Procedure
1. Collect what the ad says: the primary text, the headline and the description, exactly as they will run. Ask for
   the product category (supplements, finance, dating, alcohol and others have their own rules) and the claims the
   ad makes, and a short description of the image or video if there is one.
2. `check_ad_policy` with `copy`, and `claims`, `category` and `imageDescription` when you have them.
3. Report the verdict first (pass, fix or block). For each flagged issue, quote the line, quote the policy text the
   check returned, and give the compliant wording it suggested. Keep the user's voice in any rewrite.
4. When the user edits the copy, run the check again on the new version and show the new verdict, so "fixed" is
   something the user saw.

## Notes
- The check reads Meta's policy pages live, so it reflects today's rules, but Meta's own review has the final word.
  Say so when the verdict is borderline.
- Personal attributes are the most common rejection: copy that asserts or implies something about the viewer
  ("Are you overweight?") is flagged even when the product is fine. Rewrite toward the product, not the person.
