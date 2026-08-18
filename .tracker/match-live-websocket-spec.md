# Match Live WebSocket Specification

## Purpose

Replace the final SSE implementation with a versioned, framework-neutral, server-to-browser WebSocket protocol using Cloudflare's Durable Object Hibernation API. Commands remain on the application HTTP/RPC path. This slice must not change scoring semantics, persistence, or the public page model.

## Public Route and Connection

The MatchRoom Worker owns one same-origin route conceptually equivalent to:

```text
GET /api/live/matches/:matchId?v=1&since=:latestProcessedSeq
Upgrade: websocket
```

The gateway validates the upgrade, protocol version, normalized `MatchId`, non-negative cursor, origin/access policy, and active D1 catalog status before calling `stub.fetch(request)`. All other public requests are rejected. A finished match must not instantiate an empty DO; a finalizing match drives the idempotent cleanup path instead of opening a socket.

There are no application-level client-to-server messages. Browser code sends score commands through Play; protocol ping/pong is left to Cloudflare. Unexpected client messages are closed as policy violations.

## Shared Wire Contract

Put browser-safe Valibot schemas and inferred types in:

```text
packages/application/src/match-live/protocol.ts
package export: @ks/application/match-live
```

Both MatchRoom and Play import this contract. It may import `MatchIdSchema`, `StoredFactSchema`, and integer schemas from `@ks/core`; it must not import D1, Cloudflare, React, or server-only application modules.

```ts
export const MatchLiveProtocolVersionSchema = v.literal(1)

export const MatchLiveConnectSchema = v.object({
  version: MatchLiveProtocolVersionSchema,
  matchId: MatchIdSchema,
  since: NonNegativeIntegerSchema,
})

export const MatchLiveFactMessageSchema = v.object({
  version: MatchLiveProtocolVersionSchema,
  type: v.literal('fact'),
  fact: StoredFactSchema,
})

export const MatchLiveCaughtUpMessageSchema = v.object({
  version: MatchLiveProtocolVersionSchema,
  type: v.literal('caught-up'),
  matchId: MatchIdSchema,
  latestSeq: NonNegativeIntegerSchema,
})

export const MatchLiveServerMessageSchema = v.variant('type', [MatchLiveFactMessageSchema, MatchLiveCaughtUpMessageSchema])

export type MatchLiveConnect = v.InferOutput<typeof MatchLiveConnectSchema>
export type MatchLiveServerMessage = v.InferOutput<typeof MatchLiveServerMessageSchema>

export const MATCH_LIVE_ENDED_CLOSE_CODE = 4000
export const MATCH_LIVE_ENDED_CLOSE_REASON = 'match-ended'
```

On connection, send facts with `seq > since` in ascending order, followed by `caught-up`. Thereafter send committed facts in sequence order. `match.ended` remains an ordinary domain fact; do not duplicate it as another message type. Because archival precedes its broadcast, receipt means the completed D1 representation is available.

After broadcasting `match.ended`, close every socket with the exported terminal code/reason, delete DO storage, and complete the D1 catalog transition from finalizing to finished. A client stops reconnecting after either processing that fact or observing the terminal close code.

Protocol version 1 is stable for old open pages. Changes must remain additive or introduce a separately negotiated version; never silently change an existing message's meaning.

## Framework-Neutral Browser Client

Put parsing, sequencing, and reconnection logic in a browser-safe module:

```text
packages/application/src/match-live/client.ts
package export: @ks/application/match-live/client
```

Its public interface should be no larger than:

```ts
export type MatchLiveConnectionState =
  | { status: 'connecting' }
  | { status: 'live' }
  | { status: 'retrying'; attempt: number }
  | { status: 'ended' }
  | { status: 'stopped'; reason: 'manual' | 'protocol-error' }

export interface MatchLiveObserver {
  onFact(fact: StoredFact): void
  onCaughtUp(latestSeq: number): void
  onConnectionStateChange(state: MatchLiveConnectionState): void
}

export interface MatchLiveSubscription {
  stop(): void
}

export interface SubscribeToMatchLiveOptions {
  endpoint: string
  matchId: MatchId
  getLatestSeq(): number
  observer: MatchLiveObserver
}

export function subscribeToMatchLive(options: SubscribeToMatchLiveOptions): MatchLiveSubscription
```

The implementation validates every frame with `MatchLiveServerMessageSchema`, ignores duplicate sequences, reconnects from `getLatestSeq()`, and treats a sequence gap as a reconnect rather than applying data out of order. It uses bounded backoff, stops on terminal completion, and stops with `protocol-error` rather than retrying malformed or incompatible messages forever.

Play owns only a small React hook, for example `apps/play/web/live/use-match-live.ts`. It imports `subscribeToMatchLive`, updates its latest-sequence ref in `onFact`, and calls the React Router revalidator from `onFact`, `onCaughtUp`, or terminal/disconnect state as appropriate. No WebSocket parsing or retry state belongs in route components.

## MatchRoom Broadcaster

Keep Cloudflare socket bookkeeping private to `do/match-room/src/live/Broadcaster.ts`. Its internal interface is:

```ts
type MatchLiveAttachment = {
  version: 1
  matchId: MatchId
}

interface MatchLiveBroadcaster {
  accept(socket: WebSocket, attachment: MatchLiveAttachment): void
  send(socket: WebSocket, message: MatchLiveServerMessage): void
  broadcast(message: MatchLiveServerMessage): void
  closeAll(code: number, reason: string): void
}
```

`accept` uses `ctx.acceptWebSocket()` and `serializeAttachment`; `broadcast` and `closeAll` use `ctx.getWebSockets()`. There is no in-memory client set, `setInterval`, or application ping. Attachment data contains only the protocol version and match identity needed after reconstruction.

MatchRoom owns replay queries and ordering: it accepts the socket, reads local facts after the cursor, sends replay plus `caught-up`, and broadcasts only after the accepted-fact transaction commits. Reconstructing the DO during hibernation must not lose subscribers or require an alarm.

## Required Verification

- Schema round-trip and malformed/version-mismatch tests.
- Replay ordering, duplicate suppression, gap recovery, and caught-up semantics.
- Client reconnect uses the latest processed sequence and bounded backoff.
- `match.ended` is delivered once, causes terminal state, closes all sockets, and prevents reconnection/DO recreation.
- Archive failure sends no terminal fact and leaves sockets/storage available for retry.
- Reconstructing MatchRoom finds sockets through `ctx.getWebSockets()` and continues broadcasting.
- Play's browser build of the two match-live subpaths contains no D1, Drizzle, Cloudflare, or server-only application module.
- No SSE route, `ReadableStream` client controller, ping interval, or in-memory client registry remains.
