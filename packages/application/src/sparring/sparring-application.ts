import type { Clock, MatchId } from '@ks/core'

import type { MatchRoomClient } from '../match/match-room'
import type { PlayerStorage } from '../player/storage/player-storage'
import { admitMatchLive } from './admit-live'
import type { SparringApplication } from './contract'
import { createMatch } from './create-match'
import { listFinishedMatches, listLiveMatches, readMatchScores } from './list-matches'
import { readMatch, readMatchProtocol } from './read-match'
import type { SparringMatchStorage } from './storage/sparring-match-storage'
import { submitMatchCommand } from './submit-command'

export type SparringDependencies = {
  clock: Clock
  newMatchId(): MatchId
  newControlSecret(): string
  players: Pick<PlayerStorage, keyof PlayerStorage>
  matches: Pick<SparringMatchStorage, keyof SparringMatchStorage>
  matchRoomClient(matchId: MatchId): MatchRoomClient
}

export function createSparringApplication(deps: SparringDependencies): SparringApplication {
  return {
    createMatch: (input) => createMatch(deps, input),
    listLiveMatches: (locale) => listLiveMatches(deps, locale),
    listFinishedMatches: (locale, day) => listFinishedMatches(deps, locale, day),
    readMatchScores: (matchIds) => readMatchScores(deps, matchIds),
    readMatch: (matchId, locale, expectedGameKey) => readMatch(deps, matchId, locale, expectedGameKey),
    submitMatchCommand: (matchId, command, expectedGameKey) =>
      submitMatchCommand(deps, matchId, command, expectedGameKey),
    readMatchProtocol: (matchId, locale, expectedGameKey) =>
      readMatchProtocol(deps, matchId, locale, expectedGameKey),
    admitMatchLive: (matchId) => admitMatchLive(deps, matchId),
  }
}
