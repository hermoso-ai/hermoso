#!/usr/bin/env node
// Hermoso CLI — drive Hermoso from any terminal agent (Claude Code, Codex, Cursor, OpenClaw…) by shelling out.
// This is the token-cheap path (the agent runs a command instead of carrying a fat tool manifest); the skills
// in skills/ wrap these commands. Same /api as the MCP server.
//
//   npm i -g  (from this repo)  OR  node bin/hermoso.mjs <cmd>
//   hermoso auth login                                 # browser sign-in (loopback, like gh/heroku); --token <key> for CI
//   hermoso capabilities                                 # learn valid model ids + costs (run first)
//   hermoso create --brand Flourish --product "protein pancakes" --format image
//   hermoso generate image --prompt "…" --ref ./bag.png --wait
//
// EVERY tool the MCP server registers is also callable here. The terminal gets the same product as the connector,
// reached a cheaper way:
//   hermoso tools                                        # every tool, name + one line, grouped
//   hermoso tools --group ads --search reddit            # narrow it
//   hermoso tools post_to_x                              # one tool's full schema
//   hermoso call post_to_x --json '{"text":"hello"}'     # run it
// The curated subcommands above stay as ergonomics for the common path; `call` is the ceiling.
//
// Auth today: none locally (the server resolves the dev account). `hermoso auth login --token <t>` stores a Bearer
// for when real auth lands — the seam, not a requirement.
import { readFile, writeFile, mkdir, chmod } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
// READ THE REAL VERSION. This line printed a hard-coded "1.0.0" while package.json shipped 0.1.151 — so the
// one command a user runs to find out what they have installed reported a version that has never existed.
// Read from package.json so it cannot drift again; a bump is already a release step, and this now follows it.
const CLI_VERSION = (() => { try { return createRequire(import.meta.url)('../package.json').version; } catch { return '0.0.0'; } })();

const CONFIG_DIR = path.join(os.homedir(), '.hermoso');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

async function loadConfig() { try { return JSON.parse(await readFile(CONFIG_FILE, 'utf8')); } catch { return {}; } }
// config.json holds a long-lived hmk_ account bearer (full billing/spend authority) — write it OWNER-ONLY (dir 0700,
// file 0600) so a co-tenant on a shared machine can't read the key and spend the victim's credits (aws/gh/docker do the
// same). mode on mkdir/writeFile is pre-umask, so also chmod after in case an existing dir/file kept looser perms.
async function saveConfig(c) {
  await mkdir(CONFIG_DIR, { recursive: true, mode: 0o700 });
  try { await chmod(CONFIG_DIR, 0o700); } catch {}
  await writeFile(CONFIG_FILE, JSON.stringify(c, null, 2), { mode: 0o600 });
  try { await chmod(CONFIG_FILE, 0o600); } catch {}
}

// ---- minimal arg parser: positionals + --flags (--flag value | --flag=value | boolean --flag) ----
function parse(argv) {
  const pos = [], flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      if (eq >= 0) { flags[a.slice(2, eq)] = a.slice(eq + 1); }
      else if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) { flags[a.slice(2)] = argv[++i]; }
      else { flags[a.slice(2)] = true; }
    } else pos.push(a);
  }
  return { pos, flags };
}

const die = (msg) => { console.error('✗ ' + msg); process.exit(1); };

async function main() {
  const { pos, flags } = parse(process.argv.slice(2));
  const [group, sub] = pos;
  const cfg = await loadConfig();

  // ---- auth: `login` opens the browser to mint + store an agent key (nothing to paste — matches the app's OAuth
  //      connectors); `--token <key>` is the manual fallback; a localhost base needs no auth (dev). ----
  if (group === 'auth') {
    if (sub === 'logout') { await saveConfig({}); return console.log('✓ Logged out (cleared ~/.hermoso/config.json)'); }
    const apiBase = (flags.url || cfg.apiBase || 'https://app.hermoso.ai').replace(/\/$/, '');
    const profile = flags.profile || cfg.profile || 'default';
    const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/.test(apiBase);
    if (flags.token) { await saveConfig({ apiBase, token: String(flags.token), profile }); return console.log(`✓ Signed in — key stored (~/.hermoso/config.json). API: ${apiBase}`); }
    if (isLocal) { await saveConfig({ apiBase, token: '', profile }); return console.log(`✓ Local dev — no auth required. API: ${apiBase}`); }
    if (sub === 'login') { // browser sign-in: spin a loopback server, open the app's /?cliauth page, receive a minted key
      const key = await browserLogin(apiBase);
      if (!key) return die(`Sign-in didn’t complete. Re-run "hermoso auth login", or paste a key: hermoso auth login --token <key>  (create one in the app under Agents & API keys).`);
      await saveConfig({ apiBase, token: key, profile });
      return console.log(`✓ Signed in — key stored (~/.hermoso/config.json). API: ${apiBase}`);
    }
    await saveConfig({ apiBase, token: cfg.token || '', profile }); // bare `auth` / `auth --url …`: just record the base
    return console.log(`✓ Saved. API: ${apiBase}${cfg.token ? ' · token stored' : ''}`);
  }
  if (group === 'version' || flags.version) {
    console.log(`hermoso-cli ${CLI_VERSION} · API ${cfg.apiBase || process.env.HERMOSO_API_BASE || 'https://app.hermoso.ai'} · ${cfg.token ? 'authed' : 'no token — run: hermoso auth login --token <key>'}`);
    return;
  }

  // resolve API base + token from config (env overrides), then load the shared client
  process.env.HERMOSO_API_BASE = process.env.HERMOSO_API_BASE || cfg.apiBase || 'https://app.hermoso.ai';
  if (cfg.token && !process.env.HERMOSO_TOKEN) process.env.HERMOSO_TOKEN = cfg.token;
  if (cfg.profile && !process.env.HERMOSO_PROFILE) process.env.HERMOSO_PROFILE = cfg.profile;
  if (cfg.owner && !process.env.HERMOSO_OWNER) process.env.HERMOSO_OWNER = cfg.owner; // shared team workspace: the owning account (server re-authorizes it)

  // `hermoso mcp` → run the stdio MCP server (Claude Code / Cursor / Codex spawn this, e.g. `npx -y hermoso mcp`).
  // It OWNS stdout as the JSON-RPC channel, so hand off immediately and print nothing to stdout here. The
  // config-resolved API base + token (set just above) ride into the server's client via env; all logs go to stderr.
  if (group === 'mcp') { await import('../mcp/hermoso-mcp.mjs'); return; }

  const api = await import('../mcp/client.mjs');
  const out = (label, data) => { if (flags.json) console.log(JSON.stringify(data, null, 2)); else console.log(label); };
  const absUrl = (u) => (u && u.startsWith('/') ? api.API_BASE + u : u);

  try {
    switch (group) {
      case 'capabilities': case 'caps': {
        const d = await api.apiGet('/api/generate/status');
        if (flags.json) return console.log(JSON.stringify(d, null, 2));
        console.log('IMAGE models:'); (d.options?.image?.models || []).forEach(m => console.log(`  ${m.id.padEnd(18)} ${m.label} · ${m.credits}cr${m.best ? ' ★best' : ''}`));
        console.log('VIDEO models:'); (d.options?.video?.models || []).forEach(m => console.log(`  ${m.id.padEnd(18)} ${m.label} · ${(m.durations || []).join('/')}s`));
        console.log(`flags: canEdit=${d.canEdit} canAvatar=${d.canAvatar} canPublish=${d.canPublish}`);
        console.log(`recipes: ${(d.recipes || []).map(r => r.id).join(', ')}`);
        return;
      }
      case 'credits': { const d = await api.apiGet('/api/credits');
        // accountBalance = the caller's Hermoso credits (authoritative when authed); balance = the local-dev usage
        // pill. Reading only `balance` printed "Balance: undefined credits" against prod for every signed-in user
        // (measured 2026-08-19). Same expression the hermoso_credits MCP tool uses, so the two cannot disagree.
        const bal = d.accountBalance ?? d.balance;
        return out(`Balance: ${bal ?? '—'} credits`, d); }
      case 'brand': {
        if (sub !== 'draft') return die('usage: hermoso brand draft (--domain <d> | --description <t> | --social <h> --platform <p>)');
        const body = flags.domain ? { domain: flags.domain } : flags.description ? { description: flags.description } : flags.social ? { socialHandle: flags.social, platform: flags.platform || 'instagram' } : null;
        if (!body) return die('give --domain, --description, or --social');
        const d = await api.apiPost('/api/brand/draft', body); const p = d.profile || d;
        return out(`✓ ${p.name || '—'}${p.category ? ' · ' + p.category : ''}${p.domain ? ' · ' + p.domain : ''}`, p);
      }
      case 'create': {
        if (!flags.product) return die('usage: hermoso create --brand <b> --product <p> [--format auto|image|video] [--recipe <id>]');
        const d = await api.apiPost('/api/create', { brand: { name: flags.brand || '' }, product: flags.product, format: flags.format || 'auto', recipe: flags.recipe || '', reference: flags.reference ? { url: flags.reference } : null, language: flags.language || '' });
        const c = d.creative || d;
        if (flags.json) return console.log(JSON.stringify(c, null, 2));
        console.log(`Concept (${c.format}${c.recipe_label ? ' · ' + c.recipe_label : ''}): ${c.concept}`);
        console.log(`Headline: ${c.copy?.[0]?.headline || ''}`);
        console.log(`Render with: ${c.format === 'video' ? c.vmodel : c.imodel || 'default'}  →  hermoso generate ${c.format === 'video' ? 'video' : 'image'} --prompt "…"`);
        return;
      }
      case 'generate': case 'gen': {
        const wait = flags.wait !== false && flags.wait !== 'false';
        if (sub === 'image') {
          if (!flags.prompt) return die('--prompt required');
          const refs = []; for (const k of ['ref', 'refs']) if (flags[k]) refs.push(...String(flags[k]).split(','));
          const refImages = refs.length ? (await Promise.all(refs.map(api.toRef))).filter(Boolean) : undefined;
          const d = await api.apiPost('/api/generate/image', { prompt: flags.prompt, refImages, aspectRatio: flags.aspect, model: flags.model });
          return out(`✓ Image: ${absUrl(d.image)}${d.model ? ` (${d.model})` : ''}`, { ...d, image: absUrl(d.image) });
        }
        // video | avatar | stitch → job + poll
        const type = sub;
        if (!['video', 'avatar', 'stitch'].includes(type)) return die('usage: hermoso generate image|video|avatar|stitch …');
        let input = {};
        if (type === 'video') { if (!flags.prompt) return die('--prompt required'); input = { prompt: flags.prompt, refImage: flags.ref ? await api.toRef(flags.ref) : undefined, durationSeconds: flags.duration ? +flags.duration : undefined, aspectRatio: flags.aspect, model: flags.model, resolution: flags.resolution, ttsScript: flags.tts, ttsVoice: flags.voice, musicMood: flags.music }; }
        else if (type === 'avatar') { if (!flags.image || !flags.script) return die('--image and --script required'); input = { image: await api.toRef(flags.image), script: flags.script, voice: flags.voice, resolution: flags.resolution }; }
        else if (type === 'stitch') { if (!flags.scenes) return die('--scenes <file.json> required'); input = { scenes: JSON.parse(await readFile(flags.scenes, 'utf8')), aspectRatio: flags.aspect, voiceover: flags.voiceover, voice: flags.voice, resolution: flags.resolution }; }
        const job = await api.submitJob(type, input, { label: 'cli ' + type });
        if (!wait) return out(`Queued job ${job.id} — poll with: hermoso jobs get ${job.id} --wait`, job);
        process.stderr.write(`rendering (job ${job.id})…`);
        const { result } = await api.pollJob(job.id, { timeoutMs: +(flags['wait-timeout'] || 600) * 1000, intervalMs: +(flags['wait-interval'] || 3) * 1000, onTick: () => process.stderr.write('.') });
        process.stderr.write('\n');
        const url = absUrl(result?.video || result?.image || result?.url);
        return out(`✓ ${type}: ${url}${result?.model ? ` (${result.model})` : ''}`, { ...result, url });
      }
      case 'jobs': {
        if (sub === 'get') { const id = pos[2]; if (!id) return die('usage: hermoso jobs get <id> [--wait]'); if (flags.wait) { const { result } = await api.pollJob(id, { timeoutMs: 600000 }); return out(`✓ ${absUrl(result?.video || result?.image || result?.url)}`, result); } const j = await api.getJob(id); return out(`${j.id} ${j.type} ${j.status}${j.progress ? ` ${Math.round(j.progress * 100)}%` : ''}`, j); }
        const d = await api.apiGet('/api/jobs');
        if (flags.json) return console.log(JSON.stringify(d, null, 2));
        console.log(`${d.running} running.`); (d.jobs || []).slice(0, 15).forEach(j => console.log(`  ${j.id}  ${j.type.padEnd(7)} ${j.status}`));
        return;
      }
      case 'competitors': { const domain = sub; if (!domain) return die('usage: hermoso competitors <domain> [--mode competitors|inspiration|company]'); const d = await api.apiPost('/api/inspire/competitors', { domain, mode: flags.mode || 'competitors' }); if (flags.json) return console.log(JSON.stringify(d, null, 2)); (d.candidates || []).forEach(c => console.log(`  ${c.name}  (${c.domain || '—'}, ${c.kind})`)); return; }
      case 'ads': {
        if (sub !== 'pull') return die('usage: hermoso ads pull (--company <n> | --domain <d>) [--platforms facebook,google,linkedin]');
        const d = await api.apiPost('/api/inspire/fanout', { companyName: flags.company, domain: flags.domain, platforms: flags.platforms ? String(flags.platforms).split(',') : ['facebook'], country: flags.country || 'US', limit: +flags.limit || 30, sort: flags.sort || 'longest_running' });
        return out('✓ pulled (use --json to see the ads)', d);
      }
      case 'research': { const q = sub || flags.query; if (!q) return die('usage: hermoso research "<request>"'); const d = await api.apiSSE('/api/explore/chat', { messages: [{ role: 'user', content: q }] }); if (flags.json) return console.log(JSON.stringify(d, null, 2)); console.log(d.reply || ''); console.log(`\n(${(d.results || []).length} ads found)`); return; }
      case 'fetch': { const url = sub; if (!url) return die('usage: hermoso fetch <url> [--out <name>]'); const r = await fetch(`${api.API_BASE}/api/download?url=${encodeURIComponent(url)}`); if (!r.ok) return die(`download failed (HTTP ${r.status})`); const buf = Buffer.from(await r.arrayBuffer()); const name = flags.out || path.basename(url.split(/[?#]/)[0]) || 'asset'; await writeFile(name, buf); return console.log(`✓ saved ${name} (${buf.length} bytes)`); }
      // ── TELLING US SOMETHING IS BROKEN OR MISSING ──────────────────────────────────────────────────────────
      // `report_bug` / `request_feature` are reachable through the generic passthrough like everything else, and
      // these two shortcuts exist anyway because of WHEN they get reached for: mid-task, right after something has
      // just failed. `hermoso call report_bug --json '{"summary":"…","details":"…"}'` is a lot of ceremony at that
      // moment, and a report that does not get written is the one case this whole channel exists to prevent.
      //
      // NOTHING IS INVENTED. With no --details, the text you typed becomes the details and its FIRST SENTENCE
      // becomes the summary — your own words in both fields, under a rule stated here and in --help. It never
      // writes a sentence you did not.
      case 'bug': case 'feature': {
        const tool = group === 'bug' ? 'report_bug' : 'request_feature';
        const text = [sub, ...pos.slice(2)].filter(Boolean).join(' ').trim() || String(flags.summary || '').trim();
        if (!text) return die(`usage: hermoso ${group} "what happened" [--details "…"]${group === 'bug' ? ' [--severity low|medium|high]' : ''}`);
        const firstSentence = (text.split(/(?<=[.!?])\s/)[0] || text).trim();
        const preset = {
          summary: String(flags.summary || firstSentence).slice(0, 200),
          details: String(flags.details || text),
          ...(group === 'bug' && flags.severity ? { severity: String(flags.severity) } : {}),
        };
        const reg = await import('../mcp/registry.mjs');
        return await runTool(reg, tool, flags, [], preset);
      }
      // ── FULL TOOL SURFACE ──────────────────────────────────────────────────────────────────────────────────
      // `tools` is what replaces a tool manifest: the agent greps this list for the one tool it needs and reads
      // that schema alone, instead of carrying several hundred schemas before the user has said anything.
      case 'tools': {
        const reg = await import('../mcp/registry.mjs');
        const name = sub;
        if (name) return await printToolSchema(reg, name, flags);
        const inv = reg.inventory();
        const q = String(flags.search || flags.grep || '').toLowerCase();
        const wantGroup = flags.group ? String(flags.group).toLowerCase() : '';
        if (wantGroup && !reg.TOOL_GROUP_NAMES.includes(wantGroup)) {
          // Refused by name, never quietly ignored — a filter that silently matched everything would hand back the
          // whole roster to someone who asked for one slice and believed they got it.
          return die(`Unknown group "${wantGroup}". Groups: ${reg.TOOL_GROUP_NAMES.join(', ')}.`);
        }
        // Sorted by group (in the order enable_tools names them) then by name, so a group heads its own block
        // exactly once. Registration order interleaves the sections and prints `core` four times.
        const order = (g) => { const i = reg.TOOL_GROUP_NAMES.indexOf(g); return i < 0 ? 99 : i; };
        const rows = inv.filter((t) => (!wantGroup || t.group === wantGroup)
          && (!q || t.name.includes(q) || t.description.toLowerCase().includes(q) || (t.title || '').toLowerCase().includes(q)))
          .sort((a, b) => order(a.group) - order(b.group) || a.name.localeCompare(b.name));
        if (flags.json === true) return console.log(JSON.stringify(rows, null, 2));
        if (flags.names) return console.log(rows.map((t) => t.name).join('\n'));
        if (!rows.length) return console.log(`No tool matches${wantGroup ? ` in ${wantGroup}` : ''}${q ? ` "${q}"` : ''}. Try: hermoso tools`);
        const counts = {};
        for (const t of inv) counts[t.group] = (counts[t.group] || 0) + 1;
        console.log(`${inv.length} tools · ${reg.TOOL_GROUP_NAMES.map((g) => `${g}(${counts[g] || 0})`).join(' ')}`);
        if (rows.length !== inv.length) console.log(`showing ${rows.length}`);
        const width = Math.max(40, (process.stdout.columns || 100) - 30);
        let last = null;
        for (const t of rows) {
          if (t.group !== last) {
            // The group's own one-line purpose, straight from the table `enable_tools` uses, so an agent scanning
            // for where to look is reading the same description the connector shows.
            const blurb = reg.TOOL_GROUPS[t.group] || '';
            console.log(`\n${t.group}${blurb ? `  ${blurb}` : ''}`);
            last = t.group;
          }
          const one = t.description.split(/(?<=[.!?])\s|\n/)[0].trim();
          console.log(`  ${t.name.padEnd(34)} ${one.length > width ? one.slice(0, width - 1) + '…' : one}`);
        }
        console.log(`\nhermoso tools <name>            one tool's full schema`);
        console.log(`hermoso call <name> --json '{…}'  run it`);
        return;
      }
      // `call` runs ANY registered tool through the same handler, the same argument validation and the same
      // confirm/spend gates the MCP twins use. There is no second implementation here to drift or to bypass.
      case 'call': {
        if (!sub) return die(`usage: hermoso call <tool_name> --json '{"key":"value"}'   ·   hermoso tools  lists them`);
        const reg = await import('../mcp/registry.mjs');
        return await runTool(reg, sub, flags, pos.slice(2));
      }
      default:
      {
        // A BARE TOOL NAME IS A CALL. `hermoso post_to_x --text hi` is the same thing as
        // `hermoso call post_to_x --text hi`, so an agent that read a name out of `hermoso tools` can just run it.
        // Checked against the REAL registry, so nothing has to be listed here and kept in step.
        if (group) {
          const reg = await import('../mcp/registry.mjs');
          if (reg.inventory().some((t) => t.name === group)) return await runTool(reg, group, flags, pos.slice(1));
        }
        console.log(`hermoso <command>
  auth login [--url <base>] [--token <t>]   credits          capabilities
  brand draft (--domain|--description|--social …)             create --brand --product [--format]
  generate image --prompt [--ref] [--model] [--aspect]        generate video|avatar|stitch … [--wait]
  jobs list | jobs get <id> [--wait]                          competitors <domain>
  ads pull (--company|--domain)                               research "<request>"
  fetch <url> [--out]                                         mcp   (run the stdio MCP server)
  bug "what broke" [--details] [--severity]                   feature "what you need" [--details]
  version

The full tool surface (every tool the MCP server has):
  tools [--group <g>] [--search <q>] [--names]               list every tool, name + one line
  tools <name>                                               that tool's full input schema
  call <name> --json '{"key":"value"}'                       run it
  <name> --key value                                         same thing, shorter
add --json to any command for machine output.`);
        if (group) console.error(`\n✗ Unknown command "${group}". It is not a subcommand and not a tool name. Try: hermoso tools --search ${JSON.stringify(String(group).slice(0, 24))}`);
        if (group) process.exitCode = 1;
        return;
      }
    }
  } catch (e) { die(e?.message || String(e)); }
}

// ---- the full-tool-surface commands ---------------------------------------------------------------------------
// Flags THIS command consumes. Everything else is a tool argument, so the list stays as short as it can be:
// `--raw` is a real property on generate_image / generate_text / generate_video, and reserving it would make three
// tools uncallable from the shorthand. A tool that ever needs a `--json` or `--args` argument can still pass it
// inside --args '{"json":…}'.
const CALL_FLAGS = new Set(['json', 'args', 'args-file', 'structured']);

async function readArgsPayload(flags) {
  let src = null;
  if (typeof flags.args === 'string') src = flags.args;
  else if (typeof flags.json === 'string') src = flags.json;      // `--json '{…}'`; a bare `--json` means machine output
  if (flags['args-file']) src = await readFile(String(flags['args-file']), 'utf8');
  if (src === '-') src = await new Promise((res, rej) => { let b = ''; process.stdin.setEncoding('utf8'); process.stdin.on('data', (c) => { b += c; }); process.stdin.on('end', () => res(b)); process.stdin.on('error', rej); });
  if (src == null || String(src).trim() === '') return {};
  let parsed;
  try { parsed = JSON.parse(src); }
  catch (e) { throw new Error(`arguments are not valid JSON: ${e.message}. Wrap the whole object in single quotes: --json '{"key":"value"}'`); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('arguments must be a JSON object, e.g. --json \'{"key":"value"}\'');
  return parsed;
}

async function printToolSchema(reg, name, flags) {
  const { client, close } = await reg.openRegistry();
  try {
    const all = await reg.listTools(client);
    const tool = all.find((t) => t.name === name);
    if (!tool) return die(suggestTool(reg, name));
    const group = reg.inventory().find((t) => t.name === name)?.group || '?';
    if (flags.json === true) return console.log(JSON.stringify({ ...tool, group }, null, 2));
    console.log(`${tool.name}   [${group}]${tool.title ? '  ·  ' + tool.title : ''}`);
    console.log(`\n${tool.description || ''}\n`);
    const fields = reg.schemaFields(tool.inputSchema);
    if (!fields.length) console.log('Arguments: none.');
    else {
      console.log('Arguments:');
      const width = Math.max(40, (process.stdout.columns || 100) - 40);
      for (const f of fields) {
        const head = `  ${f.required ? '*' : ' '} ${f.name}${f.type ? ` <${f.type}>` : ''}`;
        const d = f.enum ? `one of: ${f.enum.join(' | ')}` : f.description;
        console.log(`${head.padEnd(38)} ${d.length > width ? d.slice(0, width - 1) + '…' : d}`);
      }
      console.log('  (* = required)');
    }
    const req = fields.filter((f) => f.required);
    const example = Object.fromEntries(req.map((f) => [f.name, f.enum ? f.enum[0] : f.type === 'number' || f.type === 'integer' ? 0 : f.type === 'boolean' ? true : f.type === 'array' ? [] : '…']));
    console.log(`\nhermoso call ${tool.name} --json '${JSON.stringify(example)}'`);
    console.log(`hermoso tools ${tool.name} --json      the raw JSON Schema`);
  } finally { await close(); }
}

function suggestTool(reg, name) {
  const inv = reg.inventory();
  const needle = String(name).toLowerCase();
  const near = inv.filter((t) => t.name.includes(needle) || needle.includes(t.name.split('_')[0])).slice(0, 6).map((t) => t.name);
  return `No tool named "${name}".${near.length ? ` Did you mean: ${near.join(', ')}?` : ''} Run: hermoso tools --search ${JSON.stringify(needle.slice(0, 24))}`;
}

// RUN A TOOL. The arguments are assembled here and passed through UNTOUCHED — nothing is defaulted, injected or
// dropped on the way. That is what keeps a confirm-gated tool confirm-gated from a terminal: the gate lives in the
// handler, and the CLI is not allowed to answer it on the caller's behalf.
// `preset` is the ONLY way anything reaches the arguments other than the caller's own --json/--flags, and it is
// supplied by exactly two call sites: the `bug` and `feature` shortcuts, which shape text the user typed into the
// two fields those tools require. A caller's own value always wins over it. It is deliberately not a general
// mechanism — every other command either passes the arguments through untouched or does not use runTool at all,
// which is what keeps a confirm-gated tool something only the caller can answer.
async function runTool(reg, name, flags, extraPos = [], preset = null) {
  const { client, close } = await reg.openRegistry();
  try {
    const all = await reg.listTools(client);
    const tool = all.find((t) => t.name === name);
    if (!tool) return die(suggestTool(reg, name));
    const args = { ...(preset || {}), ...(await readArgsPayload(flags)) };
    // Per-flag arguments, coerced against the TOOL'S OWN schema and refused by name when unrecognised. The SDK
    // builds a non-strict object, so an unknown key would otherwise be stripped in silence — a typo'd `--confrim`
    // would send an unconfirmed call and read as a clean success.
    const bad = [];
    for (const [k, v] of Object.entries(flags)) {
      if (CALL_FLAGS.has(k)) continue;
      const c = reg.coerceArg(tool.inputSchema, k, v);
      if (c.ok) { args[k] = c.value; continue; }
      bad.push(c.unknown ? `--${k} is not an argument of ${name}` : c.message);
    }
    if (extraPos.length) bad.push(`unexpected value${extraPos.length > 1 ? 's' : ''} ${extraPos.map((v) => JSON.stringify(v)).join(', ')} . Every argument is a --flag or goes inside --json`);
    if (bad.length) return die(`${bad.join('\n  ')}\n  Run: hermoso tools ${name}`);

    const res = await client.callTool({ name, arguments: args });
    const text = (res.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('\n');
    if (flags.json === true) console.log(JSON.stringify(res, null, 2));
    else if (flags.structured) console.log(JSON.stringify(res.structuredContent ?? null, null, 2));
    else if (text) console.log(text);
    else console.log(JSON.stringify(res.structuredContent ?? res, null, 2));
    // A TOOL THAT FAILED MUST EXIT NON-ZERO. `isError` is how MCP reports a refused gate, a missing connector or a
    // provider failure, and a shelling-out agent reads the exit code before it reads the text.
    if (res.isError) process.exitCode = 1;
  } finally { await close(); }
}

// ---- browser sign-in (loopback OAuth, like gh/firebase): spin a 127.0.0.1 server, open the app's cli-auth page,
//      which mints an agent key and redirects the browser back to our loopback with ?key=&state=. Nothing is pasted;
//      the key transits only the user's own machine. Times out after 3 min. Returns the hmk_ key, or null. ----
async function browserLogin(apiBase) {
  const http = await import('node:http');
  const crypto = await import('node:crypto');
  const state = crypto.randomBytes(16).toString('hex');
  return await new Promise((resolve) => {
    let done = false;
    const finish = (val) => { if (done) return; done = true; try { server.close(); } catch {} resolve(val); };
    const server = http.createServer((req, res) => {
      try {
        const u = new URL(req.url, 'http://127.0.0.1');
        if (u.pathname === '/favicon.ico') { res.writeHead(204); return res.end(); }
        const key = u.searchParams.get('key') || '';
        const st = u.searchParams.get('state') || '';
        const ok = st === state && /^hmk_[A-Za-z0-9_-]{20,}$/.test(key);
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        res.end(cliAuthPage(ok ? 'You’re signed in ✓' : 'Sign-in didn’t complete', ok ? 'Hermoso CLI is connected. You can close this tab and return to your terminal.' : 'Please close this tab and run the command again.'));
        finish(ok ? key : null);
      } catch { try { res.writeHead(500); res.end('error'); } catch {} finish(null); }
    });
    server.on('error', () => finish(null));
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      const authUrl = `${apiBase}/?cliauth=1&port=${port}&state=${state}`;
      console.log(`\nOpening your browser to sign in…\nIf it doesn’t open, paste this into your browser:\n  ${authUrl}\n`);
      openBrowser(authUrl);
    });
    setTimeout(() => finish(null), 180000);
  });
}
function openBrowser(url) {
  import('node:child_process').then(({ spawn }) => {
    const plat = process.platform;
    const cmd = plat === 'darwin' ? 'open' : plat === 'win32' ? 'cmd' : 'xdg-open';
    const args = plat === 'win32' ? ['/c', 'start', '', url] : [url];
    try { const c = spawn(cmd, args, { stdio: 'ignore', detached: true }); c.on('error', () => {}); c.unref(); } catch {}
  }).catch(() => {});
}
function cliAuthPage(title, body) {
  return `<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><title>Hermoso CLI</title><body style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;background:#0e0e10;color:#f4f1ea;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0"><div style="text-align:center;max-width:420px;padding:32px"><div style="font-family:Georgia,'Times New Roman',serif;font-size:24px;font-weight:700;letter-spacing:-.5px;margin-bottom:18px">hermoso<span style="color:#d9714e">.ai</span></div><h1 style="font-size:20px;margin:14px 0 8px;font-weight:600">${title}</h1><p style="color:#a7a29a;line-height:1.55;font-size:15px">${body}</p></div></body>`;
}
main();
