import { type Control, groupControlsIntoSections, type MatchCommand } from '@ks/core'
import type { GamePresentationFor, RegisteredGameKey } from '@ks/gameplay/definitions'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useFetcher } from 'react-router'

import type { ControlActionData } from '../../routes/match/shared'
import { matchCommandForm, useControlLiveRevalidation } from '../../routes/match/shared'
import { controlEffect, controlLabel } from './renderers/control-copy'
import type { MatchControlRendererProps } from './renderers/types'
import { ActionStack, type ControlPresentation } from './shell/action-stack'
import { MatchShell } from './shell/match-shell'
import type { MatchControlData } from './shell/types'

export function MatchControlPage<K extends RegisteredGameKey>(props: {
  data: MatchControlData<K>
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
    <MatchShell
      active="control"
      data={props.data}
      submitting={fetcher.state !== 'idle'}
      onSubmit={submitCommand}
    >
      <div className="relative flex min-h-0 flex-1 flex-col justify-end">
        {fetcher.data?.ok === false ? (
          <p
            role="alert"
            className="mx-3 mb-2 rounded-lg bg-destructive-dim px-3 py-2 text-base text-destructive"
          >
            {t(fetcher.data.errorKey)}
          </p>
        ) : null}

        {props.data.controlState === 'frame-active' ? (
          <props.renderer
            game={props.data.game}
            controls={props.data.controls}
            state={props.data.state}
            participants={props.data.participants}
            submitting={fetcher.state !== 'idle'}
            onSubmitCommand={submitCommand}
          />
        ) : props.data.controlState === 'between-frames' ? (
          <ActionStack
            sections={groupControlsIntoSections(props.data.controls)}
            renderControl={(control) => genericControlPresentation(t, control)}
            submitting={fetcher.state !== 'idle'}
            onSubmit={submitCommand}
          />
        ) : null}
      </div>
    </MatchShell>
  )
}

function genericControlPresentation(
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
