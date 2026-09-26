import { type Control, groupControlsIntoSections, type MatchCommand } from '@ks/core'
import type { GamePresentationFor, RegisteredGameKey } from '@ks/gameplay/definitions'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useFetcher } from 'react-router'

import { matchCommandForm, useControlLiveRevalidation } from './live'
import { controlEffect, controlLabel } from './renderers/control-copy'
import type { MatchControlRendererProps } from './renderers/types'
import { type ControlPresentation, ControlStack } from './shell/control-stack'
import { MatchResult } from './shell/match-result'
import { MatchControlShell, MatchResultShell } from './shell/match-shell'
import type { ActiveMatchData, ControlActionData, MatchPageData } from './types'

export function MatchPage<K extends RegisteredGameKey>(props: {
  data: MatchPageData<K>
  renderer: (props: MatchControlRendererProps<GamePresentationFor<K>>) => ReactNode
}) {
  if (props.data.page === 'result') {
    return (
      <MatchResultShell active="result" data={props.data.match}>
        <MatchResult data={props.data.match} />
      </MatchResultShell>
    )
  }

  return <MatchControlPage data={props.data.match} renderer={props.renderer} />
}

function MatchControlPage<K extends RegisteredGameKey>(props: {
  data: ActiveMatchData<K>
  renderer: (props: MatchControlRendererProps<GamePresentationFor<K>>) => ReactNode
}) {
  const { t } = useTranslation()
  const fetcher = useFetcher<ControlActionData>()
  const markLocalSubmit = useControlLiveRevalidation(props.data.state, props.data.latestSeq, fetcher)

  function submitCommand(command: MatchCommand) {
    markLocalSubmit()
    void fetcher.submit(matchCommandForm(command), { method: 'post' })
  }

  return (
    <MatchControlShell data={props.data} submitting={fetcher.state !== 'idle'} onSubmit={submitCommand}>
      <div className="relative flex min-h-0 flex-1 flex-col justify-end">
        {fetcher.data?.ok === false ? (
          <p
            role="alert"
            className="mx-3 mb-2 rounded-lg bg-destructive-dim px-3 py-2 text-base text-destructive"
          >
            {t(fetcher.data.errorKey)}
          </p>
        ) : null}

        {props.data.controlPhase === 'frame-active' ? (
          <props.renderer
            game={props.data.game}
            controls={props.data.controls}
            state={props.data.state}
            participants={props.data.participants}
            submitting={fetcher.state !== 'idle'}
            onSubmitCommand={submitCommand}
          />
        ) : (
          <BetweenFramesControls
            controls={props.data.controls}
            t={t}
            submitting={fetcher.state !== 'idle'}
            onSubmit={submitCommand}
          />
        )}
      </div>
    </MatchControlShell>
  )
}

/**
 * The complete match-level control phase after a frame ends. This is separate from tertiary
 * controls, which remain available in the shell's overflow menu during gameplay phases.
 */
function BetweenFramesControls(props: {
  controls: readonly Control[]
  t: ReturnType<typeof useTranslation>['t']
  submitting: boolean
  onSubmit: (command: MatchCommand) => void
}) {
  return (
    <ControlStack
      sections={groupControlsIntoSections(props.controls)}
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
