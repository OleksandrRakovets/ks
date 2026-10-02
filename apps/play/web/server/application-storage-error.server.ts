import type { ApplicationStorageError } from '@ks/application/server'

/** Retains the adapter cause in server logs while keeping storage details out of HTTP responses. */
export function applicationStorageErrorResponse(error: ApplicationStorageError): Response {
  console.error('Application storage failed', error)

  return new Response('Internal server error', { status: 500 })
}
