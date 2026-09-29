/** Browser/server shared game contracts; this entrypoint excludes executable XState machines. */
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

export { GameResult } from '../src/constants'

export {
  type CombinedPyramidGamePresentation,
  type CombinedPyramidOldGamePresentation,
  type FreePyramidGamePresentation,
} from '../src/pyramid/definitions'

export { StrilaMeta, type StrilaBall, type StrilaGamePresentation } from '../src/strila-v2/definitions'
