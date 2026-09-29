export {
  GameKey,
  isGameKey,
  listGameKeys,
  registry,
  type GamePresentationFor,
  type GameCommandFor,
} from '../src/registry'

export {
  type LongFreePyramidGamePresentation,
  LongFreePyramidResult,
} from '../src/long-free-pyramid/definitions'

/** Optional game-owned result accompanying a finished Match; other games currently have none. */
export { LongFreePyramidResult as GameResult } from '../src/long-free-pyramid/definitions'

export {
  type CombinedPyramidGamePresentation,
  type CombinedPyramidOldGamePresentation,
  type FreePyramidGamePresentation,
} from '../src/pyramid/definitions'

export { StrilaMeta, type StrilaBall, type StrilaGamePresentation } from '../src/strila-v2/definitions'
