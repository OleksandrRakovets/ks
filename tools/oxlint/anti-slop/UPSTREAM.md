# Upstream provenance

- Source: https://github.com/dmmulroy/anti-slop
- Previous revision: `e8c4880471b23ab7f216fba7b27d173a6ef07d4c`
- Current revision: `c44ef22ca116d0ba62a3ff663a0bd13a3f3fa40b`
- Copied from: `skills/install-anti-slop/assets/anti-slop/`
- Entry points: `index.ts` (generic) and `effect/index.ts` (Effect).
- Implementation deviations: none. The previously omitted `effect/` snapshot is now included.
- Tests are not vendored; focused upstream rule tests are run from the corresponding source revision during updates.

The generic plugin snapshot includes `no-array-filter-map`,
`no-reduce-accumulator-copy`, `require-readable-spacing`, their shared helpers, and the vendored
ESLint Stylistic spacing implementation. All generic rules and the companion native
`oxc/no-accumulating-spread` rule are enabled as errors. `oxlint` and `@oxlint/plugins` are pinned
to the same exact version in the root manifest.

All five Effect rules are enabled as errors in `packages/application` and `apps/play`, the workspaces
that directly depend on Effect. Unmigrated domain and MatchRoom workspaces retain their existing
TypeScript policy. Expand the Effect rule scope when those workspaces adopt Effect.

The re-vendor confirmed that the recorded revision remains upstream HEAD. Upstream `pnpm check`
passed, including all 24 generic/Effect RuleTester and CLI suites, typechecking, lint, and generated
installer-asset parity. The copied installer assets were verified byte-for-byte; only this consumer
provenance file differs. There are no deferred upstream changes or unresolved conflicts.
