# KS

KS is the monorepo for the billiards club's software. Its apps share dependencies, coding standards, tooling, and one Cloudflare account, and each deploys independently.

## Apps

Each app is a Worker entry workspace plus the workspaces in its Turbo dependency tree. Before changing any workspace of an app, read that app's guidance; it lists its components and their own `AGENTS.md` files.

| App | Entry | Workspaces | Guidance |
| --- | --- | --- | --- |
| Play: two-player billiards scorekeeper with public live scoring at `https://play.ks.ua` | `worker/play` (`@ks/play`) | `packages/core`, `packages/gameplay`, `packages/competition`, `packages/i18n`, `packages/application`, `do/match-room`, `worker/play`, `packages/play-e2e` | [Play](worker/play/AGENTS.md) |

An app owns its root scripts, prefixed with its name (`play:dev`, `play:check:full`, …), which run Turbo from its entry (`--filter=@ks/play...`). Unprefixed root scripts are shared across apps. A new app gets its entry under `worker/<app>`, its own `AGENTS.md` with domain glossary and docs beside it, `<app>:*` scripts, and `<app>-deploy-NNN` tags.

## Working Agreements

- Prefer architectural clarity and small, reviewable changes. Ask before adding dependencies, workspace packages, or architectural layers; small internal extractions need no approval.
- Workspace `package.json` dependencies are the dependency graph. Bun's isolated installs make undeclared imports unresolvable, so typecheck fails on them, and Turbo rejects cycles; adding a workspace-to-workspace dependency is an architectural change.
- Allow focused regression tests for the requested change using existing infrastructure. Ask before broad coverage expansion, new test infrastructure, or substantial fixtures.
- Test behavior at its lowest owning layer. Higher-level tests cover wiring, persistence, transport, and lifecycle boundaries, not repeated domain rule matrices. Assert observable contracts, not implementation shape.

## Issue Tracking

Linear team Billiards (`BIL`) tracks Play, Streamer and Studio assistant work. Every issue outside Triage belongs to a project: Play projects are prefixed `Play: `, and `Play: Ongoing` holds Play work that ships without being a roadmap outcome. Labels are optional markers: `Agent` or `Club request` (the `Source` group; no source means the owner), `Bug`, `Tech` (chores customers don't fully see: libraries, dependencies, tooling), and `Learning` (exploring a new technology).

- A direct request in the thread is enough to start work that has no issue. When work has a `BIL` issue, keep one issue per thread and PR, and include its ID anywhere in the branch name (e.g. `discard-ui-bil-51`), not in PR titles, so GitHub automation moves it to In Review on PR open and Done on merge to `dev`.
- Fold small related changes found while working on an open PR, such as guidance notes or stale test expectations, into that PR and update its description; do not open a separate PR or ask first.
- PR titles, and so squash-merge commit titles, follow Conventional Commits: `type(scope): description` with type `feat`, `fix`, `refactor`, `perf`, `test`, `docs`, `build`, `ci`, or `chore`. The scope is the package when only one changed (`fix(gameplay): …`), otherwise the app (`feat(play): …`); repo-wide changes use a topic scope such as `deps` or none.
- File an out-of-scope bug or follow-up as a `BIL` issue only when it is concrete and actionable—a problem you could defend if asked why it matters now. Set status Triage explicitly (otherwise it lands in Backlog), the `Agent` label plus `Bug`, `Tech`, or `Learning` when one applies, the project when it is clear, and a link to the current thread. List minor nits and speculative ideas in the report instead of filing them. Do not explore or implement either in the current task.
- Statuses: Triage (undecided) → Backlog (accepted) → Ready → In Progress → In Review → Done. The `Parked` project holds deliberately deferred issues. Do not pick up Triage issues or issues in the `Parked` project; the user moves them first. Only Ready issues go straight to code. For a Backlog issue, the first deliverable is design—a spec or 1-pager, a codebase design, or visual exploration, as the issue needs. Present it and stop; change code only after the user approves the design.
- Leave prioritization and status moves to the user and GitHub automation, except filing into Triage.

## Shared Conventions

- Validate external input, persisted rows/JSON, browser storage, and restored machine state. Internal typed RPC between an app's own Worker and Durable Objects is a trusted capability; do not reparse canonical values solely because they cross RPC.
- Use Valibot built-ins and give schemas and inferred types the same name, without a `Schema` suffix. Use non-empty tuples for non-empty contracts, strict objects for closed variants/internal state, and stripping objects at representation boundaries where forward compatibility is intentional.
- Domain values and projections are readonly; mutable construction locals are fine. Establish readonly at the validated/returned boundary, without extra copying.
- Use explicit/custom errors that retain production diagnostics, unless the owning component's guidance says otherwise.
- Put primary exports before private helpers. Use native `#` private members.
- Document supported interfaces and non-obvious invariants, not syntax or self-explanatory DTOs. Put JSDoc on the original declaration; tags must add information beyond the type.

For dependency or toolchain changes, read [maintenance](docs/maintenance.md); Bun metadata changes also require [.agents guidance](.agents/AGENTS.md).

## Verification

Install with `bun install`. Two gates check code changes; both apply formatting:

- Fast gate: `bun run check` runs format, types, lint, and unit tests for every app. Unit tests are a cached per-workspace Turbo task, so workspaces a change does not affect are cache hits.
- Full gate: the app's `<app>:check:full` (Play: `bun run play:check:full`) runs the fast gate plus Workerd integration and the app's build. Use it instead of the fast gate for changes affecting Workerd integration or the deployable build; do not run the fast gate separately first.

Run the applicable gate on the final code before reporting completion and before every push, including after review fixes. Do not rerun checks on unchanged code. Focused tests are optional development feedback, not an additional requirement.

Before opening a PR or shipping to dev, also run the delivery review, which is not part of the gates: the app's browser E2E (named in its guidance), then `bunx knip` and `bunx knip --production` from the repository root. Review both Knip reports: fix genuine unused code/dependencies within scope, narrowly allowlist confirmed false positives with a reason, and report deferred findings rather than silently suppressing them. Rerun the delivery review after relevant code, dependency, or Knip configuration changes.

The repository has no GitHub CI, so these local checks are the only ones: do not subscribe to CI results after pushing. Subscribe to PR comments and reviews as usual.

## Deployment

The owner runs every deployment; agents never deploy, roll back, or apply remote migrations unless explicitly asked, and then verify the app's deployment preconditions first.

- Annotated Git tags `<app>-deploy-NNN` (`play-deploy-001`, …) record actual, owner-confirmed production deployments of one app in sequence, not planned releases or every commit on `dev`. Tag the exact deployed commit, normally on `dev`; historical deployments may point outside its ancestry. Include the Cloudflare deployment timestamp (UTC) and Worker version ID in the annotation. Never move or reuse an existing deployment tag.
- Agents use these tags as read-only reference points for production comparisons and investigations, not as deployment triggers or authorization. Do not create or push deployment tags unless explicitly requested. An app's highest tag is its latest recorded deployment, not proof of the currently running Cloudflare version.
- Prefer explicit schema/data migrations over legacy runtime branches. State migration/deployment ordering against the running Worker; report every added migration and its ordering to the user and in PR descriptions. Remote migrations require explicit authorization.
- Do not rewrite applied migration history. If migrations cannot safely resolve compatibility, explain the limitation, scope, and removal condition before adding legacy code.

## Maintaining Guidance

Record non-obvious constraints and decisions, not implementation transcripts. Update the owning section instead of duplicating it. Keep rules shared by all apps here, app rules in the app's guidance, component rules in nested guidance, procedures in runbooks, and only durable current architecture in the app's `docs/decisions/`. Deferred work belongs in the issue tracker.
