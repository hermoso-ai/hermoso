# Security Policy

## Reporting a vulnerability

Please report security issues privately to **hello@hermoso.ai** with the subject line "Security". Do not open a public GitHub issue for a suspected vulnerability.

Include what you found, how to reproduce it, and the affected surface (the hosted MCP server at `https://app.hermoso.ai/mcp`, the `hermoso` npm package / CLI, or the skills in this repository). We aim to acknowledge reports within 3 business days and will keep you updated until the issue is resolved.

## Supported versions

Only the latest published release of the `hermoso` npm package and the current hosted MCP server receive security fixes.

## Scope notes

- Agent keys (`hmk_…`) are per-user secrets. Never commit them to a repository or paste them into a public issue. If a key is exposed, revoke it in the app at app.hermoso.ai under MCP & CLI → Terminal & API keys.
- This repository contains no credentials. The skills run the `hermoso` CLI, which reads the key stored by `hermoso auth login`.
