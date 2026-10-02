import { type CreateSparringMatchInput, DisplayName } from '@ks/application'
import { SparringService } from '@ks/application/server'
import { PositiveInteger, Seat } from '@ks/core'
import { isGameKey, registry } from '@ks/gameplay/definitions'
import { Effect, Result, Schema } from 'effect'
import { redirect } from 'react-router'

import {
  createProfileForGame,
  type MatchCreateProfile,
  type RackRolloverOption,
} from '@/features/sparring/setup/profile'
import { matchUrl } from '@/features/sparring/urls'
import { localeFromContext } from '@/i18n'
import { applicationStorageErrorResponse } from '@/server/application-storage-error.server'
import type { AppLoadContext } from '@/server/context.server'
import { requireRunEffect } from '@/server/context.server'

type LoaderData = {
  title: string
  profile: MatchCreateProfile
  initialPlayerNames: { A: string; B: string }
}

const QueryPositiveInteger = Schema.String.check(Schema.isPattern(/^[1-9]\d*$/)).pipe(
  Schema.decodeTo(Schema.NumberFromString),
  Schema.decodeTo(PositiveInteger),
)

const RematchSetupQuery = Schema.Struct({
  seatAName: DisplayName,
  seatBName: DisplayName,
  matchTargetFrames: QueryPositiveInteger,
  targetA: QueryPositiveInteger,
  targetB: QueryPositiveInteger,
}).check(Schema.makeFilter(({ seatAName, seatBName }) => seatAName !== seatBName))

export async function loadSetupPage({
  params,
  request,
  context,
}: {
  params: { gameKey?: string }
  request: Request
  context: AppLoadContext
}): Promise<LoaderData> {
  const gameKey = params.gameKey

  if (gameKey === undefined || !isGameKey(gameKey)) {
    throw new Response('Unknown gameKey', { status: 404 })
  }

  const locale = localeFromContext(context)
  const profile = createProfileForGame(gameKey)
  const rematch = rematchSetupFromUrl(request.url, profile)

  return {
    title: registry[gameKey].meta.title[locale],
    profile: rematch === null ? profile : profileWithRematchDefaults(profile, rematch),
    initialPlayerNames: rematch?.playerNames ?? { A: '', B: '' },
  }
}

function rematchSetupFromUrl(
  url: string,
  profile: MatchCreateProfile,
): Pick<typeof CreateSparringMatchInput.Type, 'playerNames' | 'targets' | 'gameConfiguration'> | null {
  const search = new URL(url).searchParams

  if (search.get('rematch') !== '1') return null

  const parsed = Schema.decodeUnknownResult(RematchSetupQuery)({
    seatAName: search.get('seatAName'),
    seatBName: search.get('seatBName'),
    matchTargetFrames: search.get('matchTargetFrames'),
    targetA: search.get('targetA'),
    targetB: search.get('targetB'),
  })

  if (Result.isFailure(parsed)) return null

  if (
    profile.matchTargetFrames.mode === 'fixed' &&
    parsed.success.matchTargetFrames !== profile.matchTargetFrames.fixedValue
  )
    return null

  const rackRollover = parseRackRollover(search.get('rackRollover'))

  if (profile.rackRollover ? rackRollover === null : search.has('rackRollover')) return null

  const rematch = {
    playerNames: { A: parsed.success.seatAName, B: parsed.success.seatBName },
    targets: {
      matchTargetFrames: parsed.success.matchTargetFrames,
      frameTargetPointsBySeat: { A: parsed.success.targetA, B: parsed.success.targetB },
    },
  }

  return rackRollover === null ? rematch : { ...rematch, gameConfiguration: { rackRollover } }
}

function profileWithRematchDefaults(
  profile: MatchCreateProfile,
  rematch: Pick<typeof CreateSparringMatchInput.Type, 'playerNames' | 'targets' | 'gameConfiguration'>,
): MatchCreateProfile {
  const defaults: MatchCreateProfile = {
    ...profile,
    defaultFrameTargetPointsBySeat: rematch.targets.frameTargetPointsBySeat,
    matchTargetFrames:
      profile.matchTargetFrames.mode === 'fixed'
        ? profile.matchTargetFrames
        : { ...profile.matchTargetFrames, defaultValue: rematch.targets.matchTargetFrames },
  }

  if (!profile.rackRollover || !rematch.gameConfiguration?.rackRollover) return defaults

  return {
    ...defaults,
    rackRollover: { ...profile.rackRollover, defaultValue: rematch.gameConfiguration.rackRollover },
  }
}

export async function createSetupMatch({
  params,
  request,
  context,
}: {
  params: { gameKey?: string }
  request: Request
  context: AppLoadContext
}): Promise<Response> {
  const gameKey = params.gameKey

  if (gameKey === undefined || !isGameKey(gameKey)) {
    throw new Response('Unknown gameKey', { status: 404 })
  }

  const profile = createProfileForGame(gameKey)

  const form = await request.formData()
  const seatAName = Schema.decodeUnknownResult(DisplayName)(stringFormValue(form, 'seatAName'))
  const seatBName = Schema.decodeUnknownResult(DisplayName)(stringFormValue(form, 'seatBName'))

  const matchTargetFrames =
    profile.matchTargetFrames.mode === 'fixed'
      ? profile.matchTargetFrames.fixedValue
      : parsePositiveInt(form.get('matchTargetFrames'))

  const targetA = parsePositiveInt(form.get('targetA'))
  const targetB = parsePositiveInt(form.get('targetB'))
  const firstBreakerSeat = Schema.decodeUnknownResult(Seat)(form.get('firstBreakerSeat'))
  const rackRollover = profile.rackRollover ? parseRackRollover(form.get('rackRollover')) : null

  if (Result.isFailure(seatAName) || Result.isFailure(seatBName)) {
    throwInvalidSetup()
  }

  if (seatAName.success === seatBName.success) {
    throwInvalidSetup()
  }

  if (matchTargetFrames == null) {
    throwInvalidSetup()
  }

  if (targetA == null || targetB == null) {
    throwInvalidSetup()
  }

  if (profile.rackRollover && rackRollover == null) {
    throwInvalidSetup()
  }

  if (Result.isFailure(firstBreakerSeat)) {
    throwInvalidSetup()
  }

  const createInputBase = {
    gameKey,
    targets: {
      frameTargetPointsBySeat: {
        A: targetA,
        B: targetB,
      },
      matchTargetFrames,
    },
    firstBreakerSeat: firstBreakerSeat.success,
    playerNames: { A: seatAName.success, B: seatBName.success },
  }

  const createInput: typeof CreateSparringMatchInput.Type = rackRollover
    ? { ...createInputBase, gameConfiguration: { rackRollover } }
    : createInputBase

  const result = await requireRunEffect(context)(
    SparringService.use((sparring) => sparring.createMatch(createInput)).pipe(
      Effect.map(({ matchId }) => redirect(matchUrl(gameKey, matchId, localeFromContext(context)))),
      Effect.catchTags({
        InvalidMatchInput: () => Effect.succeed(new Response('Could not create match', { status: 400 })),
        MatchInitializationConflict: () =>
          Effect.succeed(new Response('Could not create match', { status: 409 })),
        ApplicationStorageError: (error) => Effect.succeed(applicationStorageErrorResponse(error)),
      }),
    ),
  )

  if (result.status !== 302) throw result

  return result
}

function stringFormValue(form: FormData, key: string): string {
  const value = Schema.decodeUnknownResult(Schema.String)(form.get(key))

  return Result.isSuccess(value) ? value.success : ''
}

function parsePositiveInt(raw: FormDataEntryValue | null): number | null {
  if (raw == null || raw === '') return null
  const parsed = Number(raw)

  if (!Number.isInteger(parsed) || parsed <= 0) return null

  return parsed
}

function parseRackRollover(raw: FormDataEntryValue | null): RackRolloverOption | null {
  const parsed = Number(raw)

  if (parsed === 14 || parsed === 15) return parsed

  return null
}

/** The UI prevents invalid submissions; this rejects forged or stale payloads at the HTTP boundary. */
function throwInvalidSetup(): never {
  throw new Response('Invalid match setup', { status: 400 })
}
