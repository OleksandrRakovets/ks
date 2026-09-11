import type { BySeatNumber } from '@ks/core'
import { keys } from '@ks/i18n'
import { useTranslation } from 'react-i18next'

import { Input, Label, NumberInput } from '@/components/ui'

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
    <section className="grid gap-4" aria-label={t(keys.match.sparring.players)}>
      <div className="grid gap-2">
        <Label htmlFor="seatAName">{t(keys.match.sparring.playerA)}</Label>
        <Input
          id="seatAName"
          name="seatAName"
          list="seatANameSuggestions"
          autoComplete="off"
          value={props.seatAName}
          onChange={(event) => props.onSeatANameChange(event.currentTarget.value)}
          required
        />
        <RecentPlayerDatalist id="seatANameSuggestions" suggestions={props.suggestionsA} />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="seatBName">{t(keys.match.sparring.playerB)}</Label>
        <Input
          id="seatBName"
          name="seatBName"
          list="seatBNameSuggestions"
          autoComplete="off"
          value={props.seatBName}
          onChange={(event) => props.onSeatBNameChange(event.currentTarget.value)}
          required
        />
        <RecentPlayerDatalist id="seatBNameSuggestions" suggestions={props.suggestionsB} />
      </div>
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

  if (props.profile.matchTargetFrames.mode === 'fixed') {
    return (
      <div className="grid gap-2 rounded-lg border border-border p-3">
        <input type="hidden" name="matchTargetFrames" value={props.profile.matchTargetFrames.fixedValue} />
        <p className="text-sm text-muted-foreground">{t(keys.match.sparring.longFreePyramidFrameHelp)}</p>
      </div>
    )
  }

  return (
    <div className="grid gap-2">
      <Label htmlFor="matchTargetFrames">{t(keys.match.sparring.matchTargetFrames)}</Label>
      <NumberInput
        id="matchTargetFrames"
        name="matchTargetFrames"
        inputMode="numeric"
        min={1}
        defaultValue={props.profile.matchTargetFrames.defaultValue}
        required
      />
    </div>
  )
}

export function FrameTargetFields(props: { playerNames: { A: string; B: string }; defaults: BySeatNumber }) {
  const { t } = useTranslation()

  return (
    <section className="grid gap-3 sm:grid-cols-2" aria-label={t(keys.match.sparring.frameTargetPoints)}>
      <div className="grid gap-2">
        <Label htmlFor="targetA">
          {t(keys.match.sparring.playerTargetPoints, { name: props.playerNames.A })}
        </Label>
        <NumberInput id="targetA" name="targetA" inputMode="numeric" min={1} defaultValue={props.defaults.A} />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="targetB">
          {t(keys.match.sparring.playerTargetPoints, { name: props.playerNames.B })}
        </Label>
        <NumberInput id="targetB" name="targetB" inputMode="numeric" min={1} defaultValue={props.defaults.B} />
      </div>
    </section>
  )
}

export function RackRolloverField(props: { profile: MatchCreateProfile }) {
  const { t } = useTranslation()

  if (!props.profile.rackRollover) return null

  return (
    <fieldset className="grid gap-3 rounded-lg border border-border p-3">
      <legend className="px-1 text-sm font-medium">{t(keys.match.sparring.rackRollover)}</legend>
      <div className="grid gap-3 sm:grid-cols-2">
        {props.profile.rackRollover.options.map((value) => (
          <label key={value} className="grid cursor-pointer gap-1 rounded-md border border-border p-3">
            <span className="flex items-center gap-2">
              <input
                type="radio"
                name="rackRollover"
                value={value}
                aria-label={t(keys.match.sparring.rackRolloverBalls, { count: value })}
                defaultChecked={value === props.profile.rackRollover?.defaultValue}
                required
              />
              <span className="font-medium">{t(keys.match.sparring.rackRolloverBalls, { count: value })}</span>
            </span>
            <span className="text-sm text-muted-foreground">
              {value === 14
                ? t(keys.match.sparring.rackRolloverPreferred)
                : t(keys.match.sparring.rackRolloverNewer)}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}
