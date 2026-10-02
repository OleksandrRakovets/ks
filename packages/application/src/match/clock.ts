import type { Clock } from '@ks/core'
import { Context } from 'effect'

/** Request-local calendar and presentation rules; never shared between Worker requests. */
export class ApplicationClock extends Context.Service<ApplicationClock, Clock>()(
  '@ks/application/match/clock',
) {}
