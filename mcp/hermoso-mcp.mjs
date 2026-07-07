#!/usr/bin/env node
// Hermoso MCP server (stdio transport) — lets Claude Code / Cursor / Codex (and any stdio MCP client) drive Hermoso:
// research competitors, plan ads, and generate images/videos/avatars, all against the running Hermoso server.
//
//   Local (today):   node mcp/hermoso-mcp.mjs            # talks to https://app.hermoso.ai (HERMOSO_API_BASE to override, e.g. http://localhost:3000 when self-running)
//   Auth (today):    none — the local server resolves the dev account. Set HERMOSO_TOKEN once real auth lands.
//
// stdout is the JSON-RPC channel — NEVER print to it. All logging goes to stderr (console.error).
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerTools } from './tools.mjs';
import { API_BASE } from './client.mjs';

const server = new McpServer({ name: 'hermoso-mcp', version: '1.0.0' }, {
  instructions: 'Hermoso generates copyable, on-brand ad creative. Typical flow: hermoso_capabilities (learn valid model ids + costs) → optionally draft_brand → plan_ad (concept + copy) → generate_image / generate_video (returns a served URL). Use find_competitors / pull_competitor_ads / research_ads to gather proven ads to remix first. Always report the final media URL to the user.',
});

registerTools(server);

const transport = new StdioServerTransport();
await server.connect(transport);
console.error(`[hermoso-mcp] ready · API ${API_BASE}`);
