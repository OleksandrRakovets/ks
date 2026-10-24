# Play

Play is a two-player billiards scorekeeper with public live scoring, served at `https://play.ks.ua`. Matches are races across frames; seats are `A` and `B`. Consult [GLOSSARY.md](GLOSSARY.md) before naming domain concepts in code or user-facing copy, and when changing domain terminology.

## Components

Domain dependencies flow `core <- gameplay <- competition`. The Worker owns HTTP and presentation; application owns use-case orchestration and D1; MatchRoom owns serialized active/finalizing execution and per-match SQLite. Finished reads use D1 only. Never mirror the active command ledger into D1. Reuse core seat contracts (`Seat`, `BySeatNumber`, `opponentOf`).

Read the owning component's `AGENTS.md` before changing it:

- Worker (this file, below): routes, browser UI, localized copy, Worker deployment.
- [Gameplay](../../packages/gameplay/AGENTS.md): game semantics and frame execution.
- [Competition](../../packages/competition/AGENTS.md): Match lifecycle, restoration, and Correction.
- [Application](../../packages/application/AGENTS.md): workflows, projections, and D1.
- [MatchRoom](../../do/match-room/AGENTS.md): active/finalizing execution, receipts, SQLite, checkpoints, Protocol persistence, and socket fan-out—even when changing a caller outside that directory.
- [Browser E2E](../../packages/play-e2e/README.md): Playwright journeys against the built Worker.

For cross-component changes, read the [architecture map](docs/decisions/current-architecture.md). For schema/data migrations, read [database operations](docs/db.md). Read [design rules](docs/design.md) before changing UI appearance or interaction.

## Commands

Run from the repository root:

- Dev server on strict port `7529`: `bun run play:dev` (`play:dev:human` for the Turbo TUI).
- Full gate: `bun run play:check:full` (the root fast gate plus Workerd integration and the Play build).
- Delivery review: `bun run play:test:e2e` (Chromium), then the root Knip review. The first E2E run on a machine installs its browser; agents should not install it earlier. Fix E2E failures or report them with the failing trace.
- Reset local D1 and MatchRoom state: `bun run play:db:reset:local`.

## Deployment Safety

The owner deploys Play only when no Active Matches and no finalization/archival are pending; if asked to deploy, verify that first. Storage changes may rely on this precondition: no deployment interrupts an Active Match or pending archival, so retained MatchRoom state needs no legacy runtime compatibility (see [MatchRoom](../../do/match-room/AGENTS.md)). Production deployments are tagged `play-deploy-NNN` under the root deployment rules. The Cloudflare Worker is named `ks`; renaming it would create a new Worker and Durable Object namespace.

## Worker

The `worker/play` workspace is Play's single Cloudflare Worker deployable. It owns HTTP and presentation, not domain execution or persistence.

## Server And Transport

- `src` is the Cloudflare Worker layer: `src/index.ts` builds `Application`, forwards live WebSocket handshakes, and hands remaining requests to the React Router app in `src/web` through router context. Keep Worker request dispatch out of `src/web`.
- Routes receive `Application` and own HTTP parsing, cookies, redirects, and presentation adaptation. Keep SQL, direct Durable Object calls, and use-case orchestration out of routes.
- Map application failure reasons to HTTP/presentation with exhaustive switches. Malformed browser input is an expected HTTP failure, not an RPC exception.
- Import the MatchRoom class at runtime only to export it from the Worker entrypoint. Application owns the private typed capability; generated bindings verify structural compatibility.
- The Worker gateway forwards admitted WebSocket handshakes to the selected room. Loader projections remain authoritative; versioned socket messages request revalidation, never apply command deltas locally.
- Active pages catch up on reconnect, browser return (visible, persisted `pageshow`, focus, online), and independent HTTP deadlines that recover silent sockets and list membership. Never replay a Command POST during freshness recovery; gate background match reads across a local submission or discard and its loader refresh.
- A completed Router request is not a committed React projection: acknowledge match reads after the commit, and release live listeners, timers, and sockets at the Result commit, not in a passive effect.
- Hide handlers do brief synchronous cleanup only; nothing may depend on hide events firing. The root error boundary retries failed GETs, excluding genuine 404s; single fetch assigns a failed request to root, so route-level boundaries cannot own network recovery. Finished pages have no live subscriptions or polling. Browser `offline` estimates must not disable controls or stop retries: they do not establish server reachability.

## Superadmin Gate

- `src/superadmin-access.ts` gates every request whose decoded path is `/superadmin`, including Router data, on a valid Cloudflare Access token before React Router runs. It fails closed when configuration, the token, certs, or path decoding fail, and does not trust Access to intercept the path. Only people pass: Access service tokens carry no email and are denied.
- Superadmin is not localized: there is no `/en/superadmin/` route, and its copy is Ukrainian JSX. Every superadmin loader still requires `superadminContext` and 404s without it, as defense in depth against path variants the gate misses.
- `SUPERADMIN_ACCESS_TEAM_DOMAIN` and `SUPERADMIN_ACCESS_AUD` are committed `vars` in `wrangler.jsonc`. Code compiled by the Vite dev server skips the check (the `import.meta.env.KS_DEV_SERVER` define); every build compiles it away regardless of `NODE_ENV` or mode, and a `vite.config.ts` build hook fails a build that keeps it. Never gate the bypass on runtime config or `isProduction`, which is hostname-derived and cosmetic.

## UI Ownership

- Import `web` modules through the `@/` alias, never relative paths; only React Router's generated `./+types/*` imports stay relative. Oxlint enforces this.
- Keep UI app-local. Generic primitives belong in `src/web/components/ui`, reusable product visuals with explicit props in `src/web/components`, and one-off UI with its feature owner.
- UI copy goes through `@ks/i18n` keys and `t()`; add each message to both the `en` and `uk` resources. Game names come from the gameplay registry, and the curated shelf (below) keeps its copy in route-local JSX.
- Browser code uses browser-safe contracts, not executable competition/gameplay entrypoints or application server dependencies.
- Give each game an explicit Match route and Protocol route. The Match loader selects Control or Result from lifecycle; the stable URL does not encode lifecycle state.
- Preserve distinct scoring and Protocol contracts. Play groups flat scoring controls into layout sections; game semantics remain in gameplay.
- Share Active/Finished surface compositions between Match and Protocol pages. Feature-local presentation functions derive copy and emphasis; Shell and Board render resolved props. Page controllers own submission and live revalidation.
- The curated game shelf's localized JSX copy belongs in `src/web/routes/sparring/index.tsx`, independently of registry names used by Setup. Adding a game also requires its card and routes.

## Installed App Launch

- `src/web/features/pwa` owns manifest identity and navigation restoration; `src/web/routes/pwa` adapts them to HTTP. The manifest depends on shared icon metadata, not icon-serving handlers. Preserve `id: "/"`; `/start/` is a launch entrypoint, not localized content.
- Mount `useRememberNavigation` in the successful root `App`, not `Layout`, which also wraps error pages. Remember every successful standalone page's locale, query, and fragment in a seven-day cookie; prefetch, revalidation, error pages, and browser tabs must not overwrite it. Chrome shares cookies between tabs and installed apps: the standalone gate isolates writes, not cookie storage or transmission.
- `/start/` validates the untrusted destination and returns an uncached redirect, falling back to home when absent or invalid and never resuming itself. Ordinary page URLs never auto-resume. This restores navigation only, not in-memory UI or authoritative Match state.

## Test Boundaries

- Do not add a unit test merely because a function or component was added or changed. Before adding one, identify the observable rule and a plausible incorrect decision it would catch; the test should survive moving or inlining helpers without changing that rule.
- Unit-test Play-owned decisions: input acceptance/rejection, HTTP status and redirect mapping, live-revalidation transitions, and non-trivial presentation choices such as score emphasis or control availability. Pure functions are suitable when they make these decisions; purity alone does not justify a test. Keep game-rule matrices in gameplay, not Play.
- Do not unit-test JSX output, rendered markup, component trees, snapshots, class names, or component/prop composition. Rendering, accessibility, styling, and user interactions belong in browser checks. Test presentation decisions through semantic values, not their JSX encoding.
- Skip assertions that merely restate construction or wiring: a factory returns its supplied/newly defined function, a wrapper forwards unchanged arguments or props, or a helper reproduces a literal object. Assert identity, invocation order, or call counts only when they are themselves required observable behavior, not incidental implementation choices. Route tests should assert the HTTP contract rather than just mocked calls.
- Do not extract helpers, widen exports, or add `@internal` tags solely to make trivial wiring unit-testable. Prefer an existing behavioral entrypoint; a small pure decision function is appropriate when it also clarifies production code.
- `packages/play-e2e` checks browser wiring against the built Worker with disposable persistence; see its README for setup, focused runs, and simulation limits. It runs in the delivery review, not the root gates; also run `bun run play:test:e2e:webkit` for freshness or lifecycle changes. Add browser journeys there for rendering, interaction, and cross-component wiring instead of JSX unit tests. For UI changes, also exercise affected states in the browser, inspect them against the design rules, and report any gaps; browser tests do not replace visual inspection or real-device Safari checks.

## Deployment And Checks

- `wrangler.jsonc` owns Worker bindings and MatchRoom class migrations. Per-room SQL migrations are separate; follow [database operations](docs/db.md) and Deployment Safety above.
- Do not hand-reformat generated `.react-router/` or `worker-configuration.d.ts` files.
- Use the root fast gate for ordinary code changes and `play:check:full` for Worker/build/integration changes.
