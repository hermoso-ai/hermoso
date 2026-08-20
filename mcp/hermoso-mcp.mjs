#!/usr/bin/env node
// Hermoso MCP server (stdio transport) — lets Claude Code / Cursor / Codex (and any stdio MCP client) drive Hermoso:
// research competitors, plan ads, and generate images/videos/avatars, all against the running Hermoso server.
//
//   Local (today):   node mcp/hermoso-mcp.mjs            # talks to http://localhost:3000 (HEIST_API_BASE to override)
//   Auth (today):    none — the local server resolves the dev account. Set HEIST_TOKEN once real auth lands.
//
// stdout is the JSON-RPC channel — NEVER print to it. All logging goes to stderr (console.error).
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerTools, MCP_INSTRUCTIONS, parseToolScope } from './tools.mjs';
import { API_BASE } from './client.mjs';

// instructions = the full capability map (ad spy · create · raw model playground · account) — one source of truth
// in tools.mjs, shared with the hosted connector (http.mjs), so every surface tells agents the same breadth.
const server = new McpServer({ name: 'hermoso-mcp', version: '1.0.0' }, {
  instructions: MCP_INSTRUCTIONS,
});

// Roster scoping, same groups as the hosted connector's ?tools= (see registerTools). The DEFAULT is every group
// except `ads` and `analytics` (OPT_IN_TOOL_GROUPS) — together ~254k of the ~365k full roster, so the default is
// ~112k. Both are held out on SIZE alone, and nothing is lost: `enable_tools` switches either on mid-session with
// no reconnect. HERMOSO_TOOLS=all restores the full roster; HERMOSO_TOOLS=create,channels narrows it further.
// An unknown group EXITS rather than silently serving all of them — a scoped connection you did not get is
// worse than one you were told you could not have.
// Both env names are read: HERMOSO_TOOLS is the current prefix, HEIST_TOOLS the pre-rebrand one that is live in
// people's configs today. Renaming a variable someone already set is how a working setup goes quiet.
const _scope = parseToolScope(process.env.HERMOSO_TOOLS || process.env.HEIST_TOOLS);
if (_scope.error) { console.error(`[hermoso-mcp] ${_scope.error}`); process.exit(1); }
registerTools(server, { only: _scope.groups });

const transport = new StdioServerTransport();
await server.connect(transport);
console.error(`[hermoso-mcp] ready · API ${API_BASE}`);
