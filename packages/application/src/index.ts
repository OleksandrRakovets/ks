/** Browser/server shared application contracts; server adapters are exported from @ks/application/server. */
export type {
  MatchListEntry,
  MatchListPage,
  MatchReadFacts,
  ReadMatchResult,
  ReadMatchProtocolResult,
} from './sparring/contract'

export { DisplayName } from './player/contract'

export {
  CreateSparringMatchInput,
  HydratedMatchParticipants,
  MatchListDay,
  MatchScorePollEntry,
  MatchScorePollResponse,
} from './sparring/contract'

export type { LastCommandPresentation } from './match/last-command-projection'

export type { ProtocolRow } from './match/protocol-projection'
