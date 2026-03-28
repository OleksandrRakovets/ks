export const resources = {
  uk: {
    translation: {
      'app.title': 'KS - Keep Score',

      'match.create.title': 'Створити матч',
      'match.create.game': 'Гра',
      'match.create.seatA': 'Гравець A',
      'match.create.seatB': 'Гравець B',
      'match.create.create': 'Створити',
      'match.create.creating': 'Створення...',
      'match.create.frameTargetPointsBySeat': 'Цільові очки фрейму за місцем',
      'match.create.frameTargetPointsA': 'Цільові очки фрейму A',
      'match.create.frameTargetPointsB': 'Цільові очки фрейму B',
      'match.create.matchTargetFrames': 'Цільові фрейми матчу',
      'match.create.invalidFormData': 'Некоректні дані форми',
      'match.create.publicUrl': 'Публічне посилання',
      'match.create.controlUrl': 'Посилання керування',

      'match.control.title': 'Керування матчем',
      'match.control.awardFrame': 'Зарахувати фрейм',
      'match.control.startNextFrame': 'Почати наступний фрейм',
      'match.control.endMatch': 'Завершити матч',
      'match.control.invalidEventPayload': 'Некоректні дані події',
      'match.control.eventRejectedByRules': 'Подію відхилено правилами матчу',
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
      'match.create.creating': 'Creating...',
      'match.create.frameTargetPointsBySeat': 'Frame target points by seat',
      'match.create.frameTargetPointsA': 'Frame target points A',
      'match.create.frameTargetPointsB': 'Frame target points B',
      'match.create.matchTargetFrames': 'Match target frames',
      'match.create.invalidFormData': 'Invalid form data',
      'match.create.publicUrl': 'Public URL',
      'match.create.controlUrl': 'Control URL',

      'match.control.title': 'Match control',
      'match.control.awardFrame': 'Award frame',
      'match.control.startNextFrame': 'Start next frame',
      'match.control.endMatch': 'End match',
      'match.control.invalidEventPayload': 'Invalid event payload',
      'match.control.eventRejectedByRules': 'Event rejected by match rules',
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
