import type { CreateMatchInput } from '@ks/application'
import { type Seat, SeatSchema } from '@ks/core'
import { isRegisteredGameKey, registry } from '@ks/gameplay/definitions'
import { keys } from '@ks/i18n'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Form, Link, redirect, useActionData, useLoaderData, useNavigation } from 'react-router'
import * as v from 'valibot'

import { Button } from '@/components/ui'

import type { AppLoadContext } from '../../server/context'
import { requireApplication } from '../../server/context'
import { localeFromCookie } from '../../server/locale'
import { FirstBreakerField, FrameTargetFields, MatchTargetFramesField, PlayerNameFields, RackRolloverField } from './fields'
import { createProfileForGame, type MatchCreateProfile } from './profile'
import { recentPlayerSuggestions, rememberRecentPlayers, useRecentPlayers } from './recent-players'
import { DisplayNameSchema, parsePositiveInt, parseRackRollover, safeNormalizeDisplayName } from './validation'

type LoaderData = {
  gameKey: string
  title: string
  profile: MatchCreateProfile
}

type ActionData = {
  ok: false
  errorKey:
    | typeof keys.match.sparring.errorBothNamesRequired
    | typeof keys.match.sparring.errorNamesMustDiffer
    | typeof keys.match.sparring.errorMatchTargetFramesRequired
    | typeof keys.match.sparring.errorHandicapMustBePositiveInt
    | typeof keys.match.sparring.errorRackRolloverRequired
}

export async function loader({ params, request }: { params: { gameKey?: string }; request: Request }): Promise<LoaderData> {
  const gameKey = params.gameKey
  if (!gameKey || !isRegisteredGameKey(gameKey)) {
    throw new Response('Unknown gameKey', { status: 404 })
  }

  const locale = localeFromCookie(request.headers.get('cookie'))
  return {
    gameKey,
    title: registry[gameKey].meta.title[locale],
    profile: createProfileForGame(gameKey),
  }
}

export async function action({
  params,
  request,
  context,
}: {
  params: { gameKey?: string }
  request: Request
  context: AppLoadContext
}): Promise<ActionData | Response> {
  const gameKey = params.gameKey
  if (!gameKey || !isRegisteredGameKey(gameKey)) {
    throw new Response('Unknown gameKey', { status: 404 })
  }

  const profile = createProfileForGame(gameKey)
  const defaultFrameTargetPointsBySeat = profile.defaultFrameTargetPointsBySeat

  const form = await request.formData()
  const seatAName = v.safeParse(DisplayNameSchema, String(form.get('seatAName') ?? ''))
  const seatBName = v.safeParse(DisplayNameSchema, String(form.get('seatBName') ?? ''))
  const matchTargetFrames =
    profile.matchTargetFrames.mode === 'fixed'
      ? profile.matchTargetFrames.fixedValue
      : parsePositiveInt(form.get('matchTargetFrames'))
  const targetA = parsePositiveInt(form.get('targetA'), defaultFrameTargetPointsBySeat.A)
  const targetB = parsePositiveInt(form.get('targetB'), defaultFrameTargetPointsBySeat.B)
  const firstBreakerSeat = v.safeParse(SeatSchema, form.get('firstBreakerSeat'))
  const rackRollover = profile.rackRollover ? parseRackRollover(form.get('rackRollover')) : null

  if (!seatAName.success || !seatBName.success) {
    return { ok: false, errorKey: keys.match.sparring.errorBothNamesRequired } as const
  }
  if (seatAName.output === seatBName.output) {
    return { ok: false, errorKey: keys.match.sparring.errorNamesMustDiffer } as const
  }
  if (matchTargetFrames == null) {
    return { ok: false, errorKey: keys.match.sparring.errorMatchTargetFramesRequired } as const
  }
  if (targetA == null || targetB == null) {
    return { ok: false, errorKey: keys.match.sparring.errorHandicapMustBePositiveInt } as const
  }
  if (profile.rackRollover && rackRollover == null) {
    return { ok: false, errorKey: keys.match.sparring.errorRackRolloverRequired } as const
  }
  if (!firstBreakerSeat.success) {
    throw new Response('Invalid first breaker', { status: 400 })
  }

  const application = requireApplication(context)
  const createInput: CreateMatchInput = {
    gameKey,
    targets: {
      frameTargetPointsBySeat: {
        A: targetA,
        B: targetB,
      },
      matchTargetFrames,
    },
    firstBreakerSeat: firstBreakerSeat.output,
    playerNames: { A: seatAName.output, B: seatBName.output },
  }
  if (rackRollover) createInput.gameConfiguration = { rackRollover }
  const result = await application.createMatch(createInput)

  if (!result.ok) {
    throw new Response('Could not create match', { status: result.status })
  }

  return redirect(`/sparring/matches/${result.matchId}/`)
}

export const handle = {
  headerConfig: (data: LoaderData) => ({ title: data.title, backTo: '/sparring/' }),
}

export default function SparringInitRoute() {
  const { t } = useTranslation()
  const { profile } = useLoaderData<typeof loader>()
  const actionData = useActionData<typeof action>()
  const navigation = useNavigation()
  const isSubmitting = navigation.state === 'submitting'
  const recentPlayers = useRecentPlayers()
  const [seatAName, setSeatAName] = useState('')
  const [seatBName, setSeatBName] = useState('')
  const [firstBreakerSeat, setFirstBreakerSeat] = useState<Seat | null>(null)

  const normalizedSeatAName = safeNormalizeDisplayName(seatAName)
  const normalizedSeatBName = safeNormalizeDisplayName(seatBName)
  const canShowSettings =
    normalizedSeatAName != null && normalizedSeatBName != null && normalizedSeatAName !== normalizedSeatBName
  const suggestionsA = useMemo(() => recentPlayerSuggestions(recentPlayers, seatBName), [recentPlayers, seatBName])
  const suggestionsB = useMemo(() => recentPlayerSuggestions(recentPlayers, seatAName), [recentPlayers, seatAName])

  function handleSubmit() {
    if (!canShowSettings || firstBreakerSeat === null) return
    rememberRecentPlayers([seatAName, seatBName])
  }

  function handleSeatANameChange(value: string) {
    setSeatAName(value)
    setFirstBreakerSeat(null)
  }

  function handleSeatBNameChange(value: string) {
    setSeatBName(value)
    setFirstBreakerSeat(null)
  }

  return (
    <main className="flex-1 bg-background px-4 py-6 text-foreground">
      <div className="mx-auto w-full max-w-2xl">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">{t(keys.match.sparring.setupTitle)}</h1>
          </div>
          <Button asChild variant="outline">
            <Link to="/sparring/">{t(keys.match.sparring.chooseAnotherGame)}</Link>
          </Button>
        </div>

        <Form method="post" className="grid gap-6" onSubmit={handleSubmit}>
          <PlayerNameFields
            seatAName={seatAName}
            seatBName={seatBName}
            suggestionsA={suggestionsA}
            suggestionsB={suggestionsB}
            onSeatANameChange={handleSeatANameChange}
            onSeatBNameChange={handleSeatBNameChange}
          />

          {canShowSettings ? (
            <div className="grid gap-6">
              <MatchTargetFramesField profile={profile} />
              <RackRolloverField profile={profile} />
              <FirstBreakerField
                playerNames={{ A: normalizedSeatAName, B: normalizedSeatBName }}
                firstBreakerSeat={firstBreakerSeat}
                onFirstBreakerSeatChange={setFirstBreakerSeat}
              />
              <FrameTargetFields
                playerNames={{ A: normalizedSeatAName, B: normalizedSeatBName }}
                defaults={profile.defaultFrameTargetPointsBySeat}
              />
            </div>
          ) : null}

          {actionData?.ok === false ? <p className="text-sm text-destructive">{t(actionData.errorKey)}</p> : null}

          <Button
            type="submit"
            size="touch"
            className="w-full"
            disabled={isSubmitting || !canShowSettings || firstBreakerSeat === null}
          >
            {isSubmitting ? t(keys.match.sparring.creatingMatch) : t(keys.match.sparring.createMatch)}
          </Button>
        </Form>
      </div>
    </main>
  )
}
