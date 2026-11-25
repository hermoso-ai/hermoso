# Hermoso Ads Reporting for Claude

One honest report across your own ad accounts. Read campaign and ad performance from Meta, Google Ads,
LinkedIn, TikTok, Microsoft Advertising, Reddit, Pinterest, X and ChatGPT Ads, plus Google Analytics 4 and Google
Search Console, side by side in each account's own currency and dates, then decide what to scale, pause, fix and
test next. Every tool only reads: nothing is created, edited, activated, paused or deleted, and no budget is
changed. Requires a Hermoso account (free to start); ad accounts are connected in the Hermoso app.

## What is in this plugin

- **The Hermoso Ads Reporting MCP server**, connected remotely at `https://app.hermoso.ai/mcp?tools=directory-reports`. Nothing is
  installed on your machine, no command runs locally and no key is stored: the first time one of its tools runs you
  sign in with your Hermoso account in the browser (in Claude Code, `/mcp` and then `hermoso-ads-reporting`).
- **3 skills** that teach Claude how to use it well:

| Skill | Use it for |
| --- | --- |
| `ads-report` | One table across every connected ad platform, with the gaps named honestly |
| `campaign-analyst` | What to scale, pause, fix and test next, with a data floor that refuses a verdict on thin data |
| `site-analytics` | Google Analytics 4, Search Console queries and Keyword Planner volumes |

## Ask in your own words

- "How did my Meta and Google ads do in the last 14 days?"
- "Which campaigns should I pause, and where should the budget go?"
- "Which ad campaign drove purchases on the site last month?"
- "What do people search on Google to find us?"

## What it sends and stores

Each tool call sends its arguments to Hermoso at `app.hermoso.ai` over HTTPS, signed in with your Hermoso
account. The tools read the ad accounts and analytics properties you connected in the Hermoso app and ticked for your brand, and return the numbers to Claude. Your Hermoso workspace keeps your sign-in, your brand profile, the connections you made in the Hermoso app, and a log of the calls that
used credits. The plugin reads nothing from your computer and no environment variable or local credential.
Reading reports uses no credits. Nothing is bought from inside Claude.

**Who writes the answers.** The numbers come straight from each ad platform and analytics property; no AI model on Hermoso's side writes them. Claude writes the summary you read.

## Privacy and support

- Privacy Policy: [hermoso.ai/privacy](https://hermoso.ai/privacy)
- Terms of Service: [hermoso.ai/terms](https://hermoso.ai/terms)
- Documentation: [hermoso.ai/docs/mcp](https://hermoso.ai/docs/mcp/)
- Support: email [hello@hermoso.ai](mailto:hello@hermoso.ai) or use [hermoso.ai/contact](https://hermoso.ai/contact).

## License

MIT, see [LICENSE](LICENSE).
