# Requirement snapshot — C2 requirement images

Original request (`q-612052e8`, trigger `f4718412a134de180bf3ef9e9ab9072a`):

> 1 讨论tab 改为 新建需求  新建需求页面 删除 概览 button   2 新建需求 去掉 一句话说明作什么 3 需求列表拆出来单独新增 需求列表列  4 提交需求 需要支持 图片

This slice covers only item 4's server half. Frozen acceptance criteria (from the ticket assignment):

1. `POST local/issues` accepts images (PNG/JPEG/WebP/GIF, ≤5 MiB each, at most 4) in the same request as the requirement; if any image is invalid the whole request is refused, no requirement is created, and a localizable error is returned.
2. Images are written to `<stateDir>/local-images/<issueId>/`; the issue record keeps each image's id, original name, media type and byte count; `GET local/issues/:id` returns that metadata.
3. `GET local/issues/:id/images/:imageId` returns raw bytes with the stored media type (`cache-control: no-store`); unknown ids 404; non-same-origin requests 403.
4. The requirement trigger text contains every image's absolute path; tests prove those paths exist and are valid images.
5. Only the create-requirement route allows a larger request body; every other management route keeps the 128 KiB limit.
6. `pnpm check` passes; tests cover acceptance, refusal (type/size/count), reading and an over-limit request.
