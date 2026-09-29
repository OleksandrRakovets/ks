import { MatchCommand, MatchId } from '@ks/core'
import { type GameKey, registry } from '@ks/gameplay/definitions'
import { keys } from '@ks/i18n'
import * as v from 'valibot'

import type {
  ControlActionData,
  MatchPageData,
  MatchPageDecision,
  ProtocolPageData,
} from '@/features/sparring/match/types'
import { localeFromContext } from '@/i18n'
import type { AppLoadContext } from '@/server/context'
import { requireApplication } from '@/server/context'

type RouteArgs = {
  params: { matchId?: string }
  request: Request
  context: AppLoadContext
}

type ControlActionErrorKey = Extract<ControlActionData, { ok: false }>['errorKey']

const SubmittedMatchCommand = v.pipe(v.string(), v.parseJson(), MatchCommand)

function matchIdFromParams(params: RouteArgs['params']): MatchId {
  const matchId = v.safeParse(MatchId, params.matchId)

  if (!matchId.success) throw new Response('Invalid matchId', { status: 400 })

  return matchId.output
}

export async function loadMatchPage<K extends GameKey>(
  args: RouteArgs,
  expectedGameKey: K,
): Promise<MatchPageData<K>> {
  const matchId = matchIdFromParams(args.params)
  const locale = localeFromContext(args.context)
  const result = await requireApplication(args.context).sparring.readMatch(matchId, locale, expectedGameKey)

  if (!result.ok) throw new Response(result.error, { status: result.status })

  return decideMatchPage({
    ...result,
    shortGameTitle: registry[expectedGameKey].meta.shortGameTitle[locale],
  })
}

async function loadMatchProtocol<K extends GameKey>(args: RouteArgs, expectedGameKey: K) {
  const matchId = matchIdFromParams(args.params)
  const locale = localeFromContext(args.context)

  const result = await requireApplication(args.context).sparring.readMatchProtocol(
    matchId,
    locale,
    expectedGameKey,
  )

  if (!result.ok) throw new Response(result.error, { status: result.status })

  return { ...result, shortGameTitle: registry[expectedGameKey].meta.shortGameTitle[locale] }
}

export async function loadMatchProtocolPage<K extends GameKey>(
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

function commandErrorKey(error: string): ControlActionErrorKey {
  if (error === 'unknown-match' || error === 'Unknown match') return keys.match.control.unknownMatch

  if (error === 'match-locked') return keys.match.control.matchLocked

  if (error === 'invalid-command-body' || error === 'command-id-conflict')
    return keys.match.control.invalidCommandPayload

  return keys.match.control.invalidCommandPayload
}

export async function commandMatchAction(
  args: RouteArgs,
  expectedGameKey: GameKey,
): Promise<ControlActionData> {
  const matchId = matchIdFromParams(args.params)
  const form = await args.request.formData()
  const command = v.safeParse(SubmittedMatchCommand, form.get('command'))

  if (!command.success) {
    return { ok: false, errorKey: keys.match.control.invalidCommandPayload }
  }

  const result = await requireApplication(args.context).sparring.submitMatchCommand(
    matchId,
    command.output,
    expectedGameKey,
  )

  if (!result.ok) {
    if (result.status === 404) throw new Response(result.error, { status: 404 })

    if (result.status === 409) return { ok: false, errorKey: keys.match.control.matchLocked }

    if (result.status >= 500) throw new Response(result.error, { status: result.status })

    return { ok: false, errorKey: commandErrorKey(result.error) }
  }

  if (result.outcome._tag === 'rejected')
    return {
      ok: false,
      errorKey:
        result.outcome.reason.code === 'correction-not-available'
          ? keys.match.control.correctionUnavailable
          : keys.match.control.commandRejectedByRules,
    }

  return {
    ok: true,
    acceptedSeqMax: result.outcome.acceptedSeq,
  }
}
