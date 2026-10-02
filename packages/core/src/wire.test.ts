import { expect, test } from 'bun:test'

import { Result, Schema } from 'effect'

import { SparringMatchLiveQuery, SparringMatchLiveServerMessage } from './wire'

test('live query transforms only the supported string version and rejects extra query fields', () => {
  const query = Schema.decodeUnknownSync(SparringMatchLiveQuery)({ contract: '1', view: 'protocol' })

  expect(query).toEqual({ contract: 1, view: 'protocol' })
  expect(Schema.encodeSync(SparringMatchLiveQuery)(query)).toEqual({ contract: '1', view: 'protocol' })

  for (const input of [
    { contract: 1, view: 'protocol' },
    { contract: '2', view: 'control' },
    { contract: '1', view: 'control', extra: 'ignored' },
  ])
    expect(Result.isFailure(Schema.decodeUnknownResult(SparringMatchLiveQuery)(input))).toBe(true)
})

test('server notifications strip unknown fields but retain and validate the acceptance cursor', () => {
  const input = {
    contractVersion: 1,
    type: 'update',
    update: { type: 'command-accepted', acceptedSeq: 7, endsMatch: false, extra: 'ignored' },
    extra: 'ignored',
  }

  expect(Schema.decodeUnknownSync(SparringMatchLiveServerMessage)(input)).toEqual({
    contractVersion: 1,
    type: 'update',
    update: { type: 'command-accepted', acceptedSeq: 7, endsMatch: false },
  })
  expect(
    Result.isFailure(
      Schema.decodeUnknownResult(SparringMatchLiveServerMessage)({
        ...input,
        update: { ...input.update, acceptedSeq: 0 },
      }),
    ),
  ).toBe(true)
})
