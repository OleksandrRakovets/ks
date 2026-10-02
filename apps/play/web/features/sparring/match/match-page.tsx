import { type Control, type ControlSections, groupControlsIntoSections, type MatchCommand } from '@ks/core'
import type { GameKey, GamePresentationFor } from '@ks/gameplay/definitions'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useFetcher } from 'react-router'

import { matchCommandForm, useControlLiveRevalidation } from './live'
import { controlEffect, controlLabel } from './renderers/control-copy'
import type { MatchControlRendererProps } from './renderers/types'
import { ResultPanel } from './result-panel'
import { presentResult } from './result-presentation'
import { ControlPanel } from './shell/control-panel'
import { type ControlPresentation, ControlStack } from './shell/control-stack'
import { LastCommandBar } from './shell/last-command-bar'
import { OverflowSheet } from './shell/overflow-sheet'
import { RematchLink } from './shell/rematch-link'
import { ActiveSurface, FinishedSurface } from './shell/surfaces'
import type { ActiveMatchData, ControlActionData, FinishedMatchData, MatchPageData } from './types'

export function MatchPage<K extends GameKey>(props: {
  data: MatchPageData<K>
  renderer: (props: MatchControlRendererProps<GamePresentationFor<K>>) => ReactNode
}) {
  if (props.data.page === 'result') {
    return <ResultPage data={props.data.match} />
  }

  return <ControlPage data={props.data.match} renderer={props.renderer} />
}

function ControlPage<K extends GameKey>(props: {
  data: ActiveMatchData<K>
  renderer: (props: MatchControlRendererProps<GamePresentationFor<K>>) => ReactNode
}) {
  const { t } = useTranslation()
  const fetcher = useFetcher<ControlActionData>()
  const discardFetcher = useFetcher<ControlActionData>()
  const discarding = discardFetcher.state !== 'idle'
  const markLocalSubmit = useControlLiveRevalidation(props.data, fetcher, discarding)
  const sections = groupControlsIntoSections(props.data.controls)
  const submitting = fetcher.state !== 'idle' || discarding
  const failure = [discardFetcher.data, fetcher.data].find((data) => data?.ok === false)

  function submitCommand(command: MatchCommand) {
    markLocalSubmit()
    void fetcher.submit(matchCommandForm(command), { method: 'post' })
  }

  function discardMatch() {
    markLocalSubmit()
    void discardFetcher.submit({ intent: 'discard' }, { method: 'post' })
  }

  return (
    <ActiveSurface
      active="primary"
      layout="fixed"
      data={props.data}
      headerControl={
        <OverflowSheet
          controls={sections.tertiary}
          names={{ A: props.data.participants.A.displayName, B: props.data.participants.B.displayName }}
          submitting={submitting}
          onSubmit={submitCommand}
          onDiscard={discardMatch}
        />
      }
      footer={
        props.data.lastCommand ? (
          <LastCommandBar entry={props.data.lastCommand} submitting={submitting} onSubmit={submitCommand} />
        ) : null
      }
    >
      <ControlPanel errorLabel={failure?.ok === false ? t(failure.errorKey) : undefined}>
        {props.data.controlPhase === 'frame-active' ? (
          <props.renderer
            game={props.data.game}
            controls={props.data.controls}
            sections={sections}
            participants={props.data.participants}
            submitting={submitting}
            onSubmitCommand={submitCommand}
          />
        ) : (
          <BetweenFramesControls sections={sections} t={t} submitting={submitting} onSubmit={submitCommand} />
        )}
      </ControlPanel>
    </ActiveSurface>
  )
}

function ResultPage({ data }: { data: FinishedMatchData }) {
  const { t } = useTranslation()

  return (
    <FinishedSurface active="primary" data={data} footer={<RematchLink data={data} />}>
      <ResultPanel presentation={presentResult(data, t)} />
    </FinishedSurface>
  )
}

/**
 * The complete match-level control phase after a frame ends. This is separate from tertiary
 * controls, which remain available in the shell's overflow menu during gameplay phases.
 */
function BetweenFramesControls(props: {
  sections: ControlSections
  t: ReturnType<typeof useTranslation>['t']
  submitting: boolean
  onSubmit: (command: MatchCommand) => void
}) {
  return (
    <ControlStack
      sections={props.sections}
      renderControl={(control) => betweenFramesControlPresentation(props.t, control)}
      submitting={props.submitting}
      onSubmit={props.onSubmit}
    />
  )
}

function betweenFramesControlPresentation(
  t: ReturnType<typeof useTranslation>['t'],
  control: Control,
): ControlPresentation {
  const label = controlLabel(t, control)

  return {
    label,
    visibleLabel: label,
    effect: controlEffect(t, control),
  }
}
