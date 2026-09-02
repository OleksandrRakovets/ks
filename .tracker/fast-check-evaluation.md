# fast-check Evaluation

## Status

Deferred evaluation. `fast-check` is not installed. Adding it or materially expanding test coverage still requires explicit approval under `AGENTS.md`.

Property-based testing complements rather than replaces the repository's deterministic examples. Its best use here is a small number of high-leverage domain invariants at the lowest layer that owns them, not generated coverage repeated across Gameplay, Competition, MatchRoom, and Application.

## Relevant Capabilities

- Arbitraries compose valid generated values and command sequences from bounded numbers, records, unions, arrays, and dependent values. Prefer valid-by-construction arbitraries over heavily filtered values.
- `fc.property` and `fc.asyncProperty` execute invariants over generated inputs. Core `fast-check` is test-runner agnostic and can run under Bun or Vitest; `@fast-check/vitest` only adds optional `test.prop` integration.
- Failed cases shrink toward a smaller counterexample. Ordinary failures can be replayed with the reported `seed` and `path`.
- `fc.commands` generates stateful scenarios with command-aware shrinking. Each command supplies `check(model)`, `run(model, real)`, and a useful `toString()`. `fc.modelRun`, `fc.asyncModelRun`, and `fc.scheduledModelRun` execute synchronous, asynchronous, and explicitly scheduled models respectively.
- Model-based command failures additionally report a `replayPath`, because shrinking depends on which generated commands were applicable and executed.
- `fc.statistics` can show whether generated samples reach relevant games, phases, seats, and terminal states. It is diagnostic and does not establish coverage.
- The scheduler reorders only promises explicitly registered with it. It does not control arbitrary timers, external I/O, Worker events, or the Workerd runtime.

## Best Initial Property

At the Competition boundary, generate short command histories against small frame and match targets:

1. Execute commands against a warm `SparringMatch`.
2. Retain each Accepted Command with its emitted Protocol content.
3. JSON-round-trip the retained history.
4. Restore a new match from that history.
5. Assert that restored and warm semantic projections are equal.

This directly exercises the architectural invariant that resident state is disposable and reproducible from Accepted Commands while jointly covering command acceptance, Protocol generation, serialization, frame transitions, alternating breakers, terminal state, and restoration. It does not require a second implementation of gameplay rules.

Use tiny targets and weighted commands so generated scenarios regularly complete frames and matches. Every generated command should have an informative printed form. When a minimized failure represents a meaningful regression, preserve it as a named deterministic example.

## Other Suitable Properties

- A rejected or unparseable command does not change the semantic projection.
- Accepted commands always produce non-empty Protocol content belonging to the current game and frame.
- Frame indexes increase monotonically, breakers alternate, and frame completion adds exactly one win.
- A match becomes terminal when one seat reaches its frame target and accepts no later commands.
- Gameplay-specific score changes, foul direction, owed-ball accounting, rack rollover, and score/control agreement hold across generated legal transitions.

A lifecycle model should remain deliberately smaller than the implementation: phase, frame index, breaker, frame wins, and terminal status are reasonable; reproducing game scoring and transition rules is not. Testing the engine against a duplicate engine would provide little independent evidence.

## Poor Initial Fits

Keep deterministic examples for exact Protocol ordering and payloads, named billiards rules, historically important regressions, and canonical complete scenarios. Keep D1, RPC, HTTP, and disposal behavior in their integration suites rather than repeating domain properties there.

Do not begin with scheduled concurrency tests. They may eventually help Application orchestration over controlled in-memory fakes, but cannot substitute for MatchRoom Workerd integration because external Durable Object events and runtime scheduling are outside fast-check's scheduler.

## Adoption Discipline

- Start with the warm-execution/restoration property only and assess its readability, runtime, and quality of minimized failures before adding another.
- Avoid sparse `fc.pre` conditions and command sets whose `check` methods skip most generated actions; both produce weak scenarios.
- Inspect generation distributions while developing to ensure important phases are reachable, but do not turn sampled percentages into correctness assertions.
- Keep each run isolated from wall clocks, ambient randomness, shared mutable state, and uncontrolled asynchronous work so seed-based replay remains reliable.
- CI failures print replay coordinates, but a later run may choose another seed. Reproduce the reported failure and promote valuable minimized counterexamples into stable regression examples.
- Use generated properties to replace repetitive matrices where appropriate, not to accumulate another parallel suite.

## References

- [fast-check documentation](https://fast-check.dev/)
- [Why property-based testing](https://fast-check.dev/docs/introduction/why-property-based/)
- [Model-based testing](https://fast-check.dev/docs/advanced/model-based-testing/)
- [Runners and diagnostics](https://fast-check.dev/docs/core-blocks/runners/)
- [Ecosystem and Vitest integration](https://fast-check.dev/docs/ecosystem/)
