// Tiny fetch wrapper around the Hermoso HTTP API, shared by the MCP server (mcp/tools.mjs) and the CLI (bin/hermoso.mjs).
// LOCAL today: no auth needed — the server's local auth adapter resolves the fixed dev account, so requireAuth/
// gateSpend pass. When real auth lands, set HERMOSO_TOKEN (a Bearer) and the SAME calls become authoritative — no
// changes here. We attach the x-hermoso-plan / x-hermoso-user fallbacks the browser also sends, purely for parity;
// the server treats them as non-authoritative (identity comes from the verified token / local dev user).
import { readFile } from 'node:fs/promises';
import path from 'node:path';

export const API_BASE = (process.env.HERMOSO_API_BASE || 'https://app.hermoso.ai').replace(/\/+$/, '');
const TOKEN = process.env.HERMOSO_TOKEN || '';
export const PROFILE = process.env.HERMOSO_PROFILE || 'default';

function headers(extra = {}) {
  const h = { 'Content-Type': 'application/json', 'x-hermoso-user': PROFILE, ...extra };
  if (TOKEN) h.Authorization = `Bearer ${TOKEN}`;
  return h;
}

// unwrap the {data}|{error} envelope; throw a clean Error (with .status) on failure
async function unwrap(res) {
  let body = null;
  try { body = await res.json(); } catch {}
  if (!res.ok) {
    let msg = (body && (body.error || body.message)) || `HTTP ${res.status}`;
    if (res.status === 401 && !TOKEN) msg += ' — set HERMOSO_TOKEN: create a key at app.hermoso.ai → Settings → Agents & API (or run `hermoso auth login --token <key>`)';
    throw Object.assign(new Error(msg), { status: res.status });
  }
  return body && Object.prototype.hasOwnProperty.call(body, 'data') ? body.data : body;
}

export async function apiGet(p, query) {
  const qs = query ? '?' + new URLSearchParams(query).toString() : '';
  const res = await fetch(`${API_BASE}${p}${qs}`, { headers: headers() });
  return unwrap(res);
}

export async function apiPost(p, body = {}) {
  const res = await fetch(`${API_BASE}${p}`, { method: 'POST', headers: headers(), body: JSON.stringify(body) });
  return unwrap(res);
}

export async function apiPut(p, body = {}) {
  const res = await fetch(`${API_BASE}${p}`, { method: 'PUT', headers: headers(), body: JSON.stringify(body) });
  return unwrap(res);
}

// /api/explore/chat streams Server-Sent-Events; collect to the terminal `done` payload {reply, results, actions}.
export async function apiSSE(p, body = {}) {
  const res = await fetch(`${API_BASE}${p}`, { method: 'POST', headers: headers({ Accept: 'text/event-stream' }), body: JSON.stringify(body) });
  if (!res.ok) { let e; try { e = (await res.json()).error; } catch {} throw Object.assign(new Error(e || `HTTP ${res.status}`), { status: res.status }); }
  const reader = res.body.getReader(); const dec = new TextDecoder();
  let buf = '', done = null, error = null; const progress = [];
  for (;;) {
    const { value, done: fin } = await reader.read(); if (fin) break;
    buf += dec.decode(value, { stream: true });
    const frames = buf.split('\n\n'); buf = frames.pop() || '';
    for (const f of frames) {
      const em = /event:\s*(.+)/.exec(f), dm = /data:\s*([\s\S]+)/.exec(f);
      if (!em || !dm) continue;
      let d; try { d = JSON.parse(dm[1]); } catch { continue; }
      const ev = em[1].trim();
      if (ev === 'progress') progress.push(d.label);
      else if (ev === 'done') done = d;
      else if (ev === 'error') error = d.error;
    }
  }
  if (error) throw new Error(error);
  if (!done) throw new Error('Stream closed before a response');
  return { ...done, progress };
}

// Submit a render to the job queue and (optionally) poll it to completion. Returns the UNWRAPPED worker result
// (the {image|video, model} object) on success — the job's `result` is itself a {data} envelope, so we peel it.
export async function submitJob(type, input, { label = '' } = {}) {
  return apiPost('/api/jobs', { type, input, label }); // → publicJob {id, status, ...}
}
export async function getJob(id) { return apiGet(`/api/jobs/${encodeURIComponent(id)}`); } // → publicJob
export function jobResult(job) { const r = job?.result; return r && Object.prototype.hasOwnProperty.call(r, 'data') ? r.data : r; }

export async function pollJob(id, { intervalMs = 3000, timeoutMs = 10 * 60 * 1000, onTick } = {}) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const job = await getJob(id);
    onTick?.(job);
    if (job.status === 'done') return { job, result: jobResult(job) };
    if (job.status === 'error') throw new Error(job.error || 'Render failed');
    if (Date.now() > deadline) throw Object.assign(new Error('Render timed out — check `hermoso jobs get ' + id + '`'), { jobId: id });
    await new Promise(r => setTimeout(r, intervalMs));
  }
}

// Read a local image path → data URI (so --ref local files force Nano-Banana compositing); pass http(s) URLs through.
export async function toRef(srcOrPath) {
  if (!srcOrPath) return null;
  if (/^(https?:|data:)/.test(srcOrPath)) return srcOrPath;
  const buf = await readFile(srcOrPath);
  const ext = path.extname(srcOrPath).toLowerCase().replace('.', '');
  const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : ext === 'gif' ? 'image/gif' : 'image/jpeg';
  return `data:${mime};base64,${buf.toString('base64')}`;
}

export const authState = () => ({ apiBase: API_BASE, hasToken: !!TOKEN, profile: PROFILE });
