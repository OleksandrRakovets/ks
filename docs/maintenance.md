# Dependency And Toolchain Maintenance

Read this before changing dependency versions, package-manager metadata, or the root check pipeline. Manifests and configuration own current versions; do not duplicate them in guidance.

## Dependencies

- Audit all workspaces with `bun outdated --recursive`.
- Shared versions belong in root `workspaces.catalog`; consumers use `"catalog:"`.
- Change the owning manifest, then run `bun install` to regenerate `bun.lock`. Do not bypass Bun's configured two-day release cooldown.
- Keep `typescript`, `oxlint`, `@oxlint/plugins`, and `oxlint-tsgolint` on exact versions so diagnostic changes are deliberate.
- Match TypeScript to the TypeScript-Go release embedded by `oxlint-tsgolint`. Upgrade them together, update Oxlint and its plugin API deliberately, then run `bun install` and `bun run check:full`.

## Build And Provisioning

- Keep `typegen` directly before the single root `tsc --build`. There are no per-package typecheck tasks; move generation into Turbo only if generated-output caching provides measured value.
- Bun metadata has consumers outside manifests. Before changing its version, `devEngines.packageManager`, or its representation, read [provisioning guidance](../.agents/AGENTS.md) and inspect `.agents/setup`, `.agents/resume`, and CI/tooling references. Update affected consumers in the same change.
- Provisioning verification is separate from the full code gate; follow the setup/resume checks in that guidance.

## Knip Delivery Review

Generate framework types with `bun run typegen` if Knip reports missing route or Worker declarations. Review both modes as required by root guidance.

Test-consumed exports, including shared fixtures, use declaration-level `@internal` tags with a reason: production mode omits those exports, while default mode still detects unused test APIs. The two shared fixture modules use narrow `ignoreFiles` entries because tags do not suppress unused-file reports when production analysis omits tests. Unlike project exclusions, these entries do not suppress other issue types. Keep them narrow; avoid broad ignores that hide unrelated exports.
