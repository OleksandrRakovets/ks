# Live-page E2E tests

Vitest runs in **Node**, and Playwright drives a real browser against the built Play
Worker. The server uses the real routes, D1 adapters, MatchRoom, WebSockets, and
React Router. There are no application/repository mocks.

## Run

From the repository root:

```sh
bun install
bun run --cwd packages/e2e install:browsers
bun run test:e2e
E2E_BROWSER=webkit bun run test:e2e
```

On a fresh Linux machine, install the browser system libraries with
`packages/e2e/node_modules/.bin/playwright install-deps chromium webkit` (requires
root privileges). Orb setup installs those libraries and versioned browsers.

The root command builds Play through Turbo before testing. For a focused rerun
against an **already current build**:

```sh
bun run --cwd packages/e2e test:e2e -t 'native back navigation'
```

These tests are separate from fast `bun test`, Workerd `test:integration`, and
`check:full`. Run both browser commands when changing freshness or lifecycle
wiring. Tests run serially with one test worker and one shared preview server;
every ordinary case gets a fresh browser context, page, and clock.

## What the tests prove

- Live-list discovery and committed score updates, including thirty simulated
  minutes with separate score/membership deadlines.
- Control and Protocol WebSocket invalidation, the HTTP watchdog, and recovery
  when invalidations are silently dropped from a connected socket.
- A UI Command produces one POST and its automatic loader read, without an echo
  GET; browser recovery does not replay a mutation.
- Completion becomes Result and stops live timers/sockets; history stays inert.
- A failed loader's error boundary recovers on a trusted online event.
- Recent-result expiry after a clock gap or hidden return, and cancellation of a
  delayed score response which must not overwrite newer full-loader data.
- Production HTML/Router data are `no-store`; built assets remain cacheable.
- Native Chromium hide/freeze actually stops page timers. A server-side update
  while hidden is displayed after one authoritative GET on return.
- Native back navigation distinguishes a new document under production headers
  from genuine BFCache restoration under a cacheable HTTP fixture. The latter
  must preserve a document token, emit trusted `pageshow.persisted`, and read
  updated membership once. A reload cannot satisfy that test.

Fixtures create matches and submit unique Commands through HTTP. A narrowly
scoped expiry fixture moves completed lifecycle timestamps back sixteen minutes
in **this run's disposable D1** because changing the browser clock does not
advance Workerd's clock. It does not change archives. Global setup migrates a
new OS temporary store and deletes it after preview/Miniflare shuts down; the
developer's `.wrangler` state is not used.

## Playwright, native Chromium, and Browser Mode

These are complementary layers, not three interchangeable browsers:

| Layer                       | Role here                                                                                                              | Limitation                                                                                |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Vitest in Node + Playwright | Test orchestration, retrying DOM assertions, page clocks, offline mode, HTTP/WS interception; Chromium and WebKit      | Ordinary Playwright launch applies focus emulation and disables BFCache                   |
| Native Chromium + CDP       | Trusted visibility/freeze/restore events; real timer suspension and same-document BFCache                              | Chromium-only; requires explicit browser/window lifecycle and process cleanup             |
| Vitest Browser Mode         | Useful for real-DOM component/hook tests; a spike passed real Router/production-hook commit ordering on Vitest 4 and 5 | Its browser iframe/orchestrator should not be navigated away or frozen by the test itself |

The native helper launches Playwright's versioned Chromium directly and attaches
with `chromium.connectOverCDP(endpoint, { noDefaults: true })`, using the
**existing default context**. Creating a new context reinstalls Playwright's
defaults. CDP minimizes/restores the window and freezes/activates the page;
Playwright still supplies DOM assertions. Accepted CDP commands alone do not
prove suspension, so tests also require trusted events and an unchanged live
timer counter. BFCache restoration uses `waitUntil: 'commit'`, not a new `load`.

The catalog's Vitest 4 works for this Node orchestration. Vitest 5 Browser Mode
also passed the isolated hook spike but added no needed lifecycle capability;
the Cloudflare Vitest integration currently requires Vitest 4. Keep a future
Vitest upgrade separate from this package's browser driver.

## Limits of the simulation

Most long-schedule cases accelerate the page clock and dispatch explicit,
**synthetic** return hints. This makes coalescing and timer gaps deterministic,
but does not reproduce OS app switching. Pausing timers also pauses some React
passive-effect tasks; tests let those tasks run after a projection commits
before modelling a later browser return. Native Chromium cases do not fake
timers or browser lifecycle events.

The no-store/back-navigation result is a contract of the pinned Chromium build,
not a universal rule that no-store prevents BFCache. The cacheable fixture changes
HTTP headers only for its documents and Router manifest; production headers stay
unchanged. Native Chromium cases are skipped in the WebKit run.

Playwright's Linux WebKit port is **not Safari on iOS**. Neither engine proves
Safari's suggested-URL restoration behavior, OS process termination, or which
events iOS delivers when an app is killed. Those still need device testing.

References: [Vitest Browser Mode](https://vitest.dev/guide/browser/),
[Playwright CDP attachment](https://playwright.dev/docs/api/class-browsertype#browser-type-connect-over-cdp),
[Playwright clock](https://playwright.dev/docs/clock),
[Page Lifecycle](https://developer.chrome.com/docs/web-platform/page-lifecycle-api).
