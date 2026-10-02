import { Schema } from 'effect'

export const NonEmptyString = Schema.String.check(Schema.isMinLength(1))

// isInt requires safe integers; existing contracts accept all represented integers.
export const Integer = Schema.Number.check(Schema.makeFilter(Number.isInteger, { expected: 'an integer' }))

export const PositiveInteger = Integer.check(Schema.isGreaterThanOrEqualTo(1))

export const NonNegativeInteger = Integer.check(Schema.isGreaterThanOrEqualTo(0))

export const UnknownObject = Schema.Record(Schema.String, Schema.Unknown)

export function SizedString(minLength: number, maxLength: number) {
  return Schema.String.check(Schema.isMinLength(minLength), Schema.isMaxLength(maxLength))
}

/** Checks closed object keys before Struct decoding can strip them; nested schemas retain their own policies. */
export function StrictStruct<const Fields extends Schema.Struct.Fields>(fields: Fields) {
  return Schema.ObjectKeyword.check(Schema.isPropertyNames(Schema.Literals(Object.keys(fields)))).pipe(
    Schema.decodeTo(Schema.Struct(fields)),
  )
}
