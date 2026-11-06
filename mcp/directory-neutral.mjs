// DIRECTORY-SCOPE DESCRIPTION NEUTRALISER (2026-11-06).
// The Claude Connectors Directory asks every listing to acknowledge "Tool descriptions contain no instructions about
// model behavior, other tools, or external instruction sources". Measured on the live `?tools=directory` roster that
// day: 175 of 1,043 descriptions told the model to call or use another named tool and 91 used ALWAYS/NEVER/MUST.
// On the directory scope ONLY (defForDirectory in tools.mjs), every tool, title-free description and parameter
// description is passed through this: a phrase that merely names where an id comes from ("comment id from
// list_meta_comments") loses the tool name and keeps the fact; a clause or bracket that still names another tool, or
// that directs the model (ALWAYS/NEVER/MUST, "tell the user", "call this first", "Never publish …"), is dropped.
// Every other connection is untouched (defForDirectory returns the canonical def unchanged off the scope).
// Pinned by tools/directory-description-neutral-check.mjs, which runs the REAL scoped registration.
import { readdirSync, readFileSync } from 'node:fs';

const DIRECTIVE_CAPS = /\b(?:ALWAYS|NEVER|MUST|IMPORTANT|CRITICAL|YOU|YOUR)\b/;
const DIRECTIVE_WORDS = /\byou(?:'ll| will)? (?:must|should|need to|have to|cannot|can't|may not|are required)\b|\b(?:always|never) (?:call|use|run|ask|tell|show|pass|hand|relay|retry|invent|guess|say|claim|present|offer|check|confirm|re-?run)\b|\b(?:do not|don't|must not)\s+(?:tell|say|claim|promise|describe|report|present|call|use|re-?run|retry|guess|invent|ask|offer|assume|suggest|show|mention|loop|poll|pass|send)\b|\b(?:tell|ask|show|remind|warn|inform|confirm with|check with|hand)\s+the\s+user\b|\blet the user\b|\b(?:relay|quote) (?:it|this|that|the (?:refusal|error|reply))\b|\b(?:call|use|run|invoke|try)\s+(?:this|it)\s+(?:first|before|after|once|again|instead)\b|\bbefore (?:calling|using|you call|you use)\b|\bprefer (?:this|it)\b|\binstead of (?:calling|using)\b/i;
const DIRECTIVE_LEAD = /(?:^|[.!?]\s+|[;:—·(]\s*)(?:never|always|do not|don't|make sure|be sure|remember to|remember that)\b/i;
// true when the text directs the model's behaviour (not when it states a fact about the tool or the platform)
export const isModelDirective = (t) => { const s = String(t || '').trim(); return DIRECTIVE_CAPS.test(s) || DIRECTIVE_WORDS.test(s) || DIRECTIVE_LEAD.test(s); };

// Every tool name this package can register, read off the registration calls in its own modules. A static read,
// because the first scoped session of a process rewrites early tools before later ones are registered.
let _names = null;
export function directoryToolNames() {
  if (_names) return _names;
  const out = new Set();
  try {
    const dir = new URL('.', import.meta.url);
    for (const f of readdirSync(dir)) {
      if (!f.endsWith('.mjs')) continue;
      const src = readFileSync(new URL(f, dir), 'utf8');
      for (const m of src.matchAll(/registerTool\(\s*['"]([a-z0-9_]+)['"]/g)) out.add(m[1]);
    }
  } catch {}
  _names = out;
  return out;
}

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const OPEN = '([{', CLOSE = ')]}';
// Clause boundaries at bracket depth 0: sentence ends, newlines, "; ", " — ", " · ", and a "(1) " enumeration.
function clauses(s) {
  const out = []; let depth = 0, cur = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (OPEN.includes(c)) depth++; else if (CLOSE.includes(c)) depth = Math.max(0, depth - 1);
    if (depth === 0) {
      let sep = null;
      if (c === '\n') sep = '\n';
      else if ((c === '.' || c === '!' || c === '?') && /\s/.test(s[i + 1] || '') && !/\b(?:e\.g|i\.e|vs|etc|approx|incl|eg|ie)$/i.test(cur.slice(-6))) { sep = c + ' '; i++; while (s[i + 1] === ' ') i++; }
      else if (c === ';' && s[i + 1] === ' ') { sep = '; '; i++; }
      else if (s.startsWith(' — ', i)) { sep = ' — '; i += 2; }
      else if (s.startsWith(' · ', i)) { sep = ' · '; i += 2; }
      else if (c === ' ' && /^\(\d\) /.test(s.slice(i + 1, i + 5))) sep = ' ';
      if (sep !== null) { out.push({ text: cur, sep }); cur = ''; continue; }
    }
    cur += c;
  }
  if (cur) out.push({ text: cur, sep: '' });
  return out;
}
const RANK = (sep) => (/^[.!?] ?$/.test(sep) ? 5 : sep === '\n' ? 4 : sep === '; ' ? 3 : sep === ' — ' ? 2 : sep === ' · ' ? 1 : 0);
const tidy = (t) => t.replace(/\(\s*[,;:]?\s*\)/g, '').replace(/\[\s*\]/g, '').replace(/\s+([,.;:)])/g, '$1').replace(/([(])\s+/g, '$1')
  .replace(/,\s*,/g, ',').replace(/[ \t]{2,}/g, ' ').replace(/^[\s,;:—·]+/, '').replace(/[\s,;:—·]+$/, '').trim();

// `opts.directives:false` (the focused ChatGPT apps, 2026-11-06) strips only mentions of the named tools and leaves
// directive wording alone: those apps keep the instructions every ChatGPT tool already passed review with.
export function makeDirectoryNeutral(names = directoryToolNames(), opts = {}) {
  const list = [...names].sort((a, b) => b.length - a.length).map(esc);
  if (!list.length) return { neutral: (t) => t, mentions: () => [] };
  const N = '(?:' + list.join('|') + ')';
  const nameRe = new RegExp('\\b' + N + '\\b', 'g');
  const mentions = (t, self) => [...String(t || '').matchAll(nameRe)].map((m) => m[0]).filter((n) => n !== self);
  const directives = opts.directives !== false;
  const offends = (t, self) => (directives && isModelDirective(t)) || mentions(t, self).length > 0;
  const MASKS = [
    [/\ban? upload_file (?:URL|url|link)s?\b/g, 'an uploaded file URL'],
    [/\bupload_file (?:URL|url|link)s?\b/g, 'uploaded file URLs'],
    [new RegExp('\\s*,?\\s*\\b(?:as |that |which )?(?:the )?' + N + '(?:\\s*(?:/|or|and)\\s*' + N + ')* (?:returned|returns|gave|gives|lists|listed|reports|created|made|found)(?: it| them| one)?\\b', 'g'), ''],
    [new RegExp('\\s*,?\\s*\\b(?:as returned by|returned by|listed by|from the result of|from|by|via|through|using|with|on|e\\.g\\.|eg|like|see|or|and|after)\\s+(?:the\\s+)?(?:result of\\s+|output of\\s+)?' + N + '(?:\\s+(?:result|output|response))?(?:\\s*(?:/|,|or|and)\\s*' + N + ')*\\b', 'g'), ''],
  ];
  // `opts.masks:false` drops a clause that names a tool rather than masking the name out of it: on a focused app the
  // masked remainder could read as a claim about THIS tool ("Make a new one" was the create tool's clause).
  const maskNames = opts.masks === false ? (t) => t : (t) => { for (const [re, to] of MASKS) t = t.replace(re, to); return tidy(t); };
  const stripBrackets = (t, self) => { let prev; do { prev = t; t = t.replace(/\s?[([]([^()[\]]*)[)\]]/g, (m, inner) => (offends(inner, self) ? '' : m)); } while (t !== prev); return t; };
  function neutral(text, self, fallback) {
    if (typeof text !== 'string' || !text || !offends(text, self)) return text;
    const parts = clauses(stripBrackets(maskNames(text), self));
    let out = '', pending = null;
    for (const p of parts) {
      if (!p.text.trim() || offends(p.text, self)) { if (pending !== null && RANK(p.sep) > RANK(pending)) pending = p.sep; continue; }
      if (pending !== null) out += pending || ' ';
      out += p.text; pending = p.sep;
    }
    if (pending && /^[.!?]/.test(pending)) out += pending.trim();
    out = tidy(out.replace(/([.!?]\s+|\n|^)([a-z])/g, (m, a, b) => a + b.toUpperCase()));
    if (out && /[.!?]$/.test(text.trim()) && !/[.!?)]$/.test(out)) out += '.';
    if (!out) for (const f of [].concat(fallback ?? [])) if (typeof f === 'string' && f && !offends(f, self)) { out = f; break; }
    return out;
  }
  return { neutral, mentions, offends };
}

let _default = null;
export const directoryNeutral = () => (_default ||= makeDirectoryNeutral());
// a parameter whose every clause went: fall back to its own name in words ("commentId" -> "comment id"), else the key itself
export const paramFallback = (key) => [String(key).replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/_/g, ' ').toLowerCase(), String(key)];
