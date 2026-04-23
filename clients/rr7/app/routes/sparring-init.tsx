import { createMatchService } from '@ks/competition'
import { isRegisteredGameKey, registry } from '@ks/gameplay'
import { keys } from '@ks/i18n'
import { Button, Input, Label, NumberInput } from '@ks/ui'
import { useTranslation } from 'react-i18next'
import { Form, redirect, useActionData, useLoaderData, useNavigation } from 'react-router'

import type { AppLoadContext } from '../server/context'
import { requireEnv } from '../server/context'
import { getOrCreateGuestPlayerRef } from '../server/guest-players'
import { localeFromCookie } from '../server/locale'
import { makeMatchWriteRepository } from '../server/match-room'

type LoaderData = {
  gameKey: string
  title: string
  defaultFrameTargetPointsBySeat: { A: number; B: number }
}

type ActionData = {
  ok: false
  errorKey:
    | typeof keys.match.sparring.errorBothNamesRequired
    | typeof keys.match.sparring.errorNamesMustDiffer
    | typeof keys.match.sparring.errorMatchTargetFramesRequired
    | typeof keys.match.sparring.errorHandicapMustBePositiveInt
}

function parsePositiveInt(raw: FormDataEntryValue | null, fallback?: number): number | null {
  if (raw == null || raw === '') {
    return fallback ?? null
  }
  const parsed = Number(raw)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null
  }
  return parsed
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
    defaultFrameTargetPointsBySeat: registry[gameKey].meta.defaultFrameTargetPointsBySeat,
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
}) {
  const gameKey = params.gameKey
  if (!gameKey || !isRegisteredGameKey(gameKey)) {
    throw new Response('Unknown gameKey', { status: 404 })
  }

  const defaultFrameTargetPointsBySeat = registry[gameKey].meta.defaultFrameTargetPointsBySeat

  const form = await request.formData()
  const seatAName = String(form.get('seatAName') ?? '')
  const seatBName = String(form.get('seatBName') ?? '')
  const matchTargetFrames = parsePositiveInt(form.get('matchTargetFrames'))
  const targetA = parsePositiveInt(form.get('targetA'), defaultFrameTargetPointsBySeat.A)
  const targetB = parsePositiveInt(form.get('targetB'), defaultFrameTargetPointsBySeat.B)

  if (!seatAName || !seatBName) {
    return { ok: false, errorKey: keys.match.sparring.errorBothNamesRequired } as const
  }
  if (seatAName === seatBName) {
    return { ok: false, errorKey: keys.match.sparring.errorNamesMustDiffer } as const
  }
  if (matchTargetFrames == null) {
    return { ok: false, errorKey: keys.match.sparring.errorMatchTargetFramesRequired } as const
  }
  if (targetA == null || targetB == null) {
    return { ok: false, errorKey: keys.match.sparring.errorHandicapMustBePositiveInt } as const
  }

  const env = requireEnv(context)
  const [seatAPlayerRef, seatBPlayerRef] = await Promise.all([
    getOrCreateGuestPlayerRef(env, seatAName),
    getOrCreateGuestPlayerRef(env, seatBName),
  ])

  const result = await createMatchService(makeMatchWriteRepository(env), {
    gameKey,
    targets: {
      frameTargetPointsBySeat: {
        A: targetA,
        B: targetB,
      },
      matchTargetFrames,
    },
    participants: [
      { seat: 'A', playerRef: seatAPlayerRef },
      { seat: 'B', playerRef: seatBPlayerRef },
    ],
  })

  return redirect(`/sparring/matches/${result.matchId}`)
}

function normalizeDisplayName(value: string): string {
  return value.trim().replace(/\s+/g, ' ')
}

export const handle = {
  headerConfig: (data: LoaderData) => ({ title: data.title, backTo: '/sparring' }),
}

export default function SparringInitRoute() {
  const { t } = useTranslation()
  const { defaultFrameTargetPointsBySeat } = useLoaderData<typeof loader>()
  const actionData = useActionData() as ActionData | undefined
  const navigation = useNavigation()
  const isSubmitting = navigation.state === 'submitting'

  return (
    <main className="flex-1 bg-background px-4 py-6 text-foreground">
      <div className="mx-auto w-full max-w-2xl">
        <Form
          method="post"
          className="grid gap-6"
          onSubmit={(event) => {
            const form = event.currentTarget
            const seatA = form.elements.namedItem('seatAName')
            const seatB = form.elements.namedItem('seatBName')
            if (seatA instanceof HTMLInputElement) seatA.value = normalizeDisplayName(seatA.value)
            if (seatB instanceof HTMLInputElement) seatB.value = normalizeDisplayName(seatB.value)

            if (!form.reportValidity()) {
              event.preventDefault()
            }
          }}
        >
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="seatAName">{t(keys.match.sparring.playerA)}</Label>
              <Input id="seatAName" name="seatAName" autoComplete="off" required />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="seatBName">{t(keys.match.sparring.playerB)}</Label>
              <Input id="seatBName" name="seatBName" autoComplete="off" required />
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="matchTargetFrames">{t(keys.match.sparring.matchTargetFrames)}</Label>
            <NumberInput
              id="matchTargetFrames"
              name="matchTargetFrames"
              inputMode="numeric"
              min={1}
              defaultValue={3}
              required
            />
          </div>

          <details className="rounded-lg border border-border p-3">
            <summary className="cursor-pointer text-sm font-medium select-none">
              {t(keys.match.sparring.handicapAdvanced)}
            </summary>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="targetA">{t(keys.match.sparring.seatATargetPoints)}</Label>
                <NumberInput
                  id="targetA"
                  name="targetA"
                  inputMode="numeric"
                  min={1}
                  defaultValue={defaultFrameTargetPointsBySeat.A}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="targetB">{t(keys.match.sparring.seatBTargetPoints)}</Label>
                <NumberInput
                  id="targetB"
                  name="targetB"
                  inputMode="numeric"
                  min={1}
                  defaultValue={defaultFrameTargetPointsBySeat.B}
                />
              </div>
            </div>
          </details>

          {actionData?.ok === false ? <p className="text-sm text-destructive">{t(actionData.errorKey)}</p> : null}

          <Button type="submit" size="touch" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? t(keys.match.sparring.creatingMatch) : t(keys.match.sparring.createMatch)}
          </Button>
        </Form>
      </div>
    </main>
  )
}
