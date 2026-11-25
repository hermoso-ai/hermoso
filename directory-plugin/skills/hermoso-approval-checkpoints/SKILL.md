---
name: hermoso-approval-checkpoints
description: >-
  Run any paid Hermoso job in three approved steps: the user signs off the script, then the pictures, then the
  render and its price, and nothing paid runs before the yes for that step. Use when the user says "check with me
  before you render", "show me the script first", "don't spend anything until I approve", or for any job that ends
  in a paid video, explainer, thumbnail set or batch of images. Other Hermoso skills follow the same three steps.
  NOT for: free reads, research, or posting and scheduling (those ask for a yes on the exact post instead).
argument-hint: "[the job to run with checkpoints, e.g. 'a 30-second video ad for our new flavour']"
---

# Hermoso: approval checkpoints

Paid work happens in three steps, and each step waits for the user. The point is simple: the user sees the words
before any picture is made, sees the pictures before any video is made, and sees the price before anything is
billed. A change at step one costs a rewrite. The same change after the render costs a whole new render.

## Before you start
- This plugin connects the Hermoso MCP server (`https://app.hermoso.ai/mcp`). The first time a Hermoso tool runs,
  sign in with your Hermoso account in the browser page that opens (in Claude Code, `/mcp` and then `hermoso` shows
  the sign-in). No account yet: create one free at https://app.hermoso.ai.
- A tool this file does not name still exists: `find_tools` searches every Hermoso tool and `call_tool` runs any of
  them by name.
- The server cannot read files on the user's computer. Pass a public link, or turn a file into a link with
  `upload_file` (`url` for a public link, `dataUri` for a small file). Otherwise ask the user to upload it to their
  Library at app.hermoso.ai and share the link.

## The three checkpoints

### Checkpoint 1: the script
Write the words first and show all of them: the spoken lines, the on-screen text, the caption, and for a video
the shot list with timings.
- `plan_ad` writes the concept, the copy and a timed storyboard for an ad (it bills a small writing cost). For a
  short in a known format, `make_short` plans it without rendering. For any other writing, `generate_text`.
- Show the script in full, not a summary of it. Ask: "Happy with this script, or what should change?"
- An edit comes back to this checkpoint with the new version shown in full. Never carry an unapproved line forward.

### Checkpoint 2: the pictures
Make or pick the stills the render will be built from, and show them before any video is made.
- An ad: `render_ad` with `foundations: "choose"` paints only the foundations (the look and the setting) and
  returns them without a video. The user picks one; pass `moodboardPick` and `foundationImages` on the real render
  so the approved pictures are reused rather than painted again.
- A slideshow, carousel or picture film: render the stills with `generate_image` (or take the user's own photos
  and the brand's saved product photos from `list_product_photos`) and show them as a numbered list.
- A thumbnail: `make_thumbnail` returns its variants. The user picks one before it goes anywhere.
- A presenter episode: `make_explainer` with `format: "host_episode"` returns a low-resolution draft first. The HD
  version is a separate call with `fromDraft`, made only after the user approves the draft.
- Ask the user to pick or change by number. A change means a new still of that one picture, not the whole set.

### Checkpoint 3: the render and its price
Quote, show the number, wait for a yes, then render with the quote attached.
- Get the price without spending: `get_cost: true` on any paid tool returns its price and runs nothing. On
  `render_ad`, `generate_video`, `make_explainer`, `make_thumbnail` and `post_edit`, `dryRun: true` also shows
  what the render will be (single take or several, the model, the act lengths). Quote every paid call in the job
  and show the total.
- Say what the price buys: the length, the size, how many takes.
- After the yes, send each call with `expected_credits` set to the price `get_cost` returned. If the live price
  moved, the call is refused and nothing is billed, so you come back to the user instead of spending a different
  amount. A step billed at its actual cost (a writing step, subtitles) answers `get_cost` with "no fixed price":
  say so, and run it without `expected_credits`.
- Send an `idempotency_key` chosen once per render and resent unchanged on any retry: the same key never buys twice.
- Renders run in the background: poll `get_job` until it is done and show the result as it came back.

## What counts as a yes
- An explicit yes to THIS checkpoint ("yes", "go", "approved", "render it"). A yes to the script is not a yes to
  the price.
- Silence, "nice", or a question is not a yes. Answer the question and ask again.
- The user may approve two checkpoints in one message ("script is fine, go ahead and render at that price"). Then
  run both, and still show the quote first if they have not seen it.
- The user may also say to skip the checkpoints for this job, or set a budget ("anything under the quote you gave
  me last time is fine"). That is their call: honour it, and still state the price you are spending.

## When nobody is watching
In a scheduled or unattended run there is nobody to say yes. Do checkpoint 1 (and checkpoint 2 when it is free),
then stop and report what is waiting for approval with its quote. Render only inside a budget the user set for
the schedule.

## After the render
- Show the finished file as it came back. Do not review, critique or re-render it on your own: the user watches it
  and decides. If they ask for a change, the smallest fix wins (`post_edit`, `fix_beat`, `edit_image`) and it goes
  through checkpoint 3 again with its own quote.
- Publishing is a separate yes. Show the exact caption, the account and the time before `schedule_post` or any
  `post_to_*` call.
