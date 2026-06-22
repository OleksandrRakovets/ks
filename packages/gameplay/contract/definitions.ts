export {
  GameCommandPresetSchema,
  GameControlCommandSchema,
  GameControlProjectionSchema,
  GameProjectionKeySchema,
  GameScoreboardProjectionSchema,
  GameSummaryProjectionSchema,
  type GameCommandResult,
  type GameControlCommand,
  type GameControlProjection,
  type GameCreateStateArgs,
  type GameInputMode,
  type GameMeta,
  type GameProjectionKey,
  type LocalizedGameTitle,
  deriveGameCommandSections,
} from '../src/constants'
export { getGameMeta, isRegisteredGameKey, listGameKeys, registry, type RegisteredGameKey } from '../src/registry'
export {
  LongFreePyramidControlDetailsSchema,
  LongFreePyramidControlViewSchema,
  LongFreePyramidRackSchema,
  type LongFreePyramidControlDetails,
  type LongFreePyramidControlView,
} from '../src/long-free-pyramid/definitions'
export { PyramidControlViewSchema } from '../src/pyramid/definitions'
export {
  StrilaControlDetailsSchema,
  StrilaControlViewSchema,
  StrilaMeta,
  StrilaCommandSchema,
  StrilaProtocolEntrySchema,
  type StrilaBall,
  type StrilaCommand,
  type StrilaControlDetails,
  type StrilaControlView,
  type StrilaProtocolEntry,
} from '../src/strila-v2/definitions'
