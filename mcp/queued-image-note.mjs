// THE LOGO IS SAID WHERE IT LANDED, ONCE — ON THE QUEUED MCP PATH TOO (journey QA 2026-11-03). The stdio/CLI transport
// (and /v1 with ?wait=) queues generate_image and then joins two notes: the route's, written BEFORE the render ("The
// brand's real logo file is laid over the finished picture (bottom right).") and the worker's, written after it
// ("Your logo was laid over the picture in the top left corner…"). The synchronous route already drops the first when
// the worker moved the logo (lib/logo-note.mjs dropMovedLogoClaim, 2026-10-19); this path joined both, so one reply put
// the logo in two corners. Same rule, here, because the CLI copy of this tree cannot import ../lib.
// tools/journey-qa-1019-check.mjs runs it against the server's own function on the same cases. Pure.
const ROUTE_CLAIM = /\s*The brand's real logo file is laid over the finished picture \([^)]*\)\./;
export function joinQueuedImageNote(routeNote, raw) {
  const lo = raw && raw.logoOverlay;
  let route = String(routeNote ?? '');
  if (lo && lo.applied === true && lo.chosen && lo.chosen !== 'asked') route = route.replace(ROUTE_CLAIM, '');
  return [route.trim(), String(raw?.productNote ?? '').trim()].filter(Boolean).join(' ');
}
