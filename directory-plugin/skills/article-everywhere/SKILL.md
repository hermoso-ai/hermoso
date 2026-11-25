---
name: article-everywhere
description: >-
  Turn one article, link or topic into a set of posts with Hermoso, each written for where it lands: a blog post on
  the brand's connected blog (WordPress, or a Shopify, Webflow or Wix blog), an X Article, a LinkedIn post, short
  posts for Threads, Bluesky and Facebook, and a YouTube upload when the user has the video, all queued on the
  brand's schedule. Use when the user says "turn this into a blog post and posts", "repurpose this article", "write
  about <topic> and put it everywhere", or gives a URL and wants it on every channel. NOT for: one social post (use
  approval-checkpoints and schedule it directly).
argument-hint: "[a link or a topic, e.g. 'https://yourbrand.com/blog/pricing-guide' or 'how to price handmade candles']"
---

# One article, every channel

One source in. Out comes a set of pieces, each written for the place it lands, all on the brand's own schedule.
You write the words; Hermoso publishes and schedules them. This server makes no images or video, so pictures and
videos are the user's own (the source's images, their photos, a video they already have).

| piece | lands on | how |
|---|---|---|
| blog post | WordPress, or a Shopify, Webflow or Wix blog | `schedule_post` with that channel |
| X Article | X | `schedule_post` with `xArticle` |
| LinkedIn post | a company Page or the person's own profile | `schedule_post` |
| short posts | Threads, Bluesky, Facebook, Instagram (with an image) | `schedule_post` |
| YouTube video | YouTube, only when the user has the video | `schedule_post` |

Make only the pieces the user wants. Each one works on its own.

## Before you start
- This plugin connects the Hermoso Social Scheduler server (`https://app.hermoso.ai/mcp?tools=directory-scheduler`).
  The first time one of its tools runs, sign in with your Hermoso account in the browser page that opens (in Claude
  Code, `/mcp` and then `hermoso-social-scheduler`). No account yet: create one free at https://app.hermoso.ai.
- The server cannot read files on the user's computer. Turn an image or video into a link with `upload_file`
  (`url` for a public link, `dataUri` for a small file), or ask for a public link.

## Step 0. What can publish where (free)
- `list_connectors`, then `list_connector_accounts` for each channel: what is connected and which accounts this
  brand may post to. A LinkedIn company Page needs its id from `list_linkedin_pages`. The setup-check skill runs all
  of these in one pass.
- `get_brand` for the voice, the audience, what they sell and the site.
- A channel that is not connected is not a reason to stop. Write that piece if the user wants it, hand back the
  text, and list the channel in the final report with its connect link (https://app.hermoso.ai/?tab=connectors).

## Step 1. Read the source
- A link: read the page with your own web tool. Keep the title, the argument, every fact with its number and where
  it came from, any quotes, and the image links.
- A topic: start from what the user and `get_brand` already know, and ask for what is missing. Never invent a
  statistic, a quote or a result.
- Whose story it is: if the source is someone else's, the brand writes about it and credits and links it.

## Step 2. Write every piece, then the first yes
- **Blog post.** A title with the main phrase near the front (under about 60 characters), a one-line description
  for search results (about 150 characters), a short opening that answers the question straight away, sections with
  headings that match what people search, and one call to action that fits the brand. Plain markdown. Also a slug
  and two or three categories or tags.
- **X Article.** Its own title and a shorter body that leads with the strongest point. Headings `#` and `##` only,
  no formatting X cannot hold. It links to the blog post.
- **LinkedIn post.** Up to 3,000 characters. The first two lines are the whole hook, because LinkedIn folds the
  rest. Short paragraphs, the link at the end (or as the first comment on a company Page).
- **Short posts.** One idea each, in the channel's length (Bluesky 300 characters), pointing at the blog post.
- **YouTube.** A title (up to 100 characters), a description with the blog link, and tags, for a video the user has.

Show every piece in full and wait for the user's yes or their edits (checkpoint 1 of the approval-checkpoints
skill). Edits come back here, shown in full again.

## Step 3. Schedule it all, then the second yes
Read the calendar first with `list_scheduled`, so nothing lands on top of what is queued. Then either name a time
for each piece with `at` and `timezone`, or pass `useQueue` to take the brand's next saved slots. A sensible
spread: the blog post first, the X Article and LinkedIn post a few hours later linking to it, the short posts over
the next two days, the YouTube video the day after. Show the full plan (piece, channel, account, time in the user's
time zone) and get a yes, because everything goes live publicly. One `schedule_post` per piece:
- **WordPress:** `channels` ["wordpress"], `title`, the body in `message`, `imageUrls` (the first is the featured
  image), `excerpt`, `wpSlug`, `wpCategories`, `wpTags`. A Shopify, Webflow or Wix blog works the same way with its
  own channel (shopify_blog, webflow, wix) and `blogSlug`, `seoTitle`, `seoDescription`.
- **X Article:** `channels` ["x"], `xArticle` true, `title`, the article markdown in `message`, and `imageUrl` for
  the cover. X allows only about five Articles a day per account, and a published Article cannot be edited.
- **LinkedIn:** `channels` ["linkedin"], the post in `message`, and `linkedinOrganizationId` for a company Page
  (without it the post goes to the person's own profile). `firstComment` adds the link as the first comment on a
  company Page.
- **Short posts:** one `schedule_post` with several `channels` and `captions` per channel. Instagram needs an image
  or video; several Facebook Pages need `pageId`.
- **YouTube:** `channels` ["youtube"], `videoUrl`, the title in `message`, `description`, `tags` and `categoryId`.
- Every `schedule_post` also takes `subject` (the same words on every piece, such as the article's title), so
  `post_performance` can later compare the pieces.

## Step 4. Report
- Each piece with its channel, account and time in the user's time zone, read back from `list_scheduled` rather than
  from what was sent.
- What was skipped and why (a channel not connected, a piece the user did not want), each with its fix.
- One next step: after a week, `post_performance` with `axis` set to channel shows which piece earned the most, so
  the next article can lean into that channel.

## Rules
- The words the user approved are the words that publish. Never shorten or rewrite them at scheduling time: a
  channel that cannot take a piece refuses it with the reason, and you bring that back to the user.
- Nothing is published or scheduled without the user's yes in this conversation.
- No invented facts, numbers, quotes or reviews in any piece.
