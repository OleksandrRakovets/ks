import * as v from 'valibot'

export const DisplayName = v.pipe(
  v.string(),
  v.trim(),
  v.transform((value) => value.replace(/\s+/g, ' ')),
  v.minLength(1),
  // "I Lastname" becomes "I. Lastname" when hydrated, so creation reserves one character for the short form.
  v.maxLength(127),
)

export type DisplayName = v.InferOutput<typeof DisplayName>
