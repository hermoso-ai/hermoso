# Changelog

## 0.1.1

- Published from GitHub Actions with npm provenance. Source now lives in the hermoso-ai/hermoso repository.

## 0.1.0

First release.

- Hermoso node: Brand (Get Many), Image (Generate, optionally returning a job right away), Video (Generate, returning
  the render job or waiting for the file), Job (Get, Get Many), Library Item (Get Many with filters), Media (Upload
  from a URL or a binary file), Post (Create, Get, Get Many, Cancel), Swipefile (Save Ad).
- Hermoso Trigger (polling): New Library Item, New Scheduled Post, New Published Post, New Failed Post.
- Brand, post, job and collection pickers load from your Hermoso account. Channel and model lists load live.
- Every create call sends an Idempotency-Key, so a retry of the same execution never renders or posts twice.
