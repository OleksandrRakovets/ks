import { DisplayName } from '@ks/application'
import { Result, Schema } from 'effect'

export function firstName(displayName: string): string {
  return displayName.trim().split(/\s+/u)[0] ?? displayName
}

export function safeNormalizeDisplayName(value: string): string | null {
  const parsed = Schema.decodeUnknownResult(DisplayName)(value)

  return Result.isSuccess(parsed) ? parsed.success : null
}
