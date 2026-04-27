import { createBrowserInspector } from '@statelyai/inspect'
import { createActor } from 'xstate'

import { strilaSparringMachine, getPhase, type StrilaSparringSnapshot } from '@ks/gameplay/strila-v2/machine-sparring'
import type { StrilaBall, StrilaEvent } from '@ks/gameplay/strila-v2/definitions2'

const BALLS: StrilaBall[] = [0, 1, 2, 3, 4, 5, 6, 7]
const BALL_LABELS: Record<StrilaBall, string> = { 0: 'Q', 1: '1', 2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7' }

// Deferred inspector — opened on button click to avoid popup blockers
let inspectorInspect: ReturnType<typeof createBrowserInspector>['inspect'] | undefined

function openInspector() {
  if (inspectorInspect) return
  const { inspect } = createBrowserInspector()
  inspectorInspect = inspect
  // Rebuild actor with inspect wired in so Stately sees it
  actor.stop()
  actor = buildActor(targetA, targetB)
  actor.subscribe((s) => render(s))
  actor.start()
  render(actor.getSnapshot())
}

function buildActor(targetA: number, targetB: number) {
  return createActor(strilaSparringMachine, {
    input: { targetPointsBySeat: { A: targetA, B: targetB } },
    inspect: inspectorInspect,
  })
}

let targetA = 9
let targetB = 9
let actor = buildActor(targetA, targetB)
actor.start()

const controls = document.getElementById('controls')!
const status = document.getElementById('status')!

let selectedBalls = new Set<StrilaBall>()

function render(snap: StrilaSparringSnapshot) {
  const phase = getPhase(snap)
  const ctx = snap.context

  status.innerHTML = `
    <div class="state-label">${phase}</div>
    <div class="context-block">${JSON.stringify(
      {
        score: ctx.score,
        target: ctx.targetPointsBySeat,
        actor: ctx.actor,
        balls: ctx.coloredBallsOnTable,
        cueBallStreak: ctx.cueBallPotsInRun,
        winner: ctx.winner,
        winReason: ctx.winReason,
        chooser: ctx.chooser,
        offender: ctx.offender,
      },
      null,
      2,
    )}</div>
  `
  renderControls(snap)
}

function renderControls(snap: StrilaSparringSnapshot) {
  const phase = getPhase(snap)
  const ctx = snap.context
  const isFinal = phase === 'frame-over'

  controls.innerHTML = ''

  // Reset row
  const resetRow = div('display:flex;gap:8px;align-items:center;width:100%')
  resetRow.append(
    btn('Reset frame', () => {
      selectedBalls.clear()
      actor.stop()
      actor = buildActor(targetA, targetB)
      actor.subscribe((s) => render(s))
      actor.start()
      render(actor.getSnapshot())
    }, 'primary'),
    label('Target A:'),
    numberInput(targetA, (v) => { targetA = v }),
    label('Target B:'),
    numberInput(targetB, (v) => { targetB = v }),
  )
  controls.append(resetRow)

  if (isFinal) return

  const msgEl = el('span', '', 'id=message')

  // frame.commence
  if (phase === 'not-started') {
    controls.append(
      btn('Break-off A', () => send({ type: 'frame.commence', actor: 'A' })),
      btn('Break-off B', () => send({ type: 'frame.commence', actor: 'B' })),
    )
    return
  }

  // penalty.select
  if (phase === 'penalty-selection') {
    const chooser = ctx.chooser!
    controls.append(
      label(`${chooser} chooses:`),
      btn('Play from position (+1)', () => send({ type: 'penalty.select', actor: chooser, choice: 'play-from-position' })),
      btn('Pass position (+1)', () => send({ type: 'penalty.select', actor: chooser, choice: 'pass-position' })),
      btn('Ball in hand', () => send({ type: 'penalty.select', actor: chooser, choice: 'ball-in-hand' })),
    )
    concede(controls, ctx, phase)
    return
  }

  // pot.record — ball picker
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
      renderControls(snap)
    }
    ballRow.append(b)
  }
  potRow.append(ballRow)

  const seats: Array<'A' | 'B'> = ['A', 'B']
  for (const seat of seats) {
    potRow.append(
      btn(`Pot → ${seat}`, () => {
        if (selectedBalls.size === 0) { msgEl.textContent = 'Select at least one ball'; return }
        try {
          send({ type: 'pot.record', actor: seat, pottedBalls: [...selectedBalls] as StrilaBall[] })
          selectedBalls.clear()
        } catch (e) {
          msgEl.textContent = e instanceof Error ? e.message : String(e)
        }
      }, selectedBalls.size === 0 ? '' : 'primary'),
    )
  }

  potRow.append(msgEl)
  controls.append(potRow)

  const sep = el('div', '')
  sep.className = 'sep'

  // miss / foul
  const actionRow = div('display:flex;gap:8px;align-items:center;flex-wrap:wrap')
  if (phase === 'ball-in-hand' || phase === 'respotted-black-opening') {
    const actor_ = ctx.actor!
    actionRow.append(
      label(`${actor_}:`),
      btn('Miss', () => send({ type: 'miss.record', actor: actor_ })),
      btn('Foul', () => send({ type: 'foul.commit', actor: actor_ })),
    )
  } else if (phase === 'respotted-black-play') {
    const actor_ = ctx.actor!
    actionRow.append(
      label(`${actor_}:`),
      btn('Foul', () => send({ type: 'foul.commit', actor: actor_ })),
    )
  } else {
    for (const seat of seats) {
      actionRow.append(btn(`Foul ${seat}`, () => send({ type: 'foul.commit', actor: seat })))
    }
  }

  // frame.award in winner-determined
  if (phase === 'winner-determined') {
    actionRow.append(sep.cloneNode() as HTMLElement)
    actionRow.append(btn(`Award frame → ${ctx.winner}`, () => send({ type: 'frame.award', actor: ctx.actor ?? ctx.winner! }), 'primary'))
  }

  controls.append(actionRow)
  concede(controls, ctx, phase)
}

function concede(parent: HTMLElement, ctx: StrilaSparringSnapshot['context'], phase: ReturnType<typeof getPhase>) {
  const row = div('display:flex;gap:8px;align-items:center;margin-top:4px')
  const seats: Array<'A' | 'B'> = ['A', 'B']
  for (const seat of seats) {
    row.append(btn(`${seat} concedes`, () => {
      if (phase === 'penalty-selection' && ctx.chooser === seat) return
      send({ type: 'frame.concede', actor: seat })
    }))
  }
  parent.append(row)
}

function send(event: StrilaEvent) {
  const msgEl = document.getElementById('message')
  if (msgEl) msgEl.textContent = ''
  try {
    actor.send(event as Parameters<typeof actor.send>[0])
  } catch (e) {
    const msgEl2 = document.getElementById('message')
    if (msgEl2) msgEl2.textContent = e instanceof Error ? e.message : String(e)
  }
}

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

function el(tag: string, text: string, attr = '') {
  const e = document.createElement(tag)
  e.textContent = text
  if (attr.startsWith('id=')) e.id = attr.slice(3)
  return e
}

document.getElementById('open-inspector')!.addEventListener('click', openInspector)

actor.subscribe((snap) => render(snap))
render(actor.getSnapshot())
