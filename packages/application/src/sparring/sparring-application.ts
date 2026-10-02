import { Context, Effect } from 'effect'

import { ApplicationClock } from '../match/clock'
import { MatchRooms } from '../match/match-room'
import { PlayerStorage } from '../player/storage/player-storage'
import { admitMatchLive } from './admit-live'
import type { SparringApplication } from './contract'
import { createMatch, MatchCreation } from './create-match'
import { listFinishedMatches, listLiveMatches, readMatchScores } from './list-matches'
import { readMatch, readMatchProtocol } from './read-match'
import { SparringMatchStorage } from './storage/sparring-match-storage'
import { submitMatchCommand } from './submit-command'

type SparringContext = ApplicationClock | MatchCreation | MatchRooms | PlayerStorage | SparringMatchStorage

export function createSparringApplication(context: Context.Context<SparringContext>): SparringApplication {
  const run = Effect.runPromiseWith(context)

  return {
    createMatch: (input) => run(createMatch(input)),
    listLiveMatches: (locale) => run(listLiveMatches(locale)),
    listFinishedMatches: (locale, day) => run(listFinishedMatches(locale, day)),
    readMatchScores: (matchIds) => run(readMatchScores(matchIds)),
    readMatch: (matchId, locale, expectedGameKey) => run(readMatch(matchId, locale, expectedGameKey)),
    submitMatchCommand: (matchId, command, expectedGameKey) =>
      run(submitMatchCommand(matchId, command, expectedGameKey)),
    readMatchProtocol: (matchId, locale, expectedGameKey) =>
      run(readMatchProtocol(matchId, locale, expectedGameKey)),
    admitMatchLive: (matchId) => run(admitMatchLive(matchId)),
  }
}
