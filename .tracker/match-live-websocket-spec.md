# Match Live WebSocket Specification

## Status and Scope

Deferred specification. The implemented architecture still proxies SSE through React Router and keeps each connected MatchRoom active. This document is the only remaining migration plan and owns two sequential behavior changes:

1. move the existing SSE gateway from Play to the MatchRoom Worker without changing its wire behavior;
2. replace SSE with a versioned, framework-neutral WebSocket protocol using Cloudflare's Durable Object Hibernation API.

Commands remain on the Play → application → MatchRoom RPC path. Neither slice changes scoring semantics, active/finished persistence ownership, terminal archival order, authorization policy, or the public score-page model. Finish and verify the gateway move before changing transport.

## Slice 7: Direct MatchRoom SSE Gateway

### Current and target paths

```text
Current: browser -> Play RR loader -> Application Response pass-through -> MatchRoom.stream
Target:  browser -> path-specific MatchRoom Worker route -> selected MatchRoom DO
```

The MatchRoom Worker gains one public same-origin live route, conceptually:

```text
GET /api/live/matches/:matchId?v=1&since=:latestProcessedSeq
Accept: text/event-stream
```

Its Cloudflare route must be more specific than Play's catch-all route. All unrelated public requests are rejected. Local multi-Worker development must exercise the same ownership rather than silently falling back to a React Router route.

The Worker gateway validates method, protocol version, normalized `MatchId`, non-negative cursor, the current public-read policy, and active D1 match status before selecting a named object. Add a narrow server-only `@ks/application/match-live/admission` operation so the D1 query remains application-owned; the MatchRoom Worker is another adapter of that use case. Keep this subpath isolated from general application composition so it does not pull gameplay or React Router code into the Worker bundle. The D1 binding and read belong to the host Worker admission edge, never to the `MatchRoom` class. This guard prevents a finished request from recreating a deleted object's SQLite database.

Forward the accepted request to the selected DO without buffering the response so browser cancellation reaches the stream owner. Preserve the existing SSE contract in this slice:

- `ready` contains `{ latestSeq }`;
- `ev` contains one validated `StoredFact`;
- replay is ordered by integer `seq` and followed by live facts;
- `match.ended` is broadcast only during disposal after the D1 archive exists;
- ping/cancellation behavior is unchanged.

After production-equivalent and local routing tests pass:

- remove `apps/play/web/routes/api-match-stream.ts` and its route entry;
- remove `Application.streamMatchFacts` and the application `Response` pass-through;
- remove the private application stream adapter;
- point the existing browser `EventSource` at the direct gateway;
- retain MatchRoom's SSE broadcaster until Slice 8.

### Slice 7 verification

- Gateway rejects wrong methods, malformed IDs/cursors/versions, inactive matches, and unrelated paths.
- Browser-to-DO replay, live delivery, terminal event, cancellation, and headers work through the public route without buffering.
- Play no longer handles live requests and `@ks/application` exposes no `Response`-returning operation.
- Finished live requests do not select or recreate a deleted MatchRoom.
- Both Workers still build independently; the DO class remains free of Play/application imports, and a bundle audit shows the host pulled only the narrow application admission subpath.

## Slice 8: Hibernatable WebSockets

### Public Route and Connection

Reuse the direct MatchRoom live route, now requiring a WebSocket upgrade:

```text
GET /api/live/matches/:matchId?v=1&since=:latestProcessedSeq
Upgrade: websocket
```

The gateway additionally validates the upgrade headers before calling `stub.fetch(request)`. Finished and finalizing matches do not open a socket or instantiate a finished object's DO; application reads or commands drive required finalizing cleanup.

There are no application-level client-to-server messages. Browser code sends score commands through Play; protocol ping/pong is left to Cloudflare. Unexpected client messages are closed as policy violations.

### Shared Wire Contract

Put browser-safe Valibot schemas and inferred types in:

```text
packages/application/src/match-live/protocol.ts
package export: @ks/application/match-live
```

Both MatchRoom and Play import this contract. It may import `MatchIdSchema`, `StoredFactSchema`, and integer schemas from `@ks/core`; it must not import D1, Drizzle, Cloudflare, React, or server-only application modules. Adding these explicit browser-safe package exports must not expose the application's private D1 or RPC adapters.

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

On connection, send facts with `seq > since` in ascending order, followed by `caught-up`. Accepting the socket, reading replay, and establishing live delivery must have no replay/live race. Thereafter send committed facts in sequence order. `match.ended` remains an ordinary domain fact; do not duplicate it as another message type. Because archival precedes its broadcast, receipt means the completed D1 representation is available.

After the application has archived the finalized facts in D1, it asks MatchRoom to dispose. MatchRoom broadcasts `match.ended`, closes every socket with the exported terminal code/reason, and deletes its storage. The application then transitions the D1 match row from finalizing to finished. A client stops reconnecting after either processing that fact or observing the terminal close code.

Once deployed, protocol version 1 is stable for open pages. Changes must remain additive or introduce a separately negotiated version; never silently change an existing message's meaning. Retaining old hashed browser assets across later deployments remains a separate deployment-policy decision, not part of this transport implementation.

### Framework-Neutral Browser Client

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

The implementation JSON-decodes and validates every frame with `MatchLiveServerMessageSchema`, ignores duplicate sequences, reconnects from `getLatestSeq()`, and treats a sequence gap as a reconnect rather than applying data out of order. It uses bounded backoff, stops on terminal completion, and stops with `protocol-error` rather than retrying malformed or incompatible messages forever.

Play owns only a small React hook, for example `apps/play/web/live/use-match-live.ts`. It imports `subscribeToMatchLive`, updates its latest-sequence ref in `onFact`, and calls the React Router revalidator from `onFact`, `onCaughtUp`, or terminal/disconnect state as appropriate. No WebSocket parsing or retry state belongs in route components.

### MatchRoom Broadcaster

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

`accept` uses `ctx.acceptWebSocket()` and the socket's `serializeAttachment`; `broadcast` and `closeAll` use `ctx.getWebSockets()`. MatchRoom implements the hibernation event handlers (`webSocketMessage`, `webSocketClose`, and `webSocketError`) without introducing an in-memory client registry. There is no `setInterval` or application ping. Attachment data contains only the protocol version and match identity needed after reconstruction.

MatchRoom owns replay queries and ordering: it accepts the socket, reads local facts after the cursor, sends replay plus `caught-up`, and broadcasts ordinary facts only after the accepted-fact transaction commits. The terminal fact is held until the application archives it and requests disposal. Reconstructing the DO during hibernation must not lose subscribers or require an alarm.

The current browser already closes `EventSource` after processing `match.ended`. Preserve that cooperative behavior: the WebSocket client transitions to `ended` and closes locally when it processes the terminal fact, while the server also closes every socket before deleting storage. Correct cleanup must not depend on which close reaches the other side first.

### Required Verification

- Schema round-trip and malformed/version-mismatch tests.
- Replay ordering, duplicate suppression, gap recovery, and caught-up semantics.
- Client reconnect uses the latest processed sequence and bounded backoff.
- `match.ended` is delivered once, causes terminal state, closes all sockets, and prevents reconnection/DO recreation.
- Archive failure sends no terminal fact and leaves sockets/storage available for retry.
- Reconstructing MatchRoom finds sockets through `ctx.getWebSockets()` and continues broadcasting.
- Play's browser build of the two match-live subpaths contains no D1, Drizzle, Cloudflare, or server-only application module.
- No SSE route, `ReadableStream` client controller, ping interval, or in-memory client registry remains.
- After a handler returns, MatchRoom retains no JavaScript-only client state that prevents hibernation.
