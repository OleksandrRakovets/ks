import { MatchConfigSchema, MatchIdSchema, MatchSeatAssignmentSchema, stripOptionalPrefix, type MatchConfig } from '@ks/core'
import { isRegisteredGameKey } from '@ks/gameplay/definitions'
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
    participants: z.array(MatchSeatAssignmentSchema).length(2),
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

export function assignmentsBySeat(participants: CreateMatchRequest['participants']): { A: string; B: string } {
  const seatA = participants.find((participant) => participant.seat === 'A')
  const seatB = participants.find((participant) => participant.seat === 'B')
  if (!seatA || !seatB) {
    throw new Error('Participants must include one A and one B seat')
  }
  return {
    A: seatA.playerRef,
    B: seatB.playerRef,
  }
}

export function buildMatchConfig(matchId: string, input: CreateMatchRequest): MatchConfig {
  return MatchConfigSchema.parse({
    matchId,
    gameKey: input.gameKey,
    targets: input.targets,
  })
}

export function normalizeMatchId(raw: string): string {
  return MatchIdSchema.parse(stripOptionalPrefix(raw))
}
