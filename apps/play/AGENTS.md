# Play

Play is the single Cloudflare Worker deployable. It owns HTTP and presentation, not domain execution or persistence. Read the repository-root `docs/design.md` before changing UI appearance or interaction.

## Server And Transport

- Routes receive `Application` and own HTTP parsing, cookies, redirects, and presentation adaptation. Keep SQL, direct Durable Object calls, and use-case orchestration out of routes.
- Map application failure reasons to HTTP/presentation with exhaustive switches. Malformed browser input is an expected HTTP failure, not an RPC exception.
- Import the MatchRoom class at runtime only to export it from the Worker entrypoint. Application owns the private typed capability; generated bindings verify structural compatibility.
- The Worker gateway forwards admitted WebSocket handshakes to the selected room. Loader projections remain authoritative; versioned socket messages request revalidation, never apply command deltas locally.
- Active pages revalidate on reconnect, visibility/focus, and online hints. Finished pages have no live subscriptions or polling. Browser `offline` estimates must not disable controls or stop retries: they do not establish server reachability.

## UI Ownership

- Keep UI app-local. Generic primitives belong in `web/components/ui`, reusable product visuals with explicit props in `web/components`, and one-off UI with its feature owner.
- Browser code uses browser-safe contracts, not executable competition/gameplay entrypoints or application server dependencies.
- Give each game an explicit Match route and Protocol route. The Match loader selects Control or Result from lifecycle; the stable URL does not encode lifecycle state.
- Preserve distinct scoring and Protocol contracts. Play groups flat scoring controls into layout sections; game semantics remain in gameplay.
- Share Active/Finished surface compositions between Match and Protocol pages. Feature-local presentation functions derive copy and emphasis; Shell and Board render resolved props. Page controllers own submission and live revalidation.
- The curated game shelf's localized JSX copy belongs in `web/routes/sparring/index.tsx`, independently of registry names used by Setup. Adding a game also requires its card and routes.

## Deployment And Checks

- `wrangler.jsonc` owns Worker bindings and MatchRoom class migrations. Per-room SQL migrations are separate; follow the repository-root `docs/db.md` and root deployment policy. Production is `https://play.ks.ua`.
- Do not hand-reformat generated `.react-router/` or `worker-configuration.d.ts` files.
- Use the root fast gate for ordinary code changes and full gate for Worker/build/integration changes. For UI changes, exercise affected states in the browser and inspect rendered results against the design rules.
