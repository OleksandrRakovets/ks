# MatchRoom

This file describes how MatchRoom is implemented. Use the repository architecture map to decide whether a task belongs here; use this file after that decision.

## Runtime Shape

- `ks-match-room` is an independent Cloudflare Worker with one named `MatchRoom` Durable Object per Match and one SQLite database per object.
- `src/MatchRoom.ts` is the RPC and WebSocket adapter. Keep use-case behavior in the lifecycle handlers, persistence in `MatchStorage`, and socket mechanics in `LiveConnectionHandler`.
- MatchRoom may consume `core`, `gameplay`, and `competition`. It must not import Play, application, or D1 code.
- `fetch` serves only the WebSocket handshake forwarded by Play; MatchRoom has no general HTTP API.
- Constructor migration runs inside `blockConcurrencyWhile`, so no RPC event may observe an unmigrated room.

## Lifecycle Handlers

- Initialization verifies that the Durable Object name matches the input Match ID, persists the same configuration idempotently, and reports different initialization as `initialization-conflict`. Later RPC methods derive identity from the selected object.
- `MatchStorage` lazily reads the single current `MatchRecord` into mutually exclusive active or finalizing pointers. `optionalMatchRecord` is nullable only for initialization; later code uses the required union or lifecycle-specific getters.
- `MatchRoom.#requireHandler` selects the lifecycle handler from `anyMatchRecord`. Active and finalizing handlers proxy their already-narrowed storage record without repeating status checks.
- Handler constructors receive service dependencies, not a record snapshot. Do not pass the record back into storage operations; the repository is already scoped to this Durable Object's Match.
- Creation and Accepted Command transactions update the cached record only after SQLite commits successfully. Keep every future `active_matches` mutation and its cache update in the same storage operation.
- Do not retain a running Match or gameplay actor across requests.
- Active operations restore the request-local aggregate from the checkpoint at the record cursor. Finalizing operations restore the terminal checkpoint. No read replays Accepted Commands.
- Missing storage, a lifecycle mismatch, and corrupt persisted authority are defects that throw. Expected command outcomes remain typed result variants.

## Storage Vocabulary And Boundary

- **Row** means the exact Drizzle/SQLite representation, including columns such as `configJson`, `aggregateJson`, and `entryJson`.
- **Record** means the validated storage representation after JSON columns are parsed and renamed, such as `MatchRecord`, `ActiveMatchRecord`, and `FinalizingMatchRecord`.
- **Domain value** means values owned by core, gameplay, or competition, such as `MatchCommand`, `MatchCheckpoint`, and `ProtocolEntry`.
- `src/storage/schema.ts` defines rows. `src/storage/records.ts` maps rows to validated records or domain values. `src/storage/match-storage.ts` owns queries and transactions.
- Raw `*Json` fields and their parsing must not leave `src/storage`. Name read mappings `*FromRow`; repository and handler APIs expose records or domain values.
- Keep writes beside the insert or update that owns them. Do not add generic `*RowFromRecord` reverse mappings when operations write different column subsets; add one only when multiple operations genuinely assemble the same complete row.
- Validate persisted rows and JSON when they are read from storage. Do not reparse trusted typed RPC values merely because they cross the Play-to-MatchRoom binding.

## Durable Authority

- MatchRoom SQLite owns Accepted Commands and outcomes, their monotonic sequence, complete Protocol entries, executable aggregate checkpoints, the compact score projection, and active/finalizing status.
- Creation stores checkpoint `0`. Every Accepted Command atomically stores its receipt, checkpoint, complete Protocol entries, and updated Match header at the next positive sequence. A rejected command stores only its receipt.
- `previousCheckpointSeq` identifies the prior aggregate checkpoint. A Correction follows any Correction-only links behind its target, restores the effective predecessor, and stores that predecessor on its new checkpoint.
- Correction lookup follows checkpoint links and reads only the target Command and its Protocol batch. Do not recover Correction state by replaying Accepted Commands.
- Compare command retries as decoded values rather than serialized JSON. Reusing a command ID with different content is a conflict.
- Identical accepted and rejected retries return their stored outcomes. After finalization, only retrying the match-ending acceptance reports `endsMatch: true`.
- Score and socket-cursor reads use the compact Match record. Rich reads restore the latest checkpoint. Protocol reads use the stored entries.
- Checkpoints persist XState snapshot values and contexts, not running actors. Do not deploy rule changes while Matches are active; there is no checkpoint-version router or replay fallback.
- The match-ending acceptance stores the terminal checkpoint, `endedAt`, and `finalizing` status in the same transaction. Broadcast and socket closure happen only after that commit.
- `prepareArchive` transfers the checkpoint-derived final state, game result, and stored Protocol. MatchRoom remains finalizing after D1 finishes; finished reads must not return here.
- Finalizing reads do not invoke archive transfer and warn with the Match ID and age. There is no background archival retry or retained-storage cleanup yet.
- The generated control secret is stored here but is not exposed or checked by the current command path.

## Live Connections

- Use only the Durable Object Hibernation API and reconstruct connection metadata from serialized attachments.
- Socket messages are committed-sequence invalidations; React Router loaders remain authoritative.
- Capture the current cursor and accept the socket in the same synchronous event turn. Reject new finalizing connections with `410`.

## Migrations And Checks

- MatchRoom SQLite has a migration history independent from D1. Follow `.tracker/db.md` for schema changes.
- Drizzle generates migration SQL and snapshots. Maintain `drizzle/migrations.js` manually when generating a migration, and do not hand-format generated files.
- Use `bun run --filter '@ks/match-room' test:integration` for storage, lifecycle, RPC, or disposal behavior and `bun run --filter '@ks/match-room' build` for the deployable boundary. Use the root gates according to the root `AGENTS.md`; do not rerun overlapping checks on unchanged code.
