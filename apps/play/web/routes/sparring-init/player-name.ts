export function firstName(displayName: string): string {
  return displayName.trim().split(/\s+/u)[0] ?? displayName
}
