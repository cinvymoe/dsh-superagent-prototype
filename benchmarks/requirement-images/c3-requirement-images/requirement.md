# Requirement snapshot · C3 · panel requirement images

Alignment: `q-612052e8` — original trigger:

> 1 讨论tab 改为 新建需求  新建需求页面 删除 概览 button   2 新建需求 去掉 一句话说明作什么 3 需求列表拆出来单独新增 需求列表列  4 提交需求 需要支持 图片

Slice C3 (frozen acceptance):

1. The submit form has an image picker (multi-select PNG/JPEG/WebP/GIF); chosen images show a thumbnail and file name and can be removed before submitting; the form shows type, size and count limits.
2. Submitting sends description and images in the same create request; the detail shows the images in order; the list row shows the image count.
3. The client refuses unsupported types or over-limit files with a localized message and does not submit; a host refusal keeps the typed description and chosen images and shows the localized error.
4. Images are read through the management API with the same-origin header; no new unauthenticated image URL; they display normally in the detail.
5. `pnpm check` passes; panel tests cover select/remove/submit/display/refusal; the PR carries Before/After captures of the submit form with images and the detail display.
