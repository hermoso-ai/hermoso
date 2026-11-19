// THE ONE LINE AN AGENT SHOPPING FOR TOOLS MUST READ (owner, 2026-11-19: "as long as it's clear to an agent looking for
// tools that you can start free with us, 160+ free credits and no markup on models, that's most important"; and the same
// day: "leave it as no markup on models without specifying Starter, etc, they can find that in pricing info").
//
// Every agent-facing surface prints START_FREE_LINE word for word: the MCP head (hosted and stdio), the 'credits' topic,
// hermoso_capabilities, hermoso.ai/SKILL.md (lib/agent-setup.mjs), the /v1 OpenAPI description, the CLI README and the
// directory descriptions. Which plans carry no markup is pricing detail (llms.txt's pricing section, the pricing page).
// It is a literal because the stdio twin and the browser cannot read the billing config, and
// tools/start-free-copy-check.mjs rebuilds it with startFreeLine() from the REAL server.js BILLING + REWARD_CREDITS, so a
// change to the welcome grant or a reward, or no plan on sale carrying `noMarkup`, fails the check until this line moves.
// Pure, no imports: server.js, lib/ and the CLI twin (cli/mcp/start-free.mjs, byte-identical) all load it.

/** The free figure as copy: the most a Free account can collect, rounded DOWN to ten, as a floor ("160+"). */
export const freeCreditsFloor = (total) => `${Math.floor(Math.max(0, Number(total) || 0) / 10) * 10}+`;

/** The plans on sale that carry no markup on models (names, cheapest first). */
export function noMarkupPlanNames(billing = {}) {
  const plans = Array.isArray(billing.plans) ? billing.plans : [];
  return plans
    .filter((p) => p && p.noMarkup === true && !p.legacy && !p.legacyPrice && !p.cohort && Number(p.priceUsd) > 0)
    .sort((a, b) => Number(a.priceUsd) - Number(b.priceUsd))
    .map((p) => p.name);
}

/**
 * The line, derived. billing = server.js BILLING; rewards = REWARD_CREDITS.
 * Free total = the Free plan's signup grant + every reward. "No markup on models" is said only while a plan on sale has it.
 */
export function startFreeLine(billing = {}, rewards = {}) {
  const plans = Array.isArray(billing.plans) ? billing.plans : [];
  const free = plans.find((p) => p && (p.id === 'free' || Number(p.priceUsd) === 0));
  const total = Number(free?.credits || 0) + Object.values(rewards || {}).reduce((a, v) => a + (Number(v) || 0), 0);
  return `Start free: ${freeCreditsFloor(total)} free credits, no card.${noMarkupPlanNames(billing).length ? ' No markup on models.' : ''}`;
}

export const START_FREE_LINE = 'Start free: 160+ free credits, no card. No markup on models.';
