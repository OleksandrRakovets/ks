# KS

KS is a two-player billiards scorekeeper with public live scoring. Matches are races across frames; seats are `A` and `B`. Consult [GLOSSARY.md](GLOSSARY.md) when changing domain terminology.

## Working Agreements

- Prefer architectural clarity and small, reviewable changes. Ask before adding dependencies, workspace packages, or architectural layers; small internal extractions need no approval.
- Allow focused regression tests for the requested change using existing infrastructure. Ask before broad coverage expansion, new test infrastructure, or substantial fixtures.
- Test behavior at its lowest owning layer. Higher-level tests cover wiring, persistence, transport, and lifecycle boundaries, not repeated domain rule matrices. Assert observable contracts, not implementation shape.

## Issue Tracking

Linear team Billiards (`BIL`) tracks KS and Streamer work. Projects are roadmap outcomes; the `Source` label (Club request, Owner, Tech/Learning) records where an issue came from.

- Work from one `BIL` issue per thread and PR. Include the issue ID anywhere in the branch name (e.g. `discard-ui-bil-51`), not in PR titles, so GitHub automation moves it to In Review on PR open and Done on merge to `dev`.
- File out-of-scope ideas, bugs, and follow-ups as `BIL` issues with status Triage set explicitly (otherwise they land in Backlog), a `Source` label, and a link to the current thread. Mention them in the report; do not explore or implement them in the current task.
- Statuses: Triage (undecided) → Backlog (accepted) or Parked (deferred until a 1-pager and repeated asks exist) → Shaping (1-pager or spec in progress) → Ready → In Progress → In Review → Done. Build only from Ready issues or with explicit approval; for Shaping issues, produce the spec first.
- Leave prioritization and status moves to the user and GitHub automation, except filing into Triage.

## Ownership And Guidance

Domain dependencies flow `core <- gameplay <- competition`. Play owns HTTP and presentation; application owns use-case orchestration and D1; MatchRoom owns serialized active/finalizing execution and per-match SQLite. Finished reads use D1 only. Never mirror the active command ledger into D1.

Read the owning component's `AGENTS.md` before changing it:

- [Play](apps/play/AGENTS.md): routes, browser UI, Worker deployment. For UI changes, also read [design rules](docs/design.md).
- [Gameplay](packages/gameplay/AGENTS.md): game semantics and frame execution.
- [Competition](packages/competition/AGENTS.md): Match lifecycle, restoration, and Correction.
- [Application](packages/application/AGENTS.md): workflows, projections, and D1.
- [MatchRoom](do/match-room/AGENTS.md): active/finalizing execution, receipts, SQLite, checkpoints, Protocol persistence, and socket fan-out—even when changing a caller outside that directory.

For cross-component changes, read the [architecture map](docs/decisions/current-architecture.md). For schema/data migrations, read [database operations](docs/db.md). For dependency or toolchain changes, read [maintenance](docs/maintenance.md); Bun metadata changes also require [.agents guidance](.agents/AGENTS.md).

## Shared Conventions

- Validate external input, persisted rows/JSON, browser storage, and restored machine state. Internal MatchRoom RPC is a trusted typed capability; do not reparse canonical values solely because they cross RPC.
- Use Valibot built-ins and give schemas and inferred types the same name, without a `Schema` suffix. Use non-empty tuples for non-empty contracts, strict objects for closed variants/internal state, and stripping objects at representation boundaries where forward compatibility is intentional.
- Domain values and projections are readonly; mutable construction locals are fine. Establish readonly at the validated/returned boundary, without extra copying.
- Reuse core seat contracts (`Seat`, `BySeatNumber`, `opponentOf`). Outside gameplay, use explicit/custom errors that retain production diagnostics.
- Put primary exports before private helpers. Use native `#` private members.
- Document supported interfaces and non-obvious invariants, not syntax or self-explanatory DTOs. Put JSDoc on the original declaration; tags must add information beyond the type.

## Verification

- Install: `bun install`. Develop on strict port `7529`: `bun run dev`.
- Fast gate: `bun run check` (format, types, lint, boundaries, unit tests).
- Full gate: `bun run check:full` (also Workerd integration and Play build).

For code changes, use the root fast gate by default before reporting completion; use the full gate for changes affecting Workerd integration or the deployable build. Focused tests are optional development feedback, not an additional completion requirement. Both gates apply formatting. Do not run the fast gate separately before the full gate or rerun constituent checks on unchanged code.

Before opening a PR or shipping to dev, run `bunx knip` and `bunx knip --production` from the repository root. Review both reports: fix genuine unused code/dependencies within scope, narrowly allowlist confirmed false positives with a reason, and report deferred findings rather than silently suppressing them. Keep this delivery review outside the fast/full gates; rerun after relevant code, dependency, or Knip configuration changes, not on unchanged code.

## Deployment Safety

- Before every deployment, confirm no Active Matches and no pending finalization/archival.
- Prefer explicit D1 schema/data migrations over legacy runtime branches. State migration/deployment ordering against the running Worker; report every added migration and its ordering to the user and in PR descriptions. Remote migrations require explicit authorization.
- Do not rewrite applied migration history. If migrations cannot safely resolve compatibility, explain the limitation, scope, and removal condition before adding legacy code.

## Maintaining Guidance

Record non-obvious constraints and decisions, not implementation transcripts. Update the owning section instead of duplicating it. Keep shared rules here, component rules in nested guidance, procedures in runbooks, and only durable current architecture in `docs/decisions/`. Deferred work belongs in the issue tracker.
