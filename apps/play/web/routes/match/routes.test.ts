import { describe, expect, test } from 'bun:test'

import type { Application, ReadMatchControlResult, ReadMatchProtocolResult } from '@ks/application'
import type { MatchSnapshotFor } from '@ks/competition'
import {
  type ControlCommand,
  emptyControlCommandSections,
  newCommandId,
  newFactId,
  newMatchId,
  nowUnixEpochMilliseconds,
} from '@ks/core'
import type { GameCreateStateArgs, RegisteredGameKey } from '@ks/gameplay/definitions'
import { applyGameCommand, createInitialGameState, deriveGameControl } from '@ks/gameplay/server'
import { type ComponentType, createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createMemoryRouter, matchRoutes, RouterContextProvider, RouterProvider } from 'react-router'

import { matchControlUrl, matchProtocolUrl, matchUrlForStatus } from '../../features/match-urls'
import routes from '../../routes'
import { cloudflareContext } from '../../server/context'
import { action as createMatchAction } from '../sparring-init/route'
import SparringMatchesRoute from '../sparring-matches'
import CombinedPyramidControlRoute, {
  action as combinedPyramidControlAction,
  loader as combinedPyramidControlLoader,
} from './combined-pyramid-control'
import CombinedPyramidOldControlRoute, {
  action as combinedPyramidOldControlAction,
  loader as combinedPyramidOldControlLoader,
} from './combined-pyramid-old-control'
import CombinedPyramidOldProtocolRoute, { loader as combinedPyramidOldProtocolLoader } from './combined-pyramid-old-protocol'
import CombinedPyramidProtocolRoute, { loader as combinedPyramidProtocolLoader } from './combined-pyramid-protocol'
import FreePyramidControlRoute, {
  action as freePyramidControlAction,
  loader as freePyramidControlLoader,
} from './free-pyramid-control'
import FreePyramidLongControlRoute, {
  action as freePyramidLongControlAction,
  loader as freePyramidLongControlLoader,
} from './free-pyramid-long-control'
import FreePyramidLongProtocolRoute, { loader as freePyramidLongProtocolLoader } from './free-pyramid-long-protocol'
import FreePyramidProtocolRoute, { loader as freePyramidProtocolLoader } from './free-pyramid-protocol'
import { protocolFrameScore } from './shared'
import StrilaV2ControlRoute, { action as strilaControlAction, loader as strilaControlLoader } from './strila-v2-control'
import StrilaV2ProtocolRoute, { loader as strilaProtocolLoader } from './strila-v2-protocol'
import '../../i18n'

const GAME_KEYS = ['strila-v2', 'free-pyramid', 'free-pyramid-long', 'combined-pyramid', 'combined-pyramid-old'] as const
const participants = {
  A: { playerRef: 'player-a', displayName: 'Alice', shortDisplayName: 'Alice' },
  B: { playerRef: 'player-b', displayName: 'Bob', shortDisplayName: 'Bob' },
}

function routeContext(application: Application) {
  const context = new RouterContextProvider()
  context.set(cloudflareContext, { application })
  return context
}

function request(path: string, init?: RequestInit): Request {
  return new Request(new URL(path, 'https://ks.test'), init)
}

function routeArgs(path: string, matchId: string, application: Application, init?: RequestInit) {
  const routeRequest = request(path, init)
  return {
    params: { matchId },
    request: routeRequest,
    context: routeContext(application),
    url: new URL(routeRequest.url),
    pattern: path,
  }
}

async function rejectedResponse(result: Promise<unknown>): Promise<Response> {
  try {
    await result
  } catch (error) {
    if (error instanceof Response) return error
    throw error
  }
  throw new Error('Expected route operation to reject with a response')
}

function snapshotFor<K extends RegisteredGameKey>(
  gameKey: K,
  matchId: ReturnType<typeof newMatchId>,
  lifecycle: 'frame-active' | 'between-frames' | 'finished',
): MatchSnapshotFor<K> {
  const terminal = lifecycle !== 'frame-active'
  const frame: MatchSnapshotFor<K>['frames'][number] = {
    frameIndex: 1,
    pointsBySeat: terminal ? { A: 8, B: 3 } : { A: 2, B: 1 },
    breakerSeat: 'A',
  }
  if (terminal) frame.winnerSeat = 'A'
  return {
    matchId,
    gameKey,
    targets: { frameTargetPointsBySeat: { A: 8, B: 8 }, matchTargetFrames: lifecycle === 'finished' ? 1 : 2 },
    status: lifecycle === 'finished' ? 'finished' : 'active',
    currentFrameIndex: 1,
    framesWonBySeat: terminal ? { A: 1, B: 0 } : { A: 0, B: 0 },
    frames: [frame],
    latestSeq: 4,
  }
}

function initialGameState<K extends RegisteredGameKey>(gameKey: K) {
  const args: GameCreateStateArgs = { targetPointsBySeat: { A: 8, B: 8 }, breakerSeat: 'A' }
  if (gameKey === 'free-pyramid-long') args.gameConfiguration = { rackRollover: 14 }
  return createInitialGameState(gameKey, args)
}

function activeGameState<K extends RegisteredGameKey>(gameKey: K) {
  return applyGameCommand({
    gameKey,
    state: initialGameState(gameKey),
    commandType: 'frame.commence',
    command: { seat: 'A' },
  }).state
}

function applicationFor(lifecycle: 'frame-active' | 'between-frames' | 'finished' = 'frame-active'): Application {
  return {
    createMatch: async () => ({ ok: false, error: 'unused', status: 500 }),
    listMatches: async () => [],
    readMatchControl: async <K extends RegisteredGameKey>(
      matchId: ReturnType<typeof newMatchId>,
      _locale: 'en' | 'uk',
      gameKey: K,
    ): Promise<ReadMatchControlResult<K>> => {
      const snapshot = snapshotFor(gameKey, matchId, lifecycle)
      const controlSections = emptyControlCommandSections()
      if (lifecycle !== 'frame-active') {
        if (lifecycle === 'between-frames') {
          controlSections.neutral.push({
            source: 'match',
            commandType: 'frame.start',
            command: {},
            prominence: 'secondary',
          })
        }
        return { ok: true, state: 'between-frames', snapshot, controlSections, participants }
      }
      const state = activeGameState(gameKey)
      const controlProjection = deriveGameControl(gameKey, state)
      const gameSections = controlProjection.details.commandSections
      controlSections.primary = gameSections.primary
      controlSections.secondary = gameSections.secondary
      controlSections.tertiary = gameSections.tertiary
      return { ok: true, state: 'frame-active', snapshot, controlProjection, controlSections, participants }
    },
    commandMatch: async () => ({ ok: false, error: 'unused', status: 500 }),
    readMatchProtocol: async <K extends RegisteredGameKey>(
      matchId: ReturnType<typeof newMatchId>,
      _timeZone: string,
      _locale: 'en' | 'uk',
      gameKey: K,
    ): Promise<ReadMatchProtocolResult<K>> => {
      const snapshot = snapshotFor(gameKey, matchId, lifecycle)
      const protocolRows = [
        {
          key: 'row-1',
          message: { key: 'match.protocol.commands.game.pot.record', actor: 'Alice', params: { points: 2 } },
          score: { A: 2, B: 1 },
          receivedAt: nowUnixEpochMilliseconds(),
          timeLabel: '12:34',
        },
      ]
      if (lifecycle !== 'frame-active') return { ok: true, snapshot, participants, protocolRows }
      const state = initialGameState(gameKey)
      const controlProjection = deriveGameControl(gameKey, state)
      controlProjection.score = { A: 6, B: 4 }
      return { ok: true, snapshot, controlProjection, participants, protocolRows }
    },
    streamMatchFacts: async () => new Response(null, { status: 204 }),
  }
}

function commandForm(): FormData {
  const form = new FormData()
  form.set('commandId', newCommandId())
  form.set('command', JSON.stringify({ source: 'game', commandType: 'pot.record', command: { seat: 'A', points: 1 } }))
  return form
}

function renderRoute<Data>(Component: ComponentType, data: Data): string {
  const router = createMemoryRouter([{ id: 'leaf', path: '/', Component, loader: () => data }], {
    initialEntries: ['/'],
    hydrationData: { loaderData: { leaf: data } },
  })
  return renderToStaticMarkup(createElement(RouterProvider, { router }))
}

function renderedText(html: string): string {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

const controlRoutes = [
  ['strila-v2', strilaControlLoader, strilaControlAction, StrilaV2ControlRoute, ['Record pot', 'Cue ball (object)']],
  ['free-pyramid', freePyramidControlLoader, freePyramidControlAction, FreePyramidControlRoute, ['+1', '+4']],
  [
    'free-pyramid-long',
    freePyramidLongControlLoader,
    freePyramidLongControlAction,
    FreePyramidLongControlRoute,
    ['Rack 1', '+4'],
  ],
  ['combined-pyramid', combinedPyramidControlLoader, combinedPyramidControlAction, CombinedPyramidControlRoute, ['+1', '+2']],
  [
    'combined-pyramid-old',
    combinedPyramidOldControlLoader,
    combinedPyramidOldControlAction,
    CombinedPyramidOldControlRoute,
    ['+1', '+2'],
  ],
] as const

const protocolRoutes = [
  ['strila-v2', strilaProtocolLoader, StrilaV2ProtocolRoute],
  ['free-pyramid', freePyramidProtocolLoader, FreePyramidProtocolRoute],
  ['free-pyramid-long', freePyramidLongProtocolLoader, FreePyramidLongProtocolRoute],
  ['combined-pyramid', combinedPyramidProtocolLoader, CombinedPyramidProtocolRoute],
  ['combined-pyramid-old', combinedPyramidOldProtocolLoader, CombinedPyramidOldProtocolRoute],
] as const

describe('explicit game routes', () => {
  test('registers ten static leaves and router matching rejects unknown game slugs', () => {
    const paths = routes
      .flatMap((entry) => ('children' in entry ? (entry.children ?? []) : []))
      .map((entry) => entry.path)
      .filter((path) => path?.startsWith('match/'))
    expect(paths).toEqual(
      GAME_KEYS.flatMap((gameKey) => [`match/${gameKey}/:matchId/control/`, `match/${gameKey}/:matchId/protocol/`]),
    )
    expect(
      matchRoutes(
        paths.map((path) => ({ path })),
        '/match/not-a-game/01ARZ3NDEKTSV4RRFFQ69G5FAV/control/',
      ),
    ).toBeNull()
  })

  test.each(controlRoutes)(
    'matching control loader and concrete composition succeed for %s',
    async (gameKey, loader, _action, Component, expectedControls) => {
      const matchId = newMatchId()
      const data = await loader(routeArgs(matchControlUrl(gameKey, matchId), matchId, applicationFor()))
      expect(data.snapshot.gameKey).toBe(gameKey)
      expect(data.state).toBe('frame-active')
      const html = renderRoute(Component, data)
      expect(html).toContain(matchProtocolUrl(gameKey, matchId))
      for (const expectedControl of expectedControls) expect(html).toContain(expectedControl)
    },
  )

  test.each(protocolRoutes)('matching protocol loader and shared rows succeed for %s', async (gameKey, loader, Component) => {
    const matchId = newMatchId()
    const data = await loader(routeArgs(matchProtocolUrl(gameKey, matchId), matchId, applicationFor()))
    expect(data.snapshot.gameKey).toBe(gameKey)
    expect(data.controlProjection?.gameKey).toBe(gameKey)
    const html = renderRoute(Component, data)
    expect(html).toContain('Alice')
    expect(html).toContain(matchControlUrl(gameKey, matchId))
  })

  test.each(controlRoutes)('control action supplies literal key %s', async (gameKey, _loader, action) => {
    const matchId = newMatchId()
    let receivedKey: RegisteredGameKey | undefined
    const application: Application = {
      ...applicationFor(),
      commandMatch: async (_matchId, _commandId, _command, expectedGameKey) => {
        receivedKey = expectedGameKey
        return { ok: true, accepted: [{ seq: 7, factId: newFactId() }] }
      },
    }
    const result = await action(
      routeArgs(matchControlUrl(gameKey, matchId), matchId, application, { method: 'POST', body: commandForm() }),
    )
    expect(result).toEqual({ ok: true, acceptedSeqMax: 7 })
    expect(receivedKey).toBe(gameKey)
  })

  test.each(controlRoutes)('mismatched control loader returns not found for %s', async (gameKey, loader) => {
    const matchId = newMatchId()
    const application: Application = {
      ...applicationFor(),
      readMatchControl: async () => ({ ok: false, error: 'Unknown match', status: 404 }),
    }
    const response = await rejectedResponse(loader(routeArgs(matchControlUrl(gameKey, matchId), matchId, application)))
    expect(response.status).toBe(404)
  })

  test.each(controlRoutes)(
    'between-frame control renders only frame start for %s',
    async (gameKey, loader, _action, Component, gameControls) => {
      const matchId = newMatchId()
      const data = await loader(routeArgs(matchControlUrl(gameKey, matchId), matchId, applicationFor('between-frames')))
      expect(data.state).toBe('between-frames')
      expect(data.snapshot.framesWonBySeat.A).toBeLessThan(data.snapshot.targets.matchTargetFrames)
      const html = renderRoute(Component, data)
      expect(html).toContain('Start next frame')
      for (const gameControl of gameControls) expect(html).not.toContain(gameControl)
    },
  )

  test.each(controlRoutes)(
    'finished control renders terminal state without mutation controls for %s',
    async (gameKey, loader, _action, Component, gameControls) => {
      const matchId = newMatchId()
      const data = await loader(routeArgs(matchControlUrl(gameKey, matchId), matchId, applicationFor('finished')))
      expect(data.snapshot.status).toBe('finished')
      expect(data.snapshot.framesWonBySeat.A).toBe(data.snapshot.targets.matchTargetFrames)
      const html = renderRoute(Component, data)
      expect(html).toContain(matchProtocolUrl(gameKey, matchId))
      expect(renderedText(html)).toContain('Alice1:0Bob')
      expect(html).not.toContain('Start next frame')
      expect(html).not.toContain('End match')
      for (const gameControl of gameControls) expect(html).not.toContain(gameControl)
    },
  )
})

test('mismatched action returns not found from the keyed application response', async () => {
  const matchId = newMatchId()
  let commandCalls = 0
  const application: Application = {
    ...applicationFor(),
    commandMatch: async () => {
      commandCalls += 1
      return { ok: false, error: 'Unknown match', status: 404 }
    },
  }
  const response = await rejectedResponse(
    freePyramidControlAction(
      routeArgs(matchControlUrl('free-pyramid', matchId), matchId, application, { method: 'POST', body: commandForm() }),
    ),
  )
  expect(response.status).toBe(404)
  expect(commandCalls).toBe(1)
})

test('finished action uses the match-locked presentation', async () => {
  const matchId = newMatchId()
  const application: Application = {
    ...applicationFor(),
    commandMatch: async () => ({ ok: false, error: 'Match is finished', status: 409 }),
  }
  const result = await freePyramidControlAction(
    routeArgs(matchControlUrl('free-pyramid', matchId), matchId, application, { method: 'POST', body: commandForm() }),
  )
  expect(result).toEqual({ ok: false, errorKey: 'match.control.matchLocked' })
})

test('unexpected command failures preserve their server status', async () => {
  const matchId = newMatchId()
  const application: Application = {
    ...applicationFor(),
    commandMatch: async () => ({ ok: false, error: 'Room unavailable', status: 503 }),
  }
  const response = await rejectedResponse(
    freePyramidControlAction(
      routeArgs(matchControlUrl('free-pyramid', matchId), matchId, application, { method: 'POST', body: commandForm() }),
    ),
  )
  expect(response.status).toBe(503)
  expect(await response.text()).toBe('Room unavailable')
})

test('control action forwards one complete command unchanged', async () => {
  const matchId = newMatchId()
  let receivedCommand: ControlCommand | undefined
  const application: Application = {
    ...applicationFor(),
    commandMatch: async (_matchId, _commandId, command) => {
      receivedCommand = command
      return { ok: true, accepted: [{ seq: 7, factId: newFactId() }] }
    },
  }
  const result = await freePyramidControlAction(
    routeArgs(matchControlUrl('free-pyramid', matchId), matchId, application, { method: 'POST', body: commandForm() }),
  )
  expect(result).toEqual({ ok: true, acceptedSeqMax: 7 })
  expect(receivedCommand).toEqual({ source: 'game', commandType: 'pot.record', command: { seat: 'A', points: 1 } })
})

test('protocol frame score prefers live projection and otherwise uses snapshot frame score', () => {
  const matchId = newMatchId()
  const activeSnapshot = snapshotFor('free-pyramid', matchId, 'frame-active')
  expect(
    protocolFrameScore(activeSnapshot, {
      gameKey: 'free-pyramid',
      projection: 'control',
      score: { A: 6, B: 4 },
      details: {
        phase: 'open-play',
        situationTitle: 'Open play',
        situationSummary: 'Play',
        isPotCommandAvailable: true,
        commandSections: emptyControlCommandSections(),
      },
    }),
  ).toEqual({ A: 6, B: 4 })
  expect(protocolFrameScore(snapshotFor('free-pyramid', matchId, 'finished'), undefined)).toEqual({ A: 8, B: 3 })
})

test('canonical URLs cover list status, control, protocol, and match creation redirect', async () => {
  const matchId = newMatchId()
  expect(matchUrlForStatus('strila-v2', matchId, 'active')).toBe(matchControlUrl('strila-v2', matchId))
  expect(matchUrlForStatus('strila-v2', matchId, 'finished')).toBe(matchProtocolUrl('strila-v2', matchId))

  const application: Application = {
    ...applicationFor(),
    createMatch: async () => ({ ok: true, matchId }),
  }
  const form = new FormData()
  form.set('seatAName', 'Alice')
  form.set('seatBName', 'Bob')
  form.set('matchTargetFrames', '1')
  form.set('targetA', '9')
  form.set('targetB', '9')
  form.set('firstBreakerSeat', 'A')
  const response = await createMatchAction({
    params: { gameKey: 'strila-v2' },
    request: request('/sparring/init/strila-v2/', { method: 'POST', body: form }),
    context: routeContext(application),
  })
  if (!(response instanceof Response)) throw new Error('Expected match creation redirect')
  expect(response.headers.get('location')).toBe(matchControlUrl('strila-v2', matchId))
})

test('match list renders canonical control and protocol links', () => {
  const activeMatchId = newMatchId()
  const finishedMatchId = newMatchId()
  const createdAt = nowUnixEpochMilliseconds()
  const html = renderRoute(SparringMatchesRoute, {
    matches: [
      {
        matchId: activeMatchId,
        gameKey: 'strila-v2' as const,
        gameTitle: 'Strila',
        status: 'active' as const,
        createdAt,
        participants,
      },
      {
        matchId: finishedMatchId,
        gameKey: 'combined-pyramid' as const,
        gameTitle: 'Combined pyramid',
        status: 'finished' as const,
        createdAt,
        participants,
      },
    ],
  })
  expect(html).toContain(matchControlUrl('strila-v2', activeMatchId))
  expect(html).toContain(matchProtocolUrl('combined-pyramid', finishedMatchId))
})
