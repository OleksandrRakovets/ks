import { Data } from 'effect'

/** Storage failed; the adapter-specific cause is retained for server diagnostics, not browser responses. */
export class ApplicationStorageError extends Data.TaggedError('ApplicationStorageError')<{
  readonly cause: unknown
}> {}
