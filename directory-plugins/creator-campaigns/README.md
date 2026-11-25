# Hermoso Creator Campaigns for Claude

Run creator campaigns from Claude. Find creators whose organic posts do well in your niche, keep a
shortlist with an outreach status, create a campaign that pays creators per 1,000 verified views, per approved
post or from a pool, invite creators with personal links, and review the creators who join and the posts they
submit, with views, an authenticity score and disclosure flags. Payouts are made in the Hermoso app and paid
through Stripe; nothing here charges a card or sends money. Requires a Hermoso account (free to start).

## What is in this plugin

- **The Hermoso Creator Campaigns MCP server**, connected remotely at `https://app.hermoso.ai/mcp?tools=directory-creators`. Nothing is
  installed on your machine, no command runs locally and no key is stored: the first time one of its tools runs you
  sign in with your Hermoso account in the browser (in Claude Code, `/mcp` and then `hermoso-creator-campaigns`).
- **3 skills** that teach Claude how to use it well:

| Skill | Use it for |
| --- | --- |
| `find-creators` | Rank creators in a niche, save a shortlist and track outreach |
| `run-creator-campaign` | Brief, payout model, draft, preview, go live and invite, each step with your yes |
| `review-campaign-posts` | Approve, reject or request changes on submitted posts, and read the campaign report |

## Ask in your own words

- "Find TikTok and Instagram creators in home espresso with at least 20k median views."
- "Set up a campaign paying $3 per 1,000 views, $2,000 budget, TikTok and Reels."
- "Which posts are waiting for review, and which ones are missing a disclosure?"
- "How much have we spent and what did it cost per 1,000 views?"

## What it sends and stores

Each tool call sends its arguments to Hermoso at `app.hermoso.ai` over HTTPS, signed in with your Hermoso
account. Creator searches read public posts and profiles; campaign tools change only your own campaigns, and every invite link is handed to you to send. Your Hermoso workspace keeps your sign-in, your brand profile, your creator shortlist and your campaigns, their creators and submitted posts, and a log of the calls that
used credits. The plugin reads nothing from your computer and no environment variable or local credential.
Creator searches and reading a submitted post's views use Hermoso credits; `hermoso_credits` shows the balance. Nothing is bought from inside Claude.

**Who writes the answers.** Creator rankings, authenticity scores and campaign reports are computed by Hermoso from the public posts and the views each platform reports; no AI model writes them. Claude writes the summary you read.

## Privacy and support

- Privacy Policy: [hermoso.ai/privacy](https://hermoso.ai/privacy)
- Terms of Service: [hermoso.ai/terms](https://hermoso.ai/terms)
- Documentation: [hermoso.ai/docs/mcp](https://hermoso.ai/docs/mcp/)
- Support: email [hello@hermoso.ai](mailto:hello@hermoso.ai) or use [hermoso.ai/contact](https://hermoso.ai/contact).

## License

MIT, see [LICENSE](LICENSE).
