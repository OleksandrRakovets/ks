import { createMatchService, CreateMatchRequestSchema } from '@ks/competition'
import { gameKeys, registry, type RegisteredGameKey } from '@ks/gameplay'
import { Button, Card, CardContent, CardHeader, CardTitle, Input, Label } from '@ks/ui'
import type { ActionFunctionArgs } from 'react-router'
import { Form, useActionData, useNavigation, useSearchParams } from 'react-router'

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
      matchTargetFrames: Number(formData.get('matchTargetFrames') ?? 0),
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
  const [searchParams] = useSearchParams()
  const busy = navigation.state !== 'idle'
  const flavorClass = searchParams.get('flavor') === 'latte' ? 'latte' : 'dark'

  return (
    <div className={`${flavorClass} min-h-dvh bg-background px-4 py-6 text-foreground`}>
      <div className="mx-auto w-full max-w-xl">
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-2xl">Create Match</CardTitle>
          </CardHeader>
          <CardContent>
            <Form method="post" className="grid gap-4">
              <div className="grid gap-2">
                <Label>Admin</Label>
                <div className="grid grid-cols-2 gap-2">
                  <Input name="adminUser" defaultValue="admin" />
                  <Input name="adminPass" defaultValue="admin" />
                </div>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="gameKey">Game</Label>
                <select
                  id="gameKey"
                  name="gameKey"
                  defaultValue={'free-pyramid' satisfies RegisteredGameKey}
                  className="h-8 rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  {gameKeys.map((key) => (
                    <option key={key} value={key}>
                      {registry[key].meta.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Input name="nameA" defaultValue="Player A" />
                <Input name="nameB" defaultValue="Player B" />
              </div>

              <div className="grid gap-3">
                <div className="grid gap-2">
                  <Label>Frame target points by seat</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <Input type="number" min={1} name="frameTargetA" defaultValue={8} aria-label="Frame target points A" />
                    <Input type="number" min={1} name="frameTargetB" defaultValue={8} aria-label="Frame target points B" />
                  </div>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="matchTargetFrames">Match target frames</Label>
                  <Input id="matchTargetFrames" type="number" min={1} name="matchTargetFrames" defaultValue={3} />
                </div>
              </div>

              <Button type="submit" disabled={busy} className="mt-2">
                {busy ? 'Creating...' : 'Create Match'}
              </Button>

              {actionData?.ok === false ? <div className="text-sm text-destructive">{actionData.error}</div> : null}
              {actionData?.ok ? (
                <div className="grid gap-2 text-sm">
                  <div>
                    Public:{' '}
                    <a className="text-primary underline" href={actionData.publicUrl}>
                      {actionData.publicUrl}
                    </a>
                  </div>
                  <div>
                    Control:{' '}
                    <a className="text-primary underline" href={actionData.controlUrl}>
                      {actionData.controlUrl}
                    </a>
                  </div>
                </div>
              ) : null}
            </Form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
