# `better-result` for KS command/result modeling

Research date: 2026-08-23. Package version assessed: `3.0.1`.

## Recommendation

Do **not** adopt `better-result` for KS's current command path.

The package is a capable, small Result implementation, and its distinction between expected `Err` values and thrown `Panic` defects matches KS conceptually. However, KS's important complexity is not the absence of a generic binary Result. It is the protocol distinction between parse failure (no receipt), durable rejection (a successful submission with a persisted receipt), accepted facts, and defects. `better-result` would replace a few small union shells while leaving the domain payloads, validation schemas, persistence envelopes, orchestration branches, and thrown invariant errors intact. Applying it at the RPC/persistence boundary would either add mapping code or change the durable wire shape.

Reconsider only if KS develops several multi-step application workflows that compose heterogeneous expected failures. That is where `Result.gen`, `Result.await`, and error-union inference provide leverage beyond a renamed discriminated union.

## Frozen outcome model

| KS outcome   | Correct package mapping                                                  | Required KS behavior                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------ | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Parse failed | `Err<ParseFailure>` is a reasonable in-memory representation             | MatchRoom must return an invalid-body transport failure and write **no receipt**. The parse branch therefore remains before any receipt commit (`do/match-room/src/MatchRoom.ts:155-168`).                                                                                                                                                                                                                           |
| Rejected     | `Err<SparringMatchRejection>` is reasonable only as an `execute` outcome | MatchRoom must consume that `Err`, persist a rejected receipt, and return outer submission success. It must not escape as the same transport error lane as parse/RPC failure (`do/match-room/src/MatchRoom.ts:165-175`; `storage/command-receipt.ts:5-16`).                                                                                                                                                          |
| Accepted     | `Ok<{ facts }>` is a natural representation                              | `execute` speculatively advances resident state and returns semantic facts. MatchRoom persists those facts; if persistence fails, it discards the advanced resident and later restores from durable history (`do/match-room/src/MatchRoom.ts:157-194`; `packages/competition/src/sparring-match.ts:83-96`).                                                                                                          |
| Defect       | Throw                                                                    | Keep disposed/unusable/invalid-transition/replay/invariant failures thrown. The package also throws defects, but wraps exceptions thrown inside its combinators as `Panic`; adopting combinators would therefore alter error identity at those boundaries. [Package defect policy](https://better-result.dev/errors/panic-and-defects), [source](https://github.com/dmmulroy/better-result/blob/v3.0.1/src/core.ts). |

This means the command path is not one flattenable `Result`. At most it is staged composition: parse inside `execute`, then accepted/rejected execution outcome, then conversion into a durable receipt inside an outer transport/application result. Flattening these lanes would lose the no-receipt versus durable-rejection distinction.

## Capability comparison

### Success and expected errors

`Result<T, E>` is a class-based `Ok | Err` union discriminated by `status: "ok" | "error"`, with guards, `map`, `mapError`, `andThen`, recovery, matching, generators, and collection operations. This is richer than KS's hand-written unions, but current command decisions mostly perform one parse and one decision rather than long compositional workflows. [README mental model and API](https://github.com/dmmulroy/better-result/tree/v3.0.1#mental-model), [API reference](https://better-result.dev/reference/result), [implementation](https://github.com/dmmulroy/better-result/blob/v3.0.1/src/core.ts).

KS already expresses the relevant lanes explicitly:

- gameplay decision: `accepted | rejected` (`packages/gameplay/src/gameplay-session.ts:33-42`);
- match execution: `parse-failed | accepted | rejected` (`packages/competition/src/sparring-match.ts:68-71`);
- command parse: internal parsed command or parse failure (`sparring-match.ts:117-123,162-179`; `packages/gameplay/src/parse-game-command.ts:7-16`);
- durable receipt: `accepted | rejected` (`do/match-room/src/storage/command-receipt.ts:5-16`);
- application/RPC transport result around that receipt (`packages/application/src/contracts.ts:19-21,72-74`).

### Named/tagged errors and matching

`TaggedError` creates real `Error` subclasses with `_tag`, readonly payload properties, `toJSON`, class guards, exhaustive `.match()`, and generator support. `matchError` can also exhaustively match structurally `_tag`-tagged values; selected handler exceptions become `Panic`. [Tagged errors](https://better-result.dev/errors/tagged-errors), [matching errors](https://better-result.dev/errors/matching-errors), [source](https://github.com/dmmulroy/better-result/blob/v3.0.1/src/error.ts).

That does not eliminate KS's error vocabulary. KS rejection values use durable, schema-validated `code` tags such as `wrong-breaker` and nested `game-command-rejected` (`sparring-match.ts:84-105`), while parse failure carries game/command/Valibot issue context (`parse-game-command.ts:7-23`). Those tags and payloads are domain/protocol facts and must remain. Converting them to `TaggedError` would add classes, messages/stacks, and wire mapping; using `matchError` would first require changing or duplicating `code` as `_tag`. Existing direct branches are few and policy-relevant, so exhaustive matching does not remove meaningful control flow.

### Validation and serialization

`Result.codec` accepts Standard Schema-compatible validators, including Valibot, and validates an outer `{ status, value | error }` envelope plus branch payloads. It requires four boundary-owned schemas for serialize/deserialize success/error directions. Safe methods return codec errors; unsafe methods throw `Panic` for schema mismatch. [Codec documentation](https://better-result.dev/serialization/result-codecs), [3.0 release notes](https://github.com/dmmulroy/better-result/releases/tag/v3.0.0).

KS's receipt format is instead `{ _tag: "accepted", accepted } | { _tag: "rejected", reason }`, and it is persisted JSON validated by `CommandReceiptOutcomeSchema` (`command-receipt.ts:5-32`). A codec migration would not remove `AcceptedFactRefSchema` or `SparringMatchRejectionSchema`; it would require branch schemas and change the persisted envelope to `status/value/error` unless adapters retained the existing format. JSON text still needs parsing. Therefore it does not simplify `encodeCommandReceiptOutcome` or `decodeCommandReceiptOutcome`, and changing this durable format solely to fit a library is unjustified.

`TaggedError.toJSON()` includes `_tag`, `name`, `message`, `cause`, and `stack`, which is broader than KS's compact persisted rejection DTOs. [TaggedError source](https://github.com/dmmulroy/better-result/blob/v3.0.1/src/error.ts).

### Async operations

The package supports `Promise<Result>`, async generators through `Result.gen` plus `Result.await`, async chaining/recovery/observation, concurrent collection, cancellation-aware `tryPromise`, and bounded retries. Rejected callbacks/promises inside combinators become `Panic`. [Async workflow overview](https://github.com/dmmulroy/better-result/tree/v3.0.1#compose-asynchronous-workflows), [async/retry details](https://better-result.dev/core/async-and-retries).

KS's `Application` is async (`packages/application/src/contracts.ts`), but command execution itself is intentionally synchronous and the surrounding use case has protocol-specific steps: catalog check, MatchRoom RPC, possible archive/finalization, and result adaptation (`packages/application/src/use-cases.ts`). A generator could restyle this function, but would not remove those branches or their distinct return contracts.

### Thrown defects

The package's policy is compatible in principle: expected failures are `Err`; defects throw `Panic`. In practice, KS already has precise defect classes (`GameplaySessionDisposedError`, `GameplaySessionUnusableError`, `InvalidPreparedTransitionError` at `gameplay-session.ts:163-182`, and corresponding match/replay errors at `sparring-match.ts:207-233`) plus invariant checks during apply/replay. Direct `Result.ok/err` use preserves those throws, but `map`, `andThen`, `match`, generators, and codec callbacks wrap thrown values in `Panic`. That indirection offers no simplification for the current synchronous state-machine boundary and may obscure the existing defect class at catch sites, although `Panic.cause` preserves it.

### Cost, maintenance, and TypeScript

- npm metadata declares no runtime dependencies. The official package marks itself ESM-only and `sideEffects: false`. [Published package manifest](https://github.com/dmmulroy/better-result/blob/v3.0.1/package.json).
- The supplied npm registry snapshot reports 7 files and 269,124 bytes unpacked for `3.0.1`. Measuring its official npm tarball gives a 10,665-byte ESM runtime (3,268 bytes gzip); bundlers may tree-shake it. [Registry metadata](https://registry.npmjs.org/better-result), [official tarball](https://registry.npmjs.org/better-result/-/better-result-3.0.1.tgz).
- The package is active but young: npm records the first release on 2026-01-09, `3.0.0` on 2026-08-01, and `3.0.1` on 2026-08-11. The repository is not archived and was pushed on 2026-08-18. The recent 3.0 release included breaking API/serialization changes. [Registry metadata](https://registry.npmjs.org/better-result), [repository metadata](https://api.github.com/repos/dmmulroy/better-result), [3.0.1 release](https://github.com/dmmulroy/better-result/releases/tag/v3.0.1), [3.0 migration](https://better-result.dev/migration/from-2).
- Official documentation requires TypeScript 5.4 or newer, and the repository has an explicit TypeScript 5.4.5 minimum-consumer check. KS uses TypeScript `^7.0.2` (`package.json:27,62`), so it satisfies the stated minimum. However, the package's `3.0.1` development dependency is `typescript: ^5.4.0`, which does not demonstrate testing against TypeScript 7; compatibility is plausible but not explicitly evidenced by the package's own test matrix. [README installation](https://github.com/dmmulroy/better-result/tree/v3.0.1#install), [minimum config](https://github.com/dmmulroy/better-result/blob/v3.0.1/tsconfig.typescript-minimum.json), [package manifest](https://github.com/dmmulroy/better-result/blob/v3.0.1/package.json).

The runtime cost is modest. The larger cost is introducing a second error/serialization vocabulary alongside Valibot schemas and KS's durable protocol tags.

## Deletion test

### Code it could replace

If adoption were limited to in-memory parse/decision boundaries, it could replace these four binary union declarations with type aliases to `Result`:

1. `ParseGameCommandResult<K>` (`parse-game-command.ts:14-16`).
2. `GameCommandDecision<K>` (`gameplay-session.ts:33-42`).
3. The internal parsed-command-or-failure branch (`sparring-match.ts:117-123,162-179`).
4. `MatchCommandResult` (`sparring-match.ts:68-71`).

It could also remove the local `accepted`/`rejected` envelope construction in `acceptDecision` and `rejectedDecision` (`gameplay-session.ts:62-64,156-160`) in favor of `Result.ok/err`, and replace parsed/accepted/rejected object literals at return sites with package constructors.

That is the full meaningful deletion. Even binary inspection branches are not deleted; they change from checks such as `_tag === "rejected"` to `isErr()`/`status === "error"` or a two-handler `.match()`.

### Code and concepts that must remain

- `GameCommandParseFailure`, its game key/command type/issues, and parse validation branches (`parse-game-command.ts:7-45`).
- `GameCommandRejection`, `SparringMatchRejection`, all domain `code` variants, and their Valibot schemas (`gameplay-session.ts:14-18`; `sparring-match.ts:84-105`).
- `PreparedGameCommandResult`, prepared transition brands/records, accepted facts, and non-empty tuple invariants (`gameplay-session.ts:20-31`; `sparring-match.ts:68-71,194-197`).
- Every state-dependent execution guard that determines a rejection reason (`sparring-match.ts:298-355`).
- The MatchRoom parse-failed branch (no receipt), rejected commit branch, accepted persistence branch, and resident discard on defects or persistence failure (`do/match-room/src/MatchRoom.ts:157-194`).
- `CommandReceiptOutcomeSchema`, its accepted/rejected tags, and encode/decode corruption handling unless KS intentionally migrates the durable SQLite format (`command-receipt.ts:5-43`).
- The outer application/RPC `ok/error/status` contracts and the inner durable receipt outcome; they represent different failure ownership (`contracts.ts:19-21,41,52,72-74`; `match-room-client.ts:25-29`).
- Application finalization policy, including the accepted-outcome check (`use-cases.ts:242-249`).
- Precise thrown defect classes and invariant checks.

Net result: a dependency and vocabulary migration for four small union shells, with no reduction in the command protocol's essential branches. The deletion test fails.

## Primary sources

- Supplied npm registry snapshot: `/home/sasha/.local/share/opencode/tool-output/tool_02f0dd006001fDsZ8vv2MlF6py`; canonical endpoint: <https://registry.npmjs.org/better-result>.
- Official repository and source: <https://github.com/dmmulroy/better-result/tree/v3.0.1>.
- Official documentation: <https://better-result.dev>.
- Current KS files cited inline, especially `packages/competition/src/sparring-match.ts`, `packages/gameplay/src/gameplay-session.ts`, `packages/gameplay/src/parse-game-command.ts`, `packages/application/src/contracts.ts`, `do/match-room/src/storage/command-receipt.ts`, and root `package.json`.
