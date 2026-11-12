# Retrospective — C2 requirement images

## What worked

- Validating every image before any filesystem work makes the "one bad image refuses the whole requirement" criterion structural rather than a rollback path.
- Keeping file layout and media-type sniffing inside one module let the HTTP layer stay a thin body/response adapter and kept `LocalIssues` as the only writer of the state directory.
- Extending the host fixture with a raw-bytes request helper was enough to test binary responses, 404 and the 403 gate without touching the JSON helper.
- A route-specific `maxBytes` on `readBody` is a one-line change that preserves the 128 KiB default for every other management route.

## What to watch

- The create body is 32 MiB only because four 5 MiB images base64-encode to ~27 MiB; if the image count or size changes, `REQUIREMENT_BODY_BYTES` must change with it.
- Image files live outside SQLite; backups must copy `local-images` together with `orchestrator.sqlite`.
- The panel's upload UI is a separate slice; until it lands, only API clients send `images`.

## Process

- The dispatched implementation lane failed with no output; the worker completed the same contract directly, as in the sibling slices. This is a runtime limitation, not a code issue.
