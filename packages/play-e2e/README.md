# Browser E2E tests

Playwright Test drives real browsers against the built Play Worker. Each Playwright worker
runs `wrangler dev --no-bundle` on Play's build output (`worker/play/build/server/wrangler.json`,
the bundle and configuration a deploy uploads) with its own disposable D1 and MatchRoom store,
so the real routes, D1 adapters, MatchRoom, WebSockets, and React Router run with no
application/repository mocks. Play's own Vite config has no test-specific options.

## Run

From the repository root:

```sh
bun run play:test:e2e          # Chromium: the delivery-review run
bun run play:test:e2e:webkit   # WebKit: when changing freshness or lifecycle wiring
```

Both commands build Play through Turbo first. On first use they install the lockfile's
browser and, when the host lacks its system libraries, run `playwright install-deps` with
`sudo -n`; later runs skip both. Orb and repository setup deliberately do not install
browsers, so agents start without that cost.

For a focused rerun against an **already current build**:

```sh
cd packages/play-e2e
./node_modules/.bin/playwright test --project=chromium -g 'BFCache'
```

A failing case keeps its trace under `test-results/`; open it with
`./node_modules/.bin/playwright show-trace <trace.zip>`. `playwright-report/` holds the HTML
report. Both directories are ignored by Git.

## Layout and isolation

- `test/browser.ts` extends Playwright's `test`: a worker-scoped `server`, `baseURL` from it,
  and a `page` whose clock is installed before page code runs. Every test still gets a new
  context and page; tests use distinct matches and share their worker's store.
- `*.e2e.ts` files are Playwright tests; Bun's unit runner does not collect them.
- `startServer()` (test/server.ts) applies migrations and starts Wrangler with the same
  `--persist-to` temp directory, on an OS-chosen loopback port, as its own process group.
  Teardown stops Wrangler and its workerd children, then deletes the store; the developer's
  `.wrangler` state is never used.
- `empty-list.e2e.ts` starts a second server for its own empty store, because the list's
  empty state is unreachable once other files create matches.
- `http.e2e.ts` uses only Playwright's `request` fixture for HTTP contracts that need no page.
- Fixtures create matches and submit unique Commands through the real HTTP routes. They do
  not write D1 or MatchRoom storage directly.

## What the tests prove

The suite covers browser wiring and cross-component journeys, not game-rule matrices:

- Live-list discovery from an empty list, committed score polling, and re-armed score and
  membership deadlines; finished history stays inert.
- Control and Protocol WebSocket invalidation with one committed HTTP read, the HTTP watchdog
  after a dropped invalidation, local submission without an echo GET or replay, and Result
  releasing timers and sockets at its commit.
- A failed loader's error boundary recovers on a trusted `online` event; a hidden page aborts
  slow score I/O and catches up with one full read on return.
- HTML and Router data are `no-store`; the built stylesheet is not.
- Native Chromium hide/freeze actually stops page timers and return catches up once; genuine
  BFCache restoration (under a cacheable HTTP fixture) emits trusted `pageshow.persisted`
  and reads membership once.
- Preferences: explicit theme cookies, auto following the OS in one document, and locale
  switches preserving deep path, rematch query, and fragment through real documents.
- Setup and rematch: one visible submission, remembered suggestions, breaker reset on name
  edits, and a real Long Pyramid archive restoring editable rematch settings.
- Command UX: Popover/Drawer keyboard dismissal, an overflow action closing before its held
  POST, and a stale correction catching up without replay.
- Match journeys: an accepted undo reaches a second observer through the real socket and
  leaves the effective last command; a race to two prepares the next frame, ends, and
  appears in the D1-only finished list and archived Protocol.

Prefer adding a journey per surface over a test per rule: set up state through HTTP fixtures,
drive one UI path, and assert what the user sees plus request counts where freshness matters.
Rule matrices stay with gameplay, competition, and Play unit tests.

## Native Chromium

Ordinary Playwright launches apply focus emulation and disable BFCache. The native helper
launches Playwright's versioned Chromium directly and attaches with
`chromium.connectOverCDP(endpoint, { noDefaults: true })`, using the **existing default
context**; creating a new context reinstalls Playwright's defaults. CDP minimizes/restores the
window and freezes/activates the page. Accepted CDP commands alone do not prove suspension, so
tests also require trusted events and observed timer quiescence. Cleanup tolerates a lost CDP
client, terminates the owned process, then removes its profile. These cases are skipped on
WebKit.

## Limits of the simulation

Most long-schedule cases accelerate the page clock and dispatch **synthetic** return hints,
which makes coalescing deterministic but does not reproduce OS app switching. D1 and MatchRoom
always run on real time; the page clock moves only the browser. Local workerd can hold a socket's TCP
connection open for seconds after its closing handshake (workerd#7566), so tests assert that
the page released its socket (`pageSockets`), not when the browser reports the close. Request-count assertions wait
for a short real-time network quiet period, because absence cannot be awaited directly.

Playwright's Linux WebKit is **not Safari on iOS**. Neither engine proves Safari's suggested-URL
restoration, OS process termination, or which events iOS delivers when an app is killed. Narrow
viewports emulate layout, not touch. Datalist options are inspected, not the OS popup. Those
still need device testing.
