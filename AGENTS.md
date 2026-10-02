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
- Local D1: `bun run --cwd packages/application db:migrate:local`, `bun run --cwd packages/application db:seed:local`, `bun run --cwd packages/application db:studio:local`
- Generate migrations: `bun run --cwd packages/application db:generate`, `bun run --cwd do/match-room db:generate`
- Reset local data: `bun run db:reset:local`
- Database migration workflows: `.tracker/db.md`
- UI design rules: `.tracker/design.md`

`typegen` intentionally runs directly before the single root `tsc --build`. Keep it outside Turbo unless generated-output caching provides measured value; there are no per-package typecheck tasks for Turbo to schedule.

`check` and `check:full` apply formatting before running their remaining gates. `check:full` also includes integration projects and the Play deployable build.

These commands overlap. Choose the appropriate gate; do not rerun its constituent checks on unchanged code.

## Dependencies

- For dependency audits or upgrades, check all workspaces with `bun outdated --recursive`.
- Shared versions belong in root `workspaces.catalog`; consumers use `"catalog:"`.
- Change the owning manifest, then run `bun install` to regenerate `bun.lock`.
- Package-manager and toolchain metadata has consumers outside dependency manifests. Before changing Bun's version, `devEngines.packageManager`, or its representation, inspect `.agents/setup`, `.agents/resume`, and any CI/tooling references; update affected consumers in the same change.
- `.agents/setup` owns orb provisioning and reads the declared Bun version. For changes affecting provisioning, run setup twice to verify idempotence, then run `.agents/resume`. `check:full` does not exercise orb startup.
- Do not bypass Bun's configured two-day package release cooldown.
- Keep source-policy tools (`typescript`, `oxlint`, `@oxlint/plugins`, and `oxlint-tsgolint`) on exact versions so compiler or diagnostic changes happen only in explicit toolchain updates.
- Match TypeScript to the TypeScript-Go release embedded by `oxlint-tsgolint`; for example, `oxlint-tsgolint@7.0.2001` embeds TypeScript 7.0.2 plus tsgolint revision 001. Upgrade TypeScript and tsgolint together, update Oxlint and its plugin API deliberately, run `bun install`, then run `bun run check:full`.

## Vendored Lint Policy

- `tools/oxlint/anti-slop/UPSTREAM.md` records the exact upstream revision and deviations. Re-vendor from the reviewed installer assets at that revision, preserving nested licenses and provenance. Keep implementation files byte-aligned with upstream and excluded from repository lint/format; do not patch rules to silence product findings.
- Tests are not vendored. Run upstream `pnpm check` in a disposable checkout, including generic/Effect RuleTester suites and source/assets parity, then verify copied files against the assets and run the repository gate.
- Keep `oxlint` and `@oxlint/plugins` at matching exact versions. Re-vendoring alone does not require a toolchain upgrade.
- All five `anti-slop-effect` rules are errors in `packages/application` and `apps/play`, which directly depend on Effect. Expand the configured scope as other workspaces migrate; do not force Effect imports into unmigrated packages just to satisfy syntax-wide rules.

## Boundaries

- Domain dependency direction is `core <- gameplay <- competition` and is enforced by `check:boundaries`.
- Routes own HTTP parsing, cookies, redirects, and presentation adaptation. They execute public application services through Play's request-bound `runEffect`; SQL, Durable Object calls, and use-case orchestration stay out of routes.
- `@ks/application` owns private D1 adapters and its private typed MatchRoom capability. It must not expose generic repositories.
- MatchRoom must not import Play, application, or D1 code.
- Validate at external trust and representation boundaries: HTTP, persisted rows/JSON, browser storage, and restored machine state. Internal MatchRoom RPC within the Play Worker is a trusted typed capability; do not add runtime schemas or reparse canonical values solely because a call crosses Cloudflare RPC.
- Boundary schemas use Effect v4 Schema. Prefer built-in validation and transformation APIs. Export schema values without redundant inferred type exports; consumers use `typeof Contract.Type` or a local alias. Keep named type exports for contracts without schemas and generic relationships.
- Use core seat contracts (`Seat`, `BySeatNumber`, `opponentOf`) rather than local equivalents.
- Keep one `game` path; gameplay runtimes own game-specific semantics.
- Gameplay uses its directly declared `tiny-invariant` for predicate/invariant guards; their messages are stripped in production. Unconditional unsupported-case throws may remain explicit. Other packages use explicit/custom errors to retain production diagnostics. Invariant guards do not replace boundary validation or typed rejections.
- Play's UI is app-local, not a workspace package. Generic primitives live in `apps/play/web/components/ui`; reusable product visuals or interactions with explicit props may live in `apps/play/web/components`. Keep feature-specific or one-off UI with its feature owner.

## Effect Adoption

- Migrate coherent capabilities rather than schemas one at a time. Keep synchronous XState/gameplay execution and pure projections in TypeScript unless their migration is requested separately. Preserve invariant throws as defects; do not add retries, fallback paths, or recovery state merely because Effect provides those tools.
- Use installed Effect v4 source and bundled examples as the API reference; v3/beta examples can name removed APIs. Reusable Effect functions use `Effect.fn` for meaningful tracing boundaries or `Effect.fnUntraced` for helpers. `Effect.fn.Return<A, E, R>` defaults omitted error/environment types to `never`; preserve actual failure and dependency channels rather than widening them to `unknown`.
- `Schema.Struct` strips excess properties and its fields/`Schema.Array` outputs are readonly by default; this is type-level readonly, not runtime freezing. Use core `StrictStruct` for closed objects: it checks property names before stripping while leaving nested schema policies intact. Parse options apply throughout decoding; `.annotate({ parseOptions: ... })` does not enforce them in v4. Flat closed boundaries may use decoder `onExcessProperty: 'error'` directly.
- Preserve boundary semantics when composing schemas: `Schema.optional` accepts absent and present `undefined`, unlike `optionalKey`; `Struct({})` is not an object-only empty decoder; exact `Tuple` rejects trailing elements. Preserve cross-field checks when extending a checked Struct rather than spreading only its fields and losing the checks. Native brands affect types only, never persisted values.
- Use core `Integer` for represented integers; `Schema.isInt()` restricts values to safe integers. Shape-only UUID contracts use `Schema.isGUID()`, not the version/variant restrictions of `isUUID()`. Do not tighten persisted or wire acceptance accidentally when choosing built-in checks.
- `Context.Service` classes are service keys, not implementation instances. Their string is runtime identity; use a package-qualified module identifier to avoid collisions. `yield* Service` retrieves the registered value. Layers construct/provide implementations, and reuse of the same layer within a build is memoized; service lifetime follows composition, not each Effect execution.
- Public application services expose Effect use-case methods with private dependencies captured at layer construction. `applicationLayer` exposes only public services; Play builds it once per request and keeps its Scope open through gateway or Router handling. Play's `runEffect` is the local `Effect.runPromiseWith(context)` bridge, not an Effect convention or a per-call layer build. Keep browser-safe contracts separate from server services.
- Focused application modules construct method groups with `Effect.gen`: resolve private services once, close over them in use-case methods, and compose the groups directly in the public service's `make`. Do not add per-method context binding, forwarding wrappers, or extra service tags for these groups.
- Sparring use cases return successful data directly and put expected failures in the typed error channel. Private storage adapters normalize SQL failures to `ApplicationStorageError`, retaining the native cause; RPC rejections and corruption/invariant throws stay defects. Play adapts typed failures with `Effect.catchTags` before `runEffect`, whose public type requires an error channel of `never`; Router Responses are thrown outside Effect execution. Do not add retries without a separate decision. MatchRoom persists `accepted | rejected` receipts; application returns `{ acceptedSeq }` on acceptance and fails with `MatchCommandRejected` carrying the original domain reason on rejection. Browser action `ok` payloads are independent HTTP/UI contracts.
- Construct tagged values through their owning Schema constructors, `Data.taggedEnum` for unschematized unions, or `Data.TaggedError` for unschematized errors. Use `Match` for result adaptation and `Predicate.isTagged` for simple guards. Do not create runtime schemas only to remove type declarations.
- System time can eventually use Effect's shared Clock, but request-local timezone/calendar presentation must remain separate. Do not globalize a clock that combines both responsibilities.

## Architecture Ownership

- Use `.tracker/decisions/current-architecture.md` to identify the component that owns a flow; use a component's local `AGENTS.md` to understand how that component is set up.
- Read `do/match-room/AGENTS.md` before changing active or finalizing Match execution, command receipts, per-match SQLite, checkpoints, Protocol persistence, or match WebSocket fan-out.
- MatchRoom owns serialized active/finalizing execution and its per-match authority. Do not mirror its active command history into D1.
- D1 owns players, the `sparring_matches` lifecycle rows, and completed Protocol archives with final match state. Application owns orchestration between D1 and MatchRoom.
- Finished reads use D1 and must not access the retained MatchRoom.

## Runtime Notes

- Play is the single Cloudflare Worker deployable. It exports the `MatchRoom` Durable Object class from the separate `@ks/match-room` workspace and reaches rooms through an internal binding.
- Application imports `@ks/match-room` type-only to derive its private MatchRoom capability. Play imports the class at runtime only to export it from the Worker entrypoint; generated bindings verify structural RPC compatibility without runtime response parsing.
- Live updates use a versioned WebSocket contract through Play's Worker gateway. React Router loaders remain authoritative; socket messages are invalidation notifications that request revalidation.
- Play's Wrangler configuration owns the MatchRoom class migration. The project is deployed at `https://play.ks.ua`.
- Generated `.react-router/` and `worker-configuration.d.ts` files must not be hand-reformatted.

## Deployment And Compatibility Policy

- Deploy only when there are zero live Matches: no active Matches and no pending finalization/archival. Confirm this before deploying; do not deploy while a Match can still accept commands or requires MatchRoom state for archival.
- Under this deployment policy, MatchRoom SQLite does not require historical data backfills or runtime compatibility fallbacks for old checkpoints. Finished Matches are read from D1, not retained rooms. Keep schema migrations for newly instantiated rooms and do not rewrite applied migration history.
- For D1 schema or persisted-representation changes, prefer explicit schema/data migrations that bring existing production data to the current contract over runtime legacy branches or read-time backfills. Plan migration ordering with the running Worker.
- Call out every added migration and its required deployment ordering to the user and in the PR description. Do not apply remote migrations without explicit authorization.
- If migration alone cannot safely handle existing production data or compatibility, flag the limitation to the user before adding legacy production code. Explain why it is needed, its scope, and when it can be removed; do not introduce speculative fallbacks.

## Documentation

Document supported interfaces and non-obvious invariants, authority, ordering, mutation, trust, units, or failure behavior. Do not document syntax or self-explanatory DTOs. Put JSDoc on the original declaration and add `@param`, `@returns`, or `@throws` only when they convey information beyond the type.

## File Organization

- Keep a module's primary export near the top, before private helper functions. Place private helpers below the primary implementation so readers encounter the public shape first.
- Use native `#` private members for class internals rather than TypeScript's compile-time-only `private` modifier.
