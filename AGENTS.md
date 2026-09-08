## Product

KS is a two-player billiards scorekeeper with public live scoring. A match is a race across frames; seats are always `A` and `B`. Supported games are registered in `packages/gameplay/src/registry.ts`.

Domain vocabulary and distinctions are defined in CONTEXT.md. Treat it as authoritative when naming concepts in code, tests, UI copy, and architecture documentation.

## Working Mode

- Optimize for architectural clarity and small, reviewable slices.
- Respect an explicit architecture-only phase; otherwise implement and verify changes.
- Ask before adding a package, layer, or major abstraction.
- Keep only durable, current architecture notes in `.tracker/decisions/`.
- Treat new automated test coverage as opt-in. Do not create test files, test-only helpers or fixtures, or materially expand a suite unless the user explicitly requests or approves it. Requests to implement, fix, test, or verify authorize running existing checks and updating existing tests required by the change, not adding broad coverage. If one focused regression test would provide concrete value, explain why and ask first.
- Test each behavior at the lowest layer that owns it. Higher-level tests should cover wiring, persistence, transport, or lifecycle boundaries rather than repeat lower-level rule matrices. Assert observable contracts, not source strings, implementation shape, or the existence of tests.

## Commands

- Install: `bun install`
- Develop on strict port `7529`: `bun run dev`
- Fast gate: `bun run check`
- Full integration/build gate: `bun run check:full`
- Tests: `bun test`; Workerd integration: `bun run test:integration`
- Format/lint: `bun run format`, `bun run format:check`, `bun run lint`, `bun run lint:fix`
- Boundary check: `bun run check:boundaries`
- Local D1: `bun run db:migrate:local`, `bun run db:seed:local`, `bun run db:studio:local`
- Database migration workflows: `.tracker/db.md`

`check:full` is the merge/deployment gate. It includes the fast gate, integration projects, and both deployable builds.

## Dependencies

- Check all workspaces with `bun outdated --recursive`.
- Shared versions belong in root `workspaces.catalog`; consumers use `"catalog:"`.
- Change the owning manifest, then run `bun install` to regenerate `bun.lock`.
- Do not bypass Bun's configured two-day package release cooldown.

## Boundaries

- Domain dependency direction is `core <- gameplay <- competition` and is enforced by `check:boundaries`.
- Routes own HTTP parsing, cookies, redirects, and presentation adaptation. They receive `Application`; SQL, Durable Object calls, and use-case orchestration stay out of routes.
- `@ks/application` owns private D1 adapters and its private typed MatchRoom capability. It must not expose generic repositories.
- MatchRoom must not import Play, application, or D1 code.
- Validate at external trust and representation boundaries: HTTP, persisted rows/JSON, browser storage, and restored machine state. Internal MatchRoom RPC between the owned Play and MatchRoom deployables is a trusted typed capability; do not add runtime schemas or reparse canonical values solely because a call crosses Cloudflare RPC.
- Schemas use Valibot. Prefer built-in actions such as `v.trim()` and `v.parseJson()`. Give the inferred type the exact name as the schema (the core package already does this).
- Use core seat contracts (`Seat`, `BySeatNumber`, `opponentOf`) rather than local equivalents.
- Keep one `game` path; gameplay runtimes own game-specific semantics.
- UI components have one consumer and live in `apps/play/web/components/ui`.

## Authority And Lifecycle

- Accepted Commands, their sequence, and command outcomes are authoritative in each MatchRoom's SQLite database. MatchRoom derives Protocol entries from Accepted Commands; do not mirror active command history into D1.
- D1 owns players, the `matches` table, and completed protocol archives with final match state.
- Resident match/gameplay state and derived Protocol are a disposable cache restored by replaying Accepted Commands; raw XState snapshots are not persisted.
- The match-completing Accepted Command atomically stores Final Match State and `endedAt`. Application treats MatchRoom's Protocol and Final Match State transfer as canonical, checks D1 identity/lifecycle and archive idempotency, archives it without gameplay replay, asks MatchRoom to broadcast/close streams, then marks the match row finished. Finalizing MatchRoom storage is retained.
- Finished reads use D1 and must not access the retained MatchRoom.

## Runtime Notes

- Play and `ks-match-room` are independent Cloudflare Workers. Play reaches MatchRoom through an external Durable Object binding with `script_name`.
- Play and application import `@ks/match-room` type-only. Application derives its private MatchRoom capability from the server class, while Play's generated binding verifies structural RPC compatibility without runtime response parsing.
- Live updates use a versioned WebSocket contract through Play's Worker gateway and the Durable Object Hibernation API. React Router loaders remain authoritative; socket messages are invalidation notifications that request revalidation.
- MatchRoom must be deployed before Play when its external binding changes. The project has not yet been deployed.
- Local Worker variables belong in `apps/play/.dev.vars`; start from `.dev.vars.example`.
- Generated `.react-router/`, `worker-configuration.d.ts`, and Drizzle migrations must not be hand-reformatted. MatchRoom's `drizzle/migrations.js` bundle is maintained manually when migrations are generated.

## Documentation

Document supported interfaces and non-obvious invariants, authority, ordering, mutation, trust, units, or failure behavior. Do not document syntax or self-explanatory DTOs. Put JSDoc on the original declaration and add `@param`, `@returns`, or `@throws` only when they convey information beyond the type.

## File Organization

- Keep a module's primary export near the top, before private helper functions. Place private helpers below the primary implementation so readers encounter the public shape first.
- Use native `#` private members for class internals rather than TypeScript's compile-time-only `private` modifier.
