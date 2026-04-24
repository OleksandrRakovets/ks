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
export { getGameMeta, isRegisteredGameKey, listGameKeys, registry, type RegisteredGameKey } from './registry'
