import { matchSparringMachine, getMatchPhase, type MatchSparringActor } from '@ks/competition/match-sparring-machine'
import { opponentOf } from '@ks/core'
import { createBrowserInspector } from '@statelyai/inspect'
import { createActor } from 'xstate'

import type { StrilaBall, StrilaCommand } from '../../../packages/gameplay/src/strila-v2/definitions'
import {
  strilaSparringMachine,
  getPhase,
  type StrilaSparringSnapshot,
} from '../../../packages/gameplay/src/strila-v2/machine-sparring'

const BALLS: StrilaBall[] = [0, 1, 2, 3, 4, 5, 6, 7]
const BALL_LABELS: Record<StrilaBall, string> = { 0: 'Q', 1: '1', 2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7' }

// ── Inspector ────────────────────────────────────────────────────────────────

let inspectorInspect: ReturnType<typeof createBrowserInspector>['inspect'] | undefined

function openInspector() {
  if (inspectorInspect) return
  const { inspect } = createBrowserInspector()
  inspectorInspect = inspect
  rebuildCurrentActor()
}

document.getElementById('open-inspector')!.addEventListener('click', openInspector)

// ── Mode tabs ────────────────────────────────────────────────────────────────

type Mode = 'frame' | 'match'
let mode: Mode = 'frame'

document.getElementById('tab-frame')!.addEventListener('click', () => switchMode('frame'))
document.getElementById('tab-match')!.addEventListener('click', () => switchMode('match'))

function switchMode(m: Mode) {
  mode = m
  document.getElementById('tab-frame')!.classList.toggle('tab-active', m === 'frame')
  document.getElementById('tab-match')!.classList.toggle('tab-active', m === 'match')
  rebuildCurrentActor()
}

// ── Frame actor ──────────────────────────────────────────────────────────────

let targetA = 9
let targetB = 9
let frameActor = buildFrameActor()
let selectedBalls = new Set<StrilaBall>()

function buildFrameActor() {
  return createActor(strilaSparringMachine, {
    input: { targetPointsBySeat: { A: targetA, B: targetB } },
    inspect: inspectorInspect,
  })
}

// ── Match actor ──────────────────────────────────────────────────────────────

let matchTargetFrames = 3
let matchFrameTargetA = 9
let matchFrameTargetB = 9
let matchActor: MatchSparringActor = buildMatchActor()

function buildMatchActor() {
  const actor = createActor(matchSparringMachine, {
    input: { frameTargetPointsBySeat: { A: matchFrameTargetA, B: matchFrameTargetB }, matchTargetFrames },
    inspect: inspectorInspect,
  })
  actor.start()
  return actor
}

function rebuildCurrentActor() {
  if (mode === 'frame') {
    frameActor.stop()
    frameActor = buildFrameActor()
    frameActor.subscribe(() => renderFrame(frameActor.getSnapshot()))
    frameActor.start()
    renderFrame(frameActor.getSnapshot())
  } else {
    matchActor.stop()
    matchActor = buildMatchActor()
    matchActor.subscribe(() => renderMatch())
    renderMatch()
  }
}

// ── Frame rendering ──────────────────────────────────────────────────────────

const controls = document.getElementById('controls')!
const status = document.getElementById('status')!

function renderFrame(snap: StrilaSparringSnapshot) {
  const phase = getPhase(snap)
  const ctx = snap.context

  status.innerHTML = `
    <div class="state-label">${phase}</div>
    <div class="context-block">${JSON.stringify({ score: ctx.score, target: ctx.targetPoints, balls: ctx.coloredBallsOnTable, cueBallStreak: ctx.cueBallSerialPots, winner: ctx.winner, winnerDeterminationReason: ctx.winnerDeterminationReason, foulOffender: ctx.foulOffender }, null, 2)}</div>
  `
  renderFrameControls(snap)
}

function renderFrameControls(snap: StrilaSparringSnapshot) {
  const phase = getPhase(snap)
  const ctx = snap.context
  const isFinal = phase === 'frame-over'

  controls.innerHTML = ''

  const resetRow = div('display:flex;gap:8px;align-items:center;width:100%')
  resetRow.append(
    btn(
      'Reset frame',
      () => {
        selectedBalls.clear()
        frameActor.stop()
        frameActor = buildFrameActor()
        frameActor.subscribe(() => renderFrame(frameActor.getSnapshot()))
        frameActor.start()
        renderFrame(frameActor.getSnapshot())
      },
      'primary',
    ),
    label('Target A:'),
    numberInput(targetA, (v) => {
      targetA = v
    }),
    label('Target B:'),
    numberInput(targetB, (v) => {
      targetB = v
    }),
  )
  controls.append(resetRow)

  if (isFinal) return

  const msgEl = el('span', '', 'message')

  if (phase === 'not-started') {
    controls.append(
      btn('Break-off A', () => frameActor.send({ type: 'frame.commence', seat: 'A' })),
      btn('Break-off B', () => frameActor.send({ type: 'frame.commence', seat: 'B' })),
    )
    return
  }

  if (phase === 'foul-committed.penalty-selection') {
    const offender = ctx.foulOffender!
    const chooser = opponentOf(offender)
    controls.append(
      label(`${chooser} chooses:`),
      btn('Play from position (+1)', () =>
        frameActor.send({ type: 'penalty.select', seat: chooser, choice: 'play-from-position' }),
      ),
      btn('Pass position (+1)', () => frameActor.send({ type: 'penalty.select', seat: chooser, choice: 'pass-position' })),
      btn('Ball in hand', () => frameActor.send({ type: 'penalty.select', seat: chooser, choice: 'ball-in-hand' })),
    )
    return
  }

  // Ball picker
  const potRow = div('display:flex;gap:8px;align-items:center;flex-wrap:wrap')
  potRow.append(label('Pot:'))
  const ballRow = div('display:flex;gap:6px;flex-wrap:wrap', 'ball-row')
  for (const ball of BALLS) {
    const available = ball === 0 || ctx.coloredBallsOnTable.includes(ball as (typeof ctx.coloredBallsOnTable)[number])
    const b = document.createElement('button')
    b.textContent = BALL_LABELS[ball]
    b.className = 'ball-btn'
    b.setAttribute('data-ball', String(ball))
    b.disabled = !available
    if (selectedBalls.has(ball)) b.classList.add('selected')
    b.onclick = () => {
      if (selectedBalls.has(ball)) selectedBalls.delete(ball)
      else selectedBalls.add(ball)
      renderFrameControls(snap)
    }
    ballRow.append(b)
  }
  potRow.append(ballRow)
  for (const seat of ['A', 'B'] as const) {
    potRow.append(
      btn(
        `Pot → ${seat}`,
        () => {
          if (selectedBalls.size === 0) {
            msgEl.textContent = 'Select at least one ball'
            return
          }
          try {
            frameActor.send({
              type: 'pot.record',
              seat,
              pottedBalls: [...selectedBalls] as StrilaCommand[] extends { pottedBalls: infer P }[] ? P : never,
            })
            selectedBalls.clear()
          } catch (e) {
            msgEl.textContent = e instanceof Error ? e.message : String(e)
          }
        },
        selectedBalls.size === 0 ? '' : 'primary',
      ),
    )
  }
  potRow.append(msgEl)
  controls.append(potRow)

  const actionRow = div('display:flex;gap:8px;align-items:center;flex-wrap:wrap')
  if (phase === 'foul-committed.ball-in-hand' || phase === 'respotted-black.opening') {
    for (const seat of ['A', 'B'] as const) {
      actionRow.append(btn(`Miss ${seat}`, () => frameActor.send({ type: 'miss.record', seat })))
      actionRow.append(btn(`Foul ${seat}`, () => frameActor.send({ type: 'foul.commit', seat })))
    }
  } else if (phase === 'respotted-black.play') {
    for (const seat of ['A', 'B'] as const) {
      actionRow.append(btn(`Foul ${seat}`, () => frameActor.send({ type: 'foul.commit', seat })))
    }
  } else {
    for (const seat of ['A', 'B'] as const)
      actionRow.append(btn(`Foul ${seat}`, () => frameActor.send({ type: 'foul.commit', seat })))
  }
  if (phase === 'winner-determined') {
    const sep = el('div', '')
    sep.className = 'sep'
    actionRow.append(
      sep,
      btn(`Award frame → ${ctx.winner}`, () => frameActor.send({ type: 'frame.award', seat: ctx.winner! }), 'primary'),
    )
  }
  controls.append(actionRow)
}

// ── Match rendering ──────────────────────────────────────────────────────────

function renderMatch() {
  const snap = matchActor.getSnapshot()
  const phase = getMatchPhase(snap)
  const ctx = snap.context

  status.innerHTML = `
    <div class="state-label">${phase}</div>
    <div class="context-block">${JSON.stringify({ framesWonBySeat: ctx.framesWonBySeat, matchTargetFrames: ctx.matchTargetFrames, currentFrameIndex: ctx.currentFrameIndex, matchWinner: ctx.matchWinner, frameTargetPointsBySeat: ctx.frameTargetPointsBySeat, frames: ctx.frames }, null, 2)}</div>
  `
  renderMatchControls()
}

function renderMatchControls() {
  const snap = matchActor.getSnapshot()
  const phase = getMatchPhase(snap)
  const ctx = snap.context

  controls.innerHTML = ''

  // Config / reset row
  const resetRow = div('display:flex;gap:8px;align-items:center;flex-wrap:wrap;width:100%')
  resetRow.append(
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
    numberInput(matchTargetFrames, (v) => {
      matchTargetFrames = v
    }),
    label('Frame target A:'),
    numberInput(matchFrameTargetA, (v) => {
      matchFrameTargetA = v
    }),
    label('Frame target B:'),
    numberInput(matchFrameTargetB, (v) => {
      matchFrameTargetB = v
    }),
  )
  controls.append(resetRow)

  if (phase === 'match-over') return

  if (phase === 'match-point-reached') {
    controls.append(btn('End match', () => matchActor.send({ type: 'match.end' }), 'primary'))
    return
  }

  if (phase === 'idle') {
    controls.append(
      btn(
        'Start match',
        () => {
          matchActor.send({
            type: 'match.setup',
            frameTargetPointsBySeat: { A: matchFrameTargetA, B: matchFrameTargetB },
            matchTargetFrames,
          })
        },
        'primary',
      ),
    )
    return
  }

  if (phase === 'between-frames') {
    controls.append(
      btn(`Start frame ${ctx.currentFrameIndex}`, () => matchActor.send({ type: 'frame.start' }), 'primary'),
      btn('End match', () => matchActor.send({ type: 'match.end' })),
    )
    return
  }

  if (phase === 'frame-in-progress') {
    controls.append(
      el(
        'div',
        `Frame ${ctx.currentFrameIndex} is in progress. Complete it here with a synthetic outcome; play-by-play lives in frame mode.`,
        'frame-info',
      ),
      btn('Complete frame: A wins', () => completeMatchFrame('A'), 'primary'),
      btn('Complete frame: B wins', () => completeMatchFrame('B'), 'primary'),
    )
  }
}

function completeMatchFrame(winnerSeat: 'A' | 'B') {
  matchActor.send({
    type: 'frame.completed',
    outcome: {
      winnerSeat,
      winReason: 'target-reached',
      score: {
        A: winnerSeat === 'A' ? matchFrameTargetA : Math.max(0, matchFrameTargetA - 1),
        B: winnerSeat === 'B' ? matchFrameTargetB : Math.max(0, matchFrameTargetB - 1),
      },
    },
  })
}

// ── Shared helpers ────────────────────────────────────────────────────────────

function btn(label: string, onClick: () => void, cls = '') {
  const b = document.createElement('button')
  b.textContent = label
  if (cls) b.className = cls
  b.onclick = onClick
  return b
}

function label(text: string) {
  const l = document.createElement('label')
  l.textContent = text
  return l
}

function numberInput(initial: number, onChange: (v: number) => void) {
  const i = document.createElement('input')
  i.type = 'number'
  i.value = String(initial)
  i.min = '1'
  i.max = '30'
  i.onchange = () => onChange(Number(i.value))
  return i
}

function div(style: string, cls = '') {
  const d = document.createElement('div')
  d.style.cssText = style
  if (cls) d.className = cls
  return d
}

function el(tag: string, text: string, id = '') {
  const e = document.createElement(tag)
  e.textContent = text
  if (id) e.id = id
  return e
}

// ── Boot ─────────────────────────────────────────────────────────────────────

frameActor.subscribe(() => renderFrame(frameActor.getSnapshot()))
frameActor.start()
matchActor.subscribe(() => renderMatch())
renderFrame(frameActor.getSnapshot())
