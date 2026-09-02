import * as v from 'valibot'

export const NonEmptyString = v.pipe(v.string(), v.minLength(1))
export type NonEmptyString = v.InferOutput<typeof NonEmptyString>

export const Integer = v.pipe(v.number(), v.integer())
export type Integer = v.InferOutput<typeof Integer>

export const PositiveInteger = v.pipe(Integer, v.minValue(1))
export type PositiveInteger = v.InferOutput<typeof PositiveInteger>

export const NonNegativeInteger = v.pipe(Integer, v.minValue(0))
export type NonNegativeInteger = v.InferOutput<typeof NonNegativeInteger>

export const UnknownObject = v.pipe(v.objectWithRest({}, v.unknown()), v.readonly())
export type UnknownObject = v.InferOutput<typeof UnknownObject>

export function SizedString(minLength: number, maxLength: number) {
  return v.pipe(v.string(), v.minLength(minLength), v.maxLength(maxLength))
}
