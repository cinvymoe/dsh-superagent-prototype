/** Validation bounds shared between host schemas and management panel forms. */
export const LIMITS = {
  ruleName: 100,
  ruleInstruction: 2000,
  evalTimeoutSeconds: { min: 30, max: 600 },
  maxWorkers: { min: 1, max: 16 },
  prepareCommand: 4000,
  promptMaxChars: { min: 1000, max: 1_000_000 },
  admissionContextMaxPages: { min: 1, max: 100 },
  admissionContextTimeoutMs: { min: 1, max: 90_000 },
} as const

/** Requirement images: at most four attached to one requirement, at most 5 MiB decoded each, and their accepted media types. */
export const REQUIREMENT_IMAGES = {
  count: 4,
  bytes: 5 * 1024 * 1024,
  mediaTypes: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] as const,
} as const
export type RequirementImageMediaType = typeof REQUIREMENT_IMAGES.mediaTypes[number]

/** Largest management request body: the create-requirement route alone carries images, base64-encoded in JSON. */
export const REQUIREMENT_BODY_BYTES = 32 * 1024 * 1024
