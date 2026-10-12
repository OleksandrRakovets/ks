# Current Architecture

This map records cross-component authority and ordering. Local `AGENTS.md` files own implementation constraints; [database operations](../db.md) owns migration procedures and root [guidance](../../AGENTS.md) owns deployment safety.

## Runtime And Ownership

```text
Browser
  -> Play Worker (React Router and React)
       -> application
            -> D1
            -> internal MATCH_ROOM binding
                 -> named MatchRoom Durable Object
                      -> per-match SQLite
```

| Component | Responsibility | Guidance |
| --- | --- | --- |
| core | Shared IDs, schemas, seats, Protocol values, generic contracts | Root conventions and `GLOSSARY.md` |
| gameplay | Registered games, frame rules, execution and restoration | [Gameplay](../../packages/gameplay/AGENTS.md) |
| competition | Match lifecycle, execution, restoration, Correction and projections | [Competition](../../packages/competition/AGENTS.md) |
| application | Use-case orchestration, private D1 access, source selection, cross-store finalization | [Application](../../packages/application/AGENTS.md) |
| MatchRoom | Serialized active/finalizing execution, SQLite authority, socket fan-out | [MatchRoom](../../do/match-room/AGENTS.md) |
| Play | HTTP, browser presentation, Worker deployment | [Play](../../apps/play/AGENTS.md) |

Domain dependencies flow `core <- gameplay <- competition`. Application and MatchRoom consume the domain independently. Application imports MatchRoom type-only for its private RPC capability; Play exports the class at runtime from its Worker entrypoint. MatchRoom has no D1 dependency or general HTTP API.

### Why One Deployable

Colocation accepts a larger bundle and shared deployment lifecycle in exchange for removing cross-deployment compatibility, local Worker registry orchestration, and branch-preview namespace coupling. Local profiling did not establish a MatchRoom cold-start benefit from a separate Worker.

A Play deployment can restart rooms and close sockets. The root deployment policy therefore requires no Active Matches and no pending archival even for changes unrelated to gameplay. Finished reads use D1; retained rooms need no historical backfills or old-checkpoint routing. New rooms still require schema initialization.

## Data Authority And Trust

| Store | Authority |
| --- | --- |
| D1 | Players, creating/active/finished/discarded Match rows, final Protocol archives and Final Match State |
| MatchRoom SQLite | Active configuration, command receipts and outcomes, monotonic acceptance sequence, Protocol entries, executable checkpoints, active/finalizing/discarded status |

The acceptance ledger stays in MatchRoom and is never mirrored to D1. Execution restores checkpoints, not command replay. Compact score projections and cursors support coherent lightweight reads; projections are reproducible derived data, not a second history authority.

Application selects active reads from MatchRoom and finished reads from D1. A finalizing room may supply a finished-looking projection while D1 remains active; reads do not advance archival. D1-finished reads never select the retained room.

HTTP, browser storage, persisted data, and restored snapshots are validation boundaries. Internal RPC is a trusted typed capability, with generated bindings checking structural compatibility. Expected outcomes are semantic variants; Play maps them to HTTP. Missing or corrupt authority and invalid lifecycle calls throw.

## Creation And Finalization

Creation is application-coordinated:

```text
D1 creating
  -> initialize named MatchRoom with configuration and prepared checkpoint 0
  -> D1 active
```

Initialization binds the room to the routed Match ID and is idempotent. Later calls use the selected room's identity. Ordinary commands check D1 lifecycle, then write only to MatchRoom. Receipts make retries idempotent and reject command-ID reuse with different canonical content.

Finalization crosses stores in this order:

```text
MatchRoom atomically commits match-ending acceptance, Protocol, terminal checkpoint, finalizing status
  -> broadcast match-ending invalidation and close sockets
  -> application checks D1 identity, lifecycle, and archive idempotency
  -> idempotently archive transferred Protocol and Final Match State in D1
  -> mark D1 finished with endedAt, acceptance cursor, and compact final score
```

Application archives the transfer without replaying gameplay. Until D1 completion succeeds, GETs return the room's final projection without writing; a later POST can retry transfer and archival. MatchRoom remains finalizing after D1 completion. This separation preserves a durable terminal result if archival fails and avoids making reads mutate lifecycle.

### Discard Is A Soft Delete, Not A Competitive Outcome

Only Active Matches may be discarded. The room serializes discard against scoring and finalization, persists `discarded` with `endedAt`, and closes sockets before application idempotently marks D1 discarded with that same timestamp. No frame is awarded, winner inferred, acceptance added, or Protocol archived. Existing room history remains internal, with no restoration or public read contract.

Discarded Match/Protocol/score reads behave as missing, including while D1 remains active after a failed write. Lists omit discarded rooms and rows. Reads never complete the D1 write; a later discard or command POST retries it. Creation activation cannot revive a discarded row.

## Live Reads

Play's gateway uses application for transport-neutral D1 admission before forwarding a WebSocket handshake to the selected room. The socket supplies a caught-up cursor followed by committed-sequence invalidations, not replayed commands. Browser loaders remain authoritative.

The match-ending notification precedes D1 archival: revalidation can read either the room's final projection or the D1 archive. Changing read source does not require another notification. A terminal socket hint forces a loader read even with an unchanged cursor; only the committed loader projection confirms Result and releases active-page resources.

Play owns browser freshness separately from MatchRoom's invalidation transport. Browser return and independent HTTP deadlines recover missed notifications and expired list membership without replaying Command POSTs. Loader network completion can precede React's commit, so match freshness acknowledges committed projections, not merely completed requests. Live lists use replacement score projections from application; a periodic membership read removes recent results that left the server window. Finished lists read D1 without room access or polling.

Play sends `Cache-Control: no-store` for SSR HTML and Router loader data, not assets. HTTP caching and in-memory page restoration are separate: cache policy cannot replace lifecycle catch-up. Hide cleanup is best-effort and may never run on mobile process termination; no freshness guarantee depends on a hidden timer or final hide-handler request completing. Play's local guidance and controller declarations own the browser lifecycle constraints and schedules.

## Current Capability Limits

The generated control secret is stored in MatchRoom but is not exposed or checked by the current command path; its existence does not establish command authorization. Finalization retries are POST-driven, with no background archival retry or retained-room cleanup.
