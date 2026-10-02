import { Context, Effect, Layer } from 'effect'

import { liveMethods } from './admit-live'
import { creationMethods } from './create-match'
import { listMethods } from './list-matches'
import { readMethods } from './read-match'
import { commandMethods } from './submit-command'

/** Method groups capture private dependencies at construction; public methods need no environment. */
export class SparringService extends Context.Service<SparringService>()(
  '@ks/application/sparring/sparring-service',
  {
    make: Effect.gen(function* () {
      const creation = yield* creationMethods
      const reads = yield* readMethods
      const lists = yield* listMethods
      const commands = yield* commandMethods
      const live = yield* liveMethods

      return { ...creation, ...reads, ...lists, ...commands, ...live }
    }),
  },
) {
  static readonly layer = Layer.effect(this, this.make)
}
