# Hermoso Social Scheduler for Claude

Publish and schedule your own posts to your own accounts from Claude: Facebook, Instagram, Threads, X,
LinkedIn, Pinterest, Bluesky, Telegram, YouTube and TikTok, plus a WordPress, Shopify, Webflow or Wix blog. Turn
one article into a post for every channel, answer comments and messages, and see which posts performed. Claude
shows you the exact words, media, account and time and waits for your yes before anything is posted. Requires a
Hermoso account (free to start); channels are connected in the Hermoso app.

## What is in this plugin

- **The Hermoso Social Scheduler MCP server**, connected remotely at `https://app.hermoso.ai/mcp?tools=directory-scheduler`. Nothing is
  installed on your machine, no command runs locally and no key is stored: the first time one of its tools runs you
  sign in with your Hermoso account in the browser (in Claude Code, `/mcp` and then `hermoso-social-scheduler`).
- **4 skills** that teach Claude how to use it well:

| Skill | Use it for |
| --- | --- |
| `setup-check` | What is connected, which accounts this brand may post to, and what to fix first |
| `approval-checkpoints` | Approve the exact post, account and time before anything publishes |
| `article-everywhere` | One article or link into a blog post, an X Article, a LinkedIn post and short posts, all scheduled |
| `inbox-replies` | Comments, mentions and DMs across channels, with replies sent only after your yes |

## Ask in your own words

- "Schedule this video to Instagram Reels and TikTok for Tuesday at 9am."
- "Turn https://... into a LinkedIn post and an X Article for this week."
- "What comments haven't I answered yet?"
- "Which of last month's posts did best on each channel?"

## What it sends and stores

Each tool call sends its arguments to Hermoso at `app.hermoso.ai` over HTTPS, signed in with your Hermoso
account. Posts, media links and replies you approve are published to the accounts you connected in the Hermoso app; reads return your queue, posts, comments and messages to Claude. Your Hermoso workspace keeps your sign-in, your brand profile, your connections, the posts you queue and the files you upload, and a log of the calls that
used credits. The plugin reads nothing from your computer and no environment variable or local credential.
Posting uses no credits, except on X, which is billed at X's per-post price and quoted before you post. Nothing is bought from inside Claude.

**Who writes the answers.** Your posts are published as you approve them. If you ask Hermoso to fit one caption to each channel, that version is written by an AI model run by Hermoso AI, and the queue shows the version that will publish.

## Privacy and support

- Privacy Policy: [hermoso.ai/privacy](https://hermoso.ai/privacy)
- Terms of Service: [hermoso.ai/terms](https://hermoso.ai/terms)
- Documentation: [hermoso.ai/docs/mcp](https://hermoso.ai/docs/mcp/)
- Support: email [hello@hermoso.ai](mailto:hello@hermoso.ai) or use [hermoso.ai/contact](https://hermoso.ai/contact).

## License

MIT, see [LICENSE](LICENSE).
