// ── THE UTF-16 WELL-FORMEDNESS LAW — one rule, every crossing (2026-08-26) ──────────────────────────────────────
//
// A JS string is a sequence of UTF-16 CODE UNITS, and nothing stops one from holding an UNPAIRED SURROGATE:
// `'😀'.slice(0, 1)` is a lone `\uD83D`. `JSON.stringify` faithfully emits it as the escape `\ud83d`, which is
// well-formed by the JSON grammar and REFUSED by three different consumers on three different wires:
//
//   Postgres `jsonb`   '{"t":"hi \ud83d"}'   → 22P02 invalid input syntax for type json
//                                              DETAIL: Unicode low surrogate must follow a high surrogate.
//   The Anthropic API  a tool_result block   → 400 invalid_request_error,
//                                              "The request body is not valid JSON: no low surrogate in string"
//   A customer's own   the JSON-RPC frame    → the same 400, in THEIR turn, on THEIR key, with no recourse on
//   MCP client                                 their side and no visibility on ours.
//
//   the well-formed PAIR, in all three       → ACCEPTED   ← THE CONTROL, and the reason this file has the shape
//                                                            it has: the repair must be surgical, never a strip.
//
// Every row above is MEASURED, not reasoned: the Postgres rows against a real Postgres 16 through the real `pg`
// driver (adapters/jsonb-safe.js, 2026-08-23), the Anthropic rows against the real API with a real tool_result
// block (server.js `wellFormedParams`, 2026-08-25), the MCP row through a real MCP round trip (mcp/tools.mjs,
// 2026-08-26).
//
// WHY IT IS ONE FILE AND NOT THREE COPIES. The character rule used to live in `adapters/jsonb-safe.js` and be
// named for the crossing it was written for. It is not about jsonb; it is about UTF-16, and the moment a second
// and third consumer needed it, "copy the regex" became the drift risk that `jsonb-safe.js` existed to prevent.
// So the law lives here and NOTHING re-decides it:
//
//   adapters/jsonb-safe.js  imports it   → the STORE crossing  (JS string → `$n::jsonb` parameter)
//   server.js               imports it   → the ANTHROPIC crossing (JS string → request body)
//   mcp/well-formed.mjs     re-exports   → the MCP RETURN crossing (JS string → JSON-RPC frame)
//
// ONE COPY EXISTS, AND ONLY BECAUSE NPM PACKAGING FORCES IT. `cli/mcp/well-formed.mjs` is a BYTE-IDENTICAL copy of
// this file: the CLI ships as a standalone npm package rooted at `cli/`, so it cannot reach `lib/` at all. That
// copy is not maintained by hand and must never be edited — `tools/well-formed-law-check.mjs` byte-compares it
// against this file on every suite pass and `--fix` rewrites it from here. Editing one and not the other is the
// exact mistake that check exists to catch.
//
// IT IS A REPAIR, NOT A TRY/CATCH. An unpaired surrogate becomes U+FFFD (the substitution the Unicode standard
// prescribes for exactly this) and NULs are dropped. Swallowing the error instead would lose the transcript, the
// turn or the tool result and leave the user with a deterministic failure dressed as a transient one.

// A lone surrogate: a high with no low after it, or a low with no high before it. A WELL-FORMED PAIR MATCHES
// NEITHER ALTERNATIVE, which is what makes this safe to run over ordinary emoji-bearing text.
export const LONE_SURROGATE_RE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

// The cheap gate for JSON *TEXT* (the store crossing tests the stringified value, not the live object). One scan,
// no allocation, and FALSE for the overwhelming majority of writes — including every write carrying well-formed
// emoji, which is why the detector tests for a LONE surrogate rather than for any surrogate at all. Deliberately
// OVER-inclusive on the escape alternatives (`\\u…` is matched without checking the parity of the backslash run,
// so a literal `\ud83d` the user typed also trips it): a false positive costs one parse+stringify of a value that
// is repaired to itself, while a false negative costs a 500.
//
// NO `g` FLAG, DELIBERATELY. It is built from `LONE_SURROGATE_RE.source` rather than from the regex object, so it
// carries no flags and `.test()` is stateless. A `/g` regex reused across `.test()` calls advances `lastIndex` and
// answers FALSE on every other call, which on this path would be a silent skipped repair.
export const NEEDS_REPAIR_RE = new RegExp(
  LONE_SURROGATE_RE.source            // a raw lone surrogate code unit
  + '|\\u0000'                        // a raw NUL
  + '|\\\\u0000'                      // the escape for one
  // A surrogate-range \uXXXX escape, paired or not — the repair decides. THE RANGE IS D800–DFFF, i.e. the second
  // hex digit is 8–F and NOT just 8–B: the first draft of this line covered only the HIGH half (D800–DBFF), so a
  // lone LOW surrogate escape — `\ude00`, the exact other half of the emoji in the incident — sailed straight
  // through the detector and was returned unrepaired. Caught by a check before it shipped.
  + '|\\\\u[dD][89a-fA-F][0-9a-fA-F]{2}'
);

/** Does this JSON TEXT contain something a strict consumer will refuse? Pure; the checks run it. */
export function needsWellFormedRepair(text) {
  return NEEDS_REPAIR_RE.test(String(text ?? ''));
}

/**
 * One string, made acceptable everywhere: unpaired surrogates → U+FFFD, NULs dropped. Idempotent, and it returns
 * the SAME REFERENCE when there was nothing to repair — which is what lets the deep walk below leave an unchanged
 * object alone rather than rebuilding it.
 */
export function wellFormedString(s) {
  let out = String(s ?? '');
  if (out.indexOf('\u0000') !== -1) out = out.split('\u0000').join('');
  // A deliberate hand-rolled replace rather than `String.prototype.toWellFormed()`: one code path on every Node,
  // and one a check can RUN. An untested version-guarded fallback is a branch nobody has ever executed.
  return out.replace(LONE_SURROGATE_RE, '\uFFFD');
}

/**
 * A whole value, made acceptable everywhere — strings, array elements, object values AND OBJECT KEYS.
 *
 * NON-MUTATING, and that is load-bearing rather than tidy. Both live callers hand it something they do not own:
 * the Anthropic crossing is given the caller's `messages` array (the muse loop reuses it across rounds and edits
 * `cache_control` off those very objects), and the MCP crossing is given a tool result that may reference the
 * shared, process-wide tool canon. Mutating either would be a cross-request side effect.
 *
 * It returns the SAME REFERENCE when nothing needed repair, so the ordinary case allocates nothing at all and a
 * caller may compare by identity to learn whether anything was touched.
 */
export function wellFormedValue(v) {
  if (typeof v === 'string') return wellFormedString(v);
  if (Array.isArray(v)) {
    let copy = null;
    for (let i = 0; i < v.length; i++) {
      const nv = wellFormedValue(v[i]);
      if (nv !== v[i] && !copy) copy = v.slice();
      if (copy) copy[i] = nv;
    }
    return copy || v;
  }
  // Only PLAIN objects are walked. A Date, a Buffer, a URL, a stream — anything with a prototype of its own — is
  // returned untouched: rebuilding it as `{...}` would destroy it, and none of them can carry a lone surrogate in
  // a way `JSON.stringify` will emit except through its own `toJSON`, which is that object's business.
  if (!v || typeof v !== 'object') return v;
  const proto = Object.getPrototypeOf(v);
  if (proto !== Object.prototype && proto !== null) return v;
  let copy = null;
  for (const k of Object.keys(v)) {
    const nv = wellFormedValue(v[k]);
    // Keys are repaired too. A key holding a lone surrogate is vanishingly rare and refused just as hard, and a
    // walk that quietly skipped keys would be a hole nobody could see from the outside.
    const nk = wellFormedString(k);
    if ((nv !== v[k] || nk !== k) && !copy) copy = { ...v };
    if (copy) { if (nk !== k) delete copy[k]; copy[nk] = nv; }
  }
  return copy || v;
}

/**
 * Truncate to at most `n` UTF-16 code units WITHOUT bisecting a surrogate pair — i.e. the fix at the source, for
 * the thing that manufactures lone surrogates in the first place.
 *
 * `.slice(0, n)` counts code units, so it cuts an astral character in half whenever the boundary lands mid-pair.
 * Measured on live vendor text: 14,579 upstream strings held 570 real PAIRS and ZERO lone surrogates — the
 * vendor is not emitting broken text, our own truncation is creating it, at 1 caption length in every 21.
 *
 * THE LENGTH CONTRACT IS PRESERVED: the result is never LONGER than `.slice(0, n)` would be — at worst one code
 * unit shorter, and that one unit was half a character no consumer could render anyway.
 */
export function sliceWellFormed(s, n) {
  const str = String(s ?? '');
  if (!(n > 0)) return '';
  if (n >= str.length) return str;
  const c = str.charCodeAt(n - 1);
  // A trailing HIGH surrogate is the only way a cut at `n` orphans anything: its low half is at `n`, on the far
  // side of the boundary. A trailing LOW surrogate still has its high half at n-2, inside the slice.
  return str.slice(0, (c >= 0xD800 && c <= 0xDBFF) ? n - 1 : n);
}
