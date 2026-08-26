# Gameplay Corrections

## Purpose

Correct concrete gameplay terminology and rule representation before changing MatchRoom persistence. These fixes cross core, gameplay, competition, application presentation, and UI boundaries, but they must preserve the current fact-based storage and finalization architecture for this phase.

Implement and evaluate each numbered correction as a separate reviewable slice. Run the fast gate after each slice and the full gate after all slices. Do not begin `.tracker/accepted-command-history-spec.md` until this spec is complete and green.

Read `CONTEXT.md` first. The canonical frame verbs are prepare, commence, and award. Owed Balls is the old Combined Pyramid interpretation of negative score; it is not a negative pot.

The project has not been deployed. Update clean contracts directly without compatibility aliases for old command names or payload fields.

## Constraints

- Do not alter MatchRoom SQLite tables or D1 schemas.
- Do not replace facts, receipts, replay, finalization, or live transport in this work.
- Keep `game.command` and embedded Protocol entries temporarily because the accepted-command refactor removes them later.
- Preserve command idempotency, fact batch ordering, restoration equality, archive verification, and terminal withholding.
- Preserve dependency direction `core <- gameplay <- competition`.
- Do not add a package, layer, repository, or generic rules abstraction.

## 1. Prepare, Commence, Award

### Problem

The current match command `frame.start` prepares the next frame, assigns the breaker, creates gameplay, and emits `frame.started`. Actual play begins only after the separate game command `frame.commence`. The names make preparation and commencement appear synonymous.

`frame.award` is already correct real-world Protocol language. Do not rename it to close or complete at the command/UI level.

### Required change

- Rename command `frame.start` to `frame.prepare`.
- Rename the corresponding current lifecycle fact `frame.started` to `frame.prepared` for the temporary fact architecture.
- Retain `frame.commence` exactly.
- Retain `frame.award` exactly.
- Update control descriptors, parsing, aggregate branches, restoration, Protocol projection, i18n keys/copy, routes/tests, MatchRoom fixtures, live fixtures, and archive fixtures.
- Protocol copy must distinguish preparation from commencement. Preparation may state frame number and assigned breaker; commencement records beginning play.
- Do not introduce `frame.commenced` or `frame.awarded` facts in this phase. Accepted commencement and award remain represented by the temporary `game.command` fact until that model is removed.

### Invariants

- A frame can be prepared only between frames.
- Preparation computes the same alternating breaker as today.
- Gameplay exists after preparation but remains in its pre-commencement phase.
- Only the assigned breaker may commence.
- Concession and award behavior remain unchanged.

### Primary files

- `packages/core/src/facts.ts`
- `packages/core/src/facts.test.ts`
- `packages/competition/src/sparring-match.ts`
- `packages/competition/src/sparring-match*.test.ts`
- `packages/gameplay/src/command-schemas.ts`
- `packages/application/src/protocol.ts`
- `packages/application/src/protocol.test.ts`
- `do/match-room/src/MatchRoom*.test.ts`
- `apps/play/web/routes/match/**`
- `packages/i18n/src/keys.ts`
- `packages/i18n/src/resources.ts`

### Acceptance

- `grep` finds no semantic use of `frame.start` or `frame.started` outside historical/spec text.
- Control flow visibly offers prepare, then commence, then award.
- Warm and restored match projections remain equal.
- Active and archived Protocols preserve both preparation and commencement in order.

## 2. Pyramid Pot Count

### Problem

Pyramid-family `pot.record` commands name their value `points`. In every currently registered Pyramid game that value is the number of balls potted, with one score point per ball. The generic Pyramid schema structurally parses any integer, but controls advertise only valid positive options and machine guards reject values outside each game's option set before mutation. Negative pots are not currently accepted. Old Combined Pyramid negative score is caused only by foul penalties and represents Owed Balls.

### Required change

- Rename Pyramid and Long Free Pyramid `pot.record.points` to `pottedBallCount`.
- Keep Strila `pottedBalls` unchanged because it records exact ball identities.
- Tighten the renamed count schema to positive values before game-specific option validation. This moves an existing rejection earlier; it does not fix accepted negative scoring.
- Preserve each game's current valid counts:
  - Free Pyramid: 1, 2, or 4;
  - Combined Pyramid: 1 or 2;
  - old Combined Pyramid: 1 or 2;
  - Long Free Pyramid: 1, 2, 3, or 4, limited by balls on table.
- Update machine guards/actions, command parsing, control presets, Protocol bodies/rendering, tests, and i18n interpolation names.
- Preserve one score point per potted ball.
- Do not add an `owedBalls` state field. Old Combined Pyramid may remain negative after `foul.commit`; subsequent positive pots naturally repay it.

### Edge scenarios

- At old Combined Pyramid score 0, offender foul produces -1.
- The same player then pots one ball: score returns to 0, not 1.
- A second legal one-ball pot advances score to 1.
- Zero and negative `pottedBallCount` remain rejected and never mutate state.
- A Long Free Pyramid count greater than balls on table is rejected.
- Rack rollover behavior at configured 14/15 is unchanged.

### Primary files

- `packages/gameplay/src/pyramid/definitions.ts`
- `packages/gameplay/src/pyramid/rules.ts`
- `packages/gameplay/src/pyramid/machine.ts`
- `packages/gameplay/src/pyramid/protocol.ts`
- `packages/gameplay/src/long-free-pyramid/definitions.ts`
- `packages/gameplay/src/long-free-pyramid/machine.ts`
- `packages/gameplay/src/long-free-pyramid/calculations.ts`
- gameplay protocol/control tests and application Protocol fixtures.

### Acceptance

- No Pyramid command or Protocol body calls a potted-ball count `points`.
- Invalid non-positive counts are covered at the tightened structural boundary and by no-mutation tests.
- Owed-ball repayment has explicit tests.
- Existing target detection, continued winner scoring, rack rollover, and Protocol scores remain unchanged.

## 3. Regression Characterization

Before the persistence refactor, add or retain focused tests proving these behaviors are intentional:

- every registered game produces one or more Protocol entries for every accepted gameplay command;
- one command may produce multiple ordered entries for automatic/system consequences;
- Pyramid foul penalty direction remains game-specific;
- winner-determined players may continue legal scoring until award where currently supported;
- Long Free Pyramid table counts and rack rollover remain correct;
- rejected commands retain state and produce no accepted facts/Protocol entries;
- JSON round-trip and cold restoration preserve the corrected command and outcome contracts.

Characterization tests should expose behavior, not private XState syntax.

## Verification

After each numbered correction:

- run focused package tests;
- run `bun run check`;
- run `git diff --check`.

After all corrections:

- run `bun test`;
- run `bun run test:integration`;
- run `bun run check:full`.

Do not mark this spec complete if failures are deferred to the accepted-command persistence refactor.

## Out Of Scope

- Removing facts or receipts;
- changing MatchRoom SQLite or D1 schemas;
- accepted-command storage;
- final-state transfer changes;
- application-side replay removal;
- live transport redesign;
- Undo or correction;
- tournament workflows or new statistics.
