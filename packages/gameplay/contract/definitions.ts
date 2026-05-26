export {
  GameCommandPresetSchema,
  GameControlProjectionSchema,
  GameProjectionKeySchema,
  GameScoreboardProjectionSchema,
  GameSummaryProjectionSchema,
  type GameCommandResult,
  type GameCreateStateArgs,
  type GameInputMode,
  type GameMeta,
  type GameProjectionKey,
  type LocalizedGameTitle,
} from '../src/constants'
export { getGameMeta, isRegisteredGameKey, listGameKeys, registry, type RegisteredGameKey } from '../src/registry'
export { PyramidControlViewSchema } from '../src/pyramid/definitions'
export {
  StrilaControlDetailsSchema,
  StrilaControlViewSchema,
  StrilaMeta,
  StrilaCommandSchema,
  type StrilaBall,
  type StrilaCommand,
  type StrilaControlDetails,
  type StrilaControlView,
} from '../src/strila-v2/definitions'
