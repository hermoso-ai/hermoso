// ── THREE CURATED CLAUDE DIRECTORY CONNECTORS (2026-11-22) ────────────────────────────────────────────────────────────
// The owner decided 2026-11-22 to delete the three old Claude directory listings and submit three NEW focused connectors
// (docs/plans/claude-directory-resubmit-2026-11-22.md, sections 3-4). Measured that day, the old cages registered 619 to
// 1,377 tools, carried find_tools / call_tool / enable_tools, and had grown money and credential tools since their
// withheld list was written. A group-based cage drifts as the roster grows; an EXPLICIT LIST does not.
//
// So each connector here is an allowlist of exact names. A tool added to the roster later is NOT on any of these
// connectors until somebody adds it to a list below, with a title, a description written for the listing, and its
// read/write annotations. Nothing else registers on these scopes: no generic executor, no hermoso_other_capabilities, no
// generation, billing, refund, payout, password or connect_connector tool (tools/directory-curated-check.mjs pins all of
// it, and runs the real registerTools).
//
// A FOURTH, `directory-creators` (Hermoso Creator Campaigns), was approved by the owner 2026-11-23. It carries the creator
// campaign tools, but NOT the three that pay or charge (pay_campaign_creators, creator_campaign_funds) or build ads
// (promote_campaign_post): Anthropic's connector checklist does not accept money transfer, and pay_campaign_creators is a
// preview AND a payment in one tool, which the same checklist rejects outright. Payouts stay in the Hermoso app, paid
// through Stripe; payout status is read here (read_creator_campaigns, creator_campaign_report). creator_directory is off
// for the same mixed reason (its list action shares a tool with ban / unban).
//
// The tokens are NEW on purpose: `directory`, `directory-ads` and `directory-social` keep serving the old listings
// unchanged until Anthropic removes them.
//
// This module is pure data and helpers with no imports, so mcp/tools.mjs (and its CLI twin) can read it at any point.
// cli/mcp/directory-curated.mjs is a byte-identical twin.

// Per tool: t = title, d = description (<= ~600 chars, no instruction to call other software, no promotional wording),
// ro = readOnlyHint, de = destructiveHint. A read is ro:true (metering Hermoso credits is not a write); a write that
// publishes, changes or removes something is de:true; upload_file only stores the user's own file and returns a URL, so
// it is neither. Such an ADDITIVE write is declared with A (add:true) and is allowed only where the canonical tool is not
// destructive either (the check pins both halves), so the flag can never be used to soften a real write.
const R = (t, d) => Object.freeze({ t, d, ro: true, de: false });
const W = (t, d) => Object.freeze({ t, d, ro: false, de: true });
const A = (t, d) => Object.freeze({ t, d, ro: false, de: false, add: true });
// A read shared by several connectors whose wording differs per connector: `s` maps a curated token to its description;
// `d` (the first one) is the fallback.
const S = (t, s) => Object.freeze({ t, d: Object.values(s)[0], s: Object.freeze({ ...s }), ro: true, de: false });

export const DIRECTORY_CURATED_DEFS = Object.freeze({
  // ── research (Hermoso Ad Research) ──
  find_competitors: R('Find competitor brands', 'Lists competitor, similar and adjacent brands for a company, from its website domain. Each result has the brand name, domain, kind (competitor, similar or adjacent) and a one-line reason. mode: competitors (default; leaves the searched company out), inspiration (relevant brands known for strong advertising, with the searched company included) or company. Uses a language model grounded in a web search. Read-only; uses Hermoso credits.'),
  competitor_teardown: R('Competitor ad teardown', 'Summarizes how one competitor advertises: the mix of opening hooks, the themes of its longest-running ads, the gaps nobody in its set covers, and the positions it owns. Takes competitor {name, domain}. With ads (ad objects from an earlier ad-library search) it analyzes exactly those; otherwise it first reads the competitor\'s longest-running Meta ads. Uses the saved brand profile, if any, for context. Read-only; uses Hermoso credits (free when ads are passed in).'),
  pull_competitor_ads: R('Pull a brand\'s Meta ads', 'Returns the ads a named brand runs in the Meta Ad Library (Facebook, Instagram, Messenger and Threads): copy, call to action, link, media and run dates, deduplicated and sorted. Takes the brand name (companyName) and, optionally, its domain, which helps pick the right Facebook Page; country narrows the region and sort picks the order. Covers the Meta Ad Library only. Read-only; uses Hermoso credits.'),
  research_ads: R('Research ads across platforms', 'Answers an open-ended advertising question across several brands or platforms, such as which angles are working in a category or how two brands compare. Runs several ad-library and social searches, then returns a written summary with the ads it is based on. Takes 30 to 60 seconds; a question about one named brand or one keyword is answered faster by a single search. The question goes in query. Read-only; uses Hermoso credits for each search it runs.'),
  search_meta_ads: R('Search the Meta Ad Library', 'Searches the Meta Ad Library (Facebook, Instagram, Messenger, Threads) by keyword (query) or by one advertiser (companyName, domain or pageId). Filters: country, status (ACTIVE, INACTIVE or ALL), mediaType and limit. Returns compact JSON per ad: page name, body, call to action, link, dates and media. An advertiser search returns only that advertiser\'s ads, or none plus similarly named Pages to retry by pageId. Read-only; uses Hermoso credits per library read.'),
  search_google_ads: R('Search Google ads', 'Lists one advertiser\'s ads from the Google Ads Transparency Center, by domain or advertiserId, optionally for one region. Returns compact JSON per ad: advertiser, format, ad URL, image, first shown and last shown. Uses the basic listing, which has no per-ad headlines. Read-only; uses about one Hermoso credit.'),
  search_linkedin_ads: R('Search LinkedIn ads', 'Searches the LinkedIn Ad Library by company name, keyword or companyId, optionally limited to countries. Returns compact JSON per ad: advertiser, headline, description, call to action, link, media, dates and LinkedIn\'s impression counts. Read-only; uses about one Hermoso credit.'),
  search_tiktok: R('Search TikTok videos', 'Searches organic TikTok videos by keyword and returns the top-performing ones, ranked by plays: caption, handle, followers, plays, likes, comments, shares, length, post date, link and cover image. Filters: datePosted, sortBy, minViews, video length, maxPerCreator, and region (where TikTok is read from, not where posts come from). Organic posts only; this is not an ad library. Read-only; uses about one Hermoso credit.'),
  search_instagram: R('Search Instagram Reels', 'Searches organic Instagram Reels by keyword in their captions and returns them ranked by plays: caption, handle, plays, likes, comments, length, post date, link and cover image. It matches captions worldwide and cannot be limited to one country or language, so for a local market search in the words people there use. Read-only; uses about one Hermoso credit.'),
  search_youtube: R('Search YouTube videos', 'Searches YouTube videos by keyword and returns them ranked by views: title, channel, handle, views, length, upload date, link and thumbnail. Filters: uploadDate, sortBy, duration and region. Read-only; uses about one Hermoso credit.'),
  search_reddit: R('Search Reddit posts', 'Searches Reddit posts by keyword (top-ranked) and returns the title and text, subreddit, upvotes, comment count and link of each post. Useful for the words customers use about a problem or a product category. Read-only; uses about one Hermoso credit.'),
  search_threads: R('Search Threads posts', 'Searches public Threads posts by keyword and returns the text, author, handle, likes, link and image of each post. Read-only; uses about one Hermoso credit.'),
  check_ad_policy: R('Check ad copy against Meta policy', 'Checks ad copy against Meta\'s Advertising Standards, read live from Meta\'s policy pages. Returns a verdict (pass, fix or block); each flagged issue quotes the relevant policy text and suggests compliant wording. Takes the copy, and optionally the claims, the category and a description of the image. It only reports: nothing is changed or submitted. Read-only; uses one Hermoso credit.'),
  analyze_video: R('Analyze a video ad', 'Reads a video from a public URL and returns its structure: a verbatim transcript (voiceover and on-screen text), a beat list with timestamps, the duration and the sampled frame times. Read-only; uses Hermoso credits for one transcription.'),
  get_brand: R('Get the saved brand profile', 'Returns the brand profile saved in the user\'s Hermoso workspace (name, website, products, positioning, palette and saved notes), or hasBrand:false when none is saved. brand reads a specific brand in the workspace. Read-only; no credits.'),
  list_swipefile: R('List saved ads and creators', 'Lists the ads and creators saved in this workspace\'s swipefile, by collection: advertiser, headline, body copy, media URL, platform, date saved and any tags. A saved creator also carries its handle, platform, public contact details, stats and outreach status. collection reads one collection and limit caps the rows. Read-only; no credits.'),
  find_creators: R('Find creators in a niche', 'Searches organic TikTok, Instagram Reels and YouTube for a niche, product category or hashtag, groups the posts by creator, and ranks the creators on median views, engagement rate and how often they appear for that niche. Returns handle, platform, post count, median views, engagement, a score and sample posts; the top rows also get follower counts and the public profile details the creator lists (bio link, business email or category). Filters: platforms, limit, minAvgViews, minEngagement. Read-only; uses Hermoso credits per search.'),
  hermoso_credits: R('Credit balance', 'Returns the workspace\'s Hermoso credit balance and the recent calls that used credits, with the credits each used. Read-only; no credits.'),

  // ── accounts (scheduler + reporting) ──
  list_connectors: R('List connected accounts', 'Lists the third-party accounts connected to this Hermoso workspace (provider, status and account label) and the providers available to connect. It also flags a connection whose permissions are out of date; the user fixes that by reconnecting it in the Hermoso app. Read-only; no credits.'),
  // Shared by the Scheduler and Ads Reporting, so each connector gets its own wording (S: per-connector descriptions):
  // Anthropic's review of Ads Reporting (2026-11-26) asked that a connection with no posting tools never mention posting.
  list_connector_accounts: S('List a connection\'s accounts', {
    'directory-scheduler': 'Lists every identity each connected provider can act as (Facebook Pages, Instagram accounts, LinkedIn company Pages and personal profile, TikTok, X, YouTube, Threads, Bluesky, Telegram and Pinterest accounts, Google Business listings, and the ad, analytics and webmaster accounts on the same connections) and which of them this brand is allowed to use. provider limits it to one, for example meta, instagram, linkedin, pinterest, tiktok, x, youtube or google_business. Only allowed identities can be posted to. Read-only; no credits.',
    'directory-reports': 'Lists every account each connected provider can reach (Meta Pages and ad accounts, Google Ads, LinkedIn, TikTok, Microsoft, Reddit, Pinterest and X ad accounts, Google Analytics properties, Search Console sites and so on) and which of them this brand is allowed to use. provider limits it to one, for example meta, google_ads, linkedin_ads, tiktok_ads, microsoft_ads, reddit_ads, pinterest_ads, x_ads, google_analytics or google_search_console. Only allowed identities can be reported on. Read-only; no credits.',
  }),
  list_meta_pages: S('List Facebook Pages and ad accounts', {
    'directory-scheduler': 'Lists the Facebook Pages (with any linked Instagram business account) and the Meta ad accounts on the connected Meta account, with their ids. The Page ids choose which Page a post goes to. Read-only; no credits.',
    'directory-reports': 'Lists the Facebook Pages (with any linked Instagram business account) and the Meta ad accounts on the connected Meta account, with their ids. The ids choose which Page or ad account is read. Read-only; no credits.',
  }),

  // ── scheduler (Hermoso Social Scheduler) ──
  list_linkedin_pages: R('List LinkedIn company Pages', 'Lists the LinkedIn company Pages the connected account administers: id, name and role. A post goes to a company Page only when its id is passed; without one it goes to the person\'s own profile. An empty list means the account holds no Page admin role or LinkedIn has not granted the organization permission. Read-only; no credits.'),
  list_pinterest_boards: R('List Pinterest boards', 'Lists the boards on the connected Pinterest account: id, name, privacy and pin count. Pinterest requires a board for every Pin, and Hermoso never picks one for the user. Read-only; no credits.'),
  tiktok_creator_info: R('Read TikTok posting options', 'Returns the connected TikTok account\'s current posting options: the privacy levels it may use, whether comments, duets and stitches are available, its maximum video length and its nickname. TikTok requires these options to be shown to the user, and the privacy level to be the user\'s own choice, before a video or photo post is published. Read-only; no credits.'),
  list_scheduled: R('List scheduled and past posts', 'Lists posts queued to publish and posts that already went out, with per-channel outcomes (for example Instagram published and TikTok failed on the same item). Compact by default: the next 25 queued and the last 15 sent, captions shortened. id returns one post in full, channel filters by channel, and upcoming / fired return more rows. Read-only; no credits.'),
  list_published_posts: R('List published posts', 'Lists every post Hermoso recorded publishing for this brand, newest first, across channels: channel, permalink, caption, format and measured engagement. channel filters by channel, and cursor (the nextCursor of the previous reply) returns older posts. A dash for engagement means the platform reported no number, not zero. Read-only; no credits.'),
  post_performance: R('Post performance by hook or channel', 'Groups this brand\'s published posts by hook (default), subject, format, channel, media format or posting hour, and reports the engagement rate within each channel with the highest- and lowest-engagement posts per channel. Metrics are never summed across channels, and no verdict is given below 5 measured posts. axis, channel and days narrow it. Read-only; no credits.'),
  list_inbox: R('List comments and messages', 'Lists what people said to this brand on its connected channels: comments, replies, mentions, reviews and messages from every connected source: Facebook, Instagram, Threads, YouTube, TikTok, LinkedIn, Google Business reviews, Bluesky, X, Telegram, WhatsApp, iMessage, SMS, LINE, Intercom, Slack and Discord messages, email, and voice-agent call records. Each item has an id to reply to. A channel that is not connected is skipped and named; one that fails to read is named in notes. TikTok and LinkedIn comments are read per post (tiktokVideoId, linkedinPostUrn). Read-only; free except X, which uses credits per item.'),
  upload_file: A('Upload a file to get a hosted URL', 'Stores a file the user already has (image, video, audio, PDF or document, up to 150MB) in their Hermoso Library and returns a durable public URL that the posting and scheduling tools accept. It takes exactly one source: url (any public http or https link, fetched server-side) or dataUri (a base64 data: URI under about 15MB). Returns {url, kind, bytes}. Nothing is published. No credits.'),
  schedule_post: W('Schedule a post', 'Schedules a post on one or more connected channels (channels: the social networks, plus Google Business, WordPress, Webflow, Wix, a Shopify blog, Slack, Discord or Whop) for at (with timezone) or the brand\'s next free posting slot (useQueue:true), with the caption (message, or captions per channel) and media URLs (imageUrl, videoUrl, or imageUrls in order for a carousel). Pinterest needs boardId, a LinkedIn company Page linkedinOrganizationId, and several Facebook Pages pageId. The post goes live publicly at that time. No credits except X.'),
  reschedule_post: W('Change a scheduled post', 'Changes a post that is still queued: its time, caption, media, channels or destination (board, Page, company Page or account). Takes the post id and only the fields that change; an omitted field stays as it was and an empty string clears it. The edited post is re-checked against the same rules as a new one. A post that already published cannot be changed here. No credits.'),
  cancel_scheduled: W('Cancel a scheduled post', 'Removes a queued post before it publishes, by its post id. A post that already published cannot be unsent. No credits.'),
  retry_scheduled: W('Retry a failed scheduled post', 'Sends a failed scheduled post again, right away. By default only the channels that failed are re-sent; a channel that already published is refused rather than posted twice. The fields that caused the failure (boardId, pageId, linkedinOrganizationId, locationId, message, captions) can be corrected in the same call and are re-validated. Takes the post id. No credits except X.'),
  post_to_meta: W('Publish to Facebook, Instagram or Threads', 'Publishes now to a connected Facebook Page (target:facebook, the default), its linked Instagram business account (target:instagram, needs an image or video) or the brand\'s Threads account (target:threads). Text, link, image, video or a carousel (imageUrls in order, published as one post). Media URLs must be public https links or Hermoso-hosted URLs. collaborators invites up to 3 Instagram accounts to co-author. Publishes immediately and publicly. No credits.'),
  post_to_x: W('Publish to X', 'Publishes now to the connected X account: a single post, a post with an image or video, a reply (replyToId), or a thread (thread as an array, each part replying to the one before). Text is never truncated. Publishes immediately and publicly. Uses Hermoso credits at X\'s per-post API price, higher for a post that contains a link; dryRun:true posts nothing and returns the exact cost.'),
  post_to_linkedin: W('Publish to a LinkedIn profile', 'Publishes now to the connected person\'s own LinkedIn profile: text with an image, 2 to 20 images (imageUrls), a video (videoUrl, with optional captionsSrt and cover), a link with a preview card (linkUrl, linkTitle, linkDescription, linkThumbnailUrl) or a document (documentUrl, PDF or PPTX). Media must be a Hermoso-hosted URL. Publishes immediately and publicly. No credits.'),
  post_to_pinterest: W('Create a Pin', 'Creates a Pin now on one of the connected Pinterest account\'s boards (boardId is required) from an image, a video, or a 2 to 5 image carousel (imageUrls in order). Title, description and destination link are optional; the link is what sends Pinterest traffic to a site. Media must be a Hermoso-hosted URL. Video Pins take a minute or two to process. Publishes to the public profile. No credits.'),
  post_to_bluesky: W('Publish to Bluesky', 'Publishes now to the connected Bluesky account: text up to 300 characters and 3,000 bytes, images (imageUrls, with altText), a video, a link card, or a thread. A video needs a confirmed email on the Bluesky account. Returns the post\'s public bsky.app URL. Publishes immediately and publicly. No credits.'),
  post_to_telegram: W('Publish to Telegram', 'Publishes now to a Telegram channel, group or chat as the brand\'s own bot. chatId is required: the channel\'s @username or its numeric id. The bot must be in the chat (an administrator with Post Messages for a channel). Text, an image, several images, a video or a document, with optional buttons. No credits.'),
  post_to_youtube: W('Upload a video to YouTube', 'Uploads a video to the connected YouTube channel with title, description, tags, thumbnail and playlist. privacy is public by default, or unlisted or private; publishAt schedules the release. Subscribers are notified only for a public upload unless notifySubscribers says otherwise. Publishes immediately. No credits.'),
  post_to_tiktok: W('Publish to TikTok', 'Publishes now to the connected TikTok account: a video (videoUrl) or a photo post of 1 to 35 images (imageUrls in order), never both. TikTok requires the privacy level to be the user\'s own choice among the options their account allows (tiktok_creator_info lists them); privacy carries that choice. destination:draft sends it to the user\'s TikTok inbox instead, to finish and publish in the TikTok app. No credits.'),
  reply_to_inbox_item: W('Reply to a comment or message', 'Posts a reply to one comment, review, mention or direct message, by the id from the inbox list. The reply is sent as the brand: public on comments, replies, mentions and reviews; private on direct messages, WhatsApp, iMessage, SMS, LINE, Intercom and email. A WhatsApp reply is accepted only while its 24-hour window is open. An X mention is answered with a new post rather than here; an X direct message is answered here and uses credits. Otherwise no credits.'),

  // ── reporting (Hermoso Ads Reporting) ──
  list_meta_ads: R('List Meta campaigns, ad sets and ads', 'Reads the existing campaigns, ad sets or ads on a connected Meta ad account: id, name, status, budget, objective, and for ads Meta\'s review feedback. Takes adAccountId and level (campaign, adset or ad); campaignId or adsetId narrow it and status filters it. Read-only; no credits.'),
  meta_insights: R('Meta ad performance', 'Reads performance for a Meta ad account, or one campaign, ad set or ad (objectId, level): spend, impressions, reach, clicks, CTR, CPC, CPM, frequency, conversions such as purchases, ROAS and cost per purchase, and video plays. Dates: datePreset (Meta\'s values, e.g. last_7d, last_30d, maximum) or since and until. breakdowns splits by age, gender, placement, country or device; timeIncrement gives daily, weekly or monthly rows. A null metric was not reported by Meta, never zero. Read-only; no credits.'),
  meta_page_insights: R('Facebook Page insights', 'Reads organic performance for a connected Facebook Page: views and reach, post engagements, video views, follows and follower count, with the linked Instagram account\'s headline numbers alongside. A metric Meta returns no value for is named as missing, never reported as zero. Read-only; no credits.'),
  instagram_insights: R('Instagram account insights', 'Reads account-level performance for a connected Instagram business account: views, reach, accounts engaged, interactions, likes, comments, shares, saves and follows, plus follower and engaged-audience demographics by age, city, country or gender. Instagram returns no demographics for an account under 100 followers. Read-only; no credits.'),
  list_google_ads_campaigns: R('List Google Ads accounts and campaigns', 'Without customerId, lists the Google Ads accounts the connection can reach (id, name, currency). With customerId, lists that account\'s campaigns (id, name, status, daily budget, channel) with impressions, clicks, CTR, average CPC, cost and conversions for a datePreset (e.g. LAST_30_DAYS) or since and until. Read-only; no credits.'),
  google_ads_report: R('Google Ads query report', 'Runs a read-only Google Ads Query Language (GAQL) report for a customerId: performance by ad group, ad, keyword, search term, age, gender, location or another documented report resource. Takes a SELECT query, e.g. SELECT campaign.name, metrics.clicks FROM campaign WHERE segments.date DURING LAST_30_DAYS. cost_micros is in millionths of the account currency. Read-only; no credits.'),
  google_ads_keyword_ideas: R('Google keyword ideas and volumes', 'Returns keyword ideas from Google\'s Keyword Planner with average monthly search volume, competition and top-of-page bid estimates, sorted by volume. Seeds are keywords, a page url or a whole site; locations (place names) and language narrow it. It only reads: nothing is created and nothing is spent. No credits.'),
  list_linkedin_ads_campaigns: R('List LinkedIn ad accounts and campaigns', 'Lists the LinkedIn ad accounts this connection can reach and, with adAccountId, that account\'s campaign groups and campaigns: name, status, objective, budgets and LinkedIn\'s serving statuses, which explain why something is not delivering. Read-only; no credits.'),
  linkedin_ads_report: R('LinkedIn ads performance', 'Reads LinkedIn ad performance (impressions, clicks, cost, conversions, leads, social actions) between since and until, pivoted by one dimension: campaign (default), campaign group, creative, account, placement, device, or a member demographic such as job title, seniority, industry or company size. Demographic pivots show the top 100 values, drop values under 3 events and lag 12 to 24 hours. Zero rows means no delivery. Read-only; no credits.'),
  list_tiktok_ads_campaigns: R('List TikTok campaigns, ad groups and ads', 'Reads a TikTok advertiser account\'s campaigns, ad groups and ads, with their statuses, in one call. advertiserId is optional when the brand has one account; with several, the reply lists them. A level that fails to read is reported as failed, never as empty. Read-only; no credits.'),
  tiktok_ads_report: R('TikTok ads performance', 'Reads TikTok ads performance at advertiser, campaign, ad group or ad level: spend, impressions, clicks, CTR, CPC, CPM and conversions by default, or the metrics and dimensions requested. reportType BASIC (default) or AUDIENCE, which breaks results down by age, gender, country or interest. Zero rows means nothing delivered in that window. Read-only; no credits.'),
  list_microsoft_ads_campaigns: R('List Microsoft Advertising campaigns', 'Without adAccountId, lists the Microsoft Advertising accounts shared with this brand. With adAccountId, lists that account\'s campaigns: id, name, status, daily budget, campaign type and whether the budget is shared. Statuses are reported as Microsoft returns them. Read-only; no credits.'),
  microsoft_ads_report: R('Microsoft Advertising performance', 'Reads a Microsoft Advertising report: impressions, clicks, CTR, average CPC, spend and conversions. reportType picks the report (campaign, ad group, ad, keyword, search query, geographic, age and gender, conversion and others); aggregation sets the row grain; timePeriod (default Last30Days) or since and until set the window. Microsoft builds reports asynchronously: a pending reply with reportRequestId means call again with that id. Read-only; no credits.'),
  list_reddit_ads_campaigns: R('List Reddit ad accounts and campaigns', 'Without adAccountId, lists the Reddit ad accounts shared with this brand. With adAccountId, reads that account\'s campaigns, ad groups and ads with both the configured status and Reddit\'s effective status (for example PENDING_APPROVAL or REJECTED). Read-only; no credits.'),
  reddit_ads_report: R('Reddit ads performance', 'Reads Reddit ads performance (impressions, clicks, spend, CTR, CPC, eCPM, reach and other Reddit metric fields), optionally broken down by campaign, ad group, ad, date, hour, community, country, interest, keyword or placement. Money is in whole units of the ad account\'s currency. Dates (since, until) are snapped to Reddit\'s hourly boundaries. Zero rows means nothing delivered. Read-only; no credits.'),
  list_pinterest_ads_campaigns: R('List Pinterest ad accounts and campaigns', 'Without adAccountId, lists the Pinterest ad accounts shared with this brand. With adAccountId, lists that account\'s campaigns (id, name, status, objective, budget); with campaignId, that campaign\'s ad groups and ads. Draft and archived objects are included. Money is in the ad account\'s currency. Read-only; no credits.'),
  pinterest_ads_report: R('Pinterest ads performance', 'Reads Pinterest ads performance (spend, impressions, clicks, CTR, CPC, conversions) at account, campaign, ad group or ad level. Campaign, ad group and ad levels need their ids (campaignIds, adGroupIds, adIds); account level needs none. since and until set the window (Pinterest keeps 90 days) and granularity sets the row grain. Zero rows means nothing delivered. Read-only; no credits.'),
  list_x_ads_campaigns: R('List X ads campaigns', 'Lists the campaigns on a connected X ad account: status, budgets and whether X considers each one servable. adAccountId is optional when only one account is reachable. Read-only; no credits.'),
  x_ads_report: R('X ads performance', 'Reads performance for X campaigns, line items or promoted posts (entity, and up to 20 entityIds) between startTime and endTime. An id that does not exist on the account returns all-null metrics, which is flagged rather than reported as zero. Read-only; no credits.'),
  list_openai_ads_campaigns: R('List ChatGPT Ads campaigns', 'Reads the connected ChatGPT Ads account: with no ids, the account (names, currency, status, review state) and its campaigns; with campaignId, that campaign\'s ad groups; with adGroupId, that ad group\'s ads with their review status. Each row lists OpenAI\'s serving issues, such as payment method, review or budget. Read-only; no credits.'),
  openai_ads_report: R('ChatGPT Ads performance', 'Reads ChatGPT Ads performance: impressions, clicks, spend, CTR, CPC, CPM and conversions with CPA and conversion rate, for the whole account or a campaignId, adGroupId or adId. granularity is hourly, daily (default), monthly or none; the default window is the last 30 days; segment splits by country or device. clickWindowDays and viewWindowDays choose the attribution windows. No rows means no delivery. Read-only; no credits.'),
  list_analytics_properties: R('List Google Analytics properties', 'Lists the Google Analytics 4 properties shared with this brand, with the numeric property id each report needs (not the G- measurement id), the display name and the Analytics account. An empty list means no property has been selected for this brand in the Hermoso app. Read-only; no credits.'),
  analytics_report: R('Google Analytics report', 'Runs a Google Analytics 4 report for a property (the numeric property id). Takes metrics (e.g. activeUsers, sessions, conversions, totalRevenue) and dimensions (e.g. sessionSource, sessionCampaignName, landingPage, country, date). Dates default to the last 28 days; compare:previous_period adds the earlier period and the change. Sampled or thresholded data is noted in completenessNotes. Read-only; no credits.'),
  list_search_console_sites: R('List Search Console sites', 'Lists the Google Search Console properties shared with this brand, each with the exact siteUrl the performance report needs (sc-domain:example.com or https://example.com/) and the permission level held on it. An empty list means no property has been selected for this brand in the Hermoso app. Read-only; no credits.'),
  search_console_performance: R('Google Search Console performance', 'Reads Google Search Console performance for a siteUrl between startDate and endDate (YYYY-MM-DD, Pacific time): clicks, impressions, CTR and average position, by query (the words people searched), page, country, device, search appearance or date. Rows are the top ones only, anonymised queries are withheld, and final data lags 2 to 3 days. Read-only; no credits.'),

  // ── creators (Hermoso Creator Campaigns) ──
  // Every write here is destructiveHint:true except the two that only add to the workspace's own records: a new campaign
  // is a DRAFT nobody can join, and a saved row is a shortlist entry. An invite is destructive because a personal invite
  // skips join approval (the creator is in, under the campaign's pay), and a new open link turns the old one off.
  save_to_swipefile: A('Save creators or ads to a collection', 'Saves one or more rows to a named collection in this workspace\'s swipefile, creating the collection if it does not exist. Takes collection and items. A creator row from the creator search (platform "creator", with its creator object: handle, platform, contact details and stats) is saved as a creator, ready for an outreach status; an ad row (advertiser, title, body, image, video, link, platform) is saved as an ad. Saving a row that is already saved moves it to this collection rather than duplicating it. Nothing is sent to anyone. No credits.'),
  update_saved_creator: W('Set a saved creator\'s outreach status', 'Sets the outreach status (new, contacted, replied, booked or passed) and/or a note (deal terms, rate, what was sent) on a creator saved in the swipefile, by the key the saved list shows (for example tiktok:handle). A note replaces the previous one; an empty note clears it. Reads back the updated row. It changes only the workspace\'s own record; nothing is sent to the creator. No credits.'),
  create_creator_campaign: A('Create a creator campaign (draft)', 'Creates a creator campaign, in which the brand pays creators for posts about it, as a DRAFT. Takes the name, brief, platforms (TikTok, Instagram, YouTube, Facebook, X, Threads) and the payout model in economics: cpm (per 1,000 verified views, with budgetUsd), flat (per approved post) or pool (a fixed amount split by views at close). Optional: requirements (disclosure, hashtags, mentions), hold days, dates, caps, usage rights and the sign-up page. Creators join by link without a Hermoso account and submit post links; the brand approves or rejects each post. A draft is not live and commits no money until its status is set to active. No credits.'),
  read_creator_campaigns: R('List creator campaigns', 'Lists the brand\'s creator campaigns with their payout model, budget used, creators, posts waiting for review, approved views, and money held, payable and paid. With campaignId, also that campaign\'s creators (with the participant ids the creator review takes), latest posts and payout batches, which is where payout status is read. It also says whether payouts through Hermoso are switched on and the fee. status filters the list. Read-only; no credits.'),
  update_creator_campaign: W('Change a creator campaign or its status', 'Changes a campaign\'s name, brief, budget (budgetUsd; once live it can only go up, never below what creators already earned), dates, caps, requirements, usage rights, visibility, hold days or sign-up page. status sets it active (creators can join and submit), paused (no new posts; tracking continues), closed (the join link stops; approved earnings stay payable) or reopen. Closing and reopening also need confirm:true. A change to pay, the hold or usage rights becomes a new terms version, and the reply says who it applies to. No credits.'),
  preview_creator_campaign: R('Preview a campaign as creators see it', 'Returns short-lived (30-minute), brand-only preview links for each screen a creator sees: the join page, an invited creator\'s page, the creator\'s campaign view and the marketplace card (view). Unsaved settings can be passed in overrides to see a change before making it. Nothing in a preview can be joined, submitted or agreed to, and no creator record or email is created. Read-only; no credits.'),
  creator_campaign_link: W('Get a join link or invite a creator', 'Without displayName, returns a new open join link for the campaign (anyone with it can join; the previous open link stops working). With displayName (and optional email and accounts), invites one creator and returns their personal link, where they add accounts, submit posts and see earnings; a personal invite skips join approval. With creators (up to 25 rows, for example from the creator search), returns a personal link and a ready-to-send message for each; a creator already in the campaign is skipped. Hermoso sends nothing: the user shares the links. No credits.'),
  bulk_invite_creators: W('Invite many creators to a campaign', 'Invites up to 100 creators to a campaign at once (name, and optionally email, handle or profile link). Each gets a personal link and a ready-to-send message, returned in the reply; a personal invite skips join approval. Names already in the campaign are skipped. Hermoso emails none of them: the user sends the links. No credits.'),
  email_campaign_creator: W('Email a creator their invite or link', 'Emails one campaign creator, by participantId, from Hermoso\'s address, at the user\'s request: kind invite (the invite with their personal link) or link (a fresh personal link; the old one stops working). Needs the creator\'s email (email adds one). At most 3 emails a day to one creator, and a creator who unsubscribed is never emailed. No credits.'),
  review_campaign_creator: W('Approve, suspend or remove a creator', 'Decides on one creator in a campaign, by participantId: approve or deny a creator waiting to join, suspend (their posts stop counting and payouts skip them) or reinstate one, or remove one (earnings already approved stay theirs). grant_retainer, with period (YYYY-MM), grants a retainer month that had fewer approved posts than the minimum, which adds that month\'s retainer to what the brand owes the creator. No credits.'),
  list_campaign_posts: R('List submitted campaign posts', 'Lists posts creators submitted to the brand\'s campaigns: platform-reported views, an authenticity score from 0 to 100 with the reasons points were taken off, flags (no_disclosure, missing_hashtag, missing_mention, views_hidden, low_authenticity), status and what each has earned. campaignId and status filter it (pending_review for the posts that need a decision); limit and offset page through. Read-only; no credits.'),
  review_campaign_post: W('Approve or reject a campaign post', 'Decides on one submitted post, by submissionId: approve (it earns under the campaign\'s payout model; earnings are held, then payable), reject with a reason (its unpaid earnings are cancelled), request_changes (with what to change; atSecond points at a moment in the video), or comment. The creator sees it in the post\'s feedback thread and is emailed. taken_down records that a post came down early (a preview first, then confirm:true) and cancels its unpaid earnings; restore undoes it. Hermoso never approves or rejects on its own. No credits.'),
  creator_campaign_report: R('Creator campaign report', 'One campaign\'s report, by campaignId: spend against budget, posts, approved views, cost per 1,000 views, each creator\'s posts, views, earnings and payout status, top posts and the spread of authenticity scores. format csv returns it as CSV (rows creators or posts, money in US dollars) with a download link. Read-only; no credits.'),
});

// The three connectors. Order is the order the listing shows; every name must have a row above.
export const DIRECTORY_CURATED = Object.freeze({
  // Connector A: Hermoso Ad Research. Read-only. mine_angles is NOT here although the plan listed it: its result hands
  // back the arguments for image generation calls (WITHHELD_FROM_DIRECTORY since 2026-09-25), so it stays off.
  // find_creators added by the owner 2026-11-22: it only searches and bills credits (POST /api/creators/search writes no
  // store row and moves no money); its reply's creator-campaign next step is removed by curatedScrubResult below.
  'directory-research': Object.freeze([
    'find_competitors', 'competitor_teardown', 'pull_competitor_ads', 'research_ads', 'search_meta_ads', 'search_google_ads',
    'search_linkedin_ads', 'search_tiktok', 'search_instagram', 'search_youtube', 'search_reddit', 'search_threads',
    'check_ad_policy', 'analyze_video', 'find_creators', 'get_brand', 'list_swipefile', 'hermoso_credits',
  ]),
  // Connector B: Hermoso Social Scheduler. tiktok_creator_info is added to the plan's list: TikTok's Direct Post rules
  // require the user to see the account's real privacy options before a post, and post_to_tiktok cannot comply without it.
  'directory-scheduler': Object.freeze([
    'list_connectors', 'list_connector_accounts', 'list_meta_pages', 'list_linkedin_pages', 'list_pinterest_boards',
    'tiktok_creator_info', 'list_scheduled', 'list_published_posts', 'post_performance', 'list_inbox', 'get_brand',
    'upload_file', 'schedule_post', 'reschedule_post', 'cancel_scheduled', 'retry_scheduled', 'post_to_meta', 'post_to_x',
    'post_to_linkedin', 'post_to_pinterest', 'post_to_bluesky', 'post_to_telegram', 'post_to_youtube', 'post_to_tiktok',
    'reply_to_inbox_item',
  ]),
  // Connector C: Hermoso Ads Reporting. Read-only. list_meta_pages, list_analytics_properties and list_search_console_sites
  // are added to the plan's list: meta_insights needs an ad account id, analytics_report a numeric GA4 property id and
  // search_console_performance an exact siteUrl, and these three are the only way to read them.
  'directory-reports': Object.freeze([
    'list_connectors', 'list_connector_accounts', 'get_brand', 'list_meta_pages', 'list_meta_ads', 'meta_insights',
    'meta_page_insights', 'instagram_insights', 'list_google_ads_campaigns', 'google_ads_report', 'google_ads_keyword_ideas',
    'list_linkedin_ads_campaigns', 'linkedin_ads_report', 'list_tiktok_ads_campaigns', 'tiktok_ads_report',
    'list_microsoft_ads_campaigns', 'microsoft_ads_report', 'list_reddit_ads_campaigns', 'reddit_ads_report',
    'list_pinterest_ads_campaigns', 'pinterest_ads_report', 'list_x_ads_campaigns', 'x_ads_report',
    'list_openai_ads_campaigns', 'openai_ads_report', 'list_analytics_properties', 'analytics_report',
    'list_search_console_sites', 'search_console_performance',
  ]),
  // Connector D: Hermoso Creator Campaigns (owner, 2026-11-23). Find and shortlist creators, run campaigns, invite, review
  // creators and posts, read reports and payout status. No tool that pays, charges, funds or builds an ad (see the header).
  'directory-creators': Object.freeze([
    'find_creators', 'save_to_swipefile', 'list_swipefile', 'update_saved_creator', 'create_creator_campaign',
    'read_creator_campaigns', 'update_creator_campaign', 'preview_creator_campaign', 'creator_campaign_link',
    'bulk_invite_creators', 'email_campaign_creator', 'review_campaign_creator', 'list_campaign_posts',
    'review_campaign_post', 'creator_campaign_report', 'get_brand', 'hermoso_credits',
  ]),
});

export const DIRECTORY_CURATED_TITLES = Object.freeze({
  'directory-research': 'Hermoso Ad Research',
  'directory-scheduler': 'Hermoso Social Scheduler',
  'directory-reports': 'Hermoso Ads Reporting',
  'directory-creators': 'Hermoso Creator Campaigns',
});

// Server instructions per connector: neutral, under 2 KB, naming no tool and no other product, and DESCRIPTIVE: what the
// tools do and what their data means, never a directive to the assistant (Anthropic's review of Ads Reporting,
// 2026-11-26: "Report the numbers … Do not add up …" read as imperatives; tools/directory-curated-check.mjs lints it).
export const MCP_INSTRUCTIONS_CURATED = Object.freeze({
  'directory-research': [
    'Hermoso Ad Research reads public advertising and social content for competitive research: the Meta, Google and LinkedIn ad libraries, and organic TikTok, Instagram, YouTube, Reddit and Threads posts. It can also summarize a competitor\'s ads and check ad copy against Meta\'s advertising standards.',
    'Every tool on this connection only reads. Nothing is posted, published or changed on any account.',
    'Searches use Hermoso credits; the credit balance tool shows the balance and recent charges.',
    'Ad-library results are public records, returned as each library reports them (advertisers, copy and run dates). A search that finds nothing returns no results, never a guess.',
    'A brand profile saved in the user\'s Hermoso workspace, if there is one, is used as context for teardowns.',
  ].join('\n'),
  'directory-scheduler': [
    'Hermoso Social Scheduler publishes and schedules the user\'s own posts to the user\'s own connected accounts: Facebook, Instagram, Threads, X, LinkedIn, Pinterest, Bluesky, Telegram, YouTube and TikTok, and, where connected, Google Business Profile, WordPress, Webflow, Wix, a Shopify blog, Slack, Discord and Whop. It lists and answers comments, reviews and messages on the connected channels, and reports how published posts performed.',
    'It does not create images or video. Media comes from the user, as a public link or as a file turned into a hosted URL by the upload tool.',
    'Every tool that publishes, schedules, changes, re-sends or cancels a post, or replies as the brand, works in two steps. The first call changes nothing: it returns a preview of the exact text, the media, each destination account and the timing, with a single-use confirmation code that expires after 10 minutes. The action runs only when the call is repeated with that code after the user approves the preview, or when the user accepts the confirmation form in clients that support MCP elicitation. The code is bound to the exact content and destinations, so any change needs a new preview.',
    'Hermoso never chooses an account, Page, board or chat on the user\'s behalf: with several connected and none named, the call is refused and the options are listed.',
    'A tool for a platform that is not connected answers with how to connect it in the Hermoso app.',
  ].join('\n'),
  'directory-reports': [
    'Hermoso Ads Reporting reads campaign and ad performance from the user\'s own connected ad accounts (Meta, Google Ads, LinkedIn, TikTok, Microsoft Advertising, Reddit, Pinterest, X and ChatGPT Ads) and website analytics (Google Analytics 4 and Google Search Console).',
    'Every tool on this connection only reads. Nothing is created, edited, activated, paused or deleted, and no budget is changed.',
    'Tools return the numbers each platform reports, in the account\'s own currency. A missing metric is returned as not reported, never zero, and no rows means no delivery in that window. Platforms define metrics such as conversions differently, so totals are not comparable across platforms.',
    'A tool for an account that is not connected answers with how to connect it in the Hermoso app.',
  ].join('\n'),
  'directory-creators': [
    'Hermoso Creator Campaigns runs a brand\'s creator campaigns: it finds creators whose organic posts do well in a niche, keeps a shortlist with an outreach status, creates and edits campaigns, invites creators with personal links, reviews the creators who join and the posts they submit, and reports views, spend and earnings.',
    'The brand pays creators under each campaign\'s payout model (per 1,000 verified views, per approved post, or a pool). Approving a post makes its earnings payable after the campaign\'s hold period. Payouts are made in the Hermoso app and paid through Stripe; no tool on this connection charges a card or sends a payout.',
    'Approving, rejecting or removing a creator or a post, inviting or emailing a creator, and changing a campaign or its status work in two steps: the first call changes nothing and returns a preview of exactly what will change with a single-use confirmation code, and the change runs only when the call is repeated with that code after the user approves, or when the user accepts the confirmation form in clients that support MCP elicitation. Hermoso never picks a creator on the user\'s behalf.',
    'Posts made for a campaign are paid partnerships; a post without an ad disclosure is flagged for the brand to review.',
    'Creator searches and reading a submitted post\'s views use Hermoso credits; the credit balance tool shows the balance and recent charges. Views, earnings and amounts are returned as recorded.',
  ].join('\n'),
});

// The `directory` value a curated token travels as through the transport (mcp/http.mjs passes scope.directory to
// registerTools and the whole scope to instructionsFor, so no transport change is needed).
export const CURATED_DIRECTORY_PREFIX = 'curated:';
export const isCuratedToken = (tok) => Object.prototype.hasOwnProperty.call(DIRECTORY_CURATED, String(tok || ''));
export const curatedDirectoryValue = (tok) => (isCuratedToken(tok) ? CURATED_DIRECTORY_PREFIX + tok : null);
export const curatedTokenOf = (directory) => {
  const s = typeof directory === 'string' ? directory : '';
  if (!s.startsWith(CURATED_DIRECTORY_PREFIX)) return null;
  const tok = s.slice(CURATED_DIRECTORY_PREFIX.length);
  return isCuratedToken(tok) ? tok : null;
};
// ── PARTNER ROSTERS: GEMINI AND MICROSOFT COPILOT STUDIO (2026-11-26, owner approved both packs) ─────────────────────
// Two hosts that cannot take the full roster:
//   gemini  — Google Connected Apps (the Gemini app + Search) and Gemini Enterprise custom MCP. Gemini Enterprise lets an
//             admin enable at most 100 actions (hermoso-integrations/google-cloud-marketplace/OWNER-STEPS.md, Route B),
//             and Google's MCP guide asks for readOnlyHint on reads and destructiveHint on state-changing actions.
//   copilot — Microsoft Copilot Studio (a certified Power Platform MCP connector). Agents degrade with a long tool list
//             and a tool call must answer inside 30 seconds (hermoso-integrations/copilot-studio/OWNER-STEPS.md).
// Each is an EXPLICIT allowlist, served exactly like a curated connector (only these names exist on the connection, a
// reply never names a tool the connection does not carry, a tool outside the list answers a held message), but it is NOT
// a Claude directory connector: generation is allowed, there is no consent scope of its own, and the directory cage's
// description rewrites do not apply. It travels as `directory: 'partner:<token>'`, so the transport needs no change.
// Reached as ?tools=gemini / ?tools=copilot, or by path /mcp/gemini, /mcp/copilot (MCP_PATH_ALIASES).
// What a partner session changes, all in mcp/tools.mjs (partnerDef, partnerHandlerFor) and pinned by
// tools/partner-roster-check.mjs:
//   • every listed tool that is not read-only declares destructiveHint:true, so the host asks before any write;
//   • copilot: a call still running at PARTNER_CALL_DEADLINE_MS answers at once with a `mcpc_` id that get_job resolves
//     (the work continues and is charged once), and a render waits PARTNER_RENDER_WAIT_MS before handing back its job id.
// No tool here buys credits, changes a plan or moves money.
export const PARTNER_DIRECTORY_PREFIX = 'partner:';
export const PARTNER_ROSTERS = Object.freeze({
  gemini: Object.freeze([
    // account + workspace
    'hermoso_capabilities', 'hermoso_credits', 'list_brands', 'use_brand', 'get_brand', 'draft_brand', 'update_brand', 'get_settings',
    'remember', 'list_memory', 'list_swipefile', 'save_to_swipefile',
    // research
    'find_competitors', 'competitor_teardown', 'pull_competitor_ads', 'research_ads', 'search_meta_ads', 'search_google_ads',
    'search_linkedin_ads', 'search_tiktok', 'search_instagram', 'search_youtube', 'search_reddit', 'search_threads',
    'check_ad_policy', 'analyze_video', 'mine_angles', 'find_creators',
    // create
    'plan_ad', 'render_ad', 'generate_image', 'generate_video', 'generate_avatar', 'make_template_ad', 'make_thumbnail',
    'clone_static', 'clone_video', 'reframe_video', 'upscale_video', 'add_subtitles', 'plan_variations', 'score_ad',
    'list_creators', 'save_creator', 'list_product_photos', 'get_job', 'list_jobs', 'list_library', 'fetch_asset', 'upload_file',
    // publish + schedule
    'list_connectors', 'list_connector_accounts', 'list_meta_pages', 'list_linkedin_pages', 'list_pinterest_boards', 'tiktok_creator_info',
    'schedule_post', 'list_scheduled', 'reschedule_post', 'cancel_scheduled', 'retry_scheduled', 'list_published_posts', 'post_performance',
    'post_to_meta', 'post_to_x', 'post_to_linkedin', 'post_to_pinterest', 'post_to_tiktok', 'post_to_youtube', 'post_to_bluesky',
    'post_to_telegram', 'list_inbox', 'reply_to_inbox_item',
    // ads + analytics
    'list_meta_ads', 'meta_insights', 'meta_page_insights', 'instagram_insights', 'create_meta_campaign', 'create_meta_adset',
    'create_meta_ad', 'set_meta_campaign_status', 'list_google_ads_campaigns', 'google_ads_report', 'create_google_ads_campaign',
    'set_google_ads_status', 'list_tiktok_ads_campaigns', 'tiktok_ads_report', 'list_linkedin_ads_campaigns', 'linkedin_ads_report',
    'analyze_campaigns', 'list_analytics_properties', 'analytics_report',
  ]),
  copilot: Object.freeze([
    'hermoso_capabilities', 'hermoso_credits', 'list_brands', 'use_brand', 'get_brand', 'draft_brand',
    'find_competitors', 'competitor_teardown', 'pull_competitor_ads', 'research_ads', 'search_meta_ads', 'search_google_ads',
    'search_tiktok', 'check_ad_policy', 'analyze_video',
    'plan_ad', 'render_ad', 'generate_image', 'generate_video', 'make_template_ad', 'get_job', 'list_jobs', 'list_library', 'upload_file',
    'list_connectors', 'list_connector_accounts', 'schedule_post', 'list_scheduled', 'reschedule_post', 'cancel_scheduled',
    'list_published_posts', 'post_performance',
    'list_meta_ads', 'meta_insights', 'list_google_ads_campaigns', 'google_ads_report', 'analyze_campaigns', 'analytics_report',
  ]),
});
export const PARTNER_TITLES = Object.freeze({ gemini: 'Hermoso for Gemini', copilot: 'Hermoso for Microsoft Copilot Studio' });
// The hard caps the hosts state, asserted by the check against the real registration (never a count in prose).
export const PARTNER_TOOL_CAPS = Object.freeze({ gemini: 100, copilot: 40 });
// Copilot Studio's 30-second rule: a call still running at the deadline answers with a resumable id instead.
export const PARTNER_CALL_DEADLINE_MS = Object.freeze({ copilot: 20_000 });
export const PARTNER_RENDER_WAIT_MS = Object.freeze({ copilot: 12_000 });
export const PARTNER_DEFERRED_PREFIX = 'mcpc_';
// Server instructions: descriptive, under 2 KB, naming only tools the connection carries.
export const MCP_INSTRUCTIONS_PARTNER = Object.freeze({
  gemini: [
    'Hermoso is an AI ad studio for the user\'s own brand: it researches competitors\' ads in public ad libraries and organic social posts, makes finished image and video ads with the brand\'s real product, publishes or schedules posts to the user\'s own connected accounts, and reads and manages campaigns on the ad accounts the user connected.',
    'get_brand returns the saved brand profile; draft_brand sets one up from a website, a description or a social handle. Research tools only read. plan_ad turns a brief into a concept; generate_image, render_ad and generate_video render it. A video render runs for minutes: a reply with a job id and stillRendering is resumed with get_job.',
    'Tools that publish, schedule, change a campaign or spend are marked destructive, so the host asks the user first. Paid actions use the workspace\'s Hermoso credits; hermoso_credits shows the balance.',
    'A tool for a platform that is not connected answers with how to connect it in the Hermoso app.',
  ].join('\n'),
  copilot: [
    'Hermoso is an AI ad studio for the user\'s own brand: competitor ad research, finished image and video ads made with the brand\'s real product, scheduled posts on the user\'s connected social accounts, and ad performance from the connected ad accounts.',
    'Every call answers within about 20 seconds. Work that takes longer keeps running and the reply carries a job id (a render job_ id, or an mcpc_ id for a long plan or research call); get_job with that id returns the result when it is ready, and the work is never charged twice.',
    'Tools that publish, schedule, change a campaign or spend are marked destructive. Paid actions use the workspace\'s Hermoso credits; hermoso_credits shows the balance.',
    'A tool for a platform that is not connected answers with how to connect it in the Hermoso app.',
  ].join('\n'),
});
// Plain-language descriptions for Copilot Studio (Microsoft's rules: no all-capitals imperatives, no other products'
// names, no prices) for the listed tools that have no curated row above. Every other tool keeps its curated row, or its
// canonical description where it has none.
export const PARTNER_DESCRIPTIONS = Object.freeze({
  copilot: Object.freeze({
    hermoso_capabilities: 'Returns what this Hermoso account can do now: the available image and video model ids with their credit costs, aspect ratios, video durations, creative recipe ids, and whether editing and avatars are available. Rendering works without it, since every render tool uses the server default model when none is named. Read-only; no credits.',
    list_brands: 'Lists every brand profile on this account (id and name), which one this connection acts on, and any profile another account shared with the user. Read-only; no credits.',
    use_brand: 'Sets which brand profile this connection acts on, by the id or exact name from the brand list, including a profile shared by another account. Membership is checked before the switch. It changes only which profile later calls use; nothing is published.',
    draft_brand: 'Sets up a brand profile from a website domain, a short description or a social handle: name, products, logo and summary. On an account with no saved brand it saves the profile and reads the product photos. With save:true it replaces the saved profile.',
    plan_ad: 'Turns a brand and a product or brief into an ad concept: copy variants (headline, primary text, call to action) and either an image prompt or a timed video storyboard, with the recipe and model to render it. It renders nothing. A video needs a length in durationSeconds. Uses a few Hermoso credits.',
    render_ad: 'Renders a finished video ad from a plan_ad concept (passed as creative) on a real video model, with the brand\'s saved product photo in the shots. Returns the mp4 link, or a job id while it renders; get_job returns the finished file. dryRun:true shows the price and the shot split without rendering. Uses Hermoso credits.',
    generate_image: 'Renders a finished image ad, product photo or social graphic from a prompt, with the saved brand\'s product photo and logo, and returns its link (or a job id that get_job resolves). It can also make an animated GIF or an SVG. Uses Hermoso credits.',
    generate_video: 'Renders one continuous video clip from a description, optionally starting from a reference image, and returns its mp4 link or a job id that get_job resolves. durationSeconds must be one of the model\'s durations listed by hermoso_capabilities. Uses Hermoso credits.',
    make_template_ad: 'Builds a quick ad or post from the user\'s own words and pictures with an HTML template (slideshow, carousel, chat or notes screenshot, kinetic type, myth vs fact, app tour, or a custom HTML design), rendered without an AI model. Returns the image or video link, or a job id that get_job resolves. Uses a small number of Hermoso credits.',
    get_job: 'Returns the state of a job by id: queued, running, done or error, progress, and on done the result. A job_ id is a render; an mcpc_ id is a plan or research call that took longer than 20 seconds, and its result is returned here once it finishes. not_found is final. Read-only; no credits.',
    list_jobs: 'Lists the most recent render jobs and how many are running, so work in progress can be reported or resumed. Read-only; no credits.',
    list_library: 'Lists the workspace Library: every image, video and upload, newest first, with its link, Library id, title, kind, length, size, model and age. query finds an ad by its headline. Read-only; no credits.',
    analyze_campaigns: 'Reads each connected ad platform\'s own report and returns one table of campaigns, ad sets and ads (spend, impressions, clicks, CTR, CPC, conversions, CPA, ROAS where reported) with four lists: what to scale, pause, fix and test next, each with its numbers and reason. It changes nothing on any account. Uses a few Hermoso credits.',
  }),
});
export const isPartnerToken = (tok) => Object.prototype.hasOwnProperty.call(PARTNER_ROSTERS, String(tok || ''));
export const partnerDirectoryValue = (tok) => (isPartnerToken(tok) ? PARTNER_DIRECTORY_PREFIX + tok : null);
export const partnerTokenOf = (directory) => {
  const s = typeof directory === 'string' ? directory : '';
  if (!s.startsWith(PARTNER_DIRECTORY_PREFIX)) return null;
  const tok = s.slice(PARTNER_DIRECTORY_PREFIX.length);
  return isPartnerToken(tok) ? tok : null;
};
const _allow = new Map();
// The allowlist a `directory` value names: a curated Claude directory connector's, a partner roster's, or null.
export const curatedAllowOf = (directory) => {
  const tok = curatedTokenOf(directory);
  const ptok = tok ? null : partnerTokenOf(directory);
  if (!tok && !ptok) return null;
  const key = tok || PARTNER_DIRECTORY_PREFIX + ptok;
  if (!_allow.has(key)) _allow.set(key, new Set(tok ? DIRECTORY_CURATED[tok] : PARTNER_ROSTERS[ptok]));
  return _allow.get(key);
};

// The listed definition of a curated tool: title, description and an explicit readOnlyHint / destructiveHint pair
// (annotations.title mirrors the title, as every other tool's does). PURE: returns a new object and never mutates the
// canonical definition, which every other session shares. Memoised per (def, name).
// `tok` is the curated connector the definition is listed on: a row with per-connector wording (S) answers with that
// connector's description. Memoised per (def, name, tok).
const _curatedDefs = new WeakMap();
export const curatedDescription = (name, tok) => { const row = DIRECTORY_CURATED_DEFS[name]; return row ? ((row.s && tok && row.s[tok]) || row.d) : null; };
export function curatedDef(def, name, tok = null) {
  const row = DIRECTORY_CURATED_DEFS[name];
  if (!row || !def || typeof def !== 'object') return def;
  let per = _curatedDefs.get(def);
  if (!per) { per = new Map(); _curatedDefs.set(def, per); }
  const mk = name + '\0' + (tok || '');
  if (per.has(mk)) return per.get(mk);
  const annotations = { ...(def.annotations && typeof def.annotations === 'object' ? def.annotations : {}), title: row.t, readOnlyHint: row.ro, destructiveHint: row.de };
  const o = { ...def, title: row.t, description: curatedDescription(name, tok), annotations };
  per.set(mk, o);
  return o;
}

// ── A CURATED CONNECTOR'S REPLIES NEVER NAME A TOOL IT DOES NOT CARRY (2026-11-22) ────────────────────────────────────
// Run live on all three connectors before submission, the shared handlers answered with next steps that point at the
// full connection: get_brand said "plan_ad / plan_variations / create use it automatically", list_connector_accounts said
// "Change the shared set with set_connector_accounts", hermoso_credits pointed at upgrade_plan, find_creators at a
// creator-campaign tool. On a curated connection those names are tools the model cannot call and the reviewer cannot
// see. So the ONE tools/call chokepoint of a curated session (installCuratedReplyScrub in tools.mjs) rewrites the reply:
//   • a parenthetical that names an out-of-scope tool is removed;
//   • otherwise the sentence (or line) that names one is removed, and nothing else is touched;
//   • structured data: prose strings (anything with whitespace) get the same rewrite; a lone identifier is DATA (a
//     provider id such as "tiktok_account" is also a tool name) and is kept, except under a key that names a next step
//     (tool / next / call / action), where the field is dropped;
//   • a text item that is JSON is parsed, rewritten as data and printed back, never cut as prose.
// `isTool(name)` answers whether a word is a registered tool; `allow` is the connector's allowlist.
const TOOLISH = /\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b/g;
const STEP_KEY = /^(?:tool|tools|next|nextTool|nextStep|call|action|suggestedTool)$/i;
export function curatedNamesOutOfScope(s, allow, isTool) {
  if (typeof s !== 'string' || s.indexOf('_') < 0) return [];
  const out = new Set(); let m; TOOLISH.lastIndex = 0;
  while ((m = TOOLISH.exec(s))) if (isTool(m[0]) && !allow.has(m[0])) out.add(m[0]);
  return [...out];
}
function splitSentences(line) {
  const out = []; let depth = 0, start = 0;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '(' || ch === '[') depth++;
    else if ((ch === ')' || ch === ']') && depth > 0) depth--;
    else if (depth === 0 && '.;!?'.includes(ch) && /\s/.test(line[i + 1] || '')) { out.push(line.slice(start, i + 1)); start = i + 1; while (/\s/.test(line[start] || '')) start++; i = start - 1; }
  }
  if (start < line.length) out.push(line.slice(start));
  return out.map((x) => x.trim()).filter(Boolean);
}
export function curatedScrubText(s, allow, isTool) {
  const bad = (t) => curatedNamesOutOfScope(t, allow, isTool).length > 0;
  if (!bad(s)) return s;
  let out = s.replace(/\s*\([^()]*\)/g, (p) => (bad(p) ? '' : p));
  out = out.split('\n').map((line) => {
    if (!bad(line)) return line;
    // Sentences end at . ; ! ? OUTSIDE brackets, so a parenthetical is never cut in half. A sentence that names one keeps
    // its clean em-dash clauses ("… carries (…) — or approve them with <tool>." keeps the part before the dash).
    const kept = splitSentences(line).map((sen) => {
      if (!bad(sen)) return sen;
      const parts = sen.split(/\s+[\u2014\u2013]\s+/);
      if (parts.length < 2) return null;
      const ok = parts.filter((c) => !bad(c));
      if (!ok.length) return null;
      const j = ok.join(' \u2014 ').trim();
      return /[.!?;]$/.test(j) ? j : j + (/[.;!?]$/.test(sen.trim()) ? sen.trim().slice(-1) : '.');
    }).filter((x) => x !== null);
    const j = kept.join(' ').replace(/[,;:]\s*$/, '.');
    return /[A-Za-z0-9]/.test(j) ? j : null;
  }).filter((l) => l !== null).join('\n');
  // A name that survived both passes (no sentence boundary at all) is replaced rather than left in.
  TOOLISH.lastIndex = 0;
  return out.replace(TOOLISH, (w) => (isTool(w) && !allow.has(w) ? 'the Hermoso app' : w)).replace(/\n{3,}/g, '\n\n');
}
export function curatedScrubData(v, allow, isTool, depth = 0) {
  if (depth > 12) return v;
  if (typeof v === 'string') return /\s/.test(v) ? curatedScrubText(v, allow, isTool) : v;
  if (Array.isArray(v)) return v.map((x) => curatedScrubData(x, allow, isTool, depth + 1));
  if (v && typeof v === 'object') {
    const o = {};
    for (const [k, x] of Object.entries(v)) {
      if (STEP_KEY.test(k) && typeof x === 'string' && isTool(x) && !allow.has(x)) continue;
      if (STEP_KEY.test(k) && Array.isArray(x) && x.some((y) => typeof y === 'string' && isTool(y) && !allow.has(y))) { o[k] = x.filter((y) => !(typeof y === 'string' && isTool(y) && !allow.has(y))); continue; }
      o[k] = curatedScrubData(x, allow, isTool, depth + 1);
    }
    return o;
  }
  return v;
}
export function curatedScrubResult(res, allow, isTool) {
  if (!res || typeof res !== 'object' || !allow) return res;
  const out = { ...res };
  if (Array.isArray(res.content)) out.content = res.content.map((c) => {
    if (!c || c.type !== 'text' || typeof c.text !== 'string') return c;
    const t = c.text.trim();
    if ((t.startsWith('{') || t.startsWith('[')) && curatedNamesOutOfScope(t, allow, isTool).length) {
      try { const j = JSON.parse(t); return { ...c, text: JSON.stringify(curatedScrubData(j, allow, isTool), null, /\n {2}"/.test(t) ? 2 : 0) }; } catch {}
    }
    return { ...c, text: curatedScrubText(c.text, allow, isTool) };
  });
  if (res.structuredContent && typeof res.structuredContent === 'object') out.structuredContent = curatedScrubData(res.structuredContent, allow, isTool);
  return out;
}

// ── WHAT THE CONSENT CARD SAYS FOR A CURATED CONNECTOR (2026-11-22) ───────────────────────────────────────────────────
// Measured on production that day (Cloud Run request log of a real claude.ai add of ?tools=directory-reports): Claude
// POSTs the connector URL, gets our 401, fetches EXACTLY the `resource_metadata` URL the challenge names, then opens
// /oauth/authorize with resource=https://app.hermoso.ai/mcp (no query) and scope = the challenge's `scope`. The MCP
// spec's scope order is the same (WWW-Authenticate scope, then PRM scopes_supported). So the curated connector is carried
// by SCOPE, not by `resource`: a curated URL's 401 names one scope below (and its PRM lists only that scope), the
// consent page reads it, and the token answer echoes it so a client that checks granted ⊆ requested is satisfied.
// `resource` is deliberately left as it is: changing it risks the RFC 9728 §3.3 check every client already passes.
export const CURATED_SCOPES = Object.freeze({
  'directory-research': 'hermoso.ad-research',
  'directory-scheduler': 'hermoso.social-scheduler',
  'directory-reports': 'hermoso.ads-reporting',
  'directory-creators': 'hermoso.creator-campaigns',
});
export const CURATED_CONSENT = Object.freeze({
  'directory-research': Object.freeze({
    line: 'It can search public ad libraries and social posts for competitor research. It only reads: nothing is posted or changed on any account. Searches use your Hermoso credits.',
    first: 'Hermoso, show me the Meta ads my top competitor is running right now',
  }),
  'directory-scheduler': Object.freeze({
    line: 'It can publish and schedule posts to the social accounts you connected, list what is scheduled, and read and reply to comments and messages on those accounts. Each post, change and reply is shown to you as a preview and runs only after you approve it.',
    first: 'Hermoso, which social accounts do I have connected, and what is scheduled to post this week?',
  }),
  'directory-reports': Object.freeze({
    line: 'It can read campaign performance from the ad accounts and website analytics you connected. It only reads: nothing is created, changed, paused or spent.',
    first: 'Hermoso, how did my ad campaigns perform over the last 7 days?',
  }),
  'directory-creators': Object.freeze({
    line: 'It can find creators, run your creator campaigns, invite creators and review the posts they submit. Approved posts earn the pay set for each campaign; payouts are made through Stripe from the Hermoso app, never from here.',
    first: 'Hermoso, find creators in my niche and show me my creator campaigns',
  }),
});
// The curated connector a scope string (or an MCP URL's ?tools=) names, or null. Exactly ONE curated scope must be asked
// for: a client that requests everything it has ever seen gets the generic card, never a narrower promise.
export function curatedTokenFromScope(scope) {
  const asked = String(scope || '').split(/[\s+,]+/).filter(Boolean);
  const hits = Object.entries(CURATED_SCOPES).filter(([, s]) => asked.includes(s)).map(([t]) => t);
  return hits.length === 1 ? hits[0] : null;
}
export function curatedTokenFromUrl(u) {
  const toks = toolsFromMcpUrl(u).toLowerCase().split(',').map((x) => x.trim()).filter(Boolean);
  const hits = toks.filter(isCuratedToken);
  return hits.length === 1 && toks.length === 1 ? hits[0] : null;
}

// ── PATH-FORM CONNECTOR URLS (2026-11-26) ────────────────────────────────────────────────────────────────────────────────
// Anthropic's directory refused to publish Hermoso Ads Reporting at https://app.hermoso.ai/mcp?tools=directory-reports:
// "a published directory entry already uses this URL". Its uniqueness check drops the query string, and Social Scheduler
// (?tools=directory-scheduler) is already published. So each curated connector also answers at a PATH of its own, and
// /mcp/s/<tools> does the same for any `?tools=` value. A path form is the query form with the scope moved into the path:
// mcp/http.mjs runs the ONE /mcp handler for both, so roster, instructions, auth, sessions, GET/DELETE and logging cannot
// differ. What does differ is what RFC 9728 requires to differ: the resource identifier is the path URL itself, and its
// protected-resource metadata lives at /.well-known/oauth-protected-resource<path> (tools/mcp-path-alias-check.mjs).
// Names here may never be `s`, `server-card` or `.well-known` (other routes own those paths; the check pins it).
// THE PATH FORM IS THE STANDARD FOR A NEW SETUP (owner, 2026-11-26); the query form keeps working for ever, and a URL an
// approved or submitted listing registered (the ChatGPT apps, Social Scheduler, the MCP Registry, Smithery, Glama) stays
// as registered. So every scope we hand people has a name here when a short one is unambiguous: the whole-roster scopes
// (full, all, lean, core) and the focused apps whose job word is free (create, ads, social, sites, analytics; `research`
// and `creators` were already the Claude directory connectors, so those two apps are /mcp/s/app-research and
// /mcp/s/app-creators). A word that is also a group name means the APP here (`/mcp/ads` is Hermoso Ads Manager, the
// `ads` group alone is /mcp/s/ads). Every value is a token parseToolScope accepts, and no two names share a value, so
// mcpPathUrl below has one answer (tools/mcp-path-alias-check.mjs pins both).
export const MCP_PATH_ALIASES = Object.freeze({
  research: 'directory-research',
  scheduler: 'directory-scheduler',
  reports: 'directory-reports',
  creators: 'directory-creators',
  gemini: 'gemini',   // a partner roster (PARTNER_ROSTERS above): Google Connected Apps / Gemini Enterprise
  copilot: 'copilot', // a partner roster: Microsoft Copilot Studio (the connector's swagger path is /mcp/copilot)
  full: 'full',
  all: 'all',
  lean: 'lean',
  core: 'core',
  create: 'app-create',
  ads: 'app-ads',
  social: 'app-social',
  sites: 'app-sites',
  analytics: 'app-analytics',
});
export const MCP_SCOPE_PATH_PREFIX = '/mcp/s/';
const MCP_SCOPE_SEG_RE = /^[a-z0-9][a-z0-9_,-]{0,199}$/i; // the characters a ?tools= value is made of; anything else is not a path form
// The tool scope a request path names, or null when it is not a path form. `path` is the path as the client sent it (one
// trailing slash dropped), which is what the resource identifier is built from (RFC 9728 §3.3 compares it as sent).
export function mcpPathScope(pathname) {
  let p = String(pathname || '');
  if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1);
  const named = /^\/mcp\/([^/]+)$/i.exec(p);
  if (named) {
    const key = named[1].toLowerCase();
    return Object.prototype.hasOwnProperty.call(MCP_PATH_ALIASES, key) ? { tools: MCP_PATH_ALIASES[key], path: p } : null;
  }
  const generic = /^\/mcp\/s\/([^/]+)$/i.exec(p);
  if (!generic) return null;
  let seg; try { seg = decodeURIComponent(generic[1]); } catch { return null; }
  return MCP_SCOPE_SEG_RE.test(seg) ? { tools: seg.toLowerCase(), path: p } : null;
}
// The `tools` an MCP connector URL carries, from its path form or its query, as one string ('' when it names none).
export function toolsFromMcpUrl(u) {
  let url; try { url = new URL(String(u || ''), 'https://x.invalid'); } catch { return ''; }
  const ps = mcpPathScope(url.pathname);
  return ps ? ps.tools : String(url.searchParams.get('tools') || '');
}
// The URL to HAND someone for a `?tools=` value: its name above when it has one, else /mcp/s/<tools>; no value is the bare
// URL. `base` is the bare connector URL. A value no path can carry falls back to the query form rather than inventing one.
export function mcpPathUrl(tools, base = 'https://app.hermoso.ai/mcp') {
  const t = String(tools ?? '').trim().toLowerCase();
  const b = String(base).replace(/\/+$/, '');
  if (!t) return b;
  const name = Object.keys(MCP_PATH_ALIASES).find((k) => MCP_PATH_ALIASES[k] === t);
  if (name) return `${b}/${name}`;
  return MCP_SCOPE_SEG_RE.test(t) ? `${b}/s/${t}` : `${b}?tools=${encodeURIComponent(t)}`;
}
