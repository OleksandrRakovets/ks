import { DisplayName } from '@ks/application'
import * as v from 'valibot'

import type { RackRolloverOption } from './profile'

export function safeNormalizeDisplayName(value: string): string | null {
  const parsed = v.safeParse(DisplayName, value)
  return parsed.success ? parsed.output : null
}

export function parsePositiveInt(raw: FormDataEntryValue | null, fallback?: number): number | null {
  if (raw == null || raw === '') return fallback ?? null
  const parsed = Number(raw)
  if (!Number.isInteger(parsed) || parsed <= 0) return null
  return parsed
}

export function parseRackRollover(raw: FormDataEntryValue | null): RackRolloverOption | null {
  const parsed = Number(raw)
  if (parsed === 14 || parsed === 15) return parsed
  return null
}
