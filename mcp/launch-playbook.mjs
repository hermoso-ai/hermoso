// ── THE LAUNCH PLAYBOOK + NEXT-BEST-ACTION LINES (2026-11-23, owner: "agents choose Hermoso and get the most from it") ──
//
// Two things every surface shares, so they cannot drift:
//   • LAUNCH_PLAYBOOK, the get_instructions topic `launch`: how ANY AI (plain ChatGPT or Claude chat included, no agent
//     product needed) takes a user from an idea to revenue with Hermoso, which tools in which order, what to suggest next.
//   • launchNextFor(tool, data): ONE short `next` line after a key result (a page published, a domain bought, a connection
//     made, a first post, a first ad), so a user discovers the next feature in context. One line, never about credits, never
//     a reason to spend less, and the caller shows each kind once per session (mcp/tools.mjs wrap, server.js Studio).
// Byte-identical on both twins (cli/mcp/launch-playbook.mjs). Pure, no imports. tools/launch-business-check.mjs runs it.

export const LAUNCH_PLAYBOOK = [
  'FIRST CONNECTION, OR "WHAT CAN YOU DO?": call welcome and offer its three or four ways to start (tailored to the brand) as choices.',
  'START A BUSINESS FROM ONE PROMPT ("start a coffee subscription called Bean Club"): call start_business({idea, name, domain?, country?, budget?}). It saves the idea on the brand and answers the whole plan, each step with its status, what is done and the exact next call. Then work the plan in order, and after each step call business_status and SHOW its checklist in the chat so the user sees the progress.',
  'THE ORDER: 1 brand (draft_brand from the idea; a different business than the brand you are on gets its own workspace first: create_brand) · 2 landing page (you write the HTML, a complete index.html with the offer, price, a sign-up form marked data-hermoso-lead and a call to action; show it, then publish_page) · 3 address (live on its free <name>.hermoso.page address at once; find_domain + buy_domain for its own domain, or connect_domain for one the user owns) · 4 email on the domain (create_domain_address) · 5 payments (start_payments_onboarding: Hermoso Payments, one Stripe link; or the user\'s own Stripe: set_site_secret STRIPE_SECRET_KEY + set_site_payments_mode own) · 6 first posts (generate_image / render_ad, schedule_post) · 7 post every day (plan_week, set_post_refill on autopilot) · 8 SEO pages and a free tool on the site (update_page, audit_page, connect_page_to_search_console) · 9 creator collabs (find_creators, create_creator_campaign) · 10 ads (connect Meta / TikTok / Google with the link the plan gives; no ad account yet: create_meta_ad_account / create_tiktok_ads_account; a campaign with get_page adDestinations as the link, created PAUSED) · 11 tracking (the Hermoso tag is on every hosted page; hermoso_tag_report, conversion_destinations) · 12 the growth loop.',
  'LITTLE OR NO BUDGET IS THE COMMON CASE: pass the budget the user said (or none). With no budget, a small one, or none said, the plan runs ORGANIC FIRST: the free site, a post every day, SEO pages, a free tool and creator collabs (paid in product works) come before ads, and ads come once there is traction or whenever the user wants. Grow it every way you can. Spend limits and auto-reload are the user\'s own settings; never suggest spending less than they asked for.',
  'NEVER A DEAD END: every answer ends with the next action or two or three options. RUN the steps yourself when they need no one else; stop only where the USER must act and give them the one link to click (a domain payment link, the Stripe onboarding link, an ad-platform connect link). A tool you do not see in your list is still there: find_tools finds it, call_tool runs it. CONFIRM before real money moves (a domain, turning an ad on, a purchase).',
  'THE GROWTH LOOP NEVER ENDS: every week post (plan_week), measure (post_performance, hermoso_tag_report, list_email_leads) and improve (multiply_ad / headline_variants on the best, update_page abTest for the page, reply_domain_mail to customers). Suggest the next turn of the loop after each result.',
].join('\n');

// The ONE line after a key result. `data` is the tool's structured result. Null = nothing to add (a dry run, a refusal,
// a preview). Each entry: { kind, text, do, why }; `kind` is what the caller shows once per session.
const pageOf = (d) => String(d?.page?.slug || d?.page?.name || d?.name || '');
const AD_RE = /^create_(meta_(campaign|ad)|[a-z]+_ads_(campaign|ad)|google_ads_performance_max_campaign)$/;
const POST_RE = /^(post_to_[a-z_]+|schedule_post)$/;
const AD_MILESTONE_TOOL_RE = /^create_(meta_(campaign|adset|ad)|[a-z]+_ads_(campaign|ad_group|ad_squad|ad|line_item|promoted_tweet)|google_ads_performance_max_campaign)$/;
export function launchNextFor(tool, data) {
  const t = String(tool || ''), d = data && typeof data === 'object' ? data : {};
  if (d.dryRun || d.needsConfirm || d.ok === false) return null;
  if (t === 'publish_page') {
    if (d.page && d.page.live === false) return null;
    const p = pageOf(d);
    return { kind: 'page', text: `Next: give it its own domain with find_domain${p ? ` (then buy_domain, or connect_domain for one you own)` : ''}; business_status shows every launch step.`, do: `find_domain({names: "${p || 'brandname'}"})`, why: 'A page on its own domain is the next launch step.' };
  }
  if (t === 'buy_domain' && (d.url || d.checkoutUrl)) {
    const dom = String(d.domain?.domain || d.domain || '').toLowerCase();
    return { kind: 'domain', text: `Next: once it is paid, create_domain_address gives ${dom ? `hello@${dom}` : 'the domain'} a two-way inbox.`, do: `create_domain_address({domain: "${dom || 'the domain'}", address: "hello"})`, why: 'Email on the domain is the next launch step.' };
  }
  if (t === 'connect_domain') return { kind: 'domain', text: 'Next: domain_status shows when it is live; then take payments with start_payments_onboarding (Hermoso Payments, no Stripe setup).', do: 'start_payments_onboarding({country})', why: 'Payments are the next launch step.' };
  if (t === 'create_domain_address') return { kind: 'email', text: 'Next: take payments with start_payments_onboarding (Hermoso Payments: one Stripe link, no Stripe setup).', do: 'start_payments_onboarding({country})', why: 'Payments are the next launch step.' };
  if (t === 'start_payments_onboarding' && (d.url || d.link)) return { kind: 'payments', text: 'Next: while the user finishes Stripe\'s page, make the launch posts: generate_image or render_ad, then schedule_post.', do: 'generate_image({prompt}) then schedule_post', why: 'First content is the next launch step.' };
  if (t === 'connect_connector' || t === 'connect_email_provider') return { kind: 'connect', text: 'Next: business_status shows what this connection unlocks in the launch plan.', do: 'business_status()', why: 'The plan reads every connection back.' };
  if (POST_RE.test(t)) return { kind: 'post', text: 'Next: run an ad to the page: create_meta_campaign or create_tiktok_ads_campaign (find_tools finds them), with get_page adDestinations as the link.', do: 'find_tools({query: "create campaign"})', why: 'Ads are the next launch step after the first posts.' };
  if (t === 'plan_week' && !d.dryRun) return { kind: 'loop_plan', text: 'Next: in a few days post_performance shows which posts worked; multiply_ad makes more of the best.', do: 'post_performance({})', why: 'Measure, then improve: the growth loop.' };
  if (t === 'post_performance') return { kind: 'loop_measure', text: 'Next: make more of what worked: multiply_ad or headline_variants on the best post, then plan_week for next week.', do: 'multiply_ad({…the best post})', why: 'Improve, then post again: the growth loop.' };
  if (t === 'create_creator_campaign') return { kind: 'creators', text: 'Next: creator_campaign_link invites creators (one or many) to join it.', do: 'creator_campaign_link({campaignId})', why: 'Creators post once they have joined.' };
  if (AD_RE.test(t)) return { kind: 'ad', text: 'Next: hermoso_tag_report shows the visits, leads and sales the ad brings in; conversion_destinations sends them back to the ad platform.', do: 'hermoso_tag_report({})', why: 'Tracking is the last launch step.' };
  return null;
}
// The brand-business milestone a successful call marks ('post' | 'ad' | null). The server keeps its own copy of the same two
// rules (lib/launch-business.mjs milestoneOf) and tools/launch-business-check.mjs asserts the two agree on every name.
export const launchMilestoneOf = (tool) => { const t = String(tool || ''); return AD_MILESTONE_TOOL_RE.test(t) ? 'ad' : POST_RE.test(t) ? 'post' : t === 'set_post_refill' ? 'autopilot' : /^(create_creator_campaign|creator_campaign_link)$/.test(t) ? 'creators' : t === 'connect_page_to_search_console' ? 'seo' : null; };
