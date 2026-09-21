# n8n-nodes-hermoso

This is an n8n community node package for [Hermoso](https://hermoso.ai), marketing on autopilot. It lets you create
on-brand image and video ads, schedule social posts across your connected channels, collect finished renders, save
ads to a swipefile, and start workflows when new files or posts appear in Hermoso.

[n8n](https://n8n.io/) is a fair-code licensed workflow automation platform.

- [Installation](#installation)
- [Credentials](#credentials)
- [Operations](#operations)
- [Trigger](#trigger)
- [Usage](#usage)
- [Compatibility](#compatibility)
- [Resources](#resources)

## Installation

Follow the [installation guide](https://docs.n8n.io/integrations/community-nodes/installation/) in the n8n community
nodes documentation. In the n8n editor, open **Settings > Community Nodes > Install** and enter `n8n-nodes-hermoso`.

## Credentials

The nodes use a Hermoso API key.

1. Sign in at [app.hermoso.ai](https://app.hermoso.ai).
2. Open **MCP & CLI** and create a key. It starts with `hmk_`.
3. In n8n, create a **Hermoso API** credential and paste the key.

n8n checks the key when you save the credential. A key belongs to your Hermoso login, not to one brand: every node has
a **Brand** picker, and leaving it empty uses the brand the key is set to. Brands another account shared with you
appear in the same list.

## Operations

| Resource | Operation | What it does |
|---|---|---|
| Brand | Get Many | Lists the brand workspaces the key can use |
| Image | Generate | Creates an on-brand image ad from a prompt. Turn on **Return Job Without Waiting** to get a job back at once and collect the file later with Job > Get |
| Video | Generate | Starts a video render and returns the job. Turn on **Wait for Video** to keep checking until the file is ready |
| Job | Get, Get Many | Reads render jobs, with the finished file URL once they are done |
| Library Item | Get Many | Finds the newest images and videos in your Hermoso library, filtered by kind or text |
| Media | Upload | Stores an image or video in Hermoso, from a public URL or a binary file from an earlier node, and returns a hosted link |
| Post | Create | Publishes now, at a set time, or in the next free queue slot, on one or more connected channels. Outside media links are copied into Hermoso first |
| Post | Get, Get Many | Reads posts with their status and the result on each channel |
| Post | Cancel | Cancels a post that has not gone out yet |
| Swipefile | Save Ad | Saves an ad to a swipefile collection, creating the collection if it does not exist |

Notes:

- **Retries are safe.** Every create call sends an `Idempotency-Key` built from the execution, node and item, so a
  retry inside the same execution returns the first result instead of rendering or posting twice. Set
  **Idempotency Key** under Options to control it yourself.
- **Generating images and videos spends Hermoso credits**, exactly as it does in the app.
- **Errors say what to do.** An unconnected channel, an unknown brand, a key that was revoked or a low credit balance
  each come back with Hermoso's own message and a next step.
- Post and Job outputs have a **Simplify** switch. Turn it off to get the full API object.

## Trigger

**Hermoso Trigger** polls Hermoso on the schedule you set and starts the workflow once per new item:

- **New Library Item**: a finished image or video lands in the library (all, images only or videos only)
- **New Scheduled Post**: a post is added to the publishing calendar
- **New Published Post**: a post finishes publishing (optionally including partly published posts)
- **New Failed Post**: a post fails, or could not be confirmed, so you can alert the team or retry

When you activate the workflow, the trigger records what already exists and only reports items that appear after that.
A manual test run shows the newest match so you have data to map.

## Usage

Two example workflows are in [`examples/`](examples/). Import them with **Workflows > Import from File**.

**Schedule a post and cancel it**

1. Hermoso > Post > Create. Pick a brand and channels, write a caption, choose **At a Set Time** and a publish time.
2. Hermoso > Post > Cancel with **Post** set by ID to `{{ $json.id }}`.

**Generate an image and collect it**

1. Hermoso > Image > Generate with **Return Job Without Waiting** on. The output has the job `id`.
2. A Wait node of about 45 seconds.
3. Hermoso > Job > Get with **Job** set by ID to the job id. When `status` is `done`, `url` is the finished image.

**Post every new video automatically**

1. Hermoso Trigger > New Library Item, Kind: Videos Only.
2. Hermoso > Post > Create with **Media URLs** set to `{{ $json.url }}` and **When to Publish** set to
   **Next Free Queue Slot**.

## Compatibility

Built and tested with n8n 2.39 on Node.js 24. The package has no runtime dependencies.

## Resources

- [Hermoso API guide](https://hermoso.ai/docs/api/)
- [Hermoso OpenAPI description](https://app.hermoso.ai/openapi.json)
- [n8n community nodes documentation](https://docs.n8n.io/integrations/#community-nodes)

Questions or problems: hello@hermoso.ai
