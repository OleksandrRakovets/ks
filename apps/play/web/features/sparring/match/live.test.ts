import { describe, expect, test } from 'bun:test'

import { type ControlLiveState, transitionControlLive } from './live'

const initial: ControlLiveState = { latestSeq: 4, suppressUntilSeq: 4, localSubmitInFlight: false }

describe('control live transitions', () => {
  test('stale updates do nothing', () => {
    expect(transitionControlLive(initial, { type: 'update', seq: 4 })).toEqual({
      state: initial,
      revalidate: false,
    })
  })

  test('accepted local sequences stay suppressed after submission completes', () => {
    const submitting = transitionControlLive(initial, { type: 'submit-started' }).state
    const accepted = transitionControlLive(submitting, { type: 'accepted', seq: 7 }).state
    const finished = transitionControlLive(accepted, { type: 'submit-finished' }).state
    const echoed = transitionControlLive(finished, { type: 'update', seq: 7 })
    expect(echoed.state.latestSeq).toBe(7)
    expect(echoed.revalidate).toBe(false)
    expect(transitionControlLive(echoed.state, { type: 'update', seq: 8 }).revalidate).toBe(true)
  })

  test('finished match revalidates even when its sequence is stale', () => {
    expect(transitionControlLive(initial, { type: 'match-finished', seq: 3 })).toEqual({
      state: initial,
      revalidate: true,
    })
  })
})
