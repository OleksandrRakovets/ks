import { expect, test } from 'bun:test'

import type { Control, MatchCommand } from '@ks/core'

import { presentControls } from './control-presentation'

test('activation preserves the seat and merges selection input, with a fresh ID on every press', () => {
  const control: Control = {
    source: 'game',
    type: 'pot.record',
    seat: 'B',
    prominence: 'primary',
    fixedInput: {},
  }

  const submitted: MatchCommand[] = []

  const [item] = presentControls(
    [control],
    () => ({
      label: 'Pot',
      visibleLabel: 'Pot',
      input: { pottedBalls: [0, 3] },
    }),
    false,
    (command) => {
      submitted.push(command)
    },
  )

  expect(submitted).toEqual([])
  item.onSelect()
  item.onSelect()
  expect(submitted).toHaveLength(2)
  expect(submitted[0]).toMatchObject({
    source: 'game',
    command: { type: 'pot.record', seat: 'B', pottedBalls: [0, 3] },
  })
  expect(submitted[1].command).toEqual(submitted[0].command)
  expect(submitted[1].commandId).not.toBe(submitted[0].commandId)
})

test('busy controls stay visually distinct from controls unavailable without input', () => {
  const control: Control = {
    source: 'game',
    type: 'foul.commit',
    seat: 'A',
    prominence: 'secondary',
    fixedInput: {},
  }

  const [busy] = presentControls(
    [control],
    () => ({ label: 'Foul', visibleLabel: 'Foul' }),
    true,
    () => {},
  )

  const [unavailable] = presentControls(
    [control],
    () => ({ label: 'Foul', visibleLabel: 'Foul', disabled: true }),
    false,
    () => {},
  )

  expect(busy).toMatchObject({ disabled: true, unavailable: false, destructive: true })
  expect(unavailable).toMatchObject({ disabled: true, unavailable: true })
})
