// mcp/motion-styles.mjs (byte-twin of cli/mcp/motion-styles.mjs; server.js imports this copy) — THE PRODUCT-SIZZLE LOOKS (2026-10-26, parity with the gold-standard studio's motion looks).
//
// The gold-standard studio's Marketing Studio ▸ Video ▸ Motion offers eight product-motion looks (read live 2026-10-26): 2D product
// motion, Hypermotion, Typography, Dark Minimalism, Color pop, Mixed media, SaaS, Product Showcase. Our product sizzle
// (the 'hypermotion' job: one paid hero clip diced on its beats, intercut with typeset cards, over a music bed) already
// IS their Hypermotion; this file adds the other seven as a `style` on the same lane, in our own words. One paid leg,
// one price, whichever look is picked: a style changes the words sent to the model, never the model, length or tier.
//
// PURE: no I/O. tools/motion-styles-check.mjs runs it. Every surface (the job, the Studio tool, both MCP twins, the
// mini app) reads MOTION_STYLE_IDS from here, so a new look is one entry, never a second hand-written list.
//
// WORDS IN THE PICTURE: a video model garbles lettering, so no look asks it to write words. "Typography" is big
// abstract letterforms and type shapes in the brand colours, never a readable word; the real words ride on the typeset
// cards, which we render ourselves.

export const MOTION_STYLES = Object.freeze({
  hypermotion: {
    label: 'Hypermotion',
    short: 'Fast cuts, crash zooms and speed ramps',
    anchor: 'STYLE ANCHOR: high-energy hypermotion product film — fast rhythmic camera cuts, raw premium sizzle energy, modern and punchy.',
    cinema: 'CINEMATOGRAPHY: cinematic anamorphic lens, deep focus, slight handheld energy, dramatic rim lighting with subtle lens flare, rich color grade.',
    beats: '0-3s crash-zoom from a wide shot to a tight product hero; 3-6s fast lateral orbit around the product; 6-9s slow-motion physics beat (mist, dust or light streaks moving through the air, never on the product surface); 9-12s dynamic pull-back to a wide hero; 12-15s final stillness hero shot',
    allow: '', // the original lane: nothing but the product and atmosphere
  },
  product_2d: {
    label: '2D product motion',
    short: 'The real product with playful hand-drawn 2D animation around it',
    anchor: 'STYLE ANCHOR: mixed 2D/3D product motion — the REAL product, photographed and lit for real, with flat hand-drawn 2D cartoon animation interacting with it: doodled characters, outlined shapes, squiggles and motion lines that hug, pop around and play with the product. Bright, friendly, playful.',
    cinema: 'CINEMATOGRAPHY: clean studio set in one bold flat colour, soft even light, locked or gently drifting camera so the 2D animation reads; crisp outlines, flat fills, smooth 12fps-feeling hand-drawn motion on the 2D layer only.',
    beats: '0-3s the product drops into frame and a hand-drawn character pops out beside it; 3-6s the 2D doodles wrap around and orbit the product; 6-9s a playful interaction (the character taps, lifts or points at the product); 9-12s the doodles burst outward in a confetti of flat shapes; 12-15s settle on a clean product hero with a few doodles framing it',
    allow: 'flat hand-drawn 2D doodles and cartoon characters may move around and beside the product (never covering the label, never redrawing the product itself)',
  },
  typography: {
    label: 'Typography',
    short: 'Product framed by huge bold letterforms in the brand colours',
    anchor: 'STYLE ANCHOR: typographic product film — the product stands in front of giant bold abstract letterforms and type shapes that slide, stack, scale and rotate in the brand colours, graphic-design-poster energy. The letterforms are shapes, NOT words: never write a readable word, name or slogan anywhere in the picture.',
    cinema: 'CINEMATOGRAPHY: flat graphic background planes, hard shadows, punchy saturated two-colour palette, smooth confident camera moves, the product lit crisply and sharply in front of the moving type shapes.',
    beats: '0-3s giant letterforms slam in and the product rises in front of them; 3-6s the type shapes slide past in layers while the camera tracks the product; 6-9s a tight macro on the product as a letterform wipes across the frame; 9-12s the shapes stack and rotate around the product; 12-15s settle on a clean centred product hero against a calm block of colour',
    allow: 'big abstract letterform SHAPES in the brand colours may move behind and around the product (shapes only, no readable words)',
  },
  dark_minimal: {
    label: 'Dark minimalism',
    short: 'Moody, premium, a single hard light on black',
    anchor: 'STYLE ANCHOR: dark minimalist luxury product film — the product alone on a deep black or charcoal set, one precise hard light carving its shape, restrained and premium. Nothing else in frame.',
    cinema: 'CINEMATOGRAPHY: slow, deliberate, perfectly smooth camera moves; low-key lighting with a single key and a thin rim, deep shadows, subtle haze, glossy reflections on a dark surface, muted elegant grade.',
    beats: '0-3s the product emerges from darkness as a slow light sweep reveals its silhouette; 3-6s a slow orbit with the rim light tracing the edge; 6-9s an extreme macro of the material and finish; 9-12s a gentle push-in through soft haze; 12-15s settle on a still, perfectly lit product hero on black',
    allow: '',
  },
  color_pop: {
    label: 'Color pop',
    short: 'Bright saturated colour, glossy, joyful',
    anchor: 'STYLE ANCHOR: colour-pop product film — the product on a vivid saturated background in a bold complementary colour, iridescent and holographic accents, glossy candy-bright energy, joyful and eye-catching.',
    cinema: 'CINEMATOGRAPHY: bright high-key studio light, crisp specular highlights, bouncy snappy camera moves, playful product bounces and spins, saturated pop grade with clean edges.',
    beats: '0-3s the product bounces into frame on a burst of colour; 3-6s a quick spin as the background flips between two bold colours; 6-9s an iridescent light sweep across the product in macro; 9-12s a playful bounce and tilt toward camera; 12-15s settle on a glossy centred product hero on a solid vivid colour',
    allow: 'vivid colour fields and iridescent light accents may surround the product',
  },
  mixed_media: {
    label: 'Mixed media',
    short: 'Editorial collage: paper, cut-outs and texture around the product',
    anchor: 'STYLE ANCHOR: mixed-media editorial collage — the real product combined with paper textures, torn edges, cut-out shapes, halftone dots, tape and print grain, magazine-collage art direction, layered and handmade.',
    cinema: 'CINEMATOGRAPHY: flat-lay and frontal framings, collage layers that slide and stop-motion step into place, warm print grade with visible paper grain, soft natural light on the product.',
    beats: '0-3s collage layers snap into place around the product one by one; 3-6s torn-paper shapes slide across and reveal the product; 6-9s a halftone macro of the product finish; 9-12s cut-out shapes rearrange in stop-motion steps around it; 12-15s settle on a balanced collage composition with the product as the hero',
    allow: 'paper textures, torn edges, cut-out shapes, halftone dots and tape may be layered around the product (never covering the label)',
  },
  saas: {
    label: 'SaaS',
    short: 'For apps and software: floating screens, light trails, particles',
    anchor: 'STYLE ANCHOR: premium tech launch film for an app or software product — the real product screens (from the provided picture) float as glowing panels in a dark 3D space, connected by light trails, particle fields and soft gradient glows, sleek and futuristic. Show the real interface; never invent a different app screen.',
    cinema: 'CINEMATOGRAPHY: smooth gliding camera through 3D space, shallow depth of field, cool gradient lighting with soft bloom, particles drifting, crisp glass and glow edges on the panels.',
    beats: '0-3s a burst of particles resolves into the product screen; 3-6s the camera glides past floating panels linked by light trails; 6-9s a close look at the key screen with a soft light sweep; 9-12s the panels assemble into a neat stack as the particles swirl; 12-15s settle on the main screen centred and glowing',
    allow: "the product's real interface screens may float as glowing panels with light trails and particles (the screens are the product; keep their content as provided, never invent other screens)",
  },
  product_showcase: {
    label: 'Product showcase',
    short: 'Hero commercial: ingredients, splashes and a clean pack shot',
    anchor: 'STYLE ANCHOR: hero product commercial — the product surrounded by what it is made of or what it does (ingredients, fruit, water, ice, fabric, tools), splashes and slow-motion elements flying around it, glossy advertising polish.',
    cinema: 'CINEMATOGRAPHY: high-speed macro and slow motion, bright clean key light with strong rim highlights, rich saturated grade, precise motion-control camera moves.',
    beats: '0-3s the product appears as its ingredients or elements fly in around it; 3-6s a slow-motion splash or burst behind the product; 6-9s an extreme macro of a detail on the product; 9-12s a sweeping motion-control arc around the product and its elements; 12-15s settle on a clean pack shot with a few elements frozen mid-air',
    allow: "the product's own ingredients or elements (fruit, water, ice, fabric, tools that fit what it is) may fly and splash around it, never covering the label",
  },
});

export const MOTION_STYLE_IDS = Object.freeze(Object.keys(MOTION_STYLES));
export const DEFAULT_MOTION_STYLE = 'hypermotion';

// Accepts an id or a label in any case ("Dark Minimalism", "dark-minimal", "color pop"); anything else → the default.
export function resolveMotionStyle(v) {
  const s = String(v ?? '').trim().toLowerCase();
  if (!s) return DEFAULT_MOTION_STYLE;
  const key = s.replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  if (MOTION_STYLES[key]) return key;
  for (const [id, st] of Object.entries(MOTION_STYLES)) {
    const lab = st.label.toLowerCase().replace(/[^a-z0-9]+/g, '_');
    if (lab === key || lab.replace(/_/g, '') === key.replace(/_/g, '')) return id;
  }
  const alias = { dark_minimalism: 'dark_minimal', minimal: 'dark_minimal', colour_pop: 'color_pop', pop: 'color_pop', collage: 'mixed_media', '2d': 'product_2d', cartoon: 'product_2d', showcase: 'product_showcase', software: 'saas', app: 'saas', type: 'typography', kinetic: 'hypermotion', sizzle: 'hypermotion' }[key];
  return alias || DEFAULT_MOTION_STYLE;
}

// One line per look, for tool descriptions and menus: "hypermotion (Fast cuts…), product_2d (…)…".
export const motionStyleMenu = () => MOTION_STYLE_IDS.map((id) => `${id} (${MOTION_STYLES[id].short})`).join(', ');
