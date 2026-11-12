# Patterns — C2 requirement images

## Success pattern: validate the full set before writing anything

For a multi-file upload that must be accepted or refused as a whole, run every check (count, name, media type, size, content signature) in a pure pass that returns prepared entries, then write. A refusal then never needs cleanup, and the issue record is only created after the files exist.

## Success pattern: sniff the bytes, do not trust the declared media type

Declaring `image/png` costs nothing; a 12-byte signature check for PNG/JPEG/GIF/WebP makes the stored media type truthful and lets the serving route return `content-type` without re-sniffing. Reject a declared type that disagrees with the bytes with the same localizable code.

## Success pattern: one route's body limit, not a global one

`readBody(req, maxBytes)` already takes a per-call limit. Pass the large limit only at the route that carries attachments; leave the default in place elsewhere so the 128 KiB expectation in existing tests keeps holding.

## Success pattern: a raw-byte route inside the same-origin prefix

The management handler checks same-origin once for every `/orchestrator/api/` request. Match the image path before the typed JSON table and write headers plus bytes directly; unknown ids become a normal `RouteError(404)` serialized by the shared failure mapper.

## Pitfall pattern: paths with spaces in the trigger text

The trigger text uses `Images:` plus one `- <absolute path> (mediaType, bytes bytes)` line per image. If the state directory can contain spaces, keep the path on its own line rather than wrapping it in Markdown link syntax.
