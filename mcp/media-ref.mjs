// ── A MEDIA REFERENCE IS A URL, NEVER A PATH ON THE CALLER'S MACHINE (2026-11-05) ──────────────────────────────────
// ONE rule for every tool and route that takes a video, image or audio by reference. ChatGPT hands its own sandbox
// paths straight to our tools: analyze_video got "/mnt/data/IMG_6358(1).mp4", the server read it as one of OUR served
// paths, and the caller was told "ENOENT … open '/app/public/mnt/data/IMG_6358(1).mp4'" as a 500 (fp bf206cd60b30);
// a subtitles JOB was queued with the same kind of path and died the same way inside the worker. An earlier fix only
// covered upload_meta_asset. This module is the shared decision, PURE and import-free so the server (route
// middleware, the job enqueue, the file sinks), both MCP twins (byte-identical: cli/mcp/media-ref.mjs) and
// tools/client-local-media-check.mjs all run the same code.
//
// What it decides, per string:
//   • `url`     — http(s)://… (fetched later through the SSRF guards, not here)
//   • `data`    — a data: URI
//   • `served`  — a path WE serve: its first segment is a real entry of public/ (the server passes that list), e.g.
//                 /generated/…, /music/…. Normalised and checked for `..` first.
//   • `local`   — a file on the CALLER's side: /mnt/data/…, file://…, sandbox:/…, blob:…, C:\…, \\host\share, ~/…,
//                 ./x, or a bare absolute path that is not ours and looks like a file (an extension, or an OS/sandbox
//                 root such as /tmp, /home, /Users, /var, /private). Refused with the one sentence below.
//   • `traversal` — a `..` segment (raw, %2e-encoded, or with backslashes) or a NUL. Never a legitimate media input.
//   • `other`   — anything else (a Library id like L0, an asset id, attachment://1, a bare word, '/settings'): passed
//                 through untouched for the route to judge, so this rule can never refuse something it does not know.
export const LOCAL_FILE_MESSAGE = "That file is on your side (e.g. ChatGPT's sandbox). Upload it first with upload_file (or attach it), then pass the URL it returns.";
// upload_file's `path` source only works on a local (stdio) install; on a hosted connector the bytes must travel as
// `dataUri` (or the file must already be at a public `url`), so the sentence names the source that works everywhere.
export const LOCAL_FILE_HOW = 'upload_file takes the file itself as `dataUri` (base64) or a public `url`.';
export const MEDIA_PARAM_NOTE = 'a URL, not a local file path; use upload_file for local files';
export const TRAVERSAL_MESSAGE = 'That path is not a file Hermoso serves. Pass a public https URL, or the URL upload_file returns.';

// The param NAMES that carry a media reference. Anchored at the END so fileName / imageId / mediaType / videoTitle
// never match; `path` is deliberately absent (upload_file's own stdio `path`, Drive folder paths, /api/sc/run's __path).
export const MEDIA_KEY_RE = /(?:^|[a-z0-9_])(?:url|urls|uri|src|video|videos|image|images|img|audio|media|clip|clips|photo|photos|picture|pictures|logo|logos|thumb|thumbnail|thumbnails|cover|poster|asset|assets|music|still|stills|frame|frames|file|files|ref|refs|slide|slides|track|voiceover|source|sources|attachment|attachments|avatar|portrait|background|reference|references)$/i;
export const isMediaKey = (k) => typeof k === 'string' && MEDIA_KEY_RE.test(k);

const LOCAL_SCHEME_RE = /^(sandbox|file|blob|content|ph|assets-library):/i;
const WINDOWS_RE = /^[a-z]:[\\/]/i;
const UNC_RE = /^\\\\[^\\]/;
const HOME_RE = /^~(?:[\\/]|$)/;
// Roots that are a machine's filesystem, never a URL path anyone serves media from.
const LOCAL_ROOTS = new Set(['mnt', 'tmp', 'home', 'users', 'var', 'private', 'root', 'sdcard', 'storage', 'volumes', 'etc', 'proc', 'dev', 'sys', 'opt', 'srv', 'library', 'applications', 'workspace', 'workspaces']);
const FILE_EXT_RE = /\.[a-z0-9]{2,5}$/i;

const decodeOnce = (s) => { try { return decodeURIComponent(s); } catch { return s; } };
const hasDotDot = (s) => s.split(/[\\/]+/).some((seg) => seg === '..');

/** Classify one string. `served` is the list of first path segments we really serve; null = unknown (see below). */
export function mediaRefKind(raw, { served = ['generated'] } = {}) {
  if (typeof raw !== 'string') return 'other';
  const s = raw.trim();
  if (!s) return 'other';
  if (/^https?:\/\//i.test(s)) return 'url';
  if (/^data:/i.test(s)) return 'data';
  if (LOCAL_SCHEME_RE.test(s) || WINDOWS_RE.test(s) || UNC_RE.test(s) || HOME_RE.test(s)) return 'local';
  const pathPart = s.split(/[?#]/)[0];
  const dec = decodeOnce(pathPart);
  if (dec.includes('\0') || hasDotDot(pathPart) || hasDotDot(dec)) return 'traversal';
  if (/^\.{1,2}[\\/]/.test(s)) return 'local';
  if (s.startsWith('/') && !s.startsWith('//')) {
    const first = (dec.replace(/^\/+/, '').split(/[\\/]/)[0] || '').toLowerCase();
    // `served: null` = the caller does not know what the server serves (an MCP process): only an OS/sandbox root
    // counts as local then, and the server, which does know, judges the rest.
    if (served == null) return LOCAL_ROOTS.has(first) ? 'local' : 'other';
    const ours = new Set(served.map((x) => String(x).toLowerCase()));
    if (first && ours.has(first)) return 'served';
    if (LOCAL_ROOTS.has(first) || FILE_EXT_RE.test(dec)) return 'local';
  }
  return 'other';
}

/** The refusal for one string, or null when it is fine to pass on. */
export function mediaRefRefusal(raw, opts = {}) {
  const kind = mediaRefKind(raw, opts);
  if (kind !== 'local' && kind !== 'traversal') return null;
  const shown = String(raw).trim().slice(0, 160);
  const message = kind === 'local'
    ? `${LOCAL_FILE_MESSAGE} ${LOCAL_FILE_HOW} (\`${shown}\` is a path on your machine or sandbox, which Hermoso cannot open. Nothing was queued and nothing was charged.)`
    : `${TRAVERSAL_MESSAGE} (\`${shown}\`. Nothing was queued and nothing was charged.)`;
  return { kind, value: shown, message, code: kind === 'local' ? 'local_file_path' : 'bad_media_path' };
}

/**
 * Walk a request body / query / tool args and return the FIRST media-keyed string that is a client-local path or a
 * traversal, as {key, path, kind, value, message, code} — or null. Only values under a media-named key are judged
 * (a caption that happens to mention C:\ is the user's text, not a reference). Bounded in depth and size.
 */
export function findClientLocalMedia(value, opts = {}) {
  let budget = 4000;
  const walk = (v, key, trail, depth, media) => {
    if (budget-- <= 0 || depth > 8 || v == null) return null;
    if (typeof v === 'string') {
      if (!media) return null;
      const r = mediaRefRefusal(v, opts);
      return r ? { key, path: trail, ...r } : null;
    }
    if (Array.isArray(v)) {
      for (let i = 0; i < v.length && i < 500; i++) { const h = walk(v[i], key, `${trail}[${i}]`, depth + 1, media); if (h) return h; }
      return null;
    }
    if (typeof v === 'object') {
      if (typeof Buffer !== 'undefined' && Buffer.isBuffer?.(v)) return null;
      for (const k of Object.keys(v)) { const h = walk(v[k], k, trail ? `${trail}.${k}` : k, depth + 1, isMediaKey(k)); if (h) return h; }
    }
    return null;
  };
  return walk(value, '', '', 0, false);
}

/**
 * A file object ChatGPT passes for an attached file ({download_url, file_id, mime_type?, file_name?}, OpenAI Apps SDK
 * "openai/fileParams") sitting under a media-named key is replaced IN PLACE by its download_url, so a raw API caller that
 * forwards ChatGPT's argument as-is reaches the same https fetch as any other link. Returns how many were replaced.
 */
export const isOpenAIFileRef = (v) => !!v && typeof v === 'object' && !Array.isArray(v) && typeof v.download_url === 'string' && typeof v.file_id === 'string';
export function flattenOpenAIFiles(value) {
  let n = 0, budget = 4000;
  const walk = (v, depth) => {
    if (budget-- <= 0 || depth > 8 || !v || typeof v !== 'object') return;
    if (typeof Buffer !== 'undefined' && Buffer.isBuffer?.(v)) return;
    if (Array.isArray(v)) { for (let i = 0; i < v.length && i < 500; i++) { if (isOpenAIFileRef(v[i])) { v[i] = v[i].download_url; n++; } else walk(v[i], depth + 1); } return; }
    for (const k of Object.keys(v)) {
      const x = v[k];
      if (isMediaKey(k) && isOpenAIFileRef(x)) { v[k] = x.download_url; n++; }
      else if (isMediaKey(k) && Array.isArray(x)) { for (let i = 0; i < x.length && i < 500; i++) { if (isOpenAIFileRef(x[i])) { x[i] = x[i].download_url; n++; } else walk(x[i], depth + 2); } }
      else walk(x, depth + 1);
    }
  };
  walk(value, 0);
  return n;
}

/** The Error a caller throws for a hit: status 400 + _userInput, so the ledger files it as the caller's. */
export function clientLocalMediaError(hit) {
  return Object.assign(new Error(`\`${hit.path || hit.key}\`: ${hit.message}`), { status: 400, _userInput: true, code: hit.code, param: hit.path || hit.key });
}
