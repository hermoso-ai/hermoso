// THE ONE LINE AN AGENT SHOPPING FOR TOOLS MUST READ (owner, 2026-11-19: "as long as it's clear to an agent looking for
// tools that you can start free with us, 160+ free credits and no markup on models, that's most important").
//
// Every agent-facing surface prints START_FREE_LINE word for word: the MCP head (hosted and stdio), the 'credits' topic,
// hermoso_capabilities, hermoso.ai/SKILL.md (lib/agent-setup.mjs), the /v1 OpenAPI description, the CLI README and the
// directory descriptions. It is a literal because the stdio twin and the browser cannot read the billing config, and
// tools/start-free-copy-check.mjs rebuilds it with startFreeLine() from the REAL server.js BILLING + REWARD_CREDITS, so a
// change to the welcome grant, a reward or which plans carry `noMarkup` fails the check until this line moves with it.
// Pure, no imports: server.js, lib/ and the CLI twin (cli/mcp/start-free.mjs, byte-identical) all load it.

/** The free figure as copy: the most a Free account can collect, rounded DOWN to ten, as a floor ("160+"). */
export const freeCreditsFloor = (total) => `${Math.floor(Math.max(0, Number(total) || 0) / 10) * 10}+`;

/** "Starter, Pro and Studio" from plan names. */
export const namesList = (names) => (names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`);

/**
 * The line, derived. billing = server.js BILLING; rewards = REWARD_CREDITS.
 * Free total = the Free plan's signup grant + every reward; the no-markup plans = the plans on sale with `noMarkup`.
 */
export function startFreeLine(billing = {}, rewards = {}) {
  const plans = Array.isArray(billing.plans) ? billing.plans : [];
  const free = plans.find((p) => p && (p.id === 'free' || Number(p.priceUsd) === 0));
  const total = Number(free?.credits || 0) + Object.values(rewards || {}).reduce((a, v) => a + (Number(v) || 0), 0);
  const member = plans
    .filter((p) => p && p.noMarkup === true && !p.legacy && !p.legacyPrice && !p.cohort && Number(p.priceUsd) > 0)
    .sort((a, b) => Number(a.priceUsd) - Number(b.priceUsd))
    .map((p) => p.name);
  return `Start free: ${freeCreditsFloor(total)} free credits, no card. No markup on models on ${namesList(member)}.`;
}

export const START_FREE_LINE = 'Start free: 160+ free credits, no card. No markup on models on Starter, Pro and Studio.';
