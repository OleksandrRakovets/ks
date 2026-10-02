import { SparringService } from '@ks/application/server'
import { MatchCommand, MatchId } from '@ks/core'
import { type GameKey, registry } from '@ks/gameplay/definitions'
import { keys } from '@ks/i18n'
import { Predicate } from 'effect'
import * as v from 'valibot'

import type {
  ControlActionData,
  MatchPageData,
  MatchPageDecision,
  ProtocolPageData,
} from '@/features/sparring/match/types'
import { localeFromContext } from '@/i18n'
import type { AppLoadContext } from '@/server/context.server'
import { requireRunEffect } from '@/server/context.server'

type RouteArgs = {
  params: { matchId?: string }
  request: Request
  context: AppLoadContext
}

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

  const result = await requireRunEffect(args.context)(
    SparringService.use((sparring) => sparring.readMatch(matchId, locale, expectedGameKey)),
  )

  if (!result.ok) {
    switch (result.reason) {
      // oxlint-disable-next-line typescript/no-unnecessary-condition -- Keep the single-reason contract exhaustive.
      case 'unknown-match':
        throw new Response('Unknown match', { status: 404 })
      default:
        throw new Error('Unhandled match read failure', { cause: result.reason satisfies never })
    }
  }

  return decideMatchPage({
    ...result,
    shortGameTitle: registry[expectedGameKey].meta.shortGameTitle[locale],
  })
}

async function loadMatchProtocol<K extends GameKey>(args: RouteArgs, expectedGameKey: K) {
  const matchId = matchIdFromParams(args.params)
  const locale = localeFromContext(args.context)

  const result = await requireRunEffect(args.context)(
    SparringService.use((sparring) => sparring.readMatchProtocol(matchId, locale, expectedGameKey)),
  )

  if (!result.ok) {
    switch (result.reason) {
      // oxlint-disable-next-line typescript/no-unnecessary-condition -- Keep the single-reason contract exhaustive.
      case 'unknown-match':
        throw new Response('Unknown match', { status: 404 })
      default:
        throw new Error('Unhandled Protocol read failure', { cause: result.reason satisfies never })
    }
  }

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

  const result = await requireRunEffect(args.context)(
    SparringService.use((sparring) => sparring.submitMatchCommand(matchId, command.output, expectedGameKey)),
  )

  if (!result.ok) {
    switch (result.reason) {
      case 'unknown-match':
        throw new Response('Unknown match', { status: 404 })
      case 'match-finished':
      case 'match-locked':
        return { ok: false, errorKey: keys.match.control.matchLocked }
      case 'invalid-command':
      case 'command-id-conflict':
        return { ok: false, errorKey: keys.match.control.invalidCommandPayload }
      default:
        throw new Error('Unhandled command failure', { cause: result.reason satisfies never })
    }
  }

  if (Predicate.isTagged(result.outcome, 'rejected'))
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
