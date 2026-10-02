import { SparringService } from '@ks/application/server'
import { MatchCommand, MatchId } from '@ks/core'
import { type GameKey, registry } from '@ks/gameplay/definitions'
import { keys } from '@ks/i18n'
import { Effect, Result, Schema } from 'effect'

import type {
  ControlActionData,
  MatchPageData,
  MatchPageDecision,
  ProtocolPageData,
} from '@/features/sparring/match/types'
import { localeFromContext } from '@/i18n'
import { applicationStorageErrorResponse } from '@/server/application-storage-error.server'
import type { AppLoadContext } from '@/server/context.server'
import { requireRunEffect } from '@/server/context.server'

type RouteArgs = {
  params: { matchId?: string }
  request: Request
  context: AppLoadContext
}

const SubmittedMatchCommand = Schema.fromJsonString(MatchCommand)

function matchIdFromParams(params: RouteArgs['params']): typeof MatchId.Type {
  const matchId = Schema.decodeUnknownResult(MatchId)(params.matchId)

  if (Result.isFailure(matchId)) throw new Response('Invalid matchId', { status: 400 })

  return matchId.success
}

export async function loadMatchPage<K extends typeof GameKey.Type>(
  args: RouteArgs,
  expectedGameKey: K,
): Promise<MatchPageData<K>> {
  const matchId = matchIdFromParams(args.params)
  const locale = localeFromContext(args.context)

  const result = await requireRunEffect(args.context)(
    SparringService.use((sparring) => sparring.readMatch(matchId, locale, expectedGameKey)).pipe(
      Effect.catchTags({
        MatchNotFound: () => Effect.succeed(new Response('Unknown match', { status: 404 })),
        ApplicationStorageError: (error) => Effect.succeed(applicationStorageErrorResponse(error)),
      }),
    ),
  )

  if (result instanceof Response) throw result

  return decideMatchPage({
    ...result,
    shortGameTitle: registry[expectedGameKey].meta.shortGameTitle[locale],
  })
}

async function loadMatchProtocol<K extends typeof GameKey.Type>(args: RouteArgs, expectedGameKey: K) {
  const matchId = matchIdFromParams(args.params)
  const locale = localeFromContext(args.context)

  const result = await requireRunEffect(args.context)(
    SparringService.use((sparring) => sparring.readMatchProtocol(matchId, locale, expectedGameKey)).pipe(
      Effect.catchTags({
        MatchNotFound: () => Effect.succeed(new Response('Unknown match', { status: 404 })),
        ApplicationStorageError: (error) => Effect.succeed(applicationStorageErrorResponse(error)),
      }),
    ),
  )

  if (result instanceof Response) throw result

  return { ...result, shortGameTitle: registry[expectedGameKey].meta.shortGameTitle[locale] }
}

export async function loadMatchProtocolPage<K extends typeof GameKey.Type>(
  args: RouteArgs,
  expectedGameKey: K,
): Promise<ProtocolPageData<K>> {
  const protocol = await loadMatchProtocol(args, expectedGameKey)

  return decideMatchPage(protocol)
}

function decideMatchPage<Data extends { lifecycle: 'active' | 'finished' }>(
  match: Data,
): MatchPageDecision<Data> {
  // SAFETY: lifecycle is the checked discriminant used by both Extract branches.
  return match.lifecycle === 'finished'
    ? { page: 'result', match: match as Extract<Data, { lifecycle: 'finished' }> }
    : { page: 'control', match: match as Extract<Data, { lifecycle: 'active' }> }
}

export async function commandMatchAction(
  args: RouteArgs,
  expectedGameKey: typeof GameKey.Type,
): Promise<ControlActionData> {
  const matchId = matchIdFromParams(args.params)
  const form = await args.request.formData()
  const command = Schema.decodeUnknownResult(SubmittedMatchCommand)(form.get('command'))

  if (Result.isFailure(command)) {
    return { ok: false, errorKey: keys.match.control.invalidCommandPayload }
  }

  const result = await requireRunEffect(args.context)(
    SparringService.use((sparring) =>
      sparring.submitMatchCommand(matchId, command.success, expectedGameKey),
    ).pipe(
      Effect.map(({ acceptedSeq }) => ({ ok: true as const, acceptedSeqMax: acceptedSeq })),
      Effect.catchTags({
        MatchNotFound: () => Effect.succeed(new Response('Unknown match', { status: 404 })),
        MatchFinished: () => Effect.succeed({ ok: false as const, errorKey: keys.match.control.matchLocked }),
        MatchLocked: () => Effect.succeed({ ok: false as const, errorKey: keys.match.control.matchLocked }),
        InvalidMatchCommand: () =>
          Effect.succeed({ ok: false as const, errorKey: keys.match.control.invalidCommandPayload }),
        MatchCommandIdConflict: () =>
          Effect.succeed({ ok: false as const, errorKey: keys.match.control.invalidCommandPayload }),
        MatchCommandRejected: ({ reason }) =>
          Effect.succeed({
            ok: false as const,
            errorKey:
              reason.code === 'correction-not-available'
                ? keys.match.control.correctionUnavailable
                : keys.match.control.commandRejectedByRules,
          }),
        ApplicationStorageError: (error) => Effect.succeed(applicationStorageErrorResponse(error)),
      }),
    ),
  )

  if (result instanceof Response) throw result

  return result
}
