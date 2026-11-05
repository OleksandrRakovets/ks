/** Browser/server shared application contracts; server adapters are exported from @ks/application/server. */
import type { SparringApplication } from './sparring/contract'

export type Application = { sparring: SparringApplication }

export type {
  HydratedMatchParticipants,
  MatchListEntry,
  MatchListPage,
  MatchReadFacts,
  ReadMatchResult,
  ReadMatchProtocolResult,
} from './sparring/contract'

export { DisplayName } from './player/contract'

export {
  CreateSparringMatchInput,
  MatchListDay,
  MatchScorePollEntry,
  MatchScorePollResponse,
} from './sparring/contract'

export type { LastCommandPresentation } from './match/last-command-projection'

export type { ProtocolMessage, ProtocolRow } from './match/protocol-projection'
