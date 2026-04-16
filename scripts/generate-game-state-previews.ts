import { applyGameCommand, createInitialGameState, deriveGameProjection } from '../packages/gameplay/src/gameplay'
import { getGameMeta, listGameKeys } from '../packages/gameplay/src/registry'
import { STRILA_PHASE_COMMANDS, type StrilaPhase } from '../packages/gameplay/src/strila-v2/definitions'
import { createEmptyStrilaFrameState } from '../packages/gameplay/src/strila-v2/reducer'

type PhaseDetail = {
  phase: string
  controlCommands: string[]
  reducerAllowedCommands?: string[]
}

type TransitionRow = {
  fromPhase: string
  commandType: string
  toPhase: string
  sample: string
}

type GeneratedGameStateMachine = {
  gameKey: string
  title: { uk: string; en: string }
  sourceFiles: string[]
  phases: string[]
  phaseDetails: PhaseDetail[]
  transitions: TransitionRow[]
}

function phaseOfState(state: unknown): string {
  if (!state || typeof state !== 'object') return 'unknown'
  const maybePhase = (state as { phase?: unknown }).phase
  if (typeof maybePhase === 'string') return maybePhase
  if (maybePhase && typeof maybePhase === 'object' && typeof (maybePhase as { type?: unknown }).type === 'string') {
    return (maybePhase as { type: string }).type
  }
  return 'unknown'
}

function unique(values: string[]): string[] {
  return [...new Set(values)]
}

function controlCommandTypes(gameKey: ReturnType<typeof listGameKeys>[number], state: unknown): string[] {
  const projection = deriveGameProjection({
    gameKey,
    state,
    projection: 'control',
  }) as {
    availableCommands: Array<{ commandType: string }>
  }

  return unique(projection.availableCommands.map((command) => command.commandType))
}

function makePyramidMachine(gameKey: Exclude<ReturnType<typeof listGameKeys>[number], 'strila-v2'>): GeneratedGameStateMachine {
  const meta = getGameMeta(gameKey)
  const initial = createInitialGameState(gameKey, { targetPointsBySeat: meta.defaultFrameTargetPointsBySeat })
  const openPlay = applyGameCommand({
    gameKey,
    state: initial,
    commandType: 'break-off',
    command: { seat: 'A' },
  }).state
  const atTarget = applyGameCommand({
    gameKey,
    state: openPlay,
    commandType: 'shot.recorded',
    command: { seat: 'A', points: meta.defaultFrameTargetPointsBySeat.A },
  }).state
  const frameOver = applyGameCommand({
    gameKey,
    state: atTarget,
    commandType: 'award-frame',
    command: { seat: 'A' },
  }).state

  return {
    gameKey,
    title: meta.title,
    sourceFiles: ['packages/gameplay/src/pyramid/runtime.ts'],
    phases: ['not-started', 'open-play', 'frame-over'],
    phaseDetails: [
      {
        phase: 'not-started',
        controlCommands: controlCommandTypes(gameKey, initial),
      },
      {
        phase: 'open-play',
        controlCommands: controlCommandTypes(gameKey, openPlay),
      },
      {
        phase: 'frame-over',
        controlCommands: controlCommandTypes(gameKey, frameOver),
      },
    ],
    transitions: [
      {
        fromPhase: phaseOfState(initial),
        commandType: 'break-off',
        toPhase: phaseOfState(openPlay),
        sample: 'A opens the frame',
      },
      {
        fromPhase: phaseOfState(openPlay),
        commandType: 'shot.recorded',
        toPhase: phaseOfState(
          applyGameCommand({
            gameKey,
            state: openPlay,
            commandType: 'shot.recorded',
            command: { seat: 'A', points: 1 },
          }).state,
        ),
        sample: 'Ordinary +1 score update',
      },
      {
        fromPhase: phaseOfState(atTarget),
        commandType: 'award-frame',
        toPhase: phaseOfState(frameOver),
        sample: 'Explicit close after reaching target',
      },
    ],
  }
}

function makeStrilaPhaseSamples(): Record<StrilaPhase['type'], any> {
  const initial = createEmptyStrilaFrameState({ A: 9, B: 9 })
  const openPlay = applyGameCommand({
    gameKey: 'strila-v2',
    state: initial,
    commandType: 'break-off',
    command: { actor: 'A' },
  }).state
  const foulResponse = applyGameCommand({
    gameKey: 'strila-v2',
    state: openPlay,
    commandType: 'foul-committed',
    command: { actor: 'A' },
  }).state
  const opponentBallInHand = applyGameCommand({
    gameKey: 'strila-v2',
    state: foulResponse,
    commandType: 'choose-foul-response',
    command: { actor: 'B', choice: 'ball-in-hand' },
  }).state
  const winnerDetermined = applyGameCommand({
    gameKey: 'strila-v2',
    state: openPlay,
    commandType: 'concede-frame',
    command: { actor: 'B' },
  }).state
  const frameOver = applyGameCommand({
    gameKey: 'strila-v2',
    state: winnerDetermined,
    commandType: 'award-frame',
    command: { actor: 'A' },
  }).state

  return {
    'not-started': initial,
    'open-play': openPlay,
    'foul-response': foulResponse,
    'opponent-foul-ball-in-hand': opponentBallInHand,
    'respotted-black-opening': {
      score: { A: 8, B: 8 },
      targetPointsBySeat: { A: 9, B: 9 },
      coloredBallsOnTable: [7],
      phase: { type: 'respotted-black-opening', actor: 'A' },
    },
    'respotted-black-play': {
      score: { A: 8, B: 8 },
      targetPointsBySeat: { A: 9, B: 9 },
      coloredBallsOnTable: [7],
      phase: { type: 'respotted-black-play', actor: 'A' },
    },
    'winner-determined': winnerDetermined,
    'frame-over': frameOver,
  }
}

function makeStrilaMachine(): GeneratedGameStateMachine {
  const samples = makeStrilaPhaseSamples()
  const transitions: TransitionRow[] = []

  const scenarios = [
    { state: samples['not-started'], commandType: 'break-off', command: { actor: 'A' }, sample: 'A starts the frame' },
    {
      state: samples['open-play'],
      commandType: 'record-pot',
      command: { actor: 'A', pottedBalls: [1] },
      sample: 'Ordinary colored pot',
    },
    {
      state: { ...samples['open-play'], score: { A: 4, B: 0 }, targetPointsBySeat: { A: 6, B: 9 } },
      commandType: 'record-pot',
      command: { actor: 'A', pottedBalls: [1] },
      sample: 'Target reached by handicap',
    },
    {
      state: {
        ...samples['open-play'],
        score: { A: 8, B: 8 },
        targetPointsBySeat: { A: 9, B: 9 },
        coloredBallsOnTable: [1],
        phase: { type: 'open-play', actor: 'A', cueBallPotsInRun: 0 },
      },
      commandType: 'record-pot',
      command: { actor: 'A', pottedBalls: [1] },
      sample: 'Last colored ball at 8:8 enters respotted black',
    },
    {
      state: {
        ...samples['open-play'],
        phase: { type: 'open-play', actor: 'A', cueBallPotsInRun: 2 },
      },
      commandType: 'record-pot',
      command: { actor: 'A', pottedBalls: [0] },
      sample: 'Third consecutive cue-ball pot is an automatic foul',
    },
    { state: samples['open-play'], commandType: 'foul-committed', command: { actor: 'A' }, sample: 'Open-play foul' },
    { state: samples['open-play'], commandType: 'concede-frame', command: { actor: 'B' }, sample: 'Opponent concedes' },
    {
      state: samples['foul-response'],
      commandType: 'choose-foul-response',
      command: { actor: 'B', choice: 'play-from-position' },
      sample: 'Chooser takes a point and plays',
    },
    {
      state: samples['foul-response'],
      commandType: 'choose-foul-response',
      command: { actor: 'B', choice: 'ball-in-hand' },
      sample: 'Chooser takes ball in hand',
    },
    {
      state: samples['opponent-foul-ball-in-hand'],
      commandType: 'record-pot',
      command: { actor: 'B', pottedBalls: [1] },
      sample: 'Legal ball-in-hand pot',
    },
    {
      state: samples['opponent-foul-ball-in-hand'],
      commandType: 'record-pot',
      command: { actor: 'B', pottedBalls: [0, 1] },
      sample: 'Illegal cue-plus-colored ball-in-hand pot',
    },
    {
      state: samples['opponent-foul-ball-in-hand'],
      commandType: 'record-miss',
      command: { actor: 'B' },
      sample: 'Ball-in-hand miss',
    },
    {
      state: samples['opponent-foul-ball-in-hand'],
      commandType: 'foul-committed',
      command: { actor: 'B' },
      sample: 'Ball-in-hand foul',
    },
    {
      state: samples['respotted-black-opening'],
      commandType: 'record-pot',
      command: { actor: 'A', pottedBalls: [7] },
      sample: 'Legal black opener pot wins',
    },
    {
      state: samples['respotted-black-opening'],
      commandType: 'record-pot',
      command: { actor: 'A', pottedBalls: [0] },
      sample: 'Illegal opener pot loses by automatic foul',
    },
    {
      state: samples['respotted-black-opening'],
      commandType: 'record-miss',
      command: { actor: 'A' },
      sample: 'Opening miss hands over black play',
    },
    {
      state: samples['respotted-black-opening'],
      commandType: 'foul-committed',
      command: { actor: 'A' },
      sample: 'Opening foul loses frame',
    },
    {
      state: samples['respotted-black-play'],
      commandType: 'record-pot',
      command: { actor: 'A', pottedBalls: [7] },
      sample: 'Black play pot wins',
    },
    {
      state: samples['respotted-black-play'],
      commandType: 'foul-committed',
      command: { actor: 'A' },
      sample: 'Black play foul loses frame',
    },
    {
      state: samples['winner-determined'],
      commandType: 'record-pot',
      command: { actor: 'A', pottedBalls: [7] },
      sample: 'Winner keeps extending the break',
    },
    {
      state: samples['winner-determined'],
      commandType: 'award-frame',
      command: { actor: 'A' },
      sample: 'Operator explicitly closes frame',
    },
  ] as const

  for (const scenario of scenarios) {
    const next = applyGameCommand({
      gameKey: 'strila-v2',
      state: scenario.state,
      commandType: scenario.commandType,
      command: scenario.command,
    }).state

    transitions.push({
      fromPhase: phaseOfState(scenario.state),
      commandType: scenario.commandType,
      toPhase: phaseOfState(next),
      sample: scenario.sample,
    })
  }

  return {
    gameKey: 'strila-v2',
    title: getGameMeta('strila-v2').title,
    sourceFiles: ['packages/gameplay/src/strila-v2/definitions.ts', 'packages/gameplay/src/strila-v2/reducer.ts'],
    phases: Object.keys(STRILA_PHASE_COMMANDS),
    phaseDetails: Object.keys(STRILA_PHASE_COMMANDS).map((phase) => ({
      phase,
      controlCommands: controlCommandTypes('strila-v2', samples[phase as StrilaPhase['type']]),
      reducerAllowedCommands: [...STRILA_PHASE_COMMANDS[phase as StrilaPhase['type']]],
    })),
    transitions,
  }
}

function generate(): { generatedAt: string; games: GeneratedGameStateMachine[] } {
  const games = listGameKeys().map((gameKey) => (gameKey === 'strila-v2' ? makeStrilaMachine() : makePyramidMachine(gameKey)))

  return {
    generatedAt: new Date().toISOString(),
    games,
  }
}

const outputPath = new URL('../clients/rr7/app/routes/preview/generated/game-state-machines.ts', import.meta.url).pathname
const generated = generate()

await (globalThis as unknown as { Bun: { write(path: string, content: string): Promise<number> } }).Bun.write(
  outputPath,
  `// Generated by scripts/generate-game-state-previews.ts. Do not edit by hand.\n\nexport const generatedGameStateMachines = ${JSON.stringify(generated, null, 2)} as const\n`,
)

console.log(`Wrote ${outputPath}`)
