# Task contract · C3 · Panel requirement images

Ticket: `fd4370f4967a89692063df8d02daa80c` (slice `C3` of alignment `q-612052e8`)
Worktree: `/data/project/workspace/dsh-worktrees/slice-fd4370f4967a`
Issue file: `docs/issues/fd4370f4967a89692063df8d02daa80c.md`.
Stack: deployment `main` @ `afab266e`, plus the unmerged C1 (`agent/slice-de236aab51cc`, PR #12) and C2
(`agent/slice-7d197b3b2d9b`, PR #14) slices already merged into this worktree. The server-side image API, its
`LocalImage` metadata and `localImageUrl()` exist here; do not change server code.

## Goal

The New requirement page accepts images: multi-select PNG/JPEG/WebP/GIF files, thumbnails with file names, removal
before submit, and a limits hint. Submitting sends the description and images in one `POST local/issues` request.
The requirement detail renders the stored images in order; the requirement list row shows the image count. The client
refuses unsupported or oversized files locally without submitting; a host refusal keeps the typed description and the
chosen images and shows the localized error. Images are read through the management API with the same-origin header,
not through a new unauthenticated image URL.

## Frozen acceptance criteria

1. The submit form has an image picker (multi-select, PNG/JPEG/WebP/GIF); chosen images show a thumbnail and file
   name and can be removed before submitting; the form shows type, size and count limits.
2. Submitting sends description and images in the same create request; the detail shows the images in order; the
   list row shows the image count.
3. The client refuses an unsupported type or an over-limit file with a localized message and does not submit; when
   the host refuses, the description and chosen images stay and the localized error is shown.
4. Images are read through the management API with the same-origin header; no new unauthenticated image URL; they
   display normally in the detail.
5. `pnpm check` passes; panel tests cover select/remove/submit/display/refusal; the PR carries Before/After captures
   of the submit form with images and the detail display (worker owns captures).

## Files

Change only these:

- `src/client/discuss.tsx` — picker, thumbnails/removal, submit payload, detail gallery, list count.
- `src/client/api.ts` — same-origin image byte reader and its blob URL helper.
- `src/client/client.css` — picker/thumbnail/gallery classes (one rule per line; each selector once per block).
- `src/client/locales.ts` — zh/en copy for the picker, hint, remove, count, and the three client-side refusals.
- `src/client/controls.tsx` — add an `image` icon to `ICON_PATHS` for the picker button.
- `tests/fixtures/panel-server.ts` — accept `images` on the create route (echo id/name/mediaType/bytes), serve
  `GET local/issues/:id/images/:imageId` bytes, and add a fixture switch for a host refusal.
- `tests/panel-discuss.spec.tsx` — tests for select, remove, submit, detail display, list count, local refusal and
  host refusal with retained input.
- `docs/005-panel.md` — the New requirement page's image usage and its limits.

Do not touch `src/app/**`, `src/sources/**`, `tests/local*.spec.ts`, `tests/http.spec.ts`, `docs/007-architecture.md`
(the module/test tables already describe these files) or any other slice's docs.

## Design

### Data kept by the form

`ChosenImage = { name: string; mediaType: string; data: string; bytes: number; preview: string }`, where `data` is
the `FileReader.readAsDataURL` result (usable directly as the thumbnail `src`) and `bytes` is `file.size`. Constants:
`mediaTypes = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']`, `maxCount = 4`, `maxBytes = 5 * 1024 * 1024` —
these mirror `REQUIREMENT_IMAGES` in `src/limits.ts`; import that constant in the client instead of duplicating the
numbers if it does not drag server code into the client bundle (`src/limits.ts` has no imports).

### Picker

A hidden `<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple>` with a stable
`aria-label`/placeholder from the locale key (`discuss.imagesChoose`), plus a visible outline `Button` with the new
`image` icon and the same label. Selecting files:

- read `event.target.files` as a list, then clear `event.target.value` so the same file can be picked again;
- refuse the whole selection when any file's `type` is not one of the four, when any file exceeds 5 MiB, or when the
  current count plus the selection exceeds 4; show the localized message through the existing `notify()` toast and
  add nothing (no request is made);
- otherwise read every file with `FileReader.readAsDataURL` and append the results in selection order.

Each chosen image is a card with `<img src={preview} alt={name}>`, the file name (title attribute for overflow) and
a remove `Button` (`discuss.imagesRemove`, aria-label includes the file name) that drops only that image. A hint line
below the picker states PNG/JPEG/WebP/GIF, ≤5 MiB each, at most 4 (`discuss.imagesHint`).

### Submit

Keep the existing disabled rule based on the trimmed description; images alone do not enable submit. Send:

```ts
{ body: text, project: active.id, ...(images.length ? { images: images.map(({ name, mediaType, data }) => ({ name, mediaType, data })) } : {}) }
```

Nothing is cleared before the promise resolves; on success clear description and images and navigate to the detail.
On failure `notify(errorText(failure))` keeps both — the existing `errorText` already localizes `userError.*` codes.

### Reading and displaying images

Add `requirementImage(issueId, imageId): Promise<Blob>` to `src/client/api.ts` (with `localImageUrl` imported from
`../app/api.ts`): `fetch(localImageUrl(...), { headers: { 'x-orchestrator-request': '1' } })`, throw on `!ok`.
A small `RequirementImage` component in `discuss.tsx` fetches the blob on mount, calls `URL.createObjectURL` when the
component is still mounted, renders `<img className="dt-requirement-image" src={url} alt={image.name}>`, and revokes
the object URL on unmount. While loading (and after a failure) render a neutral placeholder span. The detail maps
`issue.images` in order into `<figure className="dt-image-card">` with the image and a `<figcaption>` naming the file
and the formatted byte size (a small local `formatBytes`: B / KiB / MiB with one decimal, no external dependency).

The list row adds `<span>{t('discuss.imageCount', { count })}</span>` to its meta only when `issue.images?.length`.

### Fixture

- `POST local/issues`: build `images` metadata from the body's images — `id: img-<index+1>`, original `name`,
  `mediaType`, and `bytes` from the decoded base64 length; attach to the created issue only when non-empty.
- `GET local/issues/:id/images/:imageId`: return a `Response` (not the JSON `Reply`) with the stored media type and a
  small byte body (a valid 1×1 PNG is enough); 404 when the issue or image id is unknown.
- Add `refuseIssueCreate?: { status: 400; error: string; code: string; values: Record<string, string> }` to the
  `PanelServer` fixture: when set, the create route returns that refusal and creates nothing.

### Tests (in `tests/panel-discuss.spec.tsx`, reusing its helpers)

Cover at least:

1. select two files → both thumbnails and names render, hint text is there; submit posts
   `images: [{ name, mediaType, data }]` in the same body as `body`/`project` and the detail then shows the images;
2. remove one image before submit → only the remaining image is posted and only it renders in the detail;
3. unsupported type and oversized file → localized toast, no POST, no thumbnail;
4. host refusal on create (`refuseIssueCreate` with `code: 'issueImageType'` and a name) → localized toast, the
   description value and both chosen images are still on the page, and no navigation happened;
5. the list row shows `discuss.imageCount` for an issue with two images and nothing for one without;
6. the image `<img>` is fed a blob URL while the fetch carried `x-orchestrator-request: '1'` (inspect
   `vi.mocked(fetch).mock.calls`; stub `URL.createObjectURL`/`URL.revokeObjectURL` in the test scope).

Use `FileReader`/`File` from jsdom and define `input.files` with `Object.defineProperty` (no `DataTransfer`
dependency). Keep the existing `server.misuse` assertion clean: every fixture route keeps its declared query/body
shape.

## Verify

```
pnpm typecheck
pnpm vitest run tests/panel-discuss.spec.tsx tests/panel-projects.spec.tsx tests/locales.spec.ts tests/styles.spec.ts tests/docs.spec.ts tests/controls.spec.tsx
pnpm check
git diff --check
```

Report changed files, the exact test file/test counts, any assertion adjusted, and confirm the five acceptance
criteria. Do not commit, push or open a PR; the worker reviews, captures the Before/After evidence and delivers.