/** Browser/server shared application contracts; server adapters are exported from @ks/application/server. */
import type { SparringApplication } from './contracts/sparring'

export type Application = { sparring: SparringApplication }

export type {
  HydratedMatchParticipants,
  MatchListEntry,
  MatchListPage,
  ReadMatchResult,
  ReadMatchProtocolResult,
} from './contracts/sparring'

export {
  CreateSparringMatchInput,
  DisplayName,
  MatchListDay,
  MatchScorePollEntry,
  MatchScorePollResponse,
} from './contracts/sparring'

export type { LastCommandPresentation } from './control'

export type { ProtocolRow } from './protocol'
