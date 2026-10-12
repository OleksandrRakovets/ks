import { DisplayName } from '@ks/application'
import * as v from 'valibot'

export function firstName(displayName: string): string {
  return displayName.trim().split(/\s+/u)[0] ?? displayName
}

export function safeNormalizeDisplayName(value: string): string | null {
  const parsed = v.safeParse(DisplayName, value)

  return parsed.success ? parsed.output : null
}
