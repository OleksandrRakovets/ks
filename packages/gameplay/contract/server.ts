/** Server-only gameplay execution and restoration API. */
export { GameCommandRejection, GameProtocolEntry, type GameplaySession } from '../src/gameplay-session'

export { parseGameCommand } from '../src/parse-game-command'

export { createGameplaySession, restoreGameplaySession } from '../src/session-factory'

export { GameplayCheckpoint } from '../src/registry'
