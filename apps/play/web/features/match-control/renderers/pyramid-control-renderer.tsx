import type { ControlCommandPreset, ControlCommandSections } from '@ks/core'
import type {
  CombinedPyramidControlView,
  CombinedPyramidOldControlView,
  FreePyramidControlView,
} from '@ks/gameplay/definitions'
import { keys } from '@ks/i18n'
import type { TFunction } from 'i18next'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui'

import { controlCommandEffect, controlCommandLabel } from './control-copy'
import type { MatchControlRendererProps } from './types'

type SeatCommands = ControlCommandSections['primary']
type CommandSection = {
  commands: SeatCommands
}

function pyramidCommandLabel(
  t: TFunction,
  command: ControlCommandPreset,
  index: number,
  pointOptions: readonly number[],
): string {
  if (command.commandType !== 'pot.record') return controlCommandLabel(t, command)
  return t('match.control.commands.game.pot.points', { points: pointOptions[index] ?? 1 })
}

function buttonVariant(prominence: ControlCommandPreset['prominence']): 'default' | 'secondary' | 'outline' {
  if (prominence === 'primary') return 'default'
  if (prominence === 'secondary') return 'secondary'
  return 'outline'
}

function CommandRows(props: {
  commands: SeatCommands
  pointOptions: readonly number[]
  showEffectSummaries?: boolean
  onSubmit: (command: ControlCommandPreset) => void
}) {
  const { t } = useTranslation()

  function renderButton(command: ControlCommandPreset, key: string, index: number) {
    return (
      <div key={key} className="grid gap-1">
        <Button
          type="button"
          variant={buttonVariant(command.prominence)}
          size="control"
          onClick={() => props.onSubmit(command)}
        >
          {pyramidCommandLabel(t, command, index, props.pointOptions)}
        </Button>
        {props.showEffectSummaries && controlCommandEffect(t, command) ? (
          <p className="text-center text-base text-text-lo">{controlCommandEffect(t, command)}</p>
        ) : null}
      </div>
    )
  }

  function renderSeatCommands(commands: ControlCommandPreset[], seat: 'A' | 'B') {
    let potIndex = 0
    return commands.map((command, index) => {
      const commandPotIndex = potIndex
      if (command.commandType === 'pot.record') potIndex += 1
      return renderButton(command, `${seat}-${index}`, commandPotIndex)
    })
  }

  return (
    <section className="border-b border-divider px-4 py-3">
      <div className="grid grid-cols-2 gap-6">
        <div className="grid gap-3.5">{renderSeatCommands(props.commands.A, 'A')}</div>
        <div className="grid gap-3.5">{renderSeatCommands(props.commands.B, 'B')}</div>
      </div>
    </section>
  )
}

function CombinedCommandRows(props: {
  sections: CommandSection[]
  pointOptions: readonly number[]
  onSubmit: (command: ControlCommandPreset) => void
}) {
  const commands = props.sections.reduce<SeatCommands>(
    (merged, section) => ({
      A: [...merged.A, ...section.commands.A],
      B: [...merged.B, ...section.commands.B],
    }),
    { A: [], B: [] },
  )

  return <CommandRows commands={commands} pointOptions={props.pointOptions} onSubmit={props.onSubmit} />
}

function NeutralCommandRows(props: { commands: ControlCommandPreset[]; onSubmit: (command: ControlCommandPreset) => void }) {
  const { t } = useTranslation()

  return (
    <section className="border-b border-divider px-4 py-3">
      <div className="mx-auto grid w-2/3 gap-3.5">
        {props.commands.map((command, index) => (
          <Button
            key={`${command.source}-${command.commandType}-${index}`}
            type="button"
            variant={buttonVariant(command.prominence)}
            size="control"
            onClick={() => props.onSubmit(command)}
          >
            {controlCommandLabel(t, command)}
          </Button>
        ))}
      </div>
    </section>
  )
}

function PyramidControlRenderer(props: {
  commandSections: ControlCommandSections
  pointOptions: readonly number[]
  onSubmitCommand: (command: ControlCommandPreset) => void
}) {
  const [showTertiary, setShowTertiary] = useState(false)
  const { t } = useTranslation()
  const commandSections = props.commandSections
  const hasNeutral = commandSections.neutral.length > 0

  const hasPrimary = commandSections.primary.A.length > 0 || commandSections.primary.B.length > 0
  const hasSecondary = commandSections.secondary.A.length > 0 || commandSections.secondary.B.length > 0
  const hasTertiary = commandSections.tertiary.A.length > 0 || commandSections.tertiary.B.length > 0
  const visibleSections: CommandSection[] = [
    ...(hasPrimary ? [{ commands: commandSections.primary }] : []),
    ...(hasSecondary ? [{ commands: commandSections.secondary }] : []),
  ]

  return (
    <div className="grid">
      {hasNeutral && <NeutralCommandRows commands={commandSections.neutral} onSubmit={props.onSubmitCommand} />}

      {visibleSections.length > 0 && (
        <CombinedCommandRows sections={visibleSections} pointOptions={props.pointOptions} onSubmit={props.onSubmitCommand} />
      )}

      {hasTertiary && (
        <div className="grid">
          <button
            type="button"
            className="px-4 py-2 text-left text-base text-muted-foreground hover:text-foreground"
            onClick={() => setShowTertiary((v) => !v)}
          >
            {showTertiary ? t(keys.match.control.showLess) : t(keys.match.control.showMore)}
          </button>
          {showTertiary && (
            <CommandRows
              commands={commandSections.tertiary}
              pointOptions={props.pointOptions}
              onSubmit={props.onSubmitCommand}
            />
          )}
        </div>
      )}
    </div>
  )
}

export function FreePyramidControlRenderer(props: MatchControlRendererProps<FreePyramidControlView>) {
  return (
    <PyramidControlRenderer
      commandSections={props.commandSections}
      pointOptions={[1, 2, 4]}
      onSubmitCommand={props.onSubmitCommand}
    />
  )
}

export function CombinedPyramidControlRenderer(props: MatchControlRendererProps<CombinedPyramidControlView>) {
  return (
    <PyramidControlRenderer
      commandSections={props.commandSections}
      pointOptions={[1, 2]}
      onSubmitCommand={props.onSubmitCommand}
    />
  )
}

export function CombinedPyramidOldControlRenderer(props: MatchControlRendererProps<CombinedPyramidOldControlView>) {
  return (
    <PyramidControlRenderer
      commandSections={props.commandSections}
      pointOptions={[1, 2]}
      onSubmitCommand={props.onSubmitCommand}
    />
  )
}
