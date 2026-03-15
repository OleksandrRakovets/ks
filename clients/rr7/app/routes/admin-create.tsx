import type { ActionFunctionArgs } from 'react-router'

import { createMatchService, CreateMatchRequestSchema } from '@ks/competition'
import { gameKeys, registry, type RegisteredGameKey } from '@ks/gameplay'
import { Form, useActionData, useNavigation } from 'react-router'

import { requireBasicAuth } from '../server/auth'
import { requireEnv } from '../server/context'
import { makeMatchWriteRepository } from '../server/match-room'

export async function action({ request, context }: ActionFunctionArgs) {
  const env = requireEnv(context)
  const formData = await request.formData()

  const adminUser = String(formData.get('adminUser') ?? '')
  const adminPass = String(formData.get('adminPass') ?? '')
  const auth = btoa(`${adminUser}:${adminPass}`)
  const authRequest = new Request('https://local/authorize', {
    headers: { authorization: `Basic ${auth}` },
  })
  if (!requireBasicAuth(authRequest, env)) {
    return { ok: false as const, error: 'Unauthorized' }
  }

  const payload = {
    gameKey: String(formData.get('gameKey') ?? ''),
    targets: {
      frameTargetPointsBySeat: {
        A: Number(formData.get('frameTargetA') ?? 0),
        B: Number(formData.get('frameTargetB') ?? 0),
      },
      matchTargetFramesBySeat: {
        A: Number(formData.get('framesToWinA') ?? 0),
        B: Number(formData.get('framesToWinB') ?? 0),
      },
    },
    participants: [
      { seat: 'A' as const, displayName: String(formData.get('nameA') ?? '') },
      { seat: 'B' as const, displayName: String(formData.get('nameB') ?? '') },
    ],
  }

  const parsed = CreateMatchRequestSchema.safeParse(payload)
  if (!parsed.success) {
    return { ok: false as const, error: 'Invalid form data' }
  }

  const result = await createMatchService(makeMatchWriteRepository(env), parsed.data)
  return { ok: true as const, ...result }
}

export default function AdminCreateRoute() {
  const actionData = useActionData<typeof action>()
  const navigation = useNavigation()
  const busy = navigation.state !== 'idle'

  return (
    <div className="min-h-dvh px-4 py-6">
      <div className="mx-auto w-full max-w-xl">
        <h1 className="text-2xl font-semibold tracking-tight">Create Match</h1>
        <Form method="post" className="mt-6 grid gap-4 rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="grid gap-2">
            <div className="text-sm text-white/80">Admin</div>
            <div className="grid grid-cols-2 gap-2">
              <input name="adminUser" defaultValue="admin" className="rounded-lg bg-black/20 px-3 py-2 ring-1 ring-white/10" />
              <input name="adminPass" defaultValue="admin" className="rounded-lg bg-black/20 px-3 py-2 ring-1 ring-white/10" />
            </div>
          </div>

          <div className="grid gap-2">
            <label htmlFor="gameKey" className="text-sm text-white/80">
              Game
            </label>
            <select
              id="gameKey"
              name="gameKey"
              defaultValue={'free-pyramid' satisfies RegisteredGameKey}
              className="rounded-lg bg-black/20 px-3 py-2 ring-1 ring-white/10"
            >
              {gameKeys.map((key) => (
                <option key={key} value={key}>
                  {registry[key].meta.label}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <input name="nameA" defaultValue="Player A" className="rounded-lg bg-black/20 px-3 py-2 ring-1 ring-white/10" />
            <input name="nameB" defaultValue="Player B" className="rounded-lg bg-black/20 px-3 py-2 ring-1 ring-white/10" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid grid-cols-2 gap-2">
              <input
                type="number"
                name="frameTargetA"
                defaultValue={8}
                className="rounded-lg bg-black/20 px-3 py-2 ring-1 ring-white/10"
              />
              <input
                type="number"
                name="frameTargetB"
                defaultValue={8}
                className="rounded-lg bg-black/20 px-3 py-2 ring-1 ring-white/10"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="number"
                name="framesToWinA"
                defaultValue={3}
                className="rounded-lg bg-black/20 px-3 py-2 ring-1 ring-white/10"
              />
              <input
                type="number"
                name="framesToWinB"
                defaultValue={3}
                className="rounded-lg bg-black/20 px-3 py-2 ring-1 ring-white/10"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={busy}
            className="mt-2 rounded-lg bg-[var(--ks-accent)] px-4 py-2 font-semibold text-black"
          >
            {busy ? 'Creating...' : 'Create Match'}
          </button>

          {actionData?.ok === false ? <div className="text-sm text-red-200">{actionData.error}</div> : null}
          {actionData?.ok ? (
            <div className="grid gap-2 text-sm">
              <div>
                Public:{' '}
                <a className="underline" href={actionData.publicUrl}>
                  {actionData.publicUrl}
                </a>
              </div>
              <div>
                Control:{' '}
                <a className="underline" href={actionData.controlUrl}>
                  {actionData.controlUrl}
                </a>
              </div>
            </div>
          ) : null}
        </Form>
      </div>
    </div>
  )
}
