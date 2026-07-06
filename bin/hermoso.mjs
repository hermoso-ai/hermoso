#!/usr/bin/env node
// Hermoso CLI — drive Hermoso from any terminal agent (Claude Code, Codex, Cursor, OpenClaw…) by shelling out.
// This is the token-cheap path (the agent runs a command instead of carrying a fat tool manifest); the skills
// in skills/ wrap these commands. Same /api as the MCP server.
//
//   npm i -g  (from this repo)  OR  node bin/hermoso.mjs <cmd>
//   hermoso auth login --url http://localhost:3000      # local: no token needed (records the base URL)
//   hermoso capabilities                                 # learn valid model ids + costs (run first)
//   hermoso create --brand Flourish --product "protein pancakes" --format image
//   hermoso generate image --prompt "…" --ref ./bag.png --wait
//
// Auth today: none locally (the server resolves the dev account). `hermoso auth login --token <t>` stores a Bearer
// for when real auth lands — the seam, not a requirement.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const CONFIG_DIR = path.join(os.homedir(), '.hermoso');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

async function loadConfig() { try { return JSON.parse(await readFile(CONFIG_FILE, 'utf8')); } catch { return {}; } }
async function saveConfig(c) { await mkdir(CONFIG_DIR, { recursive: true }); await writeFile(CONFIG_FILE, JSON.stringify(c, null, 2)); }

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

  // ---- auth: no network call today; records base URL + optional token (the OAuth seam) ----
  if (group === 'auth') {
    if (sub === 'logout') { await saveConfig({}); return console.log('✓ Logged out (cleared ~/.hermoso/config.json)'); }
    const next = { apiBase: flags.url || cfg.apiBase || 'http://localhost:3000', token: flags.token || cfg.token || '', profile: flags.profile || cfg.profile || 'default' };
    await saveConfig(next);
    console.log(`✓ Saved. API: ${next.apiBase}${next.token ? ' · token stored' : ' · local dev (no auth required)'}`);
    return;
  }
  if (group === 'version' || flags.version) {
    console.log(`hermoso-cli 1.0.0 · API ${cfg.apiBase || process.env.HERMOSO_API_BASE || 'http://localhost:3000'} · ${cfg.token ? 'authed' : 'local (no auth)'}`);
    return;
  }

  // resolve API base + token from config (env overrides), then load the shared client
  process.env.HERMOSO_API_BASE = process.env.HERMOSO_API_BASE || cfg.apiBase || 'http://localhost:3000';
  if (cfg.token && !process.env.HERMOSO_TOKEN) process.env.HERMOSO_TOKEN = cfg.token;
  if (cfg.profile && !process.env.HERMOSO_PROFILE) process.env.HERMOSO_PROFILE = cfg.profile;
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
      case 'credits': { const d = await api.apiGet('/api/credits'); return out(`Balance: ${d.balance} credits · session used: ${d.sessionUsed ?? 0}`, d); }
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
      default:
        console.log(`hermoso <command>
  auth login [--url <base>] [--token <t>]   credits          capabilities
  brand draft (--domain|--description|--social …)             create --brand --product [--format]
  generate image --prompt [--ref] [--model] [--aspect]        generate video|avatar|stitch … [--wait]
  jobs list | jobs get <id> [--wait]                          competitors <domain>
  ads pull (--company|--domain)                               research "<request>"
  fetch <url> [--out]                                         version
add --json to any command for machine output.`);
    }
  } catch (e) { die(e?.message || String(e)); }
}
main();
