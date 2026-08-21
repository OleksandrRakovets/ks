## Product context

KS is a billiards scorekeeping app for a local club. Core use case: two-player match scoring from phone/laptop with a public live scoreboard. Games: free pyramid (multiple variants), combined pyramid, Strila. Seats are always `A` and `B`; a match is a race across frames.

The current live transport is SSE. A direct MatchRoom gateway and hibernatable WebSocket replacement are specified but not implemented; see `.tracker/match-live-websocket-spec.md`.

## Working mode (owner preference)

- Architecture-first learning project; optimize for design clarity over shipping speed.
- Work in small slices: interview -> design -> implementation.
- Respect explicit user phase: architecture-only (no code) vs implementation (code allowed).
- Ask before introducing new layers, packages, or major abstractions.
- Keep durable architecture notes in `.tracker/decisions/`.

## Repo map (actual entrypoints)

- Bun workspaces monorepo: `packages/*` (independently testable logic), `apps/*` (user-facing apps), and `do/*` (independently deployed Durable Object Workers).
- Play Cloudflare Worker entrypoint: `apps/play/workers/app.ts`.
- MatchRoom Worker entrypoint: `do/match-room/src/worker.ts`; Durable Object class: `do/match-room/src/MatchRoom.ts`.
- Framework-neutral use cases and private D1 adapters: `packages/application/src/`.
- React Router route tree: `apps/play/web/routes.ts`; route context supplies an `Application`, not raw bindings.
- Global D1 operational assets: `d1/`; per-object SQLite schema and runtime: `do/match-room/src/storage/`.
- Domain direction is `core <- gameplay <- competition`; `application` and `match-room` are separate runtime-facing consumers of the domain packages.

## Commands (source of truth: root and workspace `package.json` files)

- Install deps: `bun install`
- Dev server (strict port `7529`): `bun run dev`
- Local DB migrate: `bun run db:migrate:local`
- Local DB seed: `bun run db:seed:local`
- Browse local D1: `bun run db:studio:local` (remote-box instructions are in `.tracker/db.md`)
- Full repo check/gate: `bun run check`
  - Runs format check, lint, boundary guards, workspace typecheck, and tests.
  - Use this as the default final verification before commits or deploy/build handoff.
- Build both deployables: `bun run build`
- Build one deployable: `bun run --cwd apps/play build` or `bun run --cwd do/match-room build`
- Lint/format: `bun run lint`, `bun run lint:fix`, `bun run format`, `bun run format:check`
- Repo lint/format tooling is `oxlint` + `oxfmt` (Biome/Prettier are intentionally disabled).
- Typecheck workspace graph: `bun run typecheck`
- Typecheck Play app (also regenerates Wrangler + RR types): `bun run --cwd apps/play typecheck`
- Typecheck MatchRoom (also regenerates Wrangler types): `bun run --cwd do/match-room typecheck`
- Boundary guards: `bun run check:boundaries`
- Tests: `bun test` (single file: `bun test packages/gameplay/src/strila-v2/runtime.test.ts`)

## Dependency workflow

- Check outdated deps across the monorepo with `bun outdated --recursive`; plain `bun outdated` only checks the current workspace.
- Shared dependency versions live in root `workspaces.catalog`; package consumers should keep `"catalog:"` instead of hardcoded ranges.
- To update a catalog-managed dependency, edit the root `workspaces.catalog` version first, then run `bun install` to regenerate `bun.lock`.
- To update a non-catalog dependency, edit the package that owns it, then run `bun install`.
- Bun installs intentionally use a 7-day minimum release age cooldown from machine config; do not override it with CLI flags.

## Enforced constraints (do not fight these)

- `check:boundaries` enforces:
  - `packages/core` must not import `@ks/competition` or `@ks/gameplay`.
  - `packages/gameplay` must not import `@ks/competition`.
  - `packages/competition` must not import client packages.
- Schemas use Valibot (`valibot`) across the repo.
- Prefer built-in Valibot actions in schemas; use `v.trim()` rather than adding one-off trim helper functions.
- Prefer Valibot JSON actions such as `v.parseJson()` over one-off `JSON.parse` helper functions when validating JSON strings.

## Architecture guardrails

- Keep route modules thin; route loaders/actions own HTTP, forms, cookies, redirects, and presentation adaptation, while use-case orchestration belongs in `@ks/application`.
- Validate untrusted route input before resolving or invoking the `Application`; pass canonical typed values inward without widening and reparsing them.
- Give routes the `Application` interface. Do not give them raw D1 or MatchRoom bindings or put SQL/DO stub calls in routes.
- Keep D1 schemas and query adapters private to `@ks/application`; expose use cases rather than generic repositories.
- MatchRoom must not import Play, application, or D1 code. `@ks/application` talks to it through a private structural RPC client contract.
- Active-match facts are authoritative in per-object MatchRoom SQLite. D1 owns global players/catalog data and the completed snapshot/protocol archive; do not restore active fact mirroring to D1.
- `match.ended` is terminal. Archive through the application, then ask MatchRoom to broadcast/close/delete its local storage, then mark the D1 catalog finished.
- Reuse shared schemas/types across client/server; server validation is mandatory.
- Parse at representation or trust boundaries, including HTTP, RPC, persisted rows/JSON, browser storage, and restored machine state; do not reparse already-typed internal values.
- Seats are core concepts: use `Seat`, `SeatSchema`, `BySeatNumberSchema`, and `opponentOf` from `@ks/core`; do not recreate seat unions or local opponent helpers.
- Avoid same-process internal HTTP hops unless there is a clear reason.
- Use gameplay registry as the source of game keys: `packages/gameplay/src/registry.ts`.
- Keep one game command path (`game.command`) across games; keep semantics inside gameplay runtimes.
- UI components have one consumer and live in `apps/play/web/components/ui`; do not recreate a shared UI package without a second real consumer.

## Runtime and data quirks

- Runtime consists of two independently built Cloudflare Workers: Play and `ks-match-room`. Play reaches MatchRoom through an external Durable Object binding with `script_name`.
- Play imports `@ks/match-room` only as a type for generated RPC-safe binding types; the MatchRoom implementation is not bundled into Play. Application's runtime client uses a structural stub contract.
- Deploy MatchRoom before Play when first introducing or changing their external binding. This project has not yet been deployed, so the first MatchRoom namespace is intentionally clean.
- There is no CI workflow in this repo right now.
- Local worker env vars come from `apps/play/.dev.vars` (start from `.dev.vars.example`).
- Both Workers use compatibility date `2026-08-11`, which enables current Node.js compatibility without a legacy `nodejs_compat` flag.
- Drizzle ORM and Kit are pinned to `1.0.0-rc.4`. D1 and MatchRoom SQLite have separate schemas and one generated initial migration each; see `.tracker/db.md`.
- Local DB reset: delete `apps/play/.wrangler/state/v3/d1`, then run `bun run db:migrate:local`.
- The control secret is generated and retained in MatchRoom SQLite for future ownership/invite work, but no active command path exposes or authorizes against it yet.
- Current SSE flows through a React Router loader and an application `Response` pass-through. MatchRoom's private broadcaster holds stream controllers and ping timers, so connected SSE clients keep the object active. This is valid Cloudflare behavior, but not hibernatable; only the WebSocket spec changes it.

## Generated assets

- `.react-router/` and `worker-configuration.d.ts` are generated by tooling.
- Drizzle migration SQL/snapshots under `d1/migrations/` and `do/match-room/drizzle/` are generated but reviewed and committed. MatchRoom's explicit `drizzle/migrations.js` bundle is maintained by hand.
