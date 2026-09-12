import type { BySeatNumber, Seat } from '@ks/core'
import { keys } from '@ks/i18n'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  Button,
  Field,
  FieldGroup,
  FieldLabel,
  Input,
  NumberInput,
  ToggleGroup,
  ToggleGroupItem,
} from '@/components/ui'

export { FirstBreakerField } from './first-breaker-toss'

import type { MatchCreateProfile } from './profile'

export function PlayerNameFields(props: {
  seatAName: string
  seatBName: string
  suggestionsA: readonly string[]
  suggestionsB: readonly string[]
  onSeatANameChange: (value: string) => void
  onSeatBNameChange: (value: string) => void
}) {
  const { t } = useTranslation()

  return (
    <section className="flex flex-col gap-2.5" aria-labelledby="players-heading">
      <h2 id="players-heading" className="text-lg font-semibold text-muted-foreground">
        {t(keys.match.sparring.players)}
      </h2>
      <FieldGroup className="gap-2.5">
        <Field>
          <FieldLabel htmlFor="seatAName" className="sr-only">
            {t(keys.match.sparring.playerA)}
          </FieldLabel>
          <Input
            id="seatAName"
            name="seatAName"
            list="seatANameSuggestions"
            placeholder={t(keys.match.sparring.playerA)}
            autoComplete="off"
            value={props.seatAName}
            onChange={(event) => props.onSeatANameChange(event.currentTarget.value)}
            className="h-[54px] text-lg"
            required
          />
          <RecentPlayerDatalist id="seatANameSuggestions" suggestions={props.suggestionsA} />
        </Field>
        <Field>
          <FieldLabel htmlFor="seatBName" className="sr-only">
            {t(keys.match.sparring.playerB)}
          </FieldLabel>
          <Input
            id="seatBName"
            name="seatBName"
            list="seatBNameSuggestions"
            placeholder={t(keys.match.sparring.playerB)}
            autoComplete="off"
            value={props.seatBName}
            onChange={(event) => props.onSeatBNameChange(event.currentTarget.value)}
            className="h-[54px] text-lg"
            required
          />
          <RecentPlayerDatalist id="seatBNameSuggestions" suggestions={props.suggestionsB} />
        </Field>
      </FieldGroup>
    </section>
  )
}

function RecentPlayerDatalist(props: { id: string; suggestions: readonly string[] }) {
  return (
    <datalist id={props.id}>
      {props.suggestions.map((name) => (
        <option key={name} value={name}>
          {name}
        </option>
      ))}
    </datalist>
  )
}

export function MatchTargetFramesField(props: { profile: MatchCreateProfile }) {
  const { t } = useTranslation()
  const inputRef = useRef<HTMLInputElement>(null)

  if (props.profile.matchTargetFrames.mode === 'fixed') {
    return <input type="hidden" name="matchTargetFrames" value={props.profile.matchTargetFrames.fixedValue} />
  }

  return (
    <Field className="gap-2.5">
      <FieldLabel htmlFor="matchTargetFrames" className="text-lg font-semibold text-muted-foreground">
        {t(keys.match.sparring.matchTargetFrames)}
      </FieldLabel>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          className="size-[54px] text-2xl"
          aria-label={t(keys.match.sparring.decreaseMatchTarget)}
          onClick={() => inputRef.current?.stepDown()}
        >
          −
        </Button>
        <NumberInput
          ref={inputRef}
          id="matchTargetFrames"
          name="matchTargetFrames"
          inputMode="numeric"
          min={1}
          defaultValue={props.profile.matchTargetFrames.defaultValue}
          className="h-[54px] w-[68px] [appearance:textfield] border-0 bg-transparent px-0 text-center text-[26px] font-bold tabular-nums [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          required
        />
        <Button
          type="button"
          variant="outline"
          className="size-[54px] text-2xl"
          aria-label={t(keys.match.sparring.increaseMatchTarget)}
          onClick={() => inputRef.current?.stepUp()}
        >
          +
        </Button>
      </div>
    </Field>
  )
}

export function FrameTargetFields(props: {
  playerNames: { A: string; B: string }
  defaults: BySeatNumber
  isSingleFrame: boolean
}) {
  const { t } = useTranslation()

  return (
    <section className="flex flex-col gap-2.5" aria-labelledby="target-heading">
      <h2 id="target-heading" className="text-lg font-semibold text-muted-foreground">
        {t(props.isSingleFrame ? keys.match.sparring.gameTargetPoints : keys.match.sparring.frameTargetPoints)}
      </h2>
      <div className="grid grid-cols-2 gap-2.5">
        <TargetField seat="A" playerName={props.playerNames.A} defaultValue={props.defaults.A} />
        <TargetField seat="B" playerName={props.playerNames.B} defaultValue={props.defaults.B} />
      </div>
    </section>
  )
}

function TargetField(props: { seat: Seat; playerName: string; defaultValue: number }) {
  const { t } = useTranslation()
  const id = `target${props.seat}`

  return (
    <Field className="gap-0 rounded-lg border border-border px-3 py-2 transition-[border-color,box-shadow] focus-within:border-green focus-within:shadow-[0_0_18px_var(--a-green-dim)] focus-within:ring-2 focus-within:ring-green">
      <FieldLabel htmlFor={id} className="truncate text-base font-normal text-muted-foreground">
        {firstName(props.playerName)}
      </FieldLabel>
      <NumberInput
        id={id}
        name={id}
        inputMode="numeric"
        min={1}
        defaultValue={props.defaultValue}
        aria-label={t(keys.match.sparring.playerTargetPoints, { name: props.playerName })}
        className="h-9 [appearance:textfield] border-0 bg-transparent px-0 text-[26px] leading-[1.2] font-bold tabular-nums focus-visible:ring-0 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
    </Field>
  )
}

export function RackRolloverField(props: { profile: MatchCreateProfile }) {
  const { t } = useTranslation()
  const [value, setValue] = useState(() => props.profile.rackRollover?.defaultValue)

  if (!props.profile.rackRollover) return null

  return (
    <section className="flex flex-col gap-2.5" aria-labelledby="rack-rollover-heading">
      <h2 id="rack-rollover-heading" className="text-lg font-semibold text-muted-foreground">
        {t(keys.match.sparring.rackRollover)}
      </h2>
      <input type="hidden" name="rackRollover" value={value} />
      <ToggleGroup
        value={value === undefined ? [] : [String(value)]}
        onValueChange={(nextValue) => {
          const selected = nextValue.at(0)

          if (selected === '14' || selected === '15') setValue(selected === '14' ? 14 : 15)
        }}
        aria-labelledby="rack-rollover-heading"
        className="grid h-[62px] w-full grid-cols-2 gap-1"
      >
        {props.profile.rackRollover.options.map((value) => (
          <ToggleGroupItem
            key={value}
            value={String(value)}
            className="flex h-full flex-col items-center justify-center gap-0 px-2 text-base data-pressed:border data-pressed:border-green data-pressed:bg-green-tint"
          >
            <span className="font-semibold">{t(keys.match.sparring.rackRolloverBalls, { count: value })}</span>
            <span className="text-base font-normal text-muted-foreground">
              {value === 14
                ? t(keys.match.sparring.rackRolloverPreferred)
                : t(keys.match.sparring.rackRolloverNewer)}
            </span>
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </section>
  )
}

function firstName(displayName: string): string {
  return displayName.trim().split(/\s+/u)[0] ?? displayName
}
