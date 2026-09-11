import { buildMatchConfig, type CreateMatchRequest } from '@ks/competition'
import {
  getSparringMatchPhase,
  SparringMatchMachine,
  type SparringMatchSnapshot,
} from '@ks/competition/sparring-match-machine'
import { formatPlayerRef, newMatchId } from '@ks/core'
import {
  getLongFreePyramidSparringFramePhase,
  LongFreePyramidSparringFrameMachine,
  type LongFreePyramidSparringFrameSnapshot,
} from '@ks/gameplay/long-free-pyramid-machine'
import {
  getPyramidSparringFramePhase,
  PyramidSparringFrameMachine,
  type PyramidSparringFrameSnapshot,
} from '@ks/gameplay/pyramid-machine'
import {
  getStrilaSparringFramePhase,
  StrilaSparringFrameMachine,
  type StrilaSparringFrameSnapshot,
} from '@ks/gameplay/strila-machine'
import { createBrowserInspector } from '@statelyai/inspect'
import { type ActorRefFrom, createActor } from 'xstate'

type FrameGameKey = 'strila-v2' | 'free-pyramid' | 'free-pyramid-long'

type FrameRuntime =
  | { readonly gameKey: 'strila-v2'; readonly actor: ActorRefFrom<typeof StrilaSparringFrameMachine> }
  | { readonly gameKey: 'free-pyramid'; readonly actor: ActorRefFrom<typeof PyramidSparringFrameMachine> }
  | {
      readonly gameKey: 'free-pyramid-long'
      readonly actor: ActorRefFrom<typeof LongFreePyramidSparringFrameMachine>
    }

type Mode = 'frame' | 'match'

const FREE_PYRAMID_RULES = {
  gameKey: 'free-pyramid' as const,
  allowNegative: false,
  foulPenalty: 'opponent-plus-one' as const,
  shotPointOptions: [1, 2, 4],
}

let inspectorInspect: ReturnType<typeof createBrowserInspector>['inspect'] | undefined

let mode: Mode = 'frame'

let frameGame: FrameGameKey = 'strila-v2'

let targetA = 9

let targetB = 9

let selectedBalls = new Set<number>()

let matchTargetFrames = 3

let matchFrameTargetA = 9

let matchFrameTargetB = 9

let frameRuntime = buildFrameActor()

let matchActor = buildMatchActor()

const controls = document.getElementById('controls')!

const status = document.getElementById('status')!

document.getElementById('open-inspector')!.addEventListener('click', openInspector)

document.getElementById('tab-frame')!.addEventListener('click', () => switchMode('frame'))

document.getElementById('tab-match')!.addEventListener('click', () => switchMode('match'))

function openInspector() {
  if (inspectorInspect) return
  const { inspect } = createBrowserInspector()
  inspectorInspect = inspect
  rebuildCurrentActor()
}

function switchMode(next: Mode) {
  mode = next
  document.getElementById('tab-frame')!.classList.toggle('tab-active', next === 'frame')
  document.getElementById('tab-match')!.classList.toggle('tab-active', next === 'match')
  rebuildCurrentActor()
}

function buildFrameActor(): FrameRuntime {
  switch (frameGame) {
    case 'strila-v2':
      return {
        gameKey: frameGame,
        actor: createActor(StrilaSparringFrameMachine, {
          input: { targetPointsBySeat: { A: targetA, B: targetB } },
          inspect: inspectorInspect,
        }),
      }
    case 'free-pyramid':
      return {
        gameKey: frameGame,
        actor: createActor(PyramidSparringFrameMachine, {
          input: { targetPointsBySeat: { A: targetA, B: targetB }, rules: FREE_PYRAMID_RULES },
          inspect: inspectorInspect,
        }),
      }
    case 'free-pyramid-long':
      return {
        gameKey: frameGame,
        actor: createActor(LongFreePyramidSparringFrameMachine, {
          input: { targetPointsBySeat: { A: targetA, B: targetB }, rackRollover: 14 },
          inspect: inspectorInspect,
        }),
      }
  }

  throw new Error('Unsupported frame game')
}

function subscribeToFrameRuntime(runtime: FrameRuntime) {
  switch (runtime.gameKey) {
    case 'strila-v2':
      runtime.actor.subscribe(() => renderFrame())

      return
    case 'free-pyramid':
      runtime.actor.subscribe(() => renderFrame())

      return
    case 'free-pyramid-long':
      runtime.actor.subscribe(() => renderFrame())
  }
}

const MATCH_CREATE_REQUEST: CreateMatchRequest = {
  gameKey: 'strila-v2',
  targets: {
    frameTargetPointsBySeat: { A: 9, B: 9 },
    matchTargetFrames: 3,
  },
  firstBreakerSeat: 'A',
  participants: [
    { seat: 'A', playerRef: formatPlayerRef('gp', '01HX0000000000000000000000') },
    { seat: 'B', playerRef: formatPlayerRef('gp', '01HX0000000000000000000001') },
  ],
}

function buildExplorerMatchConfig() {
  return buildMatchConfig(newMatchId(), {
    ...MATCH_CREATE_REQUEST,
    targets: {
      frameTargetPointsBySeat: { A: matchFrameTargetA, B: matchFrameTargetB },
      matchTargetFrames,
    },
  })
}

function buildMatchActor() {
  const actor = createActor(SparringMatchMachine, {
    input: buildExplorerMatchConfig(),
    inspect: inspectorInspect,
  })

  actor.start()

  return actor
}

function rebuildCurrentActor() {
  if (mode === 'frame') {
    frameRuntime.actor.stop()
    selectedBalls.clear()
    frameRuntime = buildFrameActor()
    subscribeToFrameRuntime(frameRuntime)
    frameRuntime.actor.start()
    renderFrame()
  } else {
    matchActor.stop()
    matchActor = buildMatchActor()
    matchActor.subscribe(() => renderMatch())
    renderMatch()
  }
}

function renderFrame() {
  const runtime = frameRuntime

  switch (runtime.gameKey) {
    case 'strila-v2':
      renderStrilaFrame(runtime.actor.getSnapshot(), runtime.actor)

      return
    case 'free-pyramid':
      renderPyramidFrame(runtime.actor.getSnapshot(), runtime.actor)

      return
    case 'free-pyramid-long':
      renderLongFreePyramidFrame(runtime.actor.getSnapshot(), runtime.actor)

      return
  }
}

function renderStrilaFrame(
  snap: StrilaSparringFrameSnapshot,
  actor: ActorRefFrom<typeof StrilaSparringFrameMachine>,
) {
  const phase = getStrilaSparringFramePhase(snap)
  const ctx = snap.context
  status.innerHTML = `
    <div class="state-label">${phase}</div>
    <div class="context-block">${JSON.stringify({ score: ctx.score, target: ctx.targetPoints, balls: ctx.coloredBallsOnTable, winner: ctx.winner }, null, 2)}</div>
    <p style="margin-top:8px;color:#888">Topology inspection only - not MatchRoom integration.</p>
  `
  controls.innerHTML = ''
  controls.append(
    frameGameSelector(),
    frameTargetRow(() => rebuildCurrentActor()),
  )

  if (phase === 'frame-over') return

  if (phase === 'not-started') {
    controls.append(
      btn('Break-off A', () => actor.send({ type: 'frame.commence', seat: 'A' })),
      btn('Break-off B', () => actor.send({ type: 'frame.commence', seat: 'B' })),
    )

    return
  }

  if (phase === 'winner-determined') {
    const winner = ctx.winner

    if (winner)
      controls.append(
        btn(`Award frame to ${winner}`, () => actor.send({ type: 'frame.award', seat: winner }), 'primary'),
      )
  }

  controls.append(
    btn('Pot A (+2)', () => actor.send({ type: 'pot.record', seat: 'A', pottedBalls: [1] })),
    btn('Pot B (+2)', () => actor.send({ type: 'pot.record', seat: 'B', pottedBalls: [1] })),
    btn('Foul A', () => actor.send({ type: 'foul.commit', seat: 'A' })),
    btn('Foul B', () => actor.send({ type: 'foul.commit', seat: 'B' })),
  )
}

function renderPyramidFrame(
  snap: PyramidSparringFrameSnapshot,
  actor: ActorRefFrom<typeof PyramidSparringFrameMachine>,
) {
  const phase = getPyramidSparringFramePhase(snap)
  status.innerHTML = `
    <div class="state-label">${phase}</div>
    <div class="context-block">${JSON.stringify(snap.context, null, 2)}</div>
    <p style="margin-top:8px;color:#888">Topology inspection only - not MatchRoom integration.</p>
  `
  controls.innerHTML = ''
  controls.append(
    frameGameSelector(),
    frameTargetRow(() => rebuildCurrentActor()),
  )

  if (phase === 'frame-over') return

  if (phase === 'not-started') {
    controls.append(
      btn('Break-off A', () => actor.send({ type: 'frame.commence', seat: 'A' })),
      btn('Break-off B', () => actor.send({ type: 'frame.commence', seat: 'B' })),
    )

    return
  }

  if (phase === 'winner-determined') {
    const winner = snap.context.winner

    if (winner)
      controls.append(
        btn(`Award frame to ${winner}`, () => actor.send({ type: 'frame.award', seat: winner }), 'primary'),
      )
  }

  controls.append(
    btn('Pot A (+1)', () => actor.send({ type: 'pot.record', seat: 'A', pottedBallCount: 1 })),
    btn('Pot B (+1)', () => actor.send({ type: 'pot.record', seat: 'B', pottedBallCount: 1 })),
    btn('Foul A', () => actor.send({ type: 'foul.commit', seat: 'A' })),
    btn('Foul B', () => actor.send({ type: 'foul.commit', seat: 'B' })),
  )
}

function renderLongFreePyramidFrame(
  snap: LongFreePyramidSparringFrameSnapshot,
  actor: ActorRefFrom<typeof LongFreePyramidSparringFrameMachine>,
) {
  const phase = getLongFreePyramidSparringFramePhase(snap)
  status.innerHTML = `
    <div class="state-label">${phase}</div>
    <div class="context-block">${JSON.stringify(snap.context, null, 2)}</div>
    <p style="margin-top:8px;color:#888">Topology inspection only - not MatchRoom integration.</p>
  `
  controls.innerHTML = ''
  controls.append(
    frameGameSelector(),
    frameTargetRow(() => rebuildCurrentActor()),
  )

  if (phase === 'frame-over') return

  if (phase === 'not-started') {
    controls.append(
      btn('Break-off A', () => actor.send({ type: 'frame.commence', seat: 'A' })),
      btn('Break-off B', () => actor.send({ type: 'frame.commence', seat: 'B' })),
    )

    return
  }

  if (phase === 'winner-determined') {
    const winner = snap.context.winner

    if (winner)
      controls.append(
        btn(`Award frame to ${winner}`, () => actor.send({ type: 'frame.award', seat: winner }), 'primary'),
      )
  }

  controls.append(
    btn('Pot A (+1)', () => actor.send({ type: 'pot.record', seat: 'A', pottedBallCount: 1 })),
    btn('Pot B (+1)', () => actor.send({ type: 'pot.record', seat: 'B', pottedBallCount: 1 })),
    btn('Foul A', () => actor.send({ type: 'foul.commit', seat: 'A' })),
    btn('Foul B', () => actor.send({ type: 'foul.commit', seat: 'B' })),
  )
}

function frameGameSelector() {
  const row = div('display:flex;gap:8px;align-items:center;flex-wrap:wrap;width:100%')
  row.append(label('Frame machine:'))

  for (const key of ['strila-v2', 'free-pyramid', 'free-pyramid-long'] as const) {
    row.append(
      btn(
        key,
        () => {
          frameGame = key
          rebuildCurrentActor()
        },
        frameGame === key ? 'primary' : '',
      ),
    )
  }

  return row
}

function frameTargetRow(onApply: () => void) {
  const row = div('display:flex;gap:8px;align-items:center;flex-wrap:wrap;width:100%')
  row.append(
    btn('Reset frame', onApply, 'primary'),
    label('Target A:'),
    numberInput(targetA, (value) => {
      targetA = value
    }),
    label('Target B:'),
    numberInput(targetB, (value) => {
      targetB = value
    }),
  )

  return row
}

function renderMatch() {
  const snap = matchActor.getSnapshot()
  const phase = getSparringMatchPhase(snap)
  status.innerHTML = `
    <div class="state-label">${phase}</div>
    <div class="context-block">${JSON.stringify(snap.context, null, 2)}</div>
    <p style="margin-top:8px;color:#888">Synthetic frame completions are topology inspection only - not MatchRoom integration.</p>
  `
  renderMatchControls(snap)
}

function renderMatchControls(snap: SparringMatchSnapshot) {
  const phase = getSparringMatchPhase(snap)
  const ctx = snap.context
  controls.innerHTML = ''
  controls.append(
    btn(
      'Reset match',
      () => {
        matchActor.stop()
        matchActor = buildMatchActor()
        matchActor.subscribe(() => renderMatch())
        renderMatch()
      },
      'primary',
    ),
    label('Best of:'),
    numberInput(matchTargetFrames, (value) => {
      matchTargetFrames = value
    }),
    label('Frame target A:'),
    numberInput(matchFrameTargetA, (value) => {
      matchFrameTargetA = value
    }),
    label('Frame target B:'),
    numberInput(matchFrameTargetB, (value) => {
      matchFrameTargetB = value
    }),
  )

  if (phase === 'match-over') return

  if (phase === 'between-frames') {
    controls.append(
      btn(
        `Prepare frame ${ctx.nextFrameIndex}`,
        () =>
          matchActor.send({
            type: 'frame.prepared',
            frameIndex: ctx.nextFrameIndex,
            breakerSeat: ctx.nextFrameIndex % 2 === 1 ? 'A' : 'B',
          }),
        'primary',
      ),
    )

    return
  }

  controls.append(
    el('div', 'Complete the active frame with a synthetic outcome.', 'frame-info'),
    btn('Complete frame: A wins', () => completeMatchFrame(snap, 'A'), 'primary'),
    btn('Complete frame: B wins', () => completeMatchFrame(snap, 'B'), 'primary'),
  )
}

function completeMatchFrame(snap: SparringMatchSnapshot, winnerSeat: 'A' | 'B') {
  const activeFrame = snap.context.activeFrame

  if (!activeFrame) return
  matchActor.send({
    type: 'frame.completed',
    frameIndex: activeFrame.frameIndex,
    outcome: {
      winnerSeat,
      winReason: 'game-rules',
      score: {
        A: winnerSeat === 'A' ? matchFrameTargetA : Math.max(0, matchFrameTargetA - 1),
        B: winnerSeat === 'B' ? matchFrameTargetB : Math.max(0, matchFrameTargetB - 1),
      },
    },
  })
}

function btn(text: string, onClick: () => void, cls = '') {
  const button = document.createElement('button')
  button.textContent = text

  if (cls) button.className = cls
  button.onclick = onClick

  return button
}

function label(text: string) {
  const element = document.createElement('label')
  element.textContent = text

  return element
}

function numberInput(initial: number, onChange: (value: number) => void) {
  const input = document.createElement('input')
  input.type = 'number'
  input.value = String(initial)
  input.min = '1'
  input.max = '30'
  input.onchange = () => onChange(Number(input.value))

  return input
}

function div(style: string, cls = '') {
  const element = document.createElement('div')
  element.style.cssText = style

  if (cls) element.className = cls

  return element
}

function el(tag: string, text: string, id = '') {
  const element = document.createElement(tag)
  element.textContent = text

  if (id) element.id = id

  return element
}

subscribeToFrameRuntime(frameRuntime)

frameRuntime.actor.start()

matchActor.subscribe(() => renderMatch())

renderFrame()
