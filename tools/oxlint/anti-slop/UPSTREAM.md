# Upstream provenance

- Source: https://github.com/dmmulroy/anti-slop
- Previous revision: `e8c4880471b23ab7f216fba7b27d173a6ef07d4c`
- Current revision: `c44ef22ca116d0ba62a3ff663a0bd13a3f3fa40b`
- Copied from: `skills/install-anti-slop/assets/anti-slop/`
- Intentional deviation: `effect/` is omitted because KS does not use Effect.
- Tests are not vendored; focused upstream rule tests are run from the corresponding source revision during updates.

This update adopted the complete generic plugin snapshot, including `no-array-filter-map`,
`no-reduce-accumulator-copy`, `require-readable-spacing`, their shared helpers, and the vendored
ESLint Stylistic spacing implementation. All generic rules and the companion native
`oxc/no-accumulating-spread` rule are enabled as errors. `oxlint` and `@oxlint/plugins` are pinned
to the same exact version in the root manifest.

The generic upstream RuleTester suite passed at the current revision, and the copied installer
assets were verified byte-for-byte before this baseline was advanced. There are no deferred
upstream changes or unresolved conflicts.
