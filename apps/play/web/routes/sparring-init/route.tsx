import { type CreateMatchInput, DisplayName } from '@ks/application'
import { Seat } from '@ks/core'
import { isRegisteredGameKey, registry } from '@ks/gameplay/definitions'
import { keys } from '@ks/i18n'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Form, redirect, useLoaderData, useNavigation } from 'react-router'
import * as v from 'valibot'

import { Page } from '@/components/Page'
import { Button } from '@/components/ui'

import { matchControlUrl } from '../../features/match-urls'
import { localeFromContext, localizedPath } from '../../locale'
import { useRootLocale } from '../../root'
import type { AppLoadContext } from '../../server/context'
import { requireApplication } from '../../server/context'
import {
  FirstBreakerField,
  FrameTargetFields,
  MatchTargetFramesField,
  PlayerNameFields,
  RackRolloverField,
} from './fields'
import { createProfileForGame, type MatchCreateProfile } from './profile'
import { recentPlayerSuggestions, rememberRecentPlayers, useRecentPlayers } from './recent-players'
import { parsePositiveInt, parseRackRollover, safeNormalizeDisplayName } from './validation'

type LoaderData = {
  title: string
  profile: MatchCreateProfile
}

export async function loader({
  params,
  context,
}: {
  params: { gameKey?: string }
  context: AppLoadContext
}): Promise<LoaderData> {
  const gameKey = params.gameKey

  if (gameKey === undefined || !isRegisteredGameKey(gameKey)) {
    throw new Response('Unknown gameKey', { status: 404 })
  }

  const locale = localeFromContext(context)

  return {
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
}): Promise<Response> {
  const gameKey = params.gameKey

  if (gameKey === undefined || !isRegisteredGameKey(gameKey)) {
    throw new Response('Unknown gameKey', { status: 404 })
  }

  const profile = createProfileForGame(gameKey)

  const form = await request.formData()
  const seatAName = v.safeParse(DisplayName, stringFormValue(form, 'seatAName'))
  const seatBName = v.safeParse(DisplayName, stringFormValue(form, 'seatBName'))

  const matchTargetFrames =
    profile.matchTargetFrames.mode === 'fixed'
      ? profile.matchTargetFrames.fixedValue
      : parsePositiveInt(form.get('matchTargetFrames'))

  const targetA = parsePositiveInt(form.get('targetA'))
  const targetB = parsePositiveInt(form.get('targetB'))
  const firstBreakerSeat = v.safeParse(Seat, form.get('firstBreakerSeat'))
  const rackRollover = profile.rackRollover ? parseRackRollover(form.get('rackRollover')) : null

  if (!seatAName.success || !seatBName.success) {
    throwInvalidSetup()
  }

  if (seatAName.output === seatBName.output) {
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

  if (!firstBreakerSeat.success) {
    throwInvalidSetup()
  }

  const application = requireApplication(context)

  const createInputBase = {
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

  const createInput: CreateMatchInput = rackRollover
    ? { ...createInputBase, gameConfiguration: { rackRollover } }
    : createInputBase

  const result = await application.createMatch(createInput)

  if (!result.ok) {
    throw new Response('Could not create match', { status: result.status })
  }

  return redirect(matchControlUrl(gameKey, result.matchId, localeFromContext(context)))
}

function stringFormValue(form: FormData, key: string): string {
  const value = v.safeParse(v.string(), form.get(key))

  return value.success ? value.output : ''
}

/** The UI prevents invalid submissions; this rejects forged or stale payloads at the HTTP boundary. */
function throwInvalidSetup(): never {
  throw new Response('Invalid match setup', { status: 400 })
}

export default function SparringInitRoute() {
  const { t } = useTranslation()
  const locale = useRootLocale()
  const { profile, title } = useLoaderData<typeof loader>()
  const navigation = useNavigation()
  const isPending = navigation.state !== 'idle'
  const recentPlayers = useRecentPlayers()
  const [seatAName, setSeatAName] = useState('')
  const [seatBName, setSeatBName] = useState('')
  const [firstBreakerSeat, setFirstBreakerSeat] = useState<Seat | null>(null)
  const [hasValidInputs, setHasValidInputs] = useState(false)

  const normalizedSeatAName = safeNormalizeDisplayName(seatAName)
  const normalizedSeatBName = safeNormalizeDisplayName(seatBName)

  const canShowSettings =
    normalizedSeatAName != null && normalizedSeatBName != null && normalizedSeatAName !== normalizedSeatBName

  const suggestionsA = useMemo(
    () => recentPlayerSuggestions(recentPlayers, seatBName),
    [recentPlayers, seatBName],
  )

  const suggestionsB = useMemo(
    () => recentPlayerSuggestions(recentPlayers, seatAName),
    [recentPlayers, seatAName],
  )

  function handleSubmit() {
    if (!canShowSettings || !hasValidInputs || firstBreakerSeat === null) return
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
    <Page
      title={title}
      backLink={{ to: localizedPath('/sparring/', locale), label: t(keys.match.sparring.chooseAnotherGame) }}
      className="pb-28"
    >
      <Form
        method="post"
        className="flex flex-col gap-7"
        onInput={(event) => setHasValidInputs(event.currentTarget.checkValidity())}
        onSubmit={handleSubmit}
      >
        <PlayerNameFields
          seatAName={seatAName}
          seatBName={seatBName}
          suggestionsA={suggestionsA}
          suggestionsB={suggestionsB}
          onSeatANameChange={handleSeatANameChange}
          onSeatBNameChange={handleSeatBNameChange}
        />

        {canShowSettings ? (
          <div className="flex flex-col gap-6">
            <MatchTargetFramesField profile={profile} />
            <FrameTargetFields
              playerNames={{ A: normalizedSeatAName, B: normalizedSeatBName }}
              defaults={profile.defaultFrameTargetPointsBySeat}
              isSingleFrame={profile.matchTargetFrames.mode === 'fixed'}
            />
            <RackRolloverField profile={profile} />
            <FirstBreakerField
              playerNames={{ A: normalizedSeatAName, B: normalizedSeatBName }}
              firstBreakerSeat={firstBreakerSeat}
              onFirstBreakerSeatChange={setFirstBreakerSeat}
            />
          </div>
        ) : null}

        <div className="fixed inset-x-0 bottom-0 mx-auto w-full max-w-app bg-raised p-4 shadow-(--raised-top-shadow)">
          <Button
            type="submit"
            size="control"
            className="h-[60px] w-full"
            disabled={isPending || !canShowSettings || !hasValidInputs || firstBreakerSeat === null}
          >
            {isPending ? t(keys.match.sparring.creatingMatch) : t(keys.match.sparring.createMatch)}
          </Button>
        </div>
      </Form>
    </Page>
  )
}
