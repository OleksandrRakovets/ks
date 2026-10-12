import { MatchCommand, MatchId } from '@ks/core'
import { type GameKey, registry } from '@ks/gameplay/definitions'
import { keys } from '@ks/i18n'
import { redirect } from 'react-router'
import * as v from 'valibot'

import type {
  ControlActionData,
  MatchPageData,
  MatchPageDecision,
  ProtocolPageData,
} from '@/features/sparring/match/types'
import { localeFromContext, localizedPath } from '@/i18n'
import type { AppLoadContext } from '@/server/context.server'
import { requireApplication } from '@/server/context.server'
import { noticeCookie } from '@/server/notice.server'

type RouteArgs = {
  params: { matchId?: string }
  request: Request
  context: AppLoadContext
}

const SubmittedMatchCommand = v.pipe(v.string(), v.parseJson(), MatchCommand)

export async function loadMatchPage<K extends GameKey>(
  args: RouteArgs,
  expectedGameKey: K,
): Promise<MatchPageData<K>> {
  const matchId = matchIdFromParams(args.params)
  const locale = localeFromContext(args.context)
  const result = await requireApplication(args.context).sparring.readMatch(matchId, locale, expectedGameKey)

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

export async function loadMatchProtocolPage<K extends GameKey>(
  args: RouteArgs,
  expectedGameKey: K,
): Promise<ProtocolPageData<K>> {
  const protocol = await loadMatchProtocol(args, expectedGameKey)

  return decideMatchPage(protocol)
}

/** Match page action: a single `intent=discard` field selects discard; otherwise the form carries one Command. */
export async function matchAction(
  args: RouteArgs,
  expectedGameKey: GameKey,
): Promise<ControlActionData | Response> {
  const matchId = matchIdFromParams(args.params)
  const form = await args.request.formData()

  if (!form.has('intent')) return commandMatchAction(args.context, matchId, form, expectedGameKey)

  if (form.getAll('intent').length !== 1 || form.get('intent') !== 'discard' || form.has('command'))
    return { ok: false, errorKey: keys.match.control.invalidCommandPayload }

  return discardMatchAction(args.context, matchId, expectedGameKey)
}

async function commandMatchAction(
  context: AppLoadContext,
  matchId: MatchId,
  form: FormData,
  expectedGameKey: GameKey,
): Promise<ControlActionData> {
  const command = v.safeParse(SubmittedMatchCommand, form.get('command'))

  if (!command.success) {
    return { ok: false, errorKey: keys.match.control.invalidCommandPayload }
  }

  const result = await requireApplication(context).sparring.submitMatchCommand(
    matchId,
    command.output,
    expectedGameKey,
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

async function discardMatchAction(
  context: AppLoadContext,
  matchId: MatchId,
  expectedGameKey: GameKey,
): Promise<ControlActionData | Response> {
  const result = await requireApplication(context).sparring.discardMatch(matchId, expectedGameKey)

  if (!result.ok) {
    switch (result.reason) {
      case 'unknown-match':
        throw new Response('Unknown match', { status: 404 })
      case 'match-locked':
        return { ok: false, errorKey: keys.match.control.matchLocked }
      default:
        throw new Error('Unhandled discard failure', { cause: result.reason satisfies never })
    }
  }

  return redirect(localizedPath('/sparring/', localeFromContext(context)), {
    status: 303,
    headers: { 'Set-Cookie': noticeCookie('match-discarded') },
  })
}

function matchIdFromParams(params: RouteArgs['params']): MatchId {
  const matchId = v.safeParse(MatchId, params.matchId)

  if (!matchId.success) throw new Response('Invalid matchId', { status: 400 })

  return matchId.output
}

async function loadMatchProtocol<K extends GameKey>(args: RouteArgs, expectedGameKey: K) {
  const matchId = matchIdFromParams(args.params)
  const locale = localeFromContext(args.context)

  const result = await requireApplication(args.context).sparring.readMatchProtocol(
    matchId,
    locale,
    expectedGameKey,
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

function decideMatchPage<Data extends { lifecycle: 'active' | 'finished' }>(
  match: Data,
): MatchPageDecision<Data> {
  // SAFETY: lifecycle is the checked discriminant used by both Extract branches.
  return match.lifecycle === 'finished'
    ? { page: 'result', match: match as Extract<Data, { lifecycle: 'finished' }> }
    : { page: 'control', match: match as Extract<Data, { lifecycle: 'active' }> }
}
