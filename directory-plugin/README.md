# Hermoso for Claude

Research the ads already working in any market, report on your own ad accounts and website analytics, publish and
schedule your own posts, and run creator campaigns, all from Claude. Requires a Hermoso account (free to start).

This plugin bundles four Hermoso connections, each limited to one job:

| Connection | What it does |
| --- | --- |
| Hermoso Ad Research | Reads the Meta, Google and LinkedIn ad libraries and organic TikTok, Instagram, YouTube, Reddit and Threads posts, breaks down video ads, and checks ad copy against Meta's advertising standards. Read-only. |
| Hermoso Ads Reporting | Reads performance from your own ad accounts (Meta, Google Ads, LinkedIn, TikTok, Microsoft Advertising, Reddit, Pinterest, X and ChatGPT Ads) plus Google Analytics 4 and Search Console. Read-only. |
| Hermoso Social Scheduler | Publishes and schedules your own posts to your own connected accounts, and answers comments and messages, each after your yes. |
| Hermoso Creator Campaigns | Finds creators in a niche, runs campaigns that pay creators for posts, and reviews what they submit. Payouts are made in the Hermoso app, never from here. |

None of them generates images, video or audio. Want only one job? Each connection is also its own plugin: Hermoso Ad
Research, Hermoso Ads Reporting, Hermoso Social Scheduler and Hermoso Creator Campaigns.

## What is in this plugin

- **Four remote MCP servers** on `app.hermoso.ai`: `https://app.hermoso.ai/mcp?tools=directory-research`,
  `?tools=directory-reports`, `?tools=directory-scheduler` and `?tools=directory-creators`. Nothing is installed on
  your machine, no command runs locally and no key is stored: the first time a tool from one of them runs you sign
  in with your Hermoso account in the browser (in Claude Code, `/mcp` and then the server's name).
- **Fourteen skills** that teach Claude how to use them well:

| Skill | Use it for |
| --- | --- |
| `competitor-research` | Find competitors, read their running ads, and break down how one competitor advertises |
| `trend-research` | The top organic posts and creators for a topic on TikTok, Instagram, YouTube, Reddit and Threads |
| `ad-hooks` | Name and write ad openings with 19 hook mechanics |
| `ad-policy-check` | Check ad copy against Meta's Advertising Standards, with compliant rewrites |
| `ads-report` | One table across every connected ad platform, with the gaps named honestly |
| `campaign-analyst` | What to scale, pause, fix and test next, with a data floor that refuses a verdict on thin data |
| `site-analytics` | Google Analytics 4, Search Console queries and Keyword Planner volumes |
| `setup-check` | What is connected, which accounts this brand may post to, and what to fix first |
| `approval-checkpoints` | Approve the exact post, account and time before anything publishes |
| `article-everywhere` | One article or link into a blog post, an X Article, a LinkedIn post and short posts, all scheduled |
| `inbox-replies` | Comments, mentions and DMs across channels, with replies sent only after your yes |
| `find-creators` | Rank creators in a niche, save a shortlist and track outreach |
| `run-creator-campaign` | Brief, payout model, draft, preview, go live and invite, each step with your yes |
| `review-campaign-posts` | Approve, reject or request changes on submitted posts, and read the campaign report |

## Ask in your own words

- "Find allbirds.com's competitors and pull the Meta ads they've run the longest."
- "How did my Meta and Google ads do in the last 14 days, and what should I pause?"
- "Turn https://... into a LinkedIn post and an X Article for this week."
- "Find TikTok creators in home espresso and set up a campaign paying per 1,000 views."

Nothing is published, scheduled, sent or changed unless you say yes to it in the conversation.

## What it sends and stores

Each tool call sends its arguments to Hermoso at `app.hermoso.ai` over HTTPS, signed in with your Hermoso account.
Your Hermoso workspace keeps your sign-in, your brand profile, your connections, saved ads and creators, the posts
you queue, the files you upload, your campaigns, and a log of the calls that used credits. The plugin reads nothing
from your computer and no environment variable or local credential.

**Who writes the answers.** Competitor lists, teardowns, research summaries, video breakdowns, ad-policy verdicts
and any caption you ask Hermoso to fit to each channel are written by an AI model run by Hermoso AI. Ad-library rows,
ad and analytics numbers, and creator stats come straight from the platforms.

Searches use Hermoso credits from your account, and so do posts on X at X's per-post price; reports and other posts
use none. Nothing is bought from inside Claude.

## Privacy and support

- Privacy Policy: [hermoso.ai/privacy](https://hermoso.ai/privacy)
- Terms of Service: [hermoso.ai/terms](https://hermoso.ai/terms)
- Documentation: [hermoso.ai/docs/mcp](https://hermoso.ai/docs/mcp/)
- Support: email [hello@hermoso.ai](mailto:hello@hermoso.ai) or use [hermoso.ai/contact](https://hermoso.ai/contact).

## License

MIT, see [LICENSE](LICENSE).
