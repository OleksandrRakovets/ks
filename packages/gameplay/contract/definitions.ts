/** Browser/server shared game contracts; this entrypoint excludes executable XState machines. */
export { GameKey, isGameKey, registry, type GamePresentationFor } from '../src/registry'

export { LongFreePyramidGamePresentation } from '../src/long-free-pyramid/definitions'

export { GameResult } from '../src/constants'

export {
  CombinedPyramidGamePresentation,
  CombinedPyramidOldGamePresentation,
  FreePyramidGamePresentation,
} from '../src/pyramid/definitions'

export { StrilaBall, StrilaGamePresentation, StrilaMeta } from '../src/strila-v2/definitions'
