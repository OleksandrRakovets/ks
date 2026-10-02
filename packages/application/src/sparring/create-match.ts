import type { CreateMatchRequest } from '@ks/competition'
import * as v from 'valibot'

import type { MatchRoomInitializationInput } from '../match/match-room'
import { splitGuestDisplayName } from '../player/participant'
import { CreateSparringMatchInput, type CreateSparringMatchResult } from './contract'
import type { SparringDependencies } from './sparring-application'

export async function createMatch(
  deps: SparringDependencies,
  input: CreateSparringMatchInput,
): Promise<CreateSparringMatchResult> {
  const parsed = v.safeParse(CreateSparringMatchInput, input)

  if (!parsed.success) return { ok: false, reason: 'invalid-input' }
  const matchId = deps.newMatchId()
  const controlSecret = deps.newControlSecret()
  const createdAt = deps.clock.nowMs()
  const { playerNames, ...requestInput } = parsed.output

  const [seatAPlayerRef, seatBPlayerRef] = await Promise.all([
    deps.players.ensureGuestRef(splitGuestDisplayName(playerNames.A)),
    deps.players.ensureGuestRef(splitGuestDisplayName(playerNames.B)),
  ])

  const participants: CreateMatchRequest['participants'] = [
    { seat: 'A', playerRef: seatAPlayerRef },
    { seat: 'B', playerRef: seatBPlayerRef },
  ]

  const request: MatchRoomInitializationInput = {
    ...requestInput,
    participants,
    matchId,
    controlSecret,
    createdAt,
  }

  await deps.matches.beginCreation({
    matchId,
    gameKey: request.gameKey,
    participantRefs: { A: seatAPlayerRef, B: seatBPlayerRef },
    createdAt,
  })
  const result = await deps.matchRoomClient(matchId).initialize(request)

  if (result._tag === 'initialization-conflict') return { ok: false, reason: 'initialization-conflict' }
  await deps.matches.activate(matchId)

  return { ok: true, matchId }
}
