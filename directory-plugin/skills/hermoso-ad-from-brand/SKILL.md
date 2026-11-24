---
name: hermoso-ad-from-brand
description: >-
  Make an on-brand ad for a company end to end with Hermoso: onboard the brand, write the concept and copy, then
  render the image or video. Use when the user says "make an ad for <company/website>", "build a launch ad for my
  brand", or gives a domain or brand and wants a complete ad, not just research. NOT for: just pulling competitor
  ads (use hermoso-research) or rendering from a prompt you already have (use hermoso-generate).
argument-hint: "[brand or website + what to advertise, e.g. 'an ad for yourbrand.com, our best-selling olive oil']"
---

# Hermoso: full ad from a brand

Go from a brand to an on-brand ad in three steps with the Hermoso MCP tools. Report the final media URL.

## Before you start
- This plugin connects the Hermoso MCP server (`https://app.hermoso.ai/mcp`). The first time a Hermoso tool runs,
  sign in with your Hermoso account in the browser page that opens (in Claude Code, `/mcp` and then `hermoso` shows
  the sign-in). No account yet: create one free at https://app.hermoso.ai.
- A tool this file does not name still exists: `find_tools` searches every Hermoso tool and `call_tool` runs any of
  them by name.
- The server cannot read files on the user's computer. Pass a public link, or turn a file into a link with
  `upload_file` (`url` for a public link, `dataUri` for a small file). Otherwise ask the user to upload it to their
  Library at app.hermoso.ai and share the link.

## Procedure
1. **Onboard the brand** (skip if `get_brand` already shows it, or the user gave full brand details):
   - From a website: `draft_brand` with `domain`.
   - No website: `draft_brand` with `description` (what they sell, audience, voice).
   - Influencer or social account: `draft_brand` with `socialHandle` and `platform`.
   Keep the returned brand name and category for the next steps.
2. **Plan the concept and copy**: `plan_ad` with `brand`, `product` (what to advertise and the angle) and `format`
   (`auto`, `image` or `video`). A video needs a length: put a named length in `durationSeconds`, otherwise ask.
   The result has the concept, copy variants (headline, primary text, call to action), an image prompt or a timed
   storyboard, and the model ids to render with. Tell the user the concept and headline.
3. **Render**:
   - Video: `render_ad` with `plan_ad`'s full output as `creative`. `dryRun: true` first shows the price and the
     act split for free. It takes 1 to 3 minutes; poll `get_job` until it finishes.
   - Image: `generate_image` with the image prompt from step 2 (it already carries the copy) and the model it
     resolved, `aspectRatio` such as `1:1`.
   - `hermoso_capabilities` lists the valid model ids and exact costs if you need another option.
4. **Report the served URL.** Offer one concrete next step: a punchier hook, a different aspect ratio, or a variation.

## Notes
- **Test hooks before formats.** For a test batch, try four different hooks in one format before one hook in four
  formats: the opening decides performance more than the format does.
- **Copy a reference ad OR compose from a hook and a setting, never both at once.** When the user hands you an ad to
  model (a link or a file), follow its structure; when they pick a hook and a scene, build from those; mixing the
  two blurs both.
- Formats are not interchangeable: a phone-shot UGC clip and a polished broadcast-style spot read as different
  brands, so do not mix them in one campaign unless that is the intent.
- The brand's saved product photo is used automatically. If the user has a better real product photo and the ad
  features that product, pass its link in `refImages` on the image step so the packaging is accurate.
- Quality over cost: prefer the resolved or best model unless the user asks for cheap or fast.
