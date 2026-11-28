---
name: hermoso-article-everywhere
description: >-
  Turn one article, link or topic into a full set of content with Hermoso: an SEO blog post on the brand's own blog
  (WordPress, dev.to or Hashnode, or a Shopify, Webflow or Wix blog), an X Article, a LinkedIn post, and a low-cost
  narrated slideshow video for YouTube with a vertical Short and a thumbnail, all queued on the brand's schedule.
  Use when the user says "turn this into a blog post and posts", "repurpose this article", "write about <topic> and
  put it everywhere", or gives a URL and wants it on every channel. NOT for: one social post (schedule it directly),
  a video ad (use hermoso-ad-from-brand), or a long video the user already has (repurpose_transcript does that).
argument-hint: "[a link or a topic, e.g. 'https://yourbrand.com/blog/pricing-guide' or 'how to price handmade candles']"
allowed-tools: Bash(hermoso *) Bash(npx -y hermoso@0.1.690 *)
---

# Hermoso: one article, every format

One source in. Out comes a set of pieces, each written for the place it lands, all on the brand's own schedule:

| piece | lands on | made with |
|---|---|---|
| SEO blog post | WordPress, dev.to, Hashnode, or a Shopify, Webflow or Wix blog | `generate_text`, then `schedule_post` |
| X Article | X | `generate_text`, then `schedule_post` with `xArticle: true` |
| LinkedIn post | a company Page or the person's own profile | `generate_text`, then `schedule_post` |
| YouTube video, 16:9 | YouTube | `make_explainer` in the stills lane (narrated pictures, no video model) |
| YouTube Short, 9:16 | YouTube | `make_template_ad` slideshow, `generate_voice`, `post_edit`, `add_subtitles` |
| thumbnail | the YouTube video | `make_thumbnail` |

Make only the pieces the user wants. Each one works on its own.

## Setup (once)
- Install the CLI once: `npm install -g hermoso@0.1.690`, then run every command as `hermoso …`, as written below. If you cannot install packages, run each one as `npx -y hermoso@0.1.690 …` instead (always with the version), but know that npx asks the npm registry on every single call, so an agent making many calls can be rate-limited by npm (an HTTP 429 from npm, before Hermoso is ever reached). No MCP server is needed.
- Sign in once: `npx -y hermoso@0.1.690 auth login` (opens a browser; nothing to paste). On a machine with no browser (a server, chatted over Telegram, Discord or WhatsApp): run `npx -y hermoso@0.1.690 auth login --device --no-wait`, send the user the link and short code it prints, and once they approve run `npx -y hermoso@0.1.690 auth login --device --resume`. No key needed. Only if nobody can open a link: the user creates a key at app.hermoso.ai under **MCP & CLI** and either sets it as the `HERMOSO_TOKEN` environment variable (nothing is stored) or pipes it to `npx -y hermoso@0.1.690 auth login --token -` (it reads the key from stdin, or asks for it without showing it). Never put the key itself on the command line, where it stays in shell history. No account yet? The user signs up at app.hermoso.ai (free to start). Never create an account, choose a plan or pay on the user's behalf unless they explicitly ask you to and approve the plan and its price.
- Every tool is reachable, including the ones this file does not name: `hermoso tools --search <what you want>` finds the tool, `hermoso tools <name>` prints its arguments, `hermoso call <name> --json '{...}'` runs it. A tool you cannot see is still callable, so a name you do not recognise never means a missing feature.
- Every tool named below runs as `hermoso call <name> --json '{...}'`, for example `hermoso call list_connectors --json '{}'`. `hermoso tools <name>` prints a tool's arguments before you call it.

## Ask first: purchases, payments, publishing and plan changes
`hermoso call` reaches every Hermoso tool, including tools that spend real money or put something in public. Before
any of these, show the user exactly what will happen (what, how much, which account) and wait for their explicit yes
in this conversation to that specific action:
- **Domains and purchases:** buying or renewing a domain (`buy_domain`), or anything else charged to a card.
- **Payments and refunds:** charges, subscriptions, payment links and payouts through the user's own payment accounts
  (`create_stripe_subscription`, `create_stripe_payment_link`, `pay_campaign_creators`, `creator_campaign_funds`),
  and every refund (`refund_stripe_charge`).
- **Publishing:** putting a page or site live (`publish_page`, `deploy_vercel_page`), and posting or scheduling
  anything to the user's accounts.
- **Credits and plans:** a paid render, generation or batch (quote it with `"get_cost": true` and run it with that
  price as `expected_credits`, as in the hermoso-approval-checkpoints skill); buying credits, upgrading the plan or
  turning on auto-reload (`buy_credits`, `upgrade_plan`, `set_auto_reload`). A search or lookup the user asked for is
  approved by the request itself; say what it cost when you report it.
- **Ad spend:** activating a campaign, ad set or ad, or raising a budget.

A yes covers only the action it answered, so the next purchase, payment or publish asks again. A budget or a skipped
checkpoint the user gave for a render never covers a purchase, a payment, a refund, a plan change or a publish. When
nobody is there to answer (a scheduled run), do none of these beyond what the user set up in advance for that
schedule: stop and report what is waiting for a yes.

## Step 0. What can publish where (free)
- `list_connectors`, then `list_connector_accounts` with no `provider`: which of WordPress, dev.to, Hashnode, X,
  LinkedIn and YouTube are connected, and which accounts this brand may post to. For a LinkedIn company Page you
  need its id from `list_linkedin_pages`.
- `get_brand` for the voice, the audience, what they sell and the site. `manage_post_queues` with
  `action: "list"` for the brand's posting times and time zone.
- A channel that is not connected is not a reason to stop. Make that piece if the user wants it, hand back the
  text or the file, and list the channel in the final report with its connect link
  (https://app.hermoso.ai/?tab=connectors). The hermoso-setup-check skill runs all of these reads in one pass.

## Step 1. Read the source
- A link: read the page with your own web tool (a fetch or browse tool, or `curl` in a shell). Hermoso has no
  general page reader. Keep the title, the argument, every fact with its number and where it came from, any quotes,
  and the image links.
- A topic: start from what the user and `get_brand` already know. For what people actually ask about it,
  `search_youtube` and `search_reddit` read real posts (both are paid research, so say so first). Never invent a
  statistic, a quote or a result.
- Whose story it is: if the source is someone else's, the brand writes about it and credits and links it. Never
  present another author's results as the brand's own.

## Step 2. The words people search (free when connected)
- `list_search_console_sites`, then `search_console_performance` with `dimensions: ["query"]` and the last 90 days:
  the real queries that already reach the site.
- `bing_webmaster_keywords` with `q`, `mode: "related"`, `country`, `language` and a date range: search demand
  for the topic and its neighbours, when Bing Webmaster Tools is connected.
- `google_ads_keyword_ideas` with `keywords`: monthly volumes, when a Google Ads account is connected.
- Pick one main phrase and two to four related ones. If nothing is connected, write for the plainest phrase a
  reader would type, and say the volumes were not measured. Never quote a volume you did not read.

## Step 3. Write every piece, then checkpoint 1
Write each piece with `generate_text`, one call per piece. Put the source notes, the main phrase, the brand's voice
and audience, and the rules below into the prompt. Pass `raw: true` for the blog post and the X Article, so the
model writes as an editor rather than as an ad copywriter.
- **Blog post.** A title with the main phrase near the front (under about 60 characters, so search does not cut it),
  a one-line description for search results (about 150 characters), a short opening that answers the question
  straight away, sections with headings that match what people search, and one call to action that fits the brand.
  Plain markdown: `##` headings, lists, links. Also a slug and two or three categories or tags.
- **X Article.** Its own title and a shorter body that leads with the strongest point. Headings `#` and `##` only
  (deeper ones turn into bold lines), no formatting X cannot hold. It links to the blog post.
- **LinkedIn post.** Up to 3,000 characters. The first two lines are the whole hook, because LinkedIn folds the rest.
  Short paragraphs, the link at the end (or as the first comment on a company Page).
- **YouTube script.** 60 to 120 seconds of narration: a first line that says what the viewer gets, the three or four
  points that matter, a close. Also a title (up to 100 characters), a description with the blog link, and tags.
- **Short script.** Up to 900 characters, about 45 to 60 seconds read aloud, the hook in the first sentence and one
  clear ask at the end. Plus 6 to 12 slide lines of a few words each, in the order the voice says them.

Show every piece in full and wait for the user's yes or their edits. Edits come back here, shown in full again.
This is checkpoint 1 of the hermoso-approval-checkpoints skill: nothing paid is made until the words are approved.

## Step 4. The pictures, then checkpoint 2
- Blog cover and inline images: the source's own images when the brand owns them, the brand's photos from
  `list_product_photos`, or a new cover with `generate_image` at `aspectRatio: "16:9"`.
- Short slides: reuse the cover and the source images. Render a still with `generate_image` only for a slide that
  has nothing to show, at `aspectRatio: "9:16"`.
- Thumbnail: `make_thumbnail` with `topic`, a 2 to 4 word `headline` and `aspectRatio: "16:9"`. Never put a person in
  it unless the user gives a face or a locked presenter (then `faceImages`); otherwise pick a framework with no
  person, such as `product`, `graphical` or `screenshot`. One variant (`variants: 1`) unless the user wants to
  choose between several.
- The 16:9 video draws its own pictures. What the user approves here is its look: one `style` such as
  `editorial_collage`, `flat_vector`, `whiteboard` or `cinematic`.

Show the pictures as a numbered list and wait for a yes or a change by number.

## Step 5. Quote, checkpoint 3, render
Quote every paid call with `get_cost: true` (renders also take `dryRun: true`), show the total, and wait for a yes.
Then run each with `expected_credits` set to its quote and an `idempotency_key`. The writing and subtitle steps
have no fixed price (`get_cost` says so); they run without `expected_credits`. Renders run in the background:
poll `get_job` until each finishes, and show results as they came back.
- **The YouTube video.** `make_explainer` with `lane: "stills"`, `aspectRatio: "16:9"`, `durationSeconds` between 60
  and 120, the approved `style`, and `topic` set to the approved script as the brief. `frameDensity: "minimal"` is
  the slideshow look and the lowest price; `"lean"` moves a little more. `voice` takes a narration voice name (the
  locked voice, if the brand has one). The stills lane writes its narration from the brief, so compare the finished
  narration with the approved script and tell the user where it differs. Leave `captions` off unless the user asks;
  step 6 gives YouTube a caption file instead.
- **The Short, in four calls.**
  1. `make_template_ad` with `config: { template: "slideshow", slides: [{ text, image }], video: true,
     secondsPerSlide }`. Choose `secondsPerSlide` (1.5 to 5) so the slideshow runs at least as long as the voice:
     the voice is cut where the video ends.
  2. `generate_voice` with `text` set to the approved Short script, plus `engine` and `voice` (the locked voice, if
     any). It returns an audio link.
  3. `post_edit` with `videoUrl` set to the slideshow video and `ops: [{ op: "music", track: <the audio link>,
     replace: true, fadeOut: 0 }]`. The narration becomes the video's only sound, at a normal speaking level. When
     the user does not mind which voice reads it, one step does both: `ops: [{ op: "voiceover", text: <the script>,
     voice: "female" or "male", keepSound: false }]` instead of steps 2 and 3.
  4. `add_subtitles` with `video` set to the voiced Short and `script` set to the approved words, so the subtitles
     use those exact words and take only their timing from the audio.
- **A caption file for the long video.** `add_subtitles` with `video` set to the 16:9 video and `burn: false`
  returns an .srt and leaves the picture clean.

## Step 6. Schedule it all (free)
Read the calendar first: `list_scheduled` shows what is already queued, so nothing lands on top of it. Then either
name a time for each piece with `at` and `timezone`, or pass `useQueue: true` to take the brand's next free slots.
A sensible spread: the blog post first, the X Article and LinkedIn post a few hours later linking to it, the YouTube
video the next day, the Short a day or two after. Show the full plan (piece, channel, account, time in the user's
time zone) and get a yes, because everything goes live publicly. One `schedule_post` per piece:
- **WordPress:** `channels: ["wordpress"]`, `title`, the post body in `message`, `imageUrls` (the first is the
  featured image), `excerpt`, `wpSlug`, `wpCategories`, `wpTags`. A Shopify, Webflow or Wix blog works the same way
  with its own channel (`shopify_blog`, `webflow`, `wix`) and `blogSlug`, `seoTitle`, `seoDescription`.
- **dev.to and Hashnode:** these are not on the schedule; they republish a post that is already live, with its
  canonical link pointing back at the original. Either turn on `set_blog_syndication` with the blog's `feedUrl`
  (every post published after that goes out by itself, spaced through the day), or once the post is live call
  `post_to_devto` or `post_to_hashnode` with `sourceUrl` set to its address. When dev.to or Hashnode IS the brand's
  only blog, `post_to_devto` / `post_to_hashnode` with `title` and `text` (markdown) publishes it at the time you
  run it, and `published: false` saves a dev.to draft instead.
- **X Article:** `channels: ["x"]`, `xArticle: true`, `title`, the article markdown in `message`, and `imageUrl`
  for the cover. X allows only about five Articles a day per account, and a published Article cannot be edited.
- **LinkedIn:** `channels: ["linkedin"]`, the post in `message`, and `linkedinOrganizationId` for a company Page
  (without it the post goes to the person's own profile). `firstComment` adds the link as the first comment on a Page.
- **YouTube video:** `channels: ["youtube"]`, `videoUrl`, the title in `message` (a scheduled YouTube item's text is
  its title), `description`, `tags`, `thumbnailUrl` from `make_thumbnail`, `captionTrack: { url: <the .srt link>,
  language: "en" }` and a `categoryId` such as 27 (Education) or 28 (Science and Technology).
- **YouTube Short:** `channels: ["youtube"]`, `videoUrl` set to the subtitled Short, its own title in `message` and a
  `description`.
- Every `schedule_post` also takes `subject` (the same words on every piece, such as the article's title) and
  `recipe` (the format, such as `"blog_post"` or `"slideshow"`), so `post_performance` can later compare them.

## Step 7. Report
- Each piece with its link or file, its channel and account, and its time in the user's time zone. `list_scheduled`
  reads the queue back, so report what it says rather than what you sent.
- What was skipped and why (a channel not connected, a piece the user did not want), each with its fix.
- One next step: after a week, `post_performance` shows which piece earned the most, and the next article can
  lean into that format.

## Rules
- The words the user approved are the words that publish. Never shorten or rewrite them at scheduling time: a
  channel that cannot take a piece refuses it with the reason, and you bring that back to the user.
- Nothing is published, scheduled or rendered without the user's yes in this conversation.
- No invented facts, numbers, quotes or reviews in any piece.
