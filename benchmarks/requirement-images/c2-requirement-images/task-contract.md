# Task contract · C2 · Requirement image storage and reading (server side)

Ticket: `7d197b3b2d9b27eb816cac184ca71255` (slice `C2` of alignment `q-612052e8`)
Worktree: `/data/project/workspace/dsh-worktrees/slice-7d197b3b2d9b`
Baseline: deployment `main` @ `afab266e`; branch `agent/slice-7d197b3b2d9b`.
Issue file: `docs/issues/7d197b3b2d9b27eb816cac184ca71255.md`.

## Goal

A requirement submitted through the local panel can carry up to four images in the same `POST local/issues` request. The server validates every image (count, media type, decoded size and content signature), stores the bytes under `<stateDir>/local-images/<issueId>/`, records `{ id, name, mediaType, bytes }` per image on the issue, appends each image's absolute path to the requirement trigger text, and serves the bytes back through `GET local/issues/:id/images/:imageId`. No other management route gets a larger request body.

## Frozen acceptance criteria

1. `POST local/issues` accepts `images` (PNG/JPEG/WebP/GIF, each ≤ 5 MiB decoded, at most 4), created in the same request as the requirement; if any image is invalid the whole request is refused, no requirement is created, and a localizable error code is returned.
2. Images are written to `<stateDir>/local-images/<issueId>/`; the issue record contains each image's `id`, original `name`, `mediaType` and byte count; `GET local/issues/:id` returns that metadata.
3. `GET local/issues/:id/images/:imageId` returns the raw bytes with the stored media type and `cache-control: no-store`; unknown issue/image id returns 404; a request that is not same-origin returns 403.
4. The requirement trigger text contains every image's absolute path; tests read those paths back, prove they exist and that their bytes are the submitted images.
5. Only the create-requirement route allows a larger request body; every other management route keeps the 128 KiB limit.
6. `pnpm check` passes; tests cover acceptance, refusal (type/size/count), reading and an over-limit request.

## Design (follow this unless a concrete blocker forces a change)

### Types

`src/sources/local-format.ts`:

```ts
/** One image attached to a local requirement, stored under `<stateDir>/local-images/<issue id>/`. */
export interface LocalImage {
  id: string
  /** Original file name the person attached. */
  name: string
  /** Sniffed media type: image/png, image/jpeg, image/webp or image/gif. */
  mediaType: string
  bytes: number
}

/** An image as submitted with a requirement: base64 content, original name and declared media type. */
export interface LocalImageInput { name: string; mediaType: string; data: string }
```

Add `images?: LocalImage[]` to `LocalIssue` (absent when the requirement has no images, so legacy records stay unchanged).

`src/limits.ts`: add

```ts
/** Requirement images: at most four per requirement, at most 5 MiB decoded each; the create route is the only larger body. */
export const REQUIREMENT_IMAGES = { count: 4, bytes: 5 * 1024 * 1024, mediaTypes: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] as const }
export type RequirementImageMediaType = typeof REQUIREMENT_IMAGES.mediaTypes[number]
/** Largest management request body: the create-requirement route alone carries up to four base64-encoded images. */
export const REQUIREMENT_BODY_BYTES = 32 * 1024 * 1024
```

### New module `src/app/local-images.ts`

Pure helpers plus filesystem work, no Store access:

- `requirementImagesDir(stateDir, issueId): string` → `join(stateDir, 'local-images', issueId)`
- `requirementImagePath(stateDir, issueId, image): string` → `<dir>/<image.id>.<ext>` with ext from media type (png/jpg/webp/gif)
- `sniffImageMediaType(bytes): RequirementImageMediaType | undefined` — signature check: PNG `89 50 4E 47 0D 0A 1A 0A`; JPEG `FF D8 FF`; GIF `GIF87a`/`GIF89a`; WebP `RIFF` at 0 and `WEBP` at 8.
- `storeRequirementImages(stateDir, issueId, inputs): LocalImage[]` — validate ALL inputs before writing anything:
  - more than `REQUIREMENT_IMAGES.count` → `UserError('issueImageCount', { max })`
  - blank name / longer than 255 → `UserError('issueImageName')`
  - declared `mediaType` not one of the four → `UserError('issueImageType', { name })`
  - `data` is not standard base64 (`/^[A-Za-z0-9+/]+={0,2}$/`, length % 4 === 0, optional `data:...;base64,` prefix allowed) or decodes to zero bytes → `UserError('issueImageData', { name })`
  - decoded bytes > `REQUIREMENT_IMAGES.bytes` → `UserError('issueImageSize', { name, max })`
  - signature does not match the declared media type → `UserError('issueImageType', { name })`
  - id: `img-${key('local-image', issueId, String(index), name).slice(0, 8)}`
  - then `mkdirSync(dir, { recursive: true, mode: 0o700 })` and `writeFileSync(path, bytes, { mode: 0o600 })`; on any write error remove the directory and rethrow.

### `src/app/local.ts`

- `LocalIssuesHost` gains `readonly stateDir: string` (Runtime passes `machine.stateDir`).
- `LocalIssueInput` gains `images?: LocalImageInput[]`.
- `create`: compute the issue id first, call `storeRequirementImages(this.host.stateDir, id, input.images ?? [])`, put the returned metadata on the record only when non-empty, store the issue, and submit the trigger with text:

```
<title>

<body>

Images:
- <absolute path> (<mediaType>, <bytes> bytes)
```

(the `Images:` section only when images exist). Wrap `store.set` in try/catch that removes the issue image directory on failure.
- `image(id, imageId): { bytes: Buffer; mediaType: string } | undefined` — find the issue's image metadata and `readFileSync` its path; return `undefined` for an unknown issue/image or a missing file.

### `src/app/http.ts`

- `POST local/issues`: zod body adds `images: z.array(z.object({ name: z.string(), mediaType: z.string(), data: z.string() })).optional()` (no zod max: count is a localizable `UserError`), and calls `input.body(REQUIREMENT_BODY_BYTES)`.
- Add a raw-byte route for `GET local/issues/:id/images/:imageId`, matched before the JSON route table inside the existing `/orchestrator/api/` handler (after the same-origin check, so 403 comes for free). It writes status 200 with `content-type: <stored media type>`, `content-length`, `cache-control: no-store`, `x-content-type-options: nosniff` and the bytes; unknown → `RouteError(404, 'Local issue image not found')`.
- Leave every other route on the default 128 KiB `readBody`.

### `src/app/api.ts`

- `POST local/issues` body type gains `images?: LocalImageInput[]`.
- Export `localImageUrl(issueId, imageId): string` returning `/orchestrator/api/local/issues/<encoded id>/images/<encoded imageId>`. It is a plain value, not a type: update `tests/controls.spec.tsx`’s “imports types only” expectation by keeping the file import-free apart from types (a string function needs no imports, so the existing test stays valid).

### Errors and copy

`src/core/errors.ts` add codes (English templates):
- `issueImageCount: ['refused', 'A requirement accepts at most {max} images']`
- `issueImageName: ['refused', 'A requirement image needs its original file name']`
- `issueImageType: ['refused', 'Image {name} must be a PNG, JPEG, WebP or GIF image']`
- `issueImageSize: ['refused', 'Image {name} is larger than {max} bytes']`
- `issueImageData: ['refused', 'Image {name} is not valid base64 image data']`

`src/client/locales.ts` add `userError.<code>` zh entries with the same placeholders and `USER_ERRORS.<code>[1]` as the English text (the existing `tests/locales.spec.ts` requires both languages).

### Tests

`tests/local.spec.ts` (unit, `LocalIssues`; pass `stateDir: directory`):
- accepts a mix of PNG/GIF (and a JPEG/WebP signature), stores metadata and bytes under `<stateDir>/local-images/<issue id>/`, trigger text contains each absolute path, files exist and equal the submitted bytes; `image()` returns bytes + media type; unknown image returns `undefined`.
- refuses: 5 images (`issueImageCount`), > 5 MiB decoded (`issueImageSize`), unsupported/mismatched type (`issueImageType`), invalid base64 (`issueImageData`), blank name (`issueImageName`) — each leaves `issues.list()` unchanged and creates no `local-images` directory; a valid first image plus an invalid second also creates nothing.

`tests/local-align.spec.ts` (HTTP through the simulated host):
- POST with one PNG → 200 and metadata; GET detail returns the metadata; GET the image URL returns 200, content-type image/png, cache-control no-store, bytes equal; unknown image id and unknown issue id → 404; a non-same-origin request (omit `x-orchestrator-request`) → 403.
- the trigger text contains the absolute path, which exists and equals the submitted bytes.
- POST with 5 images → 400 `code: issueImageCount` and no issue created; POST with > 5 MiB image → 400 `code: issueImageSize`.
- a create body above 128 KiB but below the new limit is accepted (proves the per-route limit); a body above `REQUIREMENT_BODY_BYTES` → 400 `Request exceeds ... bytes`; `POST local/issues/:id/comments` with > 128 KiB stays 400.

`tests/http.spec.ts`: extend the body-limit test to assert the create route accepts a payload above 128 KiB while another route still refuses 128 KiB+ (use a stub `local.create`).

`tests/fixtures/host.ts`: add a `raw(method, path, json?, headers?)` helper that captures status, response headers and a `Buffer` body; keep `api()` behaviour unchanged (it can delegate to `raw`). Needed because `h.api` JSON-parses.

### Docs

- `docs/007-architecture.md`: module table rows for `src/app/local-images.ts` (new), update `src/app/local.ts`, `src/app/http.ts`, `src/sources/local-format.ts`, `src/limits.ts`; test table rows for `tests/local.spec.ts` and `tests/local-align.spec.ts`; Persistence section line about `<stateDir>/local-images/<issue id>/`.
- `docs/006-deployment.md`: state-dir description lists requirement images in `local-images`.

## Do not

- Do not touch the panel client (`src/client/discuss.tsx`, `client.css`) — the upload UI is a different slice.
- Do not change `GET local/issues` list semantics or any other route’s body limit.
- Do not add a database schema change: image metadata lives on the `LocalIssue` record.
- Do not expose absolute paths in the HTTP JSON (only in the trigger text); the record keeps id/name/mediaType/bytes only.
- Do not weaken or reword the frozen acceptance criteria.

## Verify

```
pnpm typecheck
pnpm vitest run tests/local.spec.ts tests/local-align.spec.ts tests/http.spec.ts tests/locales.spec.ts tests/docs.spec.ts tests/class-docs.spec.ts
pnpm test
pnpm build
git diff --check
```

`pnpm check` must exit 0.

## Report

Report the exact files changed, the test command summaries (files/tests passed), any assertion adjusted, and confirm the acceptance criteria mapping. Do not commit; the worker commits after review and verification.
