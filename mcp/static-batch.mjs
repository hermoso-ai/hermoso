// STATIC ADS AT SCALE (2026-10-06) — the pure half of `make_static_ads`.
//
// A competing ads studio shipped on 2026-09-30: a brand kit from a website, the products imported from the site, pick
// one or several products and a count (up to 20 per product), and get back a batch of FINISHED static ads, each a
// different selling angle with its headline and CTA on the image, in 1:1, 4:5 or 9:16. We had every part of that
// (draft_brand, the product library, the batch planner the web Studio fans into up to 30 ranked statics) but an agent
// had to stitch it together itself: plan_variations (capped at 8, plans only), then one generate_image per variant —
// and a CLI generate_image held past 60s died client-side while the render still billed. This is the one-call shape.
//
// Everything here is PURE so tools/static-ads-batch-check.mjs runs the real functions. Byte-twin: cli/mcp/static-batch.mjs.

export const STATIC_BATCH = Object.freeze({
  COUNT_MAX: 20,          // ads per product, the ceiling the market offers
  COUNT_DEFAULT: 4,
  PRODUCTS_MAX: 10,       // products in one call
  RATIOS: Object.freeze(['1:1', '4:5', '9:16']),
  RATIO_DEFAULT: '4:5',
  // The server bounds queued+running renders per account (JOB_QUEUE_MAX, 16). One call never queues more than this;
  // the rest of the plan comes back as `remaining`, to be sent again as `plan` once some have finished.
  QUEUE_PER_CALL: 12,
});

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
const STOP = /^(the|and|for|with|of|by|a|an|in|on)$/;
const tokens = (s) => norm(s).split(' ').filter((w) => w.length > 1 && !STOP.test(w));

// The brand's catalog as rows {title, image}. A saved brand holds products in several historical shapes, and none of
// them is authoritative alone: productTitles [{image,title}] (a drafted site's own product names), products (strings
// or {title,image}), productNames (the hero names the drafter picked), productImages + product (photos, the hero
// first). A row with no image is still a row: the planner can write for it; the render then grounds on the hero.
export function catalogOf(brand) {
  const b = brand && typeof brand === 'object' ? brand : {};
  const rows = [];
  const seen = new Set();
  const add = (title, image) => {
    const t = String(title || '').trim();
    const img = typeof image === 'string' && /^https?:\/\//i.test(image) ? image : '';
    if (!t && !img) return;
    const k = norm(t) || img;
    if (seen.has(k)) { const r = rows.find((x) => (norm(x.title) || x.image) === k); if (r && !r.image && img) r.image = img; return; }
    seen.add(k);
    rows.push({ title: t, image: img });
  };
  for (const p of Array.isArray(b.productTitles) ? b.productTitles : []) if (p && typeof p === 'object') add(p.title, p.image);
  for (const p of Array.isArray(b.products) ? b.products : []) {
    if (typeof p === 'string') add(p, '');
    else if (p && typeof p === 'object') add(p.title || p.name, p.image || (Array.isArray(p.images) ? p.images[0] : ''));
  }
  for (const n of Array.isArray(b.productNames) ? b.productNames : []) add(n, '');
  return rows;
}

// The brand's default product photo (what every render grounds on when nothing names another product).
export function heroImageOf(brand) {
  const b = brand && typeof brand === 'object' ? brand : {};
  return (typeof b.product === 'string' && b.product) || (Array.isArray(b.productImages) ? b.productImages.find(Boolean) : '') || '';
}

// Match a product the caller NAMED against the catalog. Exact normalized title first; otherwise coverage of the asked
// words minus a penalty per extra word in the title (an extra word is usually a different item: "Wool Runner" must not
// land on "Wool Runner Mizzles" when a plain "Wool Runner" exists). Below two matched words (or all of a one-word ask)
// it is no match — a wrong product photo on a finished ad is worse than none.
export function matchCatalogProduct(catalog, name) {
  const q = tokens(name);
  if (!q.length || !Array.isArray(catalog) || !catalog.length) return null;
  const qn = norm(name);
  let best = null, bestScore = 0;
  for (const row of catalog) {
    const t = norm(row.title);
    if (!t) continue;
    let score;
    if (t === qn) score = 1000;
    else {
      const tt = tokens(row.title);
      const matched = q.filter((w) => tt.includes(w)).length;
      if (matched < Math.min(2, q.length)) continue;
      const extras = tt.filter((w) => !q.includes(w)).length;
      score = matched * 10 - extras * 2 + (t.startsWith(qn) ? 3 : 0) + (row.image ? 1 : 0);
    }
    if (score > bestScore) { bestScore = score; best = row; }
  }
  return best;
}

// Which products a call is for. Named products resolve against the catalog (an unmatched name is still advertised,
// by its own words, with no product photo of its own); `all` takes the catalog rows that have a photo; nothing named
// means the brand's hero.
export function resolveProducts(brand, products) {
  const catalog = catalogOf(brand);
  const asked = Array.isArray(products) ? products.map((p) => String(p || '').trim()).filter(Boolean) : [];
  if (asked.length === 1 && /^(all|every|everything|all products)$/i.test(asked[0])) {
    const withPhoto = catalog.filter((r) => r.image);
    return (withPhoto.length ? withPhoto : catalog).slice(0, STATIC_BATCH.PRODUCTS_MAX).map((r) => ({ name: r.title || 'the product', image: r.image, matched: true }));
  }
  if (!asked.length) {
    const b = brand && typeof brand === 'object' ? brand : {};
    const name = (Array.isArray(b.productNames) && b.productNames[0]) || b.sells || b.name || '';
    return name ? [{ name: String(name), image: '', matched: false, hero: true }] : [];
  }
  return asked.slice(0, STATIC_BATCH.PRODUCTS_MAX).map((n) => {
    const hit = matchCatalogProduct(catalog, n);
    return hit ? { name: hit.title || n, asked: n, image: hit.image, matched: true } : { name: n, image: '', matched: false };
  });
}

export function normalizeRatios(list) {
  const want = (Array.isArray(list) ? list : [list]).map((r) => String(r || '').trim()).filter(Boolean);
  const out = [...new Set(want.filter((r) => STATIC_BATCH.RATIOS.includes(r)))];
  return out.length ? out : [STATIC_BATCH.RATIO_DEFAULT];
}

export function clampCount(n) {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v)) return STATIC_BATCH.COUNT_DEFAULT;
  return Math.max(1, Math.min(STATIC_BATCH.COUNT_MAX, v));
}

// The brief the planner sees for one product: the product, the caller's steer, and the angles they asked for.
export function plannerBrief(product, { brief = '', angles = [] } = {}) {
  const a = (Array.isArray(angles) ? angles : []).map((x) => String(x || '').trim()).filter(Boolean).slice(0, 12);
  return [
    String(product || '').trim(),
    brief ? `What to lean into: ${String(brief).trim().slice(0, 600)}` : '',
    a.length ? `Spread the variants across these angles (one angle per variant, in this order, repeating if there are more variants than angles): ${a.join('; ')}.` : '',
  ].filter(Boolean).join('\n');
}

// One render's prompt: the planner's visual brief, then the exact words, then (with no logo on file) the no-logo rule. The words are QUOTED so
// the model prints them as given; a static whose headline is misspelled is not finished.
export function staticAdPrompt(v, { logo = 'server', productPhoto = false } = {}) {
  const x = v && typeof v === 'object' ? v : {};
  const lines = [String(x.prompt || x.visual || '').trim()];
  const words = [
    x.headline ? `headline "${String(x.headline).trim()}"` : '',
    x.supporting ? `supporting line "${String(x.supporting).trim()}"` : '',
    x.cta ? `call to action "${String(x.cta).trim()}"` : '',
  ].filter(Boolean);
  if (words.length) lines.push(`On-image text, spelled exactly as given and nothing else: ${words.join(', ')}. Bold ad typography with a clear hierarchy, crisp and correctly spelled. A finished, ready-to-run static ad.`);
  if (productPhoto) lines.push('The first reference image is the REAL product: keep its shape, colours and label exactly.');
  // THE LOGO IS LAID ON, NEVER PAINTED (2026-10-06): 'overlay' (and the old 'attached' / 'server') add nothing here. The
  // render goes with brandLogo:true, and the image route tells the model to keep a corner clear and lays the brand's real
  // logo file over the finished ad (lib/logo-intent.mjs). The model is never handed the logo to re-draw.
  if (!['overlay', 'attached', 'server'].includes(logo)) lines.push('Do not draw or invent any logo or wordmark.');
  return lines.filter(Boolean).join('\n\n');
}

// The render list for a plan: every variant once per ratio, in plan order, each carrying what it renders.
export function renderList(plan, ratios) {
  const out = [];
  for (const p of Array.isArray(plan) ? plan : []) {
    for (const v of Array.isArray(p?.variants) ? p.variants : []) {
      for (const r of normalizeRatios(ratios)) out.push({ product: p.product, image: p.image || '', variant: v, aspectRatio: r });
    }
  }
  return out;
}

// Split a render list at what one call may queue; the rest goes back to the caller as a plan of its own.
export function splitForQueue(list, cap = STATIC_BATCH.QUEUE_PER_CALL) {
  const n = Math.max(0, Math.floor(Number(cap) || 0));
  return { now: list.slice(0, n), later: list.slice(n) };
}

// Rebuild a plan (products → variants) from leftover render items, so `remaining` can be passed straight back as `plan`
// with the same `aspectRatios`. A variant appears once even when several of its ratios were left over.
export function planFromItems(items) {
  const byProduct = new Map();
  for (const it of Array.isArray(items) ? items : []) {
    const key = `${it.product}\u0000${it.image || ''}`;
    if (!byProduct.has(key)) byProduct.set(key, { product: it.product, image: it.image || '', variants: [] });
    const p = byProduct.get(key);
    if (!p.variants.includes(it.variant)) p.variants.push(it.variant);
  }
  return [...byProduct.values()];
}

// Credits for one image on the model that will run, read off GET /api/generate/status. null = could not tell, which is
// said as such and never rendered as a number. NOT the `best` row: every ad here carries the product photo and/or the
// logo, and a referenced render with no model named composites on the catalog's FIRST row (Nano Banana Pro). Measured
// 2026-10-06: `best` was GPT Image 2.5 at 7 credits, the quote said 7, and each job settled at 20 (17 for the render +
// the label check) on Nano Banana Pro.
export function perAdCredits(status, model = '') {
  const rows = status?.options?.image?.models;
  if (!Array.isArray(rows) || !rows.length) return null;
  const row = (model && rows.find((m) => m && m.id === model)) || rows[0];
  if (!row) return null;
  const bySize = row.creditsBySize && (row.creditsBySize['2K'] ?? row.creditsBySize['1K']);
  const c = Number(bySize ?? row.credits);
  return Number.isFinite(c) && c > 0 ? c : null;
}
