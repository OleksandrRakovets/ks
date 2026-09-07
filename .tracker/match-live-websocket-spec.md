# Match Live WebSocket Specification

## Status and Scope

Approved implementation plan. Deliver the two slices sequentially:

1. move the existing SSE gateway out of React Router and application response pass-through into Play's Worker entry point;
2. replace SSE with a versioned WebSocket protocol using Cloudflare's Durable Object Hibernation API.

Commands remain on the Play → application → MatchRoom RPC path. Neither slice changes scoring semantics, persistence authority, completion ordering, public-read policy, or score-page models. MatchRoom remains a separately deployed, non-public Worker because it owns the externally bound Durable Object class; it has `workers_dev: false` and no route or Custom Domain.

## Slice 7: Play Worker SSE Gateway

### Request path

```text
Current: browser -> React Router loader -> Application Response pass-through -> MatchRoom.stream
Target:  browser -> Play Worker entry gateway -> selected MatchRoom DO
```

Use this same-origin endpoint in both slices so the resource remains explicitly scoped to Sparring Matches and other Match forms can gain independent live contracts later:

```text
GET /api/sparring-match/:matchId/live/?since=:latestProcessedSeq
Accept: text/event-stream
```

Put the Play-owned gateway in `apps/play/workers/sparring-match-live.ts`, with a primary `handleSparringMatchLiveRequest` export called by the Worker entry point before React Router. The gateway validates the method, exact path shape, normalized `MatchId`, and non-negative cursor. It asks a narrow `Application` operation for live admission; application owns the D1 lookup and returns a transport-neutral admitted, unknown, or finished result. Only an active D1 Match is admitted.

```ts
export type SparringMatchLiveAdmission =
  | { readonly _tag: 'admitted' }
  | { readonly _tag: 'unknown' }
  | { readonly _tag: 'finished' }

// Add this operation to the existing Application contract.
admitSparringMatchLive(matchId: MatchId): Promise<SparringMatchLiveAdmission>
```

Missing rows map to `unknown`, active maps to `admitted`, and finished maps to `finished`. A `creating` row is an invariant violation and the application operation throws: match creation writes the D1 row, initializes MatchRoom, and marks the row active before the POST action returns the ID for redirect. Play maps `unknown` to `404` and `finished` to `410`; unexpected defects become `500`. The operation does not select MatchRoom or return an HTTP `Response`.

After admission, the gateway selects `env.MATCH_ROOM.getByName(matchId)` and forwards a canonical request through `stub.fetch()`. MatchRoom's `fetch` verifies that the routed URL identity equals `ctx.id.name`, then delegates to the active handler. Missing MatchRoom storage after active D1 admission is an invariant violation and fails with `500`; finalizing storage returns `410` without opening a stream. The gateway returns the response unchanged so cancellation reaches the stream owner.

Preserve the current SSE wire behavior:

- `ready` contains `{ latestSeq }`;
- `ev` contains one validated `MatchStreamUpdate`;
- replay contains one `command-accepted` update per sequence greater than `since`, in ascending order, followed by `ready`;
- the update with `completesMatch: true` remains withheld until D1 archival succeeds;
- ping and cancellation behavior remain unchanged.

During the transitional SSE slice, these updates are invalidation notifications, not state deltas. A reconnecting page supplies the latest sequence represented by its current loader data. It receives notifications for any later Accepted Commands and then revalidates authoritative state. If iOS unloads the tab, reopening the page first runs the loader for a complete current snapshot and opens a new connection from that snapshot's `latestSeq`; no browser cursor persistence is required. A command accepted between that loader read and connection establishment is covered by replay. Slice 8 replaces this replay with the single-message WebSocket catch-up described below.

After the direct gateway works through the browser:

- remove `apps/play/web/routes/api-match-stream.ts` and its route entry;
- remove `Application.streamMatchUpdates` and its `Response`-returning orchestration;
- retain only the transport-neutral application admission operation;
- retain MatchRoom's SSE broadcaster until Slice 8.

Local development continues to use the existing Vite auxiliary MatchRoom Worker. The browser connects only to Play's port `7529`; Play reaches the same locally simulated MatchRoom namespace through its external Durable Object binding. No local CORS, second port, service-binding proxy, or production pathname routing is required.

### Slice 7 verification

- The entry gateway rejects wrong methods, malformed paths/IDs/cursors, unknown Matches, and finished Matches.
- A `creating` D1 row fails as an invariant violation rather than appearing to be an unknown Match.
- Replay, live delivery, terminal delivery, cancellation, and SSE headers work browser → Play → MatchRoom DO without buffering.
- A finalizing room opens no stream and causes the browser to revalidate; ordinary application reads or commands perform any required idempotent completion recovery.
- React Router no longer handles live requests and application exposes no `Response`-returning operation.
- MatchRoom imports no Play, application, or D1 code.
- Both Workers build independently; `ks-match-room` has no public route or `workers.dev` endpoint.

## Slice 8: Hibernatable WebSockets

### Connection

Reuse the gateway path, now requiring contract version 1, diagnostic page kind, and a WebSocket upgrade:

```text
GET /api/sparring-match/:matchId/live/?contract=1&view=:control|protocol
Upgrade: websocket
```

The Play gateway validates the HTTP representation—including contract version and page kind—and D1 admission before forwarding the canonical request to the selected object. MatchRoom validates the upgrade and its routed identity before creating a `WebSocketPair`. Missing storage after admission fails as an invariant violation; finalizing storage returns `410` without accepting a socket. Because the application has not been deployed, SSE and WebSocket do not need a compatibility overlap or fallback.

There are no application-level client-to-server messages. Commands continue through Play's ordinary HTTP actions. Cloudflare automatically answers incoming WebSocket protocol ping frames without invoking `webSocketMessage` or waking a hibernated object. Browser JavaScript cannot originate protocol ping frames, and the application does not add a heartbeat merely to keep the Durable Object resident: dropped connections recover by reconnecting and comparing the server cursor with current loader data. If production evidence later shows an intermediary needs an application heartbeat, use `setWebSocketAutoResponse()` so `ping`/`pong` messages do not wake MatchRoom. Any other application message closes that socket with policy-violation code `1008`.

An eligible MatchRoom currently hibernates after approximately 10 seconds without an incoming request or event. A score command wakes it, runs the constructor, commits and broadcasts, and then starts a new idle period. The timing is a Cloudflare runtime policy rather than an application guarantee; correctness must not depend on ten seconds. Cloudflare does not charge Durable Object duration during the brief eligible idle window before hibernation.

### Shared wire contract

Extend the browser-safe wire contract already owned by `@ks/core` alongside `MatchStreamUpdate`:

```ts
export const SparringMatchLiveContractVersion = v.literal(1)

export const SparringMatchLiveUpdateMessage = v.pipe(
  v.object({
    contractVersion: SparringMatchLiveContractVersion,
    type: v.literal('update'),
    update: MatchStreamUpdate,
  }),
  v.readonly(),
)

export const SparringMatchLiveCaughtUpMessage = v.pipe(
  v.object({
    contractVersion: SparringMatchLiveContractVersion,
    type: v.literal('caught-up'),
    matchId: MatchId,
    latestSeq: NonNegativeInteger,
  }),
  v.readonly(),
)

export const SparringMatchLiveServerMessage = v.variant('type', [
  SparringMatchLiveUpdateMessage,
  SparringMatchLiveCaughtUpMessage,
])

export const SPARRING_MATCH_LIVE_COMPLETED_CLOSE_CODE = 4000
export const SPARRING_MATCH_LIVE_COMPLETED_CLOSE_REASON = 'match-completed'
```

Each schema's inferred output type has the same name as the schema. The contract imports no application, D1, Drizzle, Cloudflare, React, or gameplay code. MatchRoom and Play consume it from `@ks/core`; MatchRoom never imports `@ks/application`.

On connection, accept the socket, read the current `latestSeq`, and send exactly one `caught-up` message. Do not replay individual updates: `MatchStreamUpdate` is only an invalidation notification and contains no state delta to apply. Establishing the socket and reading the synchronous SQLite cursor occur in one event turn with no `await`. A command committed before that point is represented by `caught-up.latestSeq`; a command committed afterward is broadcast as a live update, so there is no connection race. Broadcast each non-terminal live update only after its Accepted Command transaction commits.

The completing update remains withheld until application has archived the completed Match in D1. Application then calls `MatchRoom.finalize()`, which broadcasts that ordinary update, closes every socket with the exported completion code/reason, and clears resident state. Application finally marks D1 finished. MatchRoom's finalizing SQLite storage is retained; this transport never deletes it or schedules disposal.

### Browser client

Put framework-neutral parsing, sequencing, and reconnection in `apps/play/web/live/sparring-match-live-client.ts`. Keep its public surface to a subscribe function returning `stop()`, with observer callbacks for updates, caught-up state, and connection-state changes. A small React hook owns revalidation and local-command suppression; route components own no WebSocket parsing or retry state.

The client:

- derives `ws:` or `wss:` from `window.location` and uses the relative same-origin gateway path;
- JSON-decodes and validates every frame with `SparringMatchLiveServerMessage`;
- treats `caught-up.latestSeq` as the baseline for subsequent live sequence checks and requests one revalidation when it is newer than current loader data;
- reconnects with bounded exponential backoff and jitter, without sending a browser cursor;
- ignores duplicate live sequences and treats a live sequence gap as a reconnect plus revalidation rather than applying anything out of order;
- tracks the highest server sequence requiring a fresh snapshot and permits at most one loader revalidation at a time; when that request settles, it revalidates again only if returned loader data is still behind the target;
- revalidates on transport failure or the completing update;
- stops after the completing update or completion close code;
- stops with a protocol error rather than retrying malformed or incompatible messages forever.

The React hook uses `useEffect` to start one subscription while an active Sparring Match page is mounted and returns `subscription.stop` as cleanup. This is React's intended synchronization boundary for a network connection. Setup and cleanup must be symmetrical and safe under Strict Mode's development-only setup → cleanup → setup cycle: `stop()` closes the current socket, cancels pending reconnect timers, and makes late events no-ops. Depend only on stable scalar identity/lifecycle values; keep current sequence and callback values behind the framework-neutral subscription interface rather than reconnecting on every render.

Do not add Context or `useSyncExternalStore` for this slice. The socket does not own rendered match data; React Router loaders remain authoritative and socket messages only request revalidation. `useSyncExternalStore` becomes appropriate only if multiple components must render a shared external connection snapshot such as connection status. It would not replace the effect that owns creation and disposal of a route-scoped socket.

### MatchRoom broadcaster

Replace the SSE broadcaster with a hibernatable broadcaster private to MatchRoom. It uses `ctx.acceptWebSocket()`, `ctx.getWebSockets()`, and a serialized attachment containing contract version, a server-generated random connection ID, and validated `control` or `protocol` page kind. The browser includes its page kind in the connection query solely as diagnostic metadata; it grants no authority. The broadcaster holds no JavaScript client registry, `ReadableStream` controller, interval, or application heartbeat.

Add narrow structured lifecycle logs with `console.info` for accepted and closed connections and `console.error` for socket errors. Include event name, Match ID, connection ID, page kind, contract version and, for closure, code/reason/clean state. Do not log IP addresses, headers, control secrets, or full URLs. This introduces no logging abstraction: the events provide the minimum correlation needed to diagnose reconnects and distinguish control-page from protocol-page clients. Ping/pong does not execute these handlers, and logging after a connection event does not prevent subsequent hibernation.

`broadcast` and `closeAll` enumerate `ctx.getWebSockets()`. MatchRoom implements `webSocketMessage`, `webSocketClose`, and `webSocketError`; reconstruction discovers attached sockets through the runtime and does not restore them into an in-memory collection. Correct completion does not depend on whether the client or server close arrives first.

### Slice 8 verification

Update the existing browser live tests and MatchRoom integration tests to cover:

- schema decoding and malformed/contract-version-mismatch handling;
- single-message catch-up, duplicate suppression, gap recovery, and the loader/connection race;
- reconnect with bounded backoff and no update replay;
- completing-update delivery after archive success, terminal revalidation, socket closure, and no reconnect;
- no completing update when archival fails;
- invariant failure for missing storage after admission and refusal to open sockets for retained finalizing storage;
- continued broadcast through `ctx.getWebSockets()` after MatchRoom reconstruction;
- correlated connection lifecycle logs with no sensitive request data;
- independent Play and MatchRoom builds and a browser bundle free of server-only modules;
- removal of the SSE route, controllers, ping timers, and in-memory client registry.

The full gate is `bun run check:full`. Local workerd may exercise hibernation handlers without proving actual eviction; production hibernation eligibility is established by using only the Hibernation API and retaining no JavaScript-only client state after handlers return.
