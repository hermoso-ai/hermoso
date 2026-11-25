# Hermoso Ad Research for Claude

See the ads and posts already working in any market, then learn from them. Find a brand's competitors,
read the ads they are running in the Meta, Google and LinkedIn ad libraries, search organic TikTok, Instagram Reels,
YouTube, Reddit and Threads, break a video ad down into its script and beats, and check your own ad copy against
Meta's advertising standards before it runs. Every tool only reads: nothing is posted, published or changed on any
account. Requires a Hermoso account (free to start).

## What is in this plugin

- **The Hermoso Ad Research MCP server**, connected remotely at `https://app.hermoso.ai/mcp?tools=directory-research`. Nothing is
  installed on your machine, no command runs locally and no key is stored: the first time one of its tools runs you
  sign in with your Hermoso account in the browser (in Claude Code, `/mcp` and then `hermoso-ad-research`).
- **4 skills** that teach Claude how to use it well:

| Skill | Use it for |
| --- | --- |
| `competitor-research` | Find competitors, read their running ads, and break down how one competitor advertises |
| `trend-research` | The top organic posts and creators for a topic on TikTok, Instagram, YouTube, Reddit and Threads |
| `ad-hooks` | Name and write ad openings with 19 hook mechanics |
| `ad-policy-check` | Check ad copy against Meta's Advertising Standards, with compliant rewrites |

## Ask in your own words

- "Find allbirds.com's competitors and pull the Meta ads they've run the longest."
- "What hooks are the top TikToks about cold brew using this month?"
- "Break down this video ad: https://... and tell me why it works."
- "Will Meta approve this copy for our supplement ad?"

## What it sends and stores

Each tool call sends its arguments to Hermoso at `app.hermoso.ai` over HTTPS, signed in with your Hermoso
account. The tools read public ad libraries and public social posts and return them to Claude. Your Hermoso workspace keeps your sign-in, your brand profile, any ads you saved to your swipefile, and a log of the calls that
used credits. The plugin reads nothing from your computer and no environment variable or local credential.
Searches use Hermoso credits from your account; `hermoso_credits` shows the balance. Nothing is bought from inside Claude.

**Who writes the answers.** Competitor lists, competitor teardowns, research summaries, video breakdowns and ad-policy verdicts are written by an AI model run by Hermoso AI, from the ads and posts the tools read. Search results and ad-library rows are returned as the platforms publish them.

## Privacy and support

- Privacy Policy: [hermoso.ai/privacy](https://hermoso.ai/privacy)
- Terms of Service: [hermoso.ai/terms](https://hermoso.ai/terms)
- Documentation: [hermoso.ai/docs/mcp](https://hermoso.ai/docs/mcp/)
- Support: email [hello@hermoso.ai](mailto:hello@hermoso.ai) or use [hermoso.ai/contact](https://hermoso.ai/contact).

## License

MIT, see [LICENSE](LICENSE).
