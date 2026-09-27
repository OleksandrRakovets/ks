## Product

KS is a two-player billiards scorekeeper with public live scoring. A match is a race across frames; seats are always `A` and `B`. Supported games are registered in `packages/gameplay/src/registry.ts`.

Consult the relevant definitions in CONTEXT.md when introducing or changing domain terminology. Treat it as authoritative.

## Working Mode

- Optimize for architectural clarity and small, reviewable slices.
- For change requests, implement and verify unless the user requests an architecture-only or review-first phase. Keep reviews, investigations, and explanations read-only unless changes are requested.
- Ask before adding dependencies or workspace packages, or introducing a new architectural layer. Small internal extractions within existing boundaries do not require approval.
- Keep only durable, current architecture notes in `.tracker/decisions/`.
- Allow focused regression tests for the requested change using existing test infrastructure. Ask before broad coverage expansion, new test infrastructure, or substantial fixtures.
- Test each behavior at the lowest layer that owns it. Higher-level tests should cover wiring, persistence, transport, or lifecycle boundaries rather than repeat lower-level rule matrices. Assert observable contracts, not source strings, implementation shape, or the existence of tests.

## Commands

- Install: `bun install`
- Develop on strict port `7529`: `bun run dev`
- Fast gate: `bun run check`
- Full integration/build gate: `bun run check:full`
- Tests: `bun test`; Workerd integration: `bun run test:integration`
- Format/lint: `bun run format`, `bun run lint`, `bun run lint:fix`
- Boundary check: `bun run check:boundaries`
- Local D1: `bun run db:migrate:local`, `bun run db:seed:local`, `bun run db:studio:local`
- Database migration workflows: `.tracker/db.md`
- UI design rules: `.tracker/design.md`

`typegen` intentionally runs directly before the single root `tsc --build`. Keep it outside Turbo unless generated-output caching provides measured value; there are no per-package typecheck tasks for Turbo to schedule.

`check` and `check:full` apply formatting before running their remaining gates. `check:full` also includes integration projects and both deployable builds.

These commands overlap. Choose the appropriate gate; do not rerun its constituent checks on unchanged code.

## Dependencies

- For dependency audits or upgrades, check all workspaces with `bun outdated --recursive`.
- Shared versions belong in root `workspaces.catalog`; consumers use `"catalog:"`.
- Change the owning manifest, then run `bun install` to regenerate `bun.lock`.
- Do not bypass Bun's configured two-day package release cooldown.
- Keep source-policy tools (`typescript`, `oxlint`, `@oxlint/plugins`, and `oxlint-tsgolint`) on exact versions so compiler or diagnostic changes happen only in explicit toolchain updates.
- Match TypeScript to the TypeScript-Go release embedded by `oxlint-tsgolint`; for example, `oxlint-tsgolint@7.0.2001` embeds TypeScript 7.0.2 plus tsgolint revision 001. Upgrade TypeScript and tsgolint together, update Oxlint and its plugin API deliberately, run `bun install`, then run `bun run check:full`.

## Boundaries

- Domain dependency direction is `core <- gameplay <- competition` and is enforced by `check:boundaries`.
- Routes own HTTP parsing, cookies, redirects, and presentation adaptation. They receive `Application`; SQL, Durable Object calls, and use-case orchestration stay out of routes.
- `@ks/application` owns private D1 adapters and its private typed MatchRoom capability. It must not expose generic repositories.
- MatchRoom must not import Play, application, or D1 code.
- Validate at external trust and representation boundaries: HTTP, persisted rows/JSON, browser storage, and restored machine state. Internal MatchRoom RPC between the owned Play and MatchRoom deployables is a trusted typed capability; do not add runtime schemas or reparse canonical values solely because a call crosses Cloudflare RPC.
- Schemas use Valibot. Prefer built-in actions such as `v.trim()` and `v.parseJson()`. Give the inferred type the exact name as the schema (the core package already does this).
- Use core seat contracts (`Seat`, `BySeatNumber`, `opponentOf`) rather than local equivalents.
- Keep one `game` path; gameplay runtimes own game-specific semantics.
- Play's UI is app-local, not a workspace package. Generic primitives live in `apps/play/web/components/ui`; reusable product visuals or interactions with explicit props may live in `apps/play/web/components`. Keep feature-specific or one-off UI with its feature owner.

## Authority And Lifecycle

- Accepted Commands, their sequence, and command outcomes are authoritative in each MatchRoom's SQLite database. MatchRoom persists complete Protocol entries at acceptance; do not mirror active command history into D1.
- D1 owns players, the `sparring_matches` table, and completed protocol archives with final match state.
- MatchRoom persists one complete aggregate checkpoint per Accepted Command sequence; command execution and rich reads restore a request-local aggregate from the latest checkpoint. Scores read the compact header projection, and no read replays Accepted Commands.
- The match-completing Accepted Command atomically stores its terminal checkpoint and `endedAt`. Application checks D1 identity/lifecycle and archive idempotency, archives MatchRoom's transferred Protocol and checkpoint-derived Final Match State without gameplay replay, asks MatchRoom to broadcast/close streams, then marks the match row finished. Finalizing MatchRoom storage is retained.
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
