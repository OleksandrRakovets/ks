# Dependency And Toolchain Maintenance

Read this before changing dependency versions, package-manager metadata, or the root check pipeline. Manifests and configuration own current versions; do not duplicate them in guidance.

## Dependencies

- Audit all workspaces with `bun outdated --recursive`.
- Shared versions belong in root `workspaces.catalog`; consumers use `"catalog:"`.
- Change the owning manifest, then run `bun install` to regenerate `bun.lock`. Do not bypass the two-day release cooldown (`minimumReleaseAge` in root `bunfig.toml`).
- Use caret ranges, including for dev tools; `bun.lock` pins installs. Pin exact versions only with a reason: `typescript`, `oxlint`, `@oxlint/plugins`, and `oxlint-tsgolint` so diagnostic changes are deliberate, `bun-types` to match the declared Bun version, and prereleases such as drizzle RCs, where a caret admits later prereleases.
- Match TypeScript to the TypeScript-Go release embedded by `oxlint-tsgolint`. Upgrade them together, update Oxlint and its plugin API deliberately, then run `bun install` and `bun run check:full`.

## Build And Provisioning

- Keep `typegen` directly before the single root `tsc --build`. There are no per-package typecheck tasks; move generation into Turbo only if generated-output caching provides measured value.
- Bun metadata has consumers outside manifests. Before changing its version, `devEngines.packageManager`, or its representation, read [provisioning guidance](../.agents/AGENTS.md) and inspect `.agents/setup`, `.agents/resume`, and CI/tooling references. Update affected consumers in the same change.
- Provisioning verification is separate from the full code gate; follow the setup/resume checks in that guidance.

## Knip Delivery Review

Generate framework types with `bun run typegen` if Knip reports missing route or Worker declarations. Review both modes as required by root guidance.

Test-consumed exports use declaration-level `@internal` tags with a reason: production mode omits those exports, while default mode still detects unused test APIs. Shared test fixture modules are excluded through production-only negative `project` patterns in `package.json`, so default mode still checks them; they need no tags. MatchRoom's `drizzle/migrations.d.ts` only types the SQL bundle and is excluded in both modes. Keep the positive project globs aligned with Knip's default source extensions; Play also includes CSS so stylesheet imports count as dependency consumers. Avoid broad ignores that hide orphaned tests or unrelated exports.
