export { createInitialGameState, applyGameCommand, deriveGameProjection, parseGameKey } from './gameplay'
export { GameControlProjectionSchema } from './abstract-runtime'
export {
  STRILA_BALLS,
  STRILA_COLORED_BALLS,
  StrilaControlDetailsSchema,
  StrilaControlViewSchema,
  type StrilaBall,
  type StrilaControlDetails,
  type StrilaControlView,
} from './strila-v2/definitions'
export { PyramidControlViewSchema } from './pyramid/runtime'
export { getGameMeta, isRegisteredGameKey, listGameKeys, registry, type RegisteredGameKey } from './registry'
export { StrilaGameplayRuntime, StrilaFrameStateSchema, type StrilaFrameState } from './strila-v2/runtime'
export { StrilaEventSchema, type StrilaEvent } from './strila-v2/definitions'
