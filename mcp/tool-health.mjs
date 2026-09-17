// ── IS THIS TOOL WORKING RIGHT NOW? (2026-09-17) ───────────────────────────────────────────────────────────────
//
// Monid's discover puts a health status and a median run time on every row, and hides an endpoint that is in
// outage. That is worth copying: an agent picking between two tools should not have to discover by spending a
// minute and a credit that one of them has failed its last nine calls.
//
// WHERE THE NUMBERS COME FROM, AND WHY NOT FROM THE ERROR LEDGER ALONE. The error ledger is the right instinct —
// it is our record of what users hit — but it records only FAILURES, with no successes and no durations, so a
// failure RATE and a typical duration cannot be computed from it at all. A ledger read is also an HTTP round trip
// per find_tools call, which is exactly the cost this feature must not add. So health is measured where the calls
// already pass: `wrap()` in mcp/tools.mjs, the one seam every tool handler returns through, and the same seam that
// FEEDS the error ledger via reportToolError. Same signal, in process, free, and it carries the two things the
// ledger cannot: the successes and the clock.
//
// WHAT IT IS AND IS NOT. It is THIS PROCESS's recent experience, which on the hosted server is every caller's
// calls and on stdio is this session's. It is therefore evidence, not a fleet statistic — and the difference is
// stated in the wording find_tools prints. NO RECENT CALLS IS SAID AS SUCH, never rendered as healthy
// ([[failed-read-is-not-empty]]): "we have not seen this tool run lately" and "this tool works" are different
// claims and the second one is the dangerous one to guess.
//
// BOUNDED BY CONSTRUCTION. At most HEALTH_TOOLS_MAX tools are tracked (LRU), at most HEALTH_SAMPLES_MAX outcomes
// each, and anything older than HEALTH_WINDOW_MS is dropped on read. Worst case is a few tens of kilobytes, on a
// process that already holds a 350K-token tool canon. No timer, no I/O, no allocation on the read path beyond the
// window filter — a find_tools call that scans 841 rows must stay cheap.
//
// PURE-ISH AND DEPENDENCY-FREE: one module-level Map and functions over it, so the check RUNS this rather than
// reading it, and so the cli twin (no lib/, no repo) resolves the same specifier as the server copy.

export const HEALTH_WINDOW_MS = 60 * 60 * 1000;   // an hour: long enough to see a pattern, short enough to be "now"
export const HEALTH_SAMPLES_MAX = 20;             // per tool
export const HEALTH_TOOLS_MAX = 400;              // distinct tools tracked, LRU by last write
export const HEALTH_FAILING_RATE = 0.6;           // "nearly all failing" — ranked last, and said out loud
export const HEALTH_DEGRADED_RATE = 0.25;
export const HEALTH_MIN_CALLS = 3;                // below this, one bad call is noise, not a verdict

const _tools = new Map(); // name -> [{ at, ok, ms }]  (insertion-ordered ⇒ LRU)

/** Record one finished tool call. Never throws — a health write may not break a tool's own answer. */
export function recordToolOutcome(name, opts) {
  try {
    // DESTRUCTURED INSIDE THE try, NOT IN THE PARAMETER LIST. A default only fires on `undefined`, so
    // `recordToolOutcome(name, null)` threw a TypeError BEFORE the try could catch it — and this function is
    // called from inside `wrap()`, where a throw would replace a tool's real answer with a health-bookkeeping
    // error. Measured: the check's "a bad write never throws" assertion went red on exactly that call.
    const { ok, ms = 0, now = Date.now() } = opts || {};
    const n = String(name || '');
    if (!n) return;
    let arr = _tools.get(n);
    if (arr) _tools.delete(n); else arr = [];       // re-insert ⇒ this tool is the most recently used
    arr.push({ at: now, ok: !!ok, ms: Number(ms) || 0 });
    if (arr.length > HEALTH_SAMPLES_MAX) arr.splice(0, arr.length - HEALTH_SAMPLES_MAX);
    _tools.set(n, arr);
    while (_tools.size > HEALTH_TOOLS_MAX) _tools.delete(_tools.keys().next().value);
  } catch { /* health is never load-bearing */ }
}

/** Test seam only — the checks need a clean slate between sections. */
export function _resetToolHealth() { _tools.clear(); }
export function _healthSize() { return _tools.size; }

/**
 * The verdict for one tool. Shapes:
 *   { state: 'unseen' }                                    — nothing recent; SAY SO, never "healthy"
 *   { state: 'healthy'|'degraded'|'failing', calls, failures, failRate, medianMs }
 */
export function toolHealth(name, now = Date.now()) {
  const arr = (_tools.get(String(name || '')) || []).filter((s) => now - s.at <= HEALTH_WINDOW_MS);
  if (!arr.length) return { state: 'unseen', calls: 0 };
  const calls = arr.length;
  const failures = arr.filter((s) => !s.ok).length;
  const failRate = failures / calls;
  const times = arr.map((s) => s.ms).filter((m) => m > 0).sort((a, b) => a - b);
  const medianMs = times.length ? times[Math.floor(times.length / 2)] : 0;
  // A SINGLE FAILED CALL IS NOT A VERDICT. Below HEALTH_MIN_CALLS the honest answer is that we have seen it run,
  // with however many failures, and nothing stronger — so it stays 'healthy' for ranking and the counts are
  // printed beside it. Above it, the rate decides.
  const state = calls >= HEALTH_MIN_CALLS && failRate >= HEALTH_FAILING_RATE ? 'failing'
    : calls >= HEALTH_MIN_CALLS && failRate >= HEALTH_DEGRADED_RATE ? 'degraded'
      : 'healthy';
  return { state, calls, failures, failRate, medianMs };
}

/** One short phrase for a find_tools row. `unseen` says it is unseen; it never reads as an endorsement. */
export function healthLabel(h) {
  if (!h || h.state === 'unseen') return 'no recent calls';
  const t = h.medianMs ? `, ~${h.medianMs >= 1000 ? `${(h.medianMs / 1000).toFixed(1)}s` : `${h.medianMs}ms`} typical` : '';
  if (h.state === 'healthy') return `${h.calls}/${h.calls - h.failures} recent calls ok${t}`.replace(/^(\d+)\/(\d+)/, '$2 of $1');
  return `${h.state.toUpperCase()}: ${h.failures} of ${h.calls} recent calls failed${t}`;
}

/**
 * The rank penalty a row carries. 0 = nothing wrong. Higher sorts LATER.
 * A tool that cannot run at all (a connector this workspace has not made) and a tool that is failing its calls are
 * both worse picks than a working one — but NEITHER IS HIDDEN, because "we have no such tool" is the single most
 * expensive wrong answer this product can give ([[prompt-rosters-go-stale]]).
 */
export function healthPenalty(h, hold = null) {
  let p = 0;
  if (hold) p += 2;                                  // not connected / host policy / directory cage
  if (h?.state === 'failing') p += 2;
  else if (h?.state === 'degraded') p += 1;
  return p;
}
