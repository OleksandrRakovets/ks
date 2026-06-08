import * as v from 'valibot'

export const NonEmptyStringSchema = v.pipe(v.string(), v.minLength(1))

export const IntegerSchema = v.pipe(v.number(), v.integer())

export const PositiveIntegerSchema = v.pipe(IntegerSchema, v.minValue(1))

export const NonNegativeIntegerSchema = v.pipe(IntegerSchema, v.minValue(0))

export const UnknownObjectSchema = v.objectWithRest({}, v.unknown())

export function SizedStringSchema(minLength: number, maxLength: number) {
  return v.pipe(v.string(), v.minLength(minLength), v.maxLength(maxLength))
}
