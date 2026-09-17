#!/usr/bin/env node
// Hermoso MCP server (stdio transport) — lets Claude Code / Cursor / Codex (and any stdio MCP client) drive Hermoso:
// research competitors, plan ads, and generate images/videos/avatars, all against the running Hermoso server.
//
//   Local (today):   node mcp/hermoso-mcp.mjs            # talks to https://app.hermoso.ai (HERMOSO_API_BASE to override)
//   Auth (today):    none — the local server resolves the dev account. Set HERMOSO_TOKEN (an agent key from the app).
//
// stdout is the JSON-RPC channel — NEVER print to it. All logging goes to stderr (console.error).
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerTools, MCP_INSTRUCTIONS, parseToolScope } from './tools.mjs';
import { API_BASE, connectedProviders } from './client.mjs';

// instructions = the full capability map (ad spy · create · raw model playground · account) — one source of truth
// in tools.mjs, shared with the hosted connector (http.mjs), so every surface tells agents the same breadth.
const server = new McpServer({ name: 'hermoso-mcp', version: '1.0.0' }, {
  instructions: MCP_INSTRUCTIONS,
});

// Roster scoping, same groups as the hosted connector's ?tools= (see registerTools). SINCE 2026-09-17 THE DEFAULT
// IS CORE-FIRST: the `core` group plus the handful of tools that make a connection drivable, measured at ~6K tokens
// against ~87K for the old default of every group but the opt-in three. Nothing is lost — everything else is held
// out of the LIST on SIZE alone, and `find_tools` finds it, `call_tool` runs it and a direct tools/call to a name
// you already know still works. `enable_tools` LISTS a whole group mid-session for a client that re-lists (stdio
// does). HERMOSO_TOOLS=all restores the full roster; HERMOSO_TOOLS=create,channels narrows it further; and
// MCP_CORE_FIRST=1 opts this process into the small core-first roster (the default is the full roster: see mcp/tools.mjs).
// An unknown group EXITS rather than silently serving all of them — a scoped connection you did not get is
// worse than one you were told you could not have.
// Both env names are read: HERMOSO_TOOLS is the current prefix, HEIST_TOOLS the pre-rebrand name that is live in
// people's configs today. Renaming a variable someone already set is how a working setup goes quiet.
const _scope = parseToolScope(process.env.HERMOSO_TOOLS || process.env.HEIST_TOOLS);
if (_scope.error) { console.error(`[hermoso-mcp] ${_scope.error}`); process.exit(1); }
// AND SCOPED TO WHAT THIS WORKSPACE HAS CONNECTED, not only to the groups asked for (2026-08-26). A tool bound to
// a provider nobody has connected can only answer `401 {connector:'<p>'}`, so listing it costs the caller context
// on every turn and buys them nothing — and a roster far past the 30-50 tool accuracy cliff is what makes a model
// pick the wrong tool. ONE read, here at startup; it NEVER throws and a failed read ships the FULL roster
// ([[failed-read-is-not-empty]]). Awaited before registerTools because the gate reads it at registration time —
// wiring it after would leave `readOk:false`, the gate would fail open, and the change would be silently inert.
const _conn = await connectedProviders();
registerTools(server, { only: _scope.groups, connectors: _conn });

const transport = new StdioServerTransport();
await server.connect(transport);
console.error(`[hermoso-mcp] ready · API ${API_BASE}`);
