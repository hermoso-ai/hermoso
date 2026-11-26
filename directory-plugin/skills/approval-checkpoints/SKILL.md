---
name: approval-checkpoints
description: >-
  Publish and schedule with Hermoso only after the user has seen and approved the exact post: the words, the media,
  the account and the time. Use for every publish, schedule, reschedule, cancel, retry and reply in this plugin, and
  when the user says "check with me before you post", "show me first", or "don't post anything until I approve".
  Other skills in this plugin follow it.
argument-hint: "[the post or batch to run with approval, e.g. 'these three LinkedIn posts for next week']"
---

# Approval checkpoints

Posts go out publicly under the user's name, and a published post cannot be unsent. So every post waits for a yes,
and the yes covers exactly what the user saw.

## Before you start
- This plugin connects the Hermoso Social Scheduler server (`https://app.hermoso.ai/mcp?tools=directory-scheduler`).
  The first time one of its tools runs, sign in with your Hermoso account in the browser page that opens (in Claude
  Code, `/mcp` and then `hermoso-social-scheduler`). No account yet: create one free at https://app.hermoso.ai.
- This server does not make images or video. Media comes from the user: a public link, or a file turned into a link
  with `upload_file` (`url` for a public link, `dataUri` for a small file). Nothing is published by an upload.

## Checkpoint 1: the words
Write the caption for each channel and show all of it, in full, not a summary. Each channel has its own shape:
LinkedIn folds after about two lines, X posts are short unless it is a thread or an Article, Bluesky allows 300
characters, YouTube needs a title and a description. Ask: "Happy with this, or what should change?" An edit comes
back to this checkpoint with the new version shown in full.

## Checkpoint 2: where and when
Show, for each post: the channel, the exact account (the Page, company Page, board, chat or handle), the media
file, and the time in the user's own time zone.
- Never choose the account for the user. List the options (`list_connector_accounts`, `list_meta_pages`,
  `list_linkedin_pages`, `list_pinterest_boards`) and let them pick.
- TikTok: read `tiktok_creator_info` first, show the privacy levels the account allows, and pass the level the user
  chose in `privacy`. Never pick it for them.
- Read `list_scheduled` so a new post does not land on top of one already queued.

## How the server holds every post for the user's yes
Every publish, schedule, reschedule, cancel, retry and reply tool on this server runs in two steps, and the first
call changes nothing:
- The first call returns a preview: the exact text, the media, each destination account (the Page, board, chat or
  handle as the connection resolves it right now) and the time, plus a single-use confirmation code. Show the user
  that preview as it is.
- After their yes to that preview, call the same tool again with the same arguments plus `confirmationCode`. Any
  change (a word, a time, an account) needs a new preview: the server refuses a code for a changed post.
- In a client that supports confirmation forms, the server shows the preview in a form instead and runs only if the
  user accepts it; no code is involved, and a declined form publishes nothing.
- A code works once and expires after 10 minutes.

## Then run it
Only after an explicit yes to the exact post ("yes", "go", "schedule it", "post it"):
- Later: `schedule_post` with `channels`, `message` (or `captions` per channel), the media, and `at` with
  `timezone`, or `useQueue` for the brand's next saved slot. Pinterest needs `boardId`, a LinkedIn company Page
  needs `linkedinOrganizationId`, several Facebook Pages need `pageId`.
- Now: the channel's own tool (`post_to_meta`, `post_to_x`, `post_to_linkedin`, `post_to_pinterest`,
  `post_to_bluesky`, `post_to_telegram`, `post_to_youtube`, `post_to_tiktok`). These publish immediately.
- X uses Hermoso credits at X's per-post price; `post_to_x` with `dryRun` returns the exact cost and posts nothing,
  so quote it before the yes.
- Changes to a queued post are the same checkpoint again: `reschedule_post` (only the fields that change),
  `cancel_scheduled`, or `retry_scheduled` for a failed one (it re-sends only the channels that failed).

## What counts as a yes
- An explicit yes to THIS post. A yes to the caption is not a yes to the time or the account.
- Silence, "nice", or a question is not a yes. Answer the question and ask again.
- The user may approve a whole batch at once ("all five look good, schedule them"). Then run all of them, and
  still show the full list first if they have not seen it.

## After
Read the result back with `list_scheduled` and report what it says (each channel's status, the permalink once
published), not what was sent. The words the user approved are the words that publish: never shorten or rewrite
them at posting time. A channel that refuses a post says why; bring that back to the user.
