import { SparringService } from '@ks/application/server'
import { Effect } from 'effect'
import { RouterContextProvider } from 'react-router'

import { cloudflareContext } from './context.server'

export function sparringContext(overrides: Partial<SparringService['Service']>): RouterContextProvider {
  const unexpected = () => Effect.die(new Error('Unexpected SparringService method'))

  const service = SparringService.of({
    createMatch: unexpected,
    listLiveMatches: unexpected,
    listFinishedMatches: unexpected,
    readMatchScores: unexpected,
    readMatch: unexpected,
    submitMatchCommand: unexpected,
    readMatchProtocol: unexpected,
    admitMatchLive: unexpected,
    ...overrides,
  })

  const provider = new RouterContextProvider()
  provider.set(cloudflareContext, {
    runEffect: Effect.runPromiseWith(SparringService.context(service)),
    isProduction: false,
  })

  return provider
}
