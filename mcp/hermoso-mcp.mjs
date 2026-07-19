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
import { registerTools, MCP_INSTRUCTIONS } from './tools.mjs';
import { API_BASE } from './client.mjs';

// instructions = the full capability map (ad spy · create · raw model playground · account) — one source of truth
// in tools.mjs, shared with the hosted connector (http.mjs), so every surface tells agents the same breadth.
const server = new McpServer({ name: 'hermoso-mcp', version: '1.0.0' }, {
  instructions: MCP_INSTRUCTIONS,
});

registerTools(server);

const transport = new StdioServerTransport();
await server.connect(transport);
console.error(`[hermoso-mcp] ready · API ${API_BASE}`);
