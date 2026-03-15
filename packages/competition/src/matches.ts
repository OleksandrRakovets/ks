import { MatchIdSchema, PlayerIdSchema, newMatchId, stripOptionalPrefix, type MatchConfig } from '@ks/core'
import { isRegisteredGameKey } from '@ks/gameplay'
import { z } from 'zod'

export const CreateMatchRequestSchema = z
  .object({
    gameKey: z.string().min(1),
    targets: z.object({
      frameTargetPointsBySeat: z.object({
        A: z.number().int().positive(),
        B: z.number().int().positive(),
      }),
      matchTargetFrames: z.number().int().positive(),
    }),
    participants: z
      .array(
        z.object({
          seat: z.enum(['A', 'B']),
          savedPlayerId: PlayerIdSchema.optional(),
          displayName: z.string().min(1).max(64),
        }),
      )
      .length(2),
  })
  .superRefine((value, ctx) => {
    if (!isRegisteredGameKey(value.gameKey)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Unsupported game key',
        path: ['gameKey'],
      })
    }

    const seats = new Set(value.participants.map((participant) => participant.seat))
    if (seats.size !== 2) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Participants must include one A and one B seat',
        path: ['participants'],
      })
    }
  })

export type CreateMatchRequest = z.infer<typeof CreateMatchRequestSchema>

export type MatchWriteRepository = {
  insertMatch(args: { matchId: string; controlSecret: string; config: MatchConfig; now: number }): Promise<void>
  initMatchRoom(args: { matchId: string; controlSecret: string; config: MatchConfig }): Promise<void>
}

function randomSecret(): string {
  const bytes = new Uint8Array(24)
  crypto.getRandomValues(bytes)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

export async function createMatchService(
  repo: MatchWriteRepository,
  input: CreateMatchRequest,
): Promise<{
  matchId: string
  publicUrl: string
  controlUrl: string
}> {
  const matchId = newMatchId()
  const controlSecret = randomSecret()
  const now = Date.now()

  const config: MatchConfig = {
    matchId,
    gameKey: input.gameKey,
    targets: input.targets,
    participants: input.participants,
  }

  await repo.insertMatch({
    matchId,
    controlSecret,
    config,
    now,
  })

  await repo.initMatchRoom({
    matchId,
    controlSecret,
    config,
  })

  return {
    matchId,
    publicUrl: `/m/${matchId}`,
    controlUrl: `/c/${matchId}/${controlSecret}`,
  }
}

export function normalizeMatchId(raw: string): string {
  return MatchIdSchema.parse(stripOptionalPrefix(raw))
}
