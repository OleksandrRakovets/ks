import type { MatchRejection } from '@ks/competition'
import { Data } from 'effect'

export class InvalidMatchInput extends Data.TaggedError('InvalidMatchInput') {}

export class MatchInitializationConflict extends Data.TaggedError('MatchInitializationConflict') {}

export class MatchNotFound extends Data.TaggedError('MatchNotFound') {}

export class MatchFinished extends Data.TaggedError('MatchFinished') {}

export class MatchLocked extends Data.TaggedError('MatchLocked') {}

export class InvalidMatchCommand extends Data.TaggedError('InvalidMatchCommand') {}

export class MatchCommandIdConflict extends Data.TaggedError('MatchCommandIdConflict') {}

export class MatchCommandRejected extends Data.TaggedError('MatchCommandRejected')<{
  readonly reason: typeof MatchRejection.Type
}> {}
