# Application

Application is the framework-independent use-case layer. It owns D1 access, player-operated workflows, active-versus-finished source selection, and cross-store finalization—not HTTP or game rules.

## Public Surface And Composition

- `src/index.ts` is browser-safe: expose the `Application` type and contracts, not storage classes, generic repositories, internal records, or server dependencies.
- `src/server.ts` (`@ks/application/server`) composes D1, storage, Clock, and the private MatchRoom capability. Only this composition root constructs production storage; tests may construct it against disposable D1.
- Import MatchRoom type-only to derive that capability. Do not add a runtime dependency on its implementation or reparse trusted RPC results.
- Compose Sparring workflows through `createSparringApplication`. Workflows receive structural capabilities, not storage they construct. Exercise workflows through this composition in unit tests.

## Module Boundaries

- Use singular module folders and `contract.ts` for shared inputs, results, and boundary schemas. Keep workflow behavior and listing rules out of contracts.
- Projections are pure functions of domain values or validated records. Participant presentation belongs to `player`; Protocol and last-command projections belong to `match`, independently of Sparring workflows.
- Preserve distinct Match and Protocol reads. Return checked reader-specific projections; full Match State and Game Result remain internal to transfers and archives.
- Modules consume other modules' contracts and pure functions, not concrete storage at runtime. Workflow dependencies may import storage classes type-only.
- Exception: `sparring/storage` may join player tables and reuse `participantRecordFromRow`. Return participant records and format names in application; avoid per-player list queries.

## Storage And Outcomes

- `src/d1/schema.ts` owns shared tables; `src/d1/client.ts` owns client construction and its private type. Only storage class methods execute D1 queries; codecs accept values, never clients.
- **Rows** derive from Drizzle and include raw JSON. **Records** are validated storage values defined independently of Drizzle in each module's `storage/records.ts`. **Domain values** belong to core, gameplay, or competition.
- Keep raw JSON and parsing inside `storage/`. Name row mappers `*FromRow`; `read*` returns records, `find*` nullable lookups, `list*` collections, and private `select*` raw rows.
- Keep writes beside their insert/update. Archive versioning, semantic retry equality, and archive errors belong together in `sparring/storage/protocol-archive.ts`.
- Finished reads use D1 without selecting a room. Finalizing reads project the room's final state without writing; archive transfer and D1 completion belong to command orchestration.
- Discard is an Active-Match soft delete: lock MatchRoom first, then mark D1 discarded without archival. Reads remain write-free and treat either discarded authority as missing; later discard or command POSTs may complete a failed D1 write. Finished/finalizing Matches cannot be discarded.
- Return expected failures as `{ ok: false, reason }`, never HTTP statuses or error strings. Missing/corrupt authority, unsupported archive versions, and invalid lifecycle calls throw.
- Clock timezone defines list-day boundaries, including DST; group by Match start, not end. Only D1-finished rows enter the finished list. Compact score projections are derived data, not history authority.

## Checks And Migrations

- Keep workflow unit tests adjacent to workflows and Workerd tests for D1 storage and composition boundaries in `test/`. Optional diagnostic shortcut from the repository root: `bun run --filter '@ks/application' test:integration`; the root full gate already includes it.
- For schema/data changes, follow the repository-root `docs/db.md`. D1 tooling uses Play's Wrangler configuration and local state; Studio can mutate that database. Do not hand-format generated snapshots.
