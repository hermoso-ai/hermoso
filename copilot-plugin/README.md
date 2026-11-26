# Hermoso for GitHub Copilot

Launch and market from your coding agent. Put the site you built live with a domain, email and payments, then
research the ads competitors run, make image and video ads, post and schedule to your own social channels, and run
ad campaigns, with analytics to see what works.

This plugin follows the Agent Plugins 1.0 format and carries two things:

- `mcp.json`: the hosted Hermoso MCP server, `https://app.hermoso.ai/mcp` (Streamable HTTP). The first call opens
  a browser sign-in (OAuth 2.1); nothing to paste.
- `skills/`: eleven skills that drive the `hermoso` CLI (`npx -y hermoso`) for research, ad creation, product
  photos, publishing and scheduling, campaign work and launching a site.

## Install

```bash
copilot plugin install hermoso-ai/hermoso:copilot-plugin
```

Requires a Hermoso account, free to start at https://hermoso.ai.

## Links

- Docs: https://hermoso.ai/docs/mcp/
- Privacy: https://hermoso.ai/privacy
- Terms: https://hermoso.ai/terms
- Support: hello@hermoso.ai
- Source: https://github.com/hermoso-ai/hermoso (MIT)
