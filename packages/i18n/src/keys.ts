export const keys = {
  appTitle: 'app.title',
  match: {
    create: {
      title: 'match.create.title',
      game: 'match.create.game',
      seatA: 'match.create.seatA',
      seatB: 'match.create.seatB',
      create: 'match.create.create',
    },
    control: {
      title: 'match.control.title',
      awardFrame: 'match.control.awardFrame',
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
