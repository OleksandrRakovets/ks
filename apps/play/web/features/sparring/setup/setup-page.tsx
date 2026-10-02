import type { Seat } from '@ks/core'
import { keys } from '@ks/i18n'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Form, useNavigation } from 'react-router'

import { Page } from '@/components/page'
import { Button } from '@/components/ui'
import { localizedPath } from '@/i18n'
import { useRootLocale } from '@/root'

import {
  FirstBreakerField,
  FrameTargetFields,
  MatchTargetFramesField,
  PlayerNameFields,
  RackRolloverField,
} from './fields'
import { safeNormalizeDisplayName } from './player-name'
import type { MatchCreateProfile } from './profile'
import { recentPlayerSuggestions, rememberRecentPlayers, useRecentPlayers } from './recent-players'

export function SparringSetupPage(props: {
  title: string
  profile: MatchCreateProfile
  initialPlayerNames: { A: string; B: string }
}) {
  const { t } = useTranslation()
  const locale = useRootLocale()
  const { initialPlayerNames, profile, title } = props
  const navigation = useNavigation()
  const isPending = navigation.state !== 'idle'
  const recentPlayers = useRecentPlayers()
  const [seatAName, setSeatAName] = useState(initialPlayerNames.A)
  const [seatBName, setSeatBName] = useState(initialPlayerNames.B)
  const [firstBreakerSeat, setFirstBreakerSeat] = useState<Seat | null>(null)

  const [hasValidInputs, setHasValidInputs] = useState(
    initialPlayerNames.A.length > 0 && initialPlayerNames.B.length > 0,
  )

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
              maxValue={profile.maxFrameTargetPoints}
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
