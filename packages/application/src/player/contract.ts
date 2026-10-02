import { Schema, SchemaGetter } from 'effect'

export const DisplayName = Schema.String.pipe(
  Schema.decode({
    decode: SchemaGetter.transform((value) => value.trim().replace(/\s+/g, ' ')),
    encode: SchemaGetter.passthrough(),
  }),
).check(
  Schema.isMinLength(1),
  // "I Lastname" becomes "I. Lastname" when hydrated, so creation reserves one character for the short form.
  Schema.isMaxLength(127),
)
