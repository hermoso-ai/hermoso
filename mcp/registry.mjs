// THE CLI'S ROUTE INTO THE FULL TOOL ROSTER — one implementation, shared with the stdio MCP twin.
//
// WHY THIS EXISTS. The CLI shipped 12 hand-written subcommands against a roster of several hundred registered
// tools, so a terminal agent had to choose between the full surface with a fat tool manifest (MCP) and a cheap
// manifest with a sliver of the product (CLI). That is the [[mcp-is-the-complete-surface]] defect one level down:
// a capability reachable on one agent surface and not another. `hermoso tools` and `hermoso call` close it — the
// agent greps for the one tool it needs and pays for that schema alone, instead of carrying every schema up front.
//
// IT IS THE SAME CODE PATH, NOT A SECOND SET OF RULES. We build a real McpServer, register the real tools with the
// real registerTools(), and drive it with a real MCP Client over an in-memory transport. So argument validation,
// confirm gates, spend gates, workspace scoping, result shaping and error text are byte-identical to what a Claude
// Code / Cursor / claude.ai session gets. There is no CLI-side reimplementation that could drift, and in
// particular no CLI-side way around a gate: a confirm-gated tool is confirm-gated from a terminal too, because it
// is literally the same handler.
//
// FREE AND OFFLINE UNTIL A TOOL IS CALLED. Registration touches no network; only the tool's own handler does.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { registerTools, MCP_INSTRUCTIONS, TOOL_GROUP_NAMES, TOOL_GROUPS } from './tools.mjs';

export { TOOL_GROUP_NAMES, TOOL_GROUPS };

// THE CLI ALWAYS REGISTERS EVERY GROUP, AND DELIBERATELY IGNORES HERMOSO_TOOLS.
//
// The MCP default roster leaves `ads` out because a client that loads every schema eagerly cannot afford it — that
// is a MANIFEST cost, and a shelling-out agent pays no manifest at all. Honouring HERMOSO_TOOLS here would mean an
// agent whose MCP config narrows the roster gets `hermoso call create_google_ads_campaign` → "no such tool", which
// is the exact parity hole this file was written to close. Scoping was never an authorization boundary either
// (`enable_tools` turns any group on mid-session with no reconnect), so ignoring it takes nothing away.
const ALL_GROUPS = [...TOOL_GROUP_NAMES];

/**
 * Register every tool against an in-process MCP server and return a connected client.
 * Callers MUST await close() — the transport keeps the event loop alive otherwise.
 */
export async function openRegistry() {
  const server = new McpServer({ name: 'hermoso-cli', version: '1.0.0' }, { instructions: MCP_INSTRUCTIONS });
  registerTools(server, { only: ALL_GROUPS });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'hermoso-cli', version: '1.0.0' }, { capabilities: {} });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return {
    client,
    async close() { try { await client.close(); } catch {} try { await server.close(); } catch {} },
  };
}

/** Every tool with its full JSON Schema, exactly as an MCP client sees it. Pages through the cursor. */
export async function listTools(client) {
  const out = [];
  let cursor;
  do {
    const page = await client.listTools(cursor ? { cursor } : {});
    out.push(...(page.tools || []));
    cursor = page.nextCursor;
  } while (cursor);
  return out;
}

// ── GROUP MEMBERSHIP IS DERIVED BY RUNNING THE REGISTRY, NEVER BY A LIST ────────────────────────────────────────
// A tool's group is the `server.group()` marker it was written under, and registerTools keeps that map private. So
// we ask the only question it answers from outside: register once per group and see which tools come back ENABLED.
// A hand-kept name list would go stale the day someone adds a tool, which is the failure this repo has shipped
// more than once ([[prompt-rosters-go-stale]]).
//
// The stub MUST implement disable(): out-of-scope tools are registered and then disabled rather than skipped, so a
// stub that throws on disable() reports every group as the full roster and every answer below is silently wrong.
function rosterFor(only) {
  const handles = new Map();
  const mk = (name) => {
    const h = { enabled: true, enable() { h.enabled = true; return h; }, disable() { h.enabled = false; return h; } };
    if (name != null) handles.set(name, h);
    return h;
  };
  registerTools({ registerTool: (n, def) => { const h = mk(n); h.def = def; return h; }, registerResource: () => mk(null) },
    only ? { only } : {});
  return handles;
}

// A tool registered above the first `server.group()` marker has group `undefined` and belongs to no scoped MCP
// roster. It is still callable from the CLI (which registers every group), so it is REPORTED as `?` rather than
// quietly filed under a real group — an unreachable tool and an ungrouped one are different problems and must not
// look the same. Pulled out as its own function so a check can RUN it: no tool is ungrouped today
// (`mcp-tool-scope-check` fails if one ever is), so the branch is unreachable through `inventory()` and a check
// that could only assert it through the roster would be asserting nothing.
export const groupLabel = (g) => (g === undefined || g === null ? '?' : g);

/**
 * The whole inventory in one pass-set: every registered name, its group, its title/description.
 *
 * ONE registration per group plus one for the full roster — 8 passes, ~0.9s, and every number in it is measured
 * rather than declared.
 */
export function inventory() {
  const full = rosterFor(ALL_GROUPS);
  const groupOf = Object.create(null);
  for (const g of ALL_GROUPS) {
    for (const [name, h] of rosterFor([g])) {
      // `core` rides in every scoped roster (a roster without discovery is undriveable), so the FIRST group that
      // claims a tool wins and core is asked first — otherwise every core tool would be relabelled by the last
      // group to include it.
      if (h.enabled && groupOf[name] === undefined) groupOf[name] = g;
    }
  }
  return [...full.entries()].map(([name, h]) => ({
    name,
    group: groupLabel(groupOf[name]),
    title: h.def?.title || '',
    description: String(h.def?.description || ''),
  }));
}

// ── ARGUMENTS ──────────────────────────────────────────────────────────────────────────────────────────────────
// Coerce a --flag string against the tool's own JSON Schema. The CLI can only carry strings, and the MCP handler
// is strict about types, so `--durationSeconds 30` has to become a number somewhere. Doing it from the schema
// means the rules come from the tool, not from a guess here.
//
// AN UNKNOWN FLAG IS REFUSED BY NAME, NEVER DROPPED. The SDK builds a non-strict z.object, so an unrecognised key
// is silently stripped: a typo'd `--confrim true` would send a call with no confirmation and read as success.
export function coerceArg(schema, key, raw) {
  const prop = schema?.properties?.[key];
  if (!prop) return { unknown: true };
  const type = Array.isArray(prop.type) ? prop.type.find((t) => t !== 'null') : prop.type;
  if (raw === true) { // a bare `--flag` with no value
    if (type === 'boolean') return { ok: true, value: true };
    return { message: `--${key} needs a value` };
  }
  const s = String(raw);
  if (type === 'boolean') {
    if (/^(true|yes|1|on)$/i.test(s)) return { ok: true, value: true };
    if (/^(false|no|0|off)$/i.test(s)) return { ok: true, value: false };
    return { message: `--${key} expects true or false, got "${s}"` };
  }
  if (type === 'number' || type === 'integer') {
    const n = Number(s);
    if (!Number.isFinite(n)) return { message: `--${key} expects a number, got "${s}"` };
    return { ok: true, value: n };
  }
  if (type === 'array') {
    // JSON first so an array of objects is still expressible; comma-splitting is the convenience for the common
    // array-of-strings case and must not silently mangle anything richer.
    if (s.trim().startsWith('[')) { try { return { ok: true, value: JSON.parse(s) }; } catch { /* fall through to split */ } }
    const items = Array.isArray(prop.items) ? prop.items[0] : prop.items;
    const itemType = items?.type;
    const parts = s.split(',').map((v) => v.trim()).filter(Boolean);
    if (itemType === 'number' || itemType === 'integer') {
      const nums = parts.map(Number);
      if (nums.some((n) => !Number.isFinite(n))) return { message: `--${key} expects a list of numbers, got "${s}"` };
      return { ok: true, value: nums };
    }
    if (itemType === 'object') return { message: `--${key} takes objects. Pass it inside --json '{"${key}":[…]}'` };
    return { ok: true, value: parts };
  }
  if (type === 'object') {
    try { return { ok: true, value: JSON.parse(s) }; }
    catch { return { message: `--${key} takes an object. Pass it inside --json '{"${key}":{…}}'` }; }
  }
  return { ok: true, value: s };
}

/** The properties a caller may pass, in schema order, with the required ones marked. */
export function schemaFields(schema) {
  const req = new Set(schema?.required || []);
  return Object.entries(schema?.properties || {}).map(([name, p]) => ({
    name,
    required: req.has(name),
    type: Array.isArray(p.type) ? p.type.join('|') : (p.type || (p.anyOf ? 'any' : '')),
    enum: p.enum || null,
    description: String(p.description || ''),
  }));
}
