export const resources = {
  uk: {
    translation: {
      'app.title': 'KS - Keep Score',

      'match.create.title': 'Створити матч',
      'match.create.game': 'Гра',
      'match.create.seatA': 'Гравець A',
      'match.create.seatB': 'Гравець B',
      'match.create.create': 'Створити',

      'match.control.title': 'Керування матчем',
      'match.control.awardFrame': 'Зарахувати фрейм',
      'match.control.targetReached': 'Ціль досягнута',
      'match.control.undo': 'Скасувати',
      'match.control.offline': 'Офлайн',

      'match.scoreboard.frames': 'Фрейми',
      'match.scoreboard.frame': 'Фрейм',
      'match.scoreboard.points': 'Очки',
    },
  },
  en: {
    translation: {
      'app.title': 'KS - Keep Score',

      'match.create.title': 'Create match',
      'match.create.game': 'Game',
      'match.create.seatA': 'Player A',
      'match.create.seatB': 'Player B',
      'match.create.create': 'Create',

      'match.control.title': 'Match control',
      'match.control.awardFrame': 'Award frame',
      'match.control.targetReached': 'Target reached',
      'match.control.undo': 'Undo',
      'match.control.offline': 'Offline',

      'match.scoreboard.frames': 'Frames',
      'match.scoreboard.frame': 'Frame',
      'match.scoreboard.points': 'Points',
    },
  },
} as const

export type SupportedLocale = keyof typeof resources
