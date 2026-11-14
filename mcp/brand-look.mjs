// ── THE BRAND'S FONTS AND COLOURS, EDITABLE EVERYWHERE (2026-11-13) ─────────────────────────────────────────────
//
// A paying customer wrote in: his profile still held the fonts and palette the site scrape guessed at onboarding,
// and nothing let him change them. The Profile showed only the free-text "Visual style", and update_brand had no
// fonts or palette field. These are the two parsers every door now goes through: the MCP twins (so the CLI and
// /v1/tools), the Studio agent's update_brand, the web Profile (its own inline copy, pinned to these fixtures by
// tools/brand-look-check.mjs) and the admin brand-field route.
//
// It lives in mcp/ rather than lib/ for the reason roster-scope.mjs does: the npm package ships `cli/mcp/**` and
// nothing else, so `./brand-look.mjs` is the one path that resolves from BOTH tools.mjs twins. cli/mcp/brand-look.mjs
// is its byte twin (tools/mcp-parity.mjs sweeps every shared file).
//
// THE STORED SHAPES DO NOT CHANGE. `fonts` stays what the onboarding draft writes: an ORDERED array of family names,
// headline face first, body face second (templates/font-map.mjs reads it positionally). `palette` stays an array of
// hex strings. Both doors are accepted for fonts: the array as stored, or {headline, body}, which is merged onto the
// fonts already saved so changing one role leaves the other alone.
//
// NOTHING THE USER WROTE IS SILENTLY CHANGED. A value is trimmed and otherwise kept exactly as typed (case included);
// anything we cannot use is REFUSED with a sentence that names it, and nothing is saved. A short hex (#abc) or one
// without its # is refused rather than expanded, because every renderer reads the six-digit form only.

export const PALETTE_MAX = 8;
export const FONTS_MAX = 4;
export const FONT_NAME_MAX = 60;
export const HEX_RE = /^#[0-9a-fA-F]{6}$/;

const s = (v) => (typeof v === 'string' ? v : v == null ? '' : String(v));
const show = (v) => JSON.stringify(s(v).slice(0, 40));

/** One colour → '' when usable, else the sentence saying why not. Pure. */
export function hexRefusal(v) {
  if (typeof v !== 'string') return `Each colour must be written as text like "#3D4C41".`;
  const t = v.trim();
  if (!t) return 'A colour is empty. Remove it or write it like "#3D4C41".';
  if (HEX_RE.test(t)) return '';
  if (/^[0-9a-fA-F]{6}$/.test(t)) return `${show(t)} needs a # in front: "#${t}".`;
  if (/^#?[0-9a-fA-F]{3}$/.test(t)) return `${show(t)} is a short colour code. Write all six digits, like "#AABBCC".`;
  return `${show(t)} is not a colour code. Write it as # and six digits or letters A–F, like "#3D4C41".`;
}

/**
 * The palette a caller asked for → { value } (the array to store) or { error }. An empty array clears it. Pure.
 */
export function parseBrandPalette(input) {
  if (input == null) return { error: 'palette must be a list of colour codes, like ["#3D4C41", "#EEE4DA"].' };
  const list = typeof input === 'string' ? input.split(/[\s,]+/).filter(Boolean) : input;
  if (!Array.isArray(list)) return { error: 'palette must be a list of colour codes, like ["#3D4C41", "#EEE4DA"].' };
  if (list.length > PALETTE_MAX) return { error: `A palette holds up to ${PALETTE_MAX} colours; this one has ${list.length}.` };
  const out = [], seen = new Set();
  for (const c of list) {
    const why = hexRefusal(c);
    if (why) return { error: why };
    const t = c.trim();
    if (seen.has(t.toLowerCase())) return { error: `${t} is in the palette twice.` };
    seen.add(t.toLowerCase()); out.push(t);
  }
  return { value: out };
}

/** One font name → '' when usable, else the sentence saying why not. Any family name is accepted. Pure. */
export function fontNameRefusal(v) {
  if (typeof v !== 'string') return 'Each font must be a family name written as text, like "Josefin Sans".';
  const t = v.trim();
  if (!t) return 'A font name is empty.';
  if (t.length > FONT_NAME_MAX) return `${show(t)}… is longer than ${FONT_NAME_MAX} characters; write just the family name.`;
  // Characters that would end a CSS family name or a prompt line. Letters in any alphabet, digits, spaces, hyphens,
  // dots, ampersands and apostrophe-free punctuation stay; nothing is stripped, the name is refused instead.
  if (/[\u0000-\u001f"'`<>{};\\]/.test(t)) return `${show(t)} contains a character a font name cannot have (quotes, < > { } ; or \\).`;
  return '';
}

/**
 * The fonts a caller asked for → { value } (the ordered array to store) or { error }.
 * `input` is an array (headline first, body second, as stored) or { headline, body } merged onto `existing`;
 * an empty string in the object form removes that role. An empty array clears the fonts. Pure.
 */
export function parseBrandFonts(input, existing = []) {
  const cur = (Array.isArray(existing) ? existing : []).filter((x) => typeof x === 'string' && x.trim());
  if (Array.isArray(input)) {
    if (input.length > FONTS_MAX) return { error: `Up to ${FONTS_MAX} fonts; the first is used for headlines and the second for body text.` };
    const out = [];
    for (const f of input) { const why = fontNameRefusal(f); if (why) return { error: why }; const t = f.trim(); if (out.some((o) => o.toLowerCase() === t.toLowerCase())) return { error: `${t} is listed twice.` }; out.push(t); }
    return { value: out };
  }
  if (input && typeof input === 'object') {
    const keys = Object.keys(input).filter((k) => input[k] !== undefined);
    const bad = keys.filter((k) => k !== 'headline' && k !== 'body');
    if (bad.length) return { error: `fonts takes headline and body (or a list); ${bad.map((k) => JSON.stringify(k)).join(', ')} is not one of them.` };
    if (!keys.length) return { error: 'fonts needs a headline or a body font (or a list).' };
    let head = cur[0] || '', body = cur[1] || '';
    const rest = cur.slice(2);
    for (const role of ['headline', 'body']) {
      if (input[role] === undefined) continue;
      const v = input[role] == null ? '' : input[role];
      if (typeof v === 'string' && !v.trim()) { if (role === 'headline') head = ''; else body = ''; continue; }
      const why = fontNameRefusal(v); if (why) return { error: why };
      if (role === 'headline') head = v.trim(); else body = v.trim();
    }
    // A body font with no headline font keeps its place as the one face; the order is what renderers read.
    const out = [head, body, ...rest].filter(Boolean);
    const dedup = []; for (const f of out) if (!dedup.some((d) => d.toLowerCase() === f.toLowerCase())) dedup.push(f);
    return { value: dedup };
  }
  if (typeof input === 'string') return { error: 'fonts takes a list (headline first, then body) or {headline, body}, not a single string.' };
  return { error: 'fonts takes a list (headline first, then body) or {headline, body}.' };
}

/** The roles an ordered font list carries: the first is the headline face, the second the body face. Pure. */
export function brandFontRoles(fonts) {
  const f = (Array.isArray(fonts) ? fonts : []).filter((x) => typeof x === 'string' && x.trim()).map((x) => x.trim());
  return { headline: f[0] || '', body: f[1] || f[0] || '', extra: f.slice(2) };
}

/** "Benne (headlines), Josefin Sans (body)" — how a reply, get_brand and the planner name the fonts. Pure. */
export function describeBrandFonts(fonts) {
  const f = (Array.isArray(fonts) ? fonts : []).filter((x) => typeof x === 'string' && x.trim()).map((x) => x.trim());
  if (!f.length) return '';
  if (f.length === 1) return `${f[0]} (headlines and body)`;
  return [`${f[0]} (headlines)`, `${f[1]} (body)`, ...f.slice(2)].join(', ');
}
