# Play

Play is the single Cloudflare Worker deployable. It owns HTTP and presentation, not domain execution or persistence. Read the repository-root `docs/design.md` before changing UI appearance or interaction.

## Server And Transport

- `src` is the Cloudflare Worker layer: `src/index.ts` builds `Application`, forwards live WebSocket handshakes, and hands remaining requests to the React Router app in `src/web` through router context. Keep Worker request dispatch out of `src/web`.
- Routes receive `Application` and own HTTP parsing, cookies, redirects, and presentation adaptation. Keep SQL, direct Durable Object calls, and use-case orchestration out of routes.
- Map application failure reasons to HTTP/presentation with exhaustive switches. Malformed browser input is an expected HTTP failure, not an RPC exception.
- Import the MatchRoom class at runtime only to export it from the Worker entrypoint. Application owns the private typed capability; generated bindings verify structural compatibility.
- The Worker gateway forwards admitted WebSocket handshakes to the selected room. Loader projections remain authoritative; versioned socket messages request revalidation, never apply command deltas locally.
- Active pages catch up on reconnect, browser return (visible, persisted `pageshow`, focus, online), and independent HTTP deadlines that recover silent sockets and list membership. Never replay a Command POST during freshness recovery; gate background match reads across a local submission or discard and its loader refresh.
- A completed Router request is not a committed React projection: acknowledge match reads after the commit, and release live listeners, timers, and sockets at the Result commit, not in a passive effect.
- Hide handlers do brief synchronous cleanup only; nothing may depend on hide events firing. The root error boundary retries failed GETs, excluding genuine 404s; single fetch assigns a failed request to root, so route-level boundaries cannot own network recovery. Finished pages have no live subscriptions or polling. Browser `offline` estimates must not disable controls or stop retries: they do not establish server reachability.

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
- There is no browser test suite yet. For UI changes, exercise affected states in the browser, inspect them against the design rules, and report what was verified and any gaps; missing browser infrastructure is not permission to substitute JSX unit tests or introduce a temporary renderer/test harness.

## Deployment And Checks

- `wrangler.jsonc` owns Worker bindings and MatchRoom class migrations. Per-room SQL migrations are separate; follow the repository-root `docs/db.md` and root deployment policy. Production is `https://play.ks.ua`.
- Do not hand-reformat generated `.react-router/` or `worker-configuration.d.ts` files.
- Use the root fast gate for ordinary code changes and full gate for Worker/build/integration changes.
