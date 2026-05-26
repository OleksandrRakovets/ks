export { createInitialGameState, applyGameCommand, deriveGameProjection, parseGameKey } from './gameplay'
export { opponentOf } from '@ks/core'
export { GameControlProjectionSchema } from './abstract-runtime'
export {
  StrilaControlDetailsSchema,
  StrilaControlViewSchema,
  StrilaMeta,
  StrilaCommandSchema,
  type StrilaBall,
  type StrilaCommand,
  type StrilaControlDetails,
  type StrilaControlView,
} from './strila-v2/definitions'
export { PyramidControlViewSchema } from './pyramid/runtime'
export { getGameMeta, isRegisteredGameKey, listGameKeys, registry, type RegisteredGameKey } from './registry'
export { StrilaGameplayRuntime, StrilaFrameStateSchema, type StrilaFrameState } from './strila-v2/runtime'
