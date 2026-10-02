import { type Control, opponentOf, type Seat } from '@ks/core'
import { type StrilaBall, type StrilaGamePresentation } from '@ks/gameplay/definitions'
import { keys } from '@ks/i18n'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { type ControlPresentation, ControlStack } from '@/features/sparring/match/shell/control-stack'
import { Takeover } from '@/features/sparring/match/shell/takeover'

import { controlEffect } from './control-copy'
import { presentControls } from './control-presentation'
import { BallSet, OpeningToss, PenaltyTitle, PotLabel, RuleNotes } from './strila-controls'
import { presentBallSet, presentRuleNotes, strilaControlLabel } from './strila-presentation'
import { matchCommandFromControl, type MatchControlRendererProps } from './types'

export function StrilaControlRenderer(props: MatchControlRendererProps<typeof StrilaGamePresentation.Type>) {
  const { t } = useTranslation()
  const [selectedBalls, setSelectedBalls] = useState<(typeof StrilaBall.Type)[]>([])
  const { sections } = props
  const details = props.game.details
  const notes = presentRuleNotes(details.ruleNotes, props.participants, t)

  const penaltyControls =
    details.phase === 'foul-committed.penalty-selection'
      ? [...sections.primary.A, ...sections.primary.B, ...sections.secondary.A, ...sections.secondary.B]
      : []

  const chooser = penaltyControls[0]?.seat

  const openingControls =
    details.phase === 'respotted-black.opening-selection'
      ? props.controls.filter(({ type }) => type === 'respotted-black.opening.select')
      : []

  function submit(command: Parameters<typeof props.onSubmitCommand>[0]) {
    setSelectedBalls([])
    props.onSubmitCommand(command)
  }

  function toggleBall(ball: typeof StrilaBall.Type) {
    setSelectedBalls(
      selectedBalls.includes(ball)
        ? selectedBalls.filter((candidate) => candidate !== ball)
        : [...selectedBalls, ball],
    )
  }

  function selectOpeningSeat(seat: typeof Seat.Type | null) {
    if (seat === null) return
    const control = openingControls.find((candidate) => candidate.seat === seat)

    if (control) submit(matchCommandFromControl(control))
  }

  const renderControl = (control: typeof Control.Type): ControlPresentation => {
    const label = strilaControlLabel(t, control)
    const isPot = control.type === 'pot.record'

    return {
      label: isPot ? <PotLabel label={label} selectedBalls={selectedBalls} /> : label,
      visibleLabel: label,
      disabled: isPot && selectedBalls.length === 0,
      input: isPot ? { pottedBalls: selectedBalls } : undefined,
      effect: controlEffect(t, control),
    }
  }

  return (
    <ControlStack
      sections={sections}
      selector={
        details.isBallSetVisible ? (
          <BallSet
            presentation={presentBallSet(details, selectedBalls, t)}
            notes={notes}
            onToggle={toggleBall}
          />
        ) : undefined
      }
      takeover={
        chooser ? (
          <Takeover
            title={
              <PenaltyTitle
                offenderLabel={t(keys.match.control.takeover.foulActor, {
                  player: props.participants[opponentOf(chooser)].displayName,
                })}
                chooserLabel={t(keys.match.control.takeover.foulChooser, {
                  player: props.participants[chooser].displayName,
                })}
              />
            }
            note={<RuleNotes notes={notes} />}
            controls={presentControls(penaltyControls, renderControl, props.submitting, submit)}
          />
        ) : openingControls.length > 0 ? (
          <OpeningToss
            notes={notes}
            playerNames={{ A: props.participants.A.displayName, B: props.participants.B.displayName }}
            submitting={props.submitting}
            onSelectedSeatChange={selectOpeningSeat}
          />
        ) : undefined
      }
      renderControl={renderControl}
      submitting={props.submitting}
      onSubmit={submit}
    />
  )
}
