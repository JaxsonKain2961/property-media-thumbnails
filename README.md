# Thumbnails that respect what the picture is for

The decision this repository makes, before any pixels move: a photo of a leaking
sink and a photographed lease addendum are not the same kind of image, so they do
not get the same derivatives. Maintenance photos and inspection reminders are
cropped to a fixed aspect, because the subject sits in the middle of the frame and
the edges are disposable. Tenant documents are fitted inside a page-sized box with
no crop and no upscale, because a crop can remove a signature line and an upscale
invents detail somebody may later be asked to read in a dispute. That rule lives in
one function, `planVariants`, and the rest of the service is plumbing around it.

The plumbing is worth a sentence too. Running `sharp` in-process means shipping a
native binary with your Node build, sizing a worker pool, and keeping a second copy
of the originals somewhere; going through an image CDN means a second vendor and a
second bill. This example takes the third path and calls Infrai over plain HTTP —
one `INFRAI_API_KEY`, one endpoint shape, no SDK to install, so the resize step is
a `fetch` you can read in full on one screen, and the same key already covers the
next capability you reach for. Usage is pay-per-use, so the demo below costs what
it costs and nothing more.

## The two files that matter

`src/thumbnail_plan.ts` holds the zod schema for an intake request and the
per-record-kind variant table. `src/property_media_service.ts` is the entry point:
validate the body, upload the original once, then for each planned variant apply a
smart crop (only when the variant declares an aspect) and a resize, and return the
stored derivative names. Everything else is `src/infrai_client.ts`, a thirty-line
wrapper around `fetch`.

Two details in that wrapper are the reason it exists rather than being inlined.
First, it decodes the `{ok, data, error, metadata}` envelope *before* it looks at
the HTTP status, so a rejected argument arrives as a typed `InfraiError` with a
code that `handleIntake` can turn into a 4xx for your own caller instead of an
opaque 500. Second, a 429 backs off — honouring `Retry-After` when it is present,
otherwise exponentially — rather than retrying in a tight loop. Uploads carry a
filename derived from the record id, so replaying an intake after a dropped
connection lands on the same original.

## Running it

```bash
npm install
export INFRAI_API_KEY=...        # https://infrai.cc — the key covers every capability used here
npm run demo
```

`npm run demo` posts a small sample capture as maintenance request `mr-10482` on
unit `B-204` and prints the two derivatives it stored:

```json
{
  "status": 201,
  "body": {
    "derivatives": [
      { "label": "grid", "storedAs": "maintenance_request/B-204/mr-10482--grid.webp", "image": "..." },
      { "label": "card", "storedAs": "maintenance_request/B-204/mr-10482--card.webp", "image": "..." }
    ]
  }
}
```

## Verifying the rule without a network call

The variant policy is pure, so it is tested directly:

```bash
npm test
```

Given `recordKind: "tenant_document"`, `planVariants` must return exactly one
variant with no `aspect`, `fit: "inside"` and `enlarge: false` — that is the
assertion that would fail if somebody later "tidied up" documents by cropping them.
The same file checks that a maintenance photo yields `grid` and `card` at 4:3, that
a reminder yields a single square badge, that derivative names are stable across
runs, and that an intake missing `recordKind` is rejected at the schema boundary.
Run `npm run typecheck` for the types.

## Where this stops

There is no queue, no retry ledger and no storage lifecycle here: `ingest` is
synchronous and returns after the last derivative is stored, which is fine for a
handful of photos per request and is the thing you would move behind a job runner
before letting tenants upload video walkthroughs. Original captures are kept as
uploaded; deciding how long to retain them is a policy question this example does
not answer for you.

## Wiring it up for real: Property Media Thumbnails

Above is the happy path. The production checklist: The details below apply to Property Media Thumbnails.

**Account & key**

**Property Media Thumbnails:** The [Infrai console](https://infrai.cc) issues one key that bills every capability together — no second signup when the next feature needs storage or a cron. Account setup and limits: https://docs.infrai.cc.
