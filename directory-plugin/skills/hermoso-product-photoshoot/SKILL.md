---
name: hermoso-product-photoshoot
description: >-
  Brand-quality product photography with Hermoso: drop a real product photo into studio, lifestyle or hero-banner
  scenes through reference-image compositing, so the packaging and label stay accurate. Use when the user wants
  "product shots", "a photoshoot for my product", "lifestyle images of <product>", "hero banner", "a Pinterest pin",
  "a model wearing my product", "a levitating / splash product shot", "restyle this image", "Amazon listing images",
  or "a pack of ad images" from a real product image. NOT for: video (use hermoso-generate) or research (use
  hermoso-research).
argument-hint: "[product image + scene, e.g. 'my bag photo as a sunlit kitchen hero shot']"
---

# Hermoso: product photoshoot

Use Hermoso's reference-image compositing so the real product (label, colours, shape) is preserved while the scene
around it is generated. It runs on the Hermoso MCP tools.

## Before you start
- This plugin connects the Hermoso MCP server (`https://app.hermoso.ai/mcp`). The first time a Hermoso tool runs,
  sign in with your Hermoso account in the browser page that opens (in Claude Code, `/mcp` and then `hermoso` shows
  the sign-in). No account yet: create one free at https://app.hermoso.ai.
- A tool this file does not name still exists: `find_tools` searches every Hermoso tool and `call_tool` runs any of
  them by name. `hermoso_capabilities` (free) lists the image model ids and recipes.
- The server cannot read files on the user's computer. Pass a public link, or turn a file into a link with
  `upload_file` (`url` for a public link, `dataUri` for a small file). Otherwise ask the user to upload it to their
  Library at app.hermoso.ai and share the link. `list_product_photos` shows the brand's saved product photos and
  `set_product_image` saves a new one.

## Procedure
1. Get the **product image** link from the user (or the brand's saved one). It goes in `refImages` and forces
   product-accurate compositing. No photo? Ask for one first (it is much more faithful); only if there is none, ask
   for the product's category, packaging, colour and distinctive features and write them into the prompt.
2. **Ask at most four short questions, each with labelled options, never open-ended**, and skip any the brief, the
   photo or an earlier turn already answers:
   - "make me images of this": how many `[1 / 3 / 5]`, which style `[Clean studio / Lifestyle / Conceptual / With a
     model]`, where they will run `[Shop / Instagram / Pinterest / Paid ads / Website hero]`, brand colours to match.
   - a use case is named ("ads for my product", "a Pinterest pin"): the mode is obvious, so ask only how many, the
     offer or hook, and what to emphasise.
   - "redo this image / change the vibe": `restyle`, then which aesthetic and season, and what must stay.
   - a model wearing the product: which model archetype (suggest two or three for the audience), environment
     `[Studio / Outdoor / Street / Editorial / Home]`, framing `[Full body / Three-quarter / Waist up / Close on the
     product]`.
   - vague ("something cool for my brand"): which product, which goal `[Sell on a marketplace / Awareness / Paid
     ads / Website]`, then continue as above.
3. Pick **one mode by intent, not by keyword** (when two fit, the more specific wins):
   - `product_shot`: the product on a clean studio, neutral or catalog backdrop (white, seamless, shop listing). 1:1
     or 4:5.
   - `lifestyle_scene`: the product in a real place in use (kitchen, desk, cafe, gym, outdoors), hands and
     atmosphere. 4:5.
   - `closeup_product_with_person`: a tight crop with hands or part of a face (applying, holding, demonstrating). 4:5.
   - `moodboard_pin`: a vertical Pinterest-native pin with a moodboard feel. 2:3 (3:4 if the model has no 2:3).
   - `hero_banner`: a wide website, email or campaign header with room for a headline. 16:9.
   - `social_carousel`: 3 to 10 connected slides of one product. 4:5 or 1:1.
   - `ad_creative_pack`: a coordinated set of static ad variants for paid social or search. Run each at the
     placement's ratio.
   - `virtual_model_tryout`: the product worn or used by a generated model (fashion, accessories, lookbook).
   - `conceptual_product`: surreal or CGI-style: levitating, floating, splash, frozen motion, sculptural.
   - `restyle`: change an EXISTING image's aesthetic, mood or season without changing its subject. Pass that image in
     `refImages` and describe only what changes, never the whole picture again.
   Most modes are also a recipe for `plan_ad` (pass `recipe`, it brings the art direction and the canvas):
   `studio_product`, `lifestyle`, `hands_closeup`, `pinterest_pin` (2:3), `hero_banner` (16:9), `tryon_photo`,
   `levitating_product`, `restyle`. A recipe is a shortcut, never a limit: any scene the user describes can be written
   straight into the prompt.
   Tie-breakers: a Pinterest pin of the product on a counter is `moodboard_pin` (the platform wins); a hero banner
   showing it in use is `hero_banner` (the format wins); a carousel of different scenes is `social_carousel`
   (multi-slide wins); a close-up of someone applying a serum is `closeup_product_with_person` (the specific genre
   wins).
4. Render: `generate_image` with `prompt` (scene + composition + any on-image text), `refImages` (the product image),
   optional `model` and `aspectRatio` (the ratio from step 3). Prefer the best image model for hero work; a faster
   model is fine for bulk variations.
5. **Variants are distinct, never paraphrases.** Each variant is its own call and changes the setting, the lighting,
   the angle and the palette. For `social_carousel` and `ad_creative_pack`, lock ONE visual system across the set
   (palette, type, lighting family, product scale) and vary only the scene, angle and message, so the set reads as
   one campaign.
6. **A marketplace listing set** (Amazon-style) is its own job, one tool: `make_listing_set`. It makes a main image
   (the product alone on a pure white background, filling most of the frame, no props, text or badges, the
   marketplace's own main-image rule), then the secondary images: an infographic of benefit callouts, a multi-angle
   view, a detail or macro shot, a lifestyle shot and a "what's in the box" layout; and, when asked, A+ modules. The
   main image renders FIRST and every other image is drawn from it, so the whole set shows the same product, scale
   and light; pass an approved main as `mainImage` to redo the rest from it. `aplus: true` adds Amazon's 7 A+
   modules, each also delivered at its module's exact pixels, with text suggested only from the product's own data
   (`copy` for the seller's words; `copyIn: "image"` paints them on). Call it with `image` and `dryRun: true` first:
   that returns the plan and its exact price (main, lifestyle, detail, scale and in use by default; `shots` takes
   multi_angle, whats_in_box, back_of_pack or the user's own words). Then call it again with `plan` set to that plan
   to render it, one image job per shot.
7. Report each served image URL as a short labelled list (for example "lifestyle / kitchen counter"); never paste
   the prompt back. Offer to tweak a scene.

## Checkpoints before anything paid
Every paid render waits for three yeses, one at a time (the hermoso-approval-checkpoints skill has the detail):
1. **The script.** Show the concept, the copy and, for a video, the timed shot list in full. Edits come back here.
2. **The pictures.** Show what the render will be built from (the image prompt and the product photo, the
   foundations from `render_ad` with `foundations: "choose"`, or the stills) and let the user pick.
3. **The price.** Quote with `get_cost: true` (`dryRun: true` on a render also shows how it will be filmed), show
   the number, and run only after a yes, with `expected_credits` set to that quote and an `idempotency_key` you
   reuse on any retry.
If the user says to skip a checkpoint or gives a budget, do that, and still say what you are spending.

## Notes
- Keep the product as the hero; never let generated text garble the real label. Describe the product as "the exact
  product in the reference, label unchanged."
