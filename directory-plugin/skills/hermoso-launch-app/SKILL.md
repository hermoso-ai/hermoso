---
name: hermoso-launch-app
description: >-
  Launch and market an app or site you just built, using Hermoso. Puts the site live on Hermoso hosting with a
  domain, email on that domain and payments if asked, sets up the brand from it, makes launch ads and posts,
  schedules them on the owner's own social channels and, if asked, builds paused ad campaigns. Use when the user
  says "launch this", "put my site live", "market my app", "get me users", "make launch posts", "promote what we just
  built", or finishes a build and asks what is next. NOT for: building the app itself, or a single image from a
  prompt (use hermoso-generate).
argument-hint: "[the app's URL or one line about what it does, e.g. 'https://myapp.com, a habit tracker for runners']"
---

# Hermoso: launch the app you just built

You built something. This gets it live and in front of people: the site on a real domain if it is not live yet, a
saved brand, launch creative, a week of scheduled posts and, only if the user asks, paid campaigns created paused.

## Before you start
- This plugin connects the Hermoso MCP server (`https://app.hermoso.ai/mcp`). The first time a Hermoso tool runs,
  sign in with your Hermoso account in the browser page that opens (in Claude Code, `/mcp` and then `hermoso` shows
  the sign-in). No account yet: create one free at https://app.hermoso.ai.
- A tool you do not see in your list still exists: `find_tools` searches every Hermoso tool and `call_tool` runs any
  of them by name.
- Hermoso works alongside your build. It is not part of the app's own code, so never wire Hermoso calls into the app
  unless the user asks for an API integration.

## The launch, in order
Do only the steps the user wants. Say what you are about to do before anything that spends credits, buys something
or posts.

1. **Know the product.** Use what you already know from the build: what the app does, who it is for, its name, its
   live URL. Ask only for what is missing. One line is enough.
2. **Put it live (only if it is not live yet and the user wants Hermoso to host it).**
   - `publish_page` with a `name` (the address, served at `https://<name>.hermoso.page`) and the files you wrote
     (`html`, or `files` with each path and its content). Hermoso hosts exactly what you wrote and never rewrites
     it. `update_page` changes it later; `list_pages` shows what is live.
   - A domain the user already owns: `connect_domain` answers the one DNS record to add; `domain_status` checks it.
   - A new domain: `find_domain` suggests available names, then `buy_domain`. Without `confirm` it only returns the
     exact price and the registration agreement to show the user; after they accept, it returns a payment link for
     the USER to open. Never buy without their yes.
   - Email on that domain: `create_domain_address` (for example `hello@`), optionally forwarding to their inbox.
   - Card payments on the site: `start_payments_onboarding` returns the onboarding link for the user to complete.
3. **Save the brand.** If the app has a public URL, call `draft_brand` with it so every ad matches the app's look and
   voice. No URL yet? Call `draft_brand` with a short description instead. `get_brand` shows what is already saved;
   do not draft twice.
4. **See what works in this market (optional, costs credits).** `find_competitors` then `research_ads`, and report
   the two or three hooks that keep showing up. Skip this if the user just wants posts.
5. **Make the launch creative.** Three is a good first set: a static launch ad, a carousel or second static with a
   different angle, and one short vertical video if the user wants video. `generate_image` and `render_ad` pick sound
   defaults when you do not name a model. Video takes a few minutes: read the job with `get_job` and never call it
   done before it finishes. Show the user each result.
6. **Check the channels.** `list_connectors` says which social accounts are connected. None connected is not an
   error: give the user the connect link from the tool result, or tell them to open Hermoso and connect the channels
   they want under Connectors. Do not post anywhere the user did not name.
7. **Schedule the week.** Show the exact caption and the exact account for each post and get a yes. Then
   `schedule_post`, one a day, at the times the user picks or mornings in their time zone. `list_scheduled` reads the
   queue back. Never rewrite or shorten a caption the user wrote.
8. **Paid ads, only if asked.** Campaigns are created paused on the user's own ad accounts and read back before you
   describe them. Turning one on is the user's decision, stated in their own words.
9. **Report.** What is live (with links), what was made, what is scheduled and when, what is waiting on the user (a
   DNS record, a payment link, a channel to connect, a campaign to turn on), and the one thing to do next week: read
   what performed with `post_performance` and make more of that.

## Rules
- Nothing is published, bought, scheduled or spent on ads without the user saying so in this conversation.
- If the free credits run out, say so plainly and stop. Do not swap in a cheaper version of what was asked.
- Use the app's real name, screens and URL. Do not invent features, prices, reviews or numbers for the ads.
