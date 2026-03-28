export const keys = {
  appTitle: 'app.title',
  match: {
    create: {
      title: 'match.create.title',
      game: 'match.create.game',
      seatA: 'match.create.seatA',
      seatB: 'match.create.seatB',
      create: 'match.create.create',
      creating: 'match.create.creating',
      frameTargetPointsBySeat: 'match.create.frameTargetPointsBySeat',
      frameTargetPointsA: 'match.create.frameTargetPointsA',
      frameTargetPointsB: 'match.create.frameTargetPointsB',
      matchTargetFrames: 'match.create.matchTargetFrames',
      invalidFormData: 'match.create.invalidFormData',
      publicUrl: 'match.create.publicUrl',
      controlUrl: 'match.create.controlUrl',
    },
    control: {
      title: 'match.control.title',
      awardFrame: 'match.control.awardFrame',
      startNextFrame: 'match.control.startNextFrame',
      endMatch: 'match.control.endMatch',
      invalidEventPayload: 'match.control.invalidEventPayload',
      eventRejectedByRules: 'match.control.eventRejectedByRules',
      targetReached: 'match.control.targetReached',
      undo: 'match.control.undo',
      offline: 'match.control.offline',
    },
    scoreboard: {
      frames: 'match.scoreboard.frames',
      frame: 'match.scoreboard.frame',
      points: 'match.scoreboard.points',
    },
  },
} as const

export type I18nKey = (typeof keys)[keyof typeof keys] | string
