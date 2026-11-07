// A KEYWORD AD SEARCH IS ACROSS ALL ADVERTISERS (2026-11-07). Pure, so tools/ad-spy-keyword-check.mjs runs the real code.
// Twin file: cli/mcp/ad-spy-keyword.mjs (byte-identical).
const flatQ = (t) => String(t || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// Is this ad's advertiser PAGE the searched name ("Liquid Death Mountain Water" yes, "Garage Beer" no)?
export function pageIsQuery(pageName, query) {
  const q = flatQ(query), n = flatQ(pageName);
  if (!q || !n) return false;
  return ` ${n} `.includes(` ${q} `) || n.replace(/ /g, '').includes(q.replace(/ /g, ''));
}

// Brand's own pages first (stable), other advertisers after and flagged; nothing is dropped.
export function orderKeywordAds(raw, query) {
  const rows = Array.isArray(raw) ? raw : [];
  if (!flatQ(query)) return { ordered: rows, otherCount: 0 };
  const mine = [], other = [];
  for (const x of rows) (pageIsQuery(x && x.page_name, query) ? mine : other).push(x);
  return { ordered: [...mine, ...other.map((x) => ({ ...x, __other: true }))], otherCount: other.length };
}

// Which pictures ride along, each captioned with the ROW it belongs to (a bare picture list drifts from the rows).
export function pictureRows(items, max = 3) {
  const out = [];
  (Array.isArray(items) ? items : []).forEach((x, i) => {
    const u = x && (x.thumb || x.image || x.cover || x.media);
    if (typeof u === 'string' && /^https?:\/\//.test(u) && !/\.(mp4|webm|mov)([?#]|$)/i.test(u) && out.length < max) out.push({ i, url: u, caption: `Picture below = ad ${i + 1} in the list${(x.page_name || x.advertiser || x.author) ? ` (advertiser: ${x.page_name || x.advertiser || x.author})` : ''}` });
  });
  return out;
}
