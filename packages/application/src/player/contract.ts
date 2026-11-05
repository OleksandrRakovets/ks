import * as v from 'valibot'

export const DisplayName = v.pipe(
  v.string(),
  v.trim(),
  v.transform((value) => value.replace(/\s+/g, ' ')),
  v.minLength(1),
  // Setup's input cap. The generated short form ("I. Lastname") adds one character, well within core's 128.
  v.maxLength(36),
)

export type DisplayName = v.InferOutput<typeof DisplayName>
