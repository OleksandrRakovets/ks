# KS

KS is a two-player billiards scorekeeper with public live scoring. Matches are races across frames; seats are `A` and `B`. Consult [GLOSSARY.md](GLOSSARY.md) before naming domain concepts in code or user-facing copy, and when changing domain terminology.

## Working Agreements

- Prefer architectural clarity and small, reviewable changes. Ask before adding dependencies, workspace packages, or architectural layers; small internal extractions need no approval.
- Allow focused regression tests for the requested change using existing infrastructure. Ask before broad coverage expansion, new test infrastructure, or substantial fixtures.
- Test behavior at its lowest owning layer. Higher-level tests cover wiring, persistence, transport, and lifecycle boundaries, not repeated domain rule matrices. Assert observable contracts, not implementation shape.

## Issue Tracking

Linear team Billiards (`BIL`) tracks KS and Streamer work. Projects are roadmap outcomes; the `Source` label (Club request, Owner, Tech/Learning) records where an issue came from.

- A direct request in the thread is enough to start work that has no issue. When work has a `BIL` issue, keep one issue per thread and PR, and include its ID anywhere in the branch name (e.g. `discard-ui-bil-51`), not in PR titles, so GitHub automation moves it to In Review on PR open and Done on merge to `dev`.
- File an out-of-scope bug or follow-up as a `BIL` issue only when it is concrete and actionable—a problem you could defend if asked why it matters now. Set status Triage explicitly (otherwise it lands in Backlog), a `Source` label, and a link to the current thread. List minor nits and speculative ideas in the report instead of filing them. Do not explore or implement either in the current task.
- Statuses: Triage (undecided) → Backlog (accepted) → Shaping (1-pager or spec in progress) → Ready → In Progress → In Review → Done. The `Parked` project holds deliberately deferred issues. Do not pick up Triage issues or issues in the `Parked` project; the user moves them first. Only Ready issues go straight to code. For a Backlog or Shaping issue, the first deliverable is design—a spec or 1-pager, a codebase design, or visual exploration, as the issue needs. Present it and stop; change code only after the user approves the design.
- Leave prioritization and status moves to the user and GitHub automation, except filing into Triage.

## Ownership And Guidance

Domain dependencies flow `core <- gameplay <- competition`. Play owns HTTP and presentation; application owns use-case orchestration and D1; MatchRoom owns serialized active/finalizing execution and per-match SQLite. Finished reads use D1 only. Never mirror the active command ledger into D1.

Read the owning component's `AGENTS.md` before changing it:

- [Play](worker/play/AGENTS.md): routes, browser UI, localized copy, Worker deployment.
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

Before opening a PR or shipping to dev, run `bun run test:e2e` (Chromium browser E2E; see [e2e](packages/e2e/README.md)), then `bunx knip` and `bunx knip --production` from the repository root. The first E2E run on a machine installs its browser; agents should not install it earlier. Fix E2E failures or report them with the failing trace. Review both Knip reports: fix genuine unused code/dependencies within scope, narrowly allowlist confirmed false positives with a reason, and report deferred findings rather than silently suppressing them. Keep this delivery review outside the fast/full gates; rerun after relevant code, dependency, or Knip configuration changes, not on unchanged code.

## Deployment Safety

The owner runs deployments, and only when no Active Matches and no finalization/archival are pending; if asked to deploy, verify that first. Storage changes may rely on this precondition: no deployment interrupts an Active Match or pending archival, so retained MatchRoom state needs no legacy runtime compatibility (see [MatchRoom](do/match-room/AGENTS.md)).

- Prefer explicit D1 schema/data migrations over legacy runtime branches. State migration/deployment ordering against the running Worker; report every added migration and its ordering to the user and in PR descriptions. Remote migrations require explicit authorization.
- Do not rewrite applied migration history. If migrations cannot safely resolve compatibility, explain the limitation, scope, and removal condition before adding legacy code.

## Maintaining Guidance

Record non-obvious constraints and decisions, not implementation transcripts. Update the owning section instead of duplicating it. Keep shared rules here, component rules in nested guidance, procedures in runbooks, and only durable current architecture in `docs/decisions/`. Deferred work belongs in the issue tracker.
