# Speculative Resident Match Execution

## Status

Accepted on 2026-08-23. This supersedes the match-level commit-before-apply decision in `../authoritative-match-machine.md`. Gameplay's current prepared-transition interface remains unchanged until a separate gameplay simplification.

## Context

Accepted facts in MatchRoom SQLite are durable authority. A resident match is a disposable in-memory derivation used to avoid replaying the complete journal for every command.

The previous design treated that disposable derivation as though it could not advance before persistence. It introduced a non-mutating decision, an opaque prepared match transition, owner and revision checks, exact committed-fact comparison, post-commit application, unusable-session recovery, and separate warm and cold application paths.

The invariant was stronger than the product requires. MatchRoom serializes commands, SQLite commits facts and receipts atomically, and any resident state can be discarded and restored from `accepted_facts`.

## Decision

### Authority

- `accepted_facts` remains the durable source of truth for an active match.
- A resident `SparringMatch` is a speculative, disposable cache.
- MatchRoom never broadcasts or returns speculative state before SQLite accepts the corresponding facts and receipt.

### Command execution

`SparringMatch.execute(command)` parses and executes one command.

- Parse failure is a tagged value, creates no receipt, and does not advance resident state.
- Expected rejection is a tagged value, receives an idempotent rejected receipt, and does not advance resident state.
- Acceptance advances resident match and gameplay state once and returns semantic fact content.
- A defect throws.

MatchRoom persists accepted fact content after execution. If execution fails after partial advancement, accepted-fact enveloping fails, or accepted persistence fails, MatchRoom disposes and clears the resident match. The next state operation restores from `accepted_facts`.

Receipt lookup remains before resident loading and execution. A retry of a committed command returns its existing receipt without executing the command again.

### Warm and cold behavior

Warm execution and cold restoration use the same private transition kernel:

```text
warm: command -> transition kernel -> resident state + fact content
cold: stored fact content -> command/event -> transition kernel -> verification
```

Warm execution runs each transition once. Cold restoration regenerates protocol and outcomes from stored commands and fails loudly when accepted history is impossible or incompatible with the deployed code.

Before deploying an intentionally incompatible rule change, active development matches may be deleted. This decision adds no rules versioning, compatibility implementation, or migration path.

### XState

- XState machines remain behavioral authority.
- Competition retains an XState-produced `SparringMatchSnapshot`, not a resident match actor.
- Production uses pure `initialTransition` and `transition` operations.
- Raw XState snapshots remain private production details and tooling contracts. They are never persisted or returned as product state.

### Product state

- The product representation currently named `MatchSnapshot` becomes `MatchState`.
- The intermediate competition representation currently named `SparringMatchState` is deleted.
- `MatchState` contains billiards match data, not an XState snapshot and not a storage cursor.
- `latestSeq` remains MatchRoom-owned cursor metadata beside `MatchState` in read results.

### Fact ownership

Competition consumes and produces `MatchFactContent`, the semantic `type` and `payload` union.

MatchRoom owns:

- fact and match identity envelopes,
- command causation,
- sequence allocation,
- acceptance time,
- storage-row validation,
- command receipts and transactions.

Competition owns:

- command parsing,
- match lifecycle and breaker policy,
- gameplay coordination,
- semantic fact content,
- semantic-history validation,
- `MatchState` and controls.

### Time

Facts have one server timestamp, `acceptedAt`.

- It is assigned once per accepted command transaction.
- Every fact in that command's batch has the same value.
- It replaces both `occurredAt` and `receivedAt`.
- Protocol display and completed-match `endedAt` use `acceptedAt`.

There is no client occurrence clock or asynchronous ingestion delay that justifies two timestamps.

### Gameplay seam

Competition continues to coordinate gameplay through the existing gameplay interface. During accepted execution, competition immediately consumes gameplay's private prepared transition before persistence. Match-level prepared transitions do not exist.

Gameplay actor and prepared-transition simplification is separate work. This decision does not move game scoring rules into competition.

## Failure ordering

```text
existing receipt
  -> return without execution

new command
  -> execute speculatively
  -> acceptance: envelope and commit facts + receipt
  -> update resident cursor
  -> broadcast
  -> respond
```

Failure outcomes:

- execution defect: clear resident, persist nothing, throw,
- accepted enveloping or persistence failure: rollback, clear resident, throw,
- rejected-receipt persistence failure: resident is unchanged and may remain cached,
- crash before persistence: resident memory disappears and the journal is unchanged,
- crash after persistence: journal and receipt make retry idempotent.

## Consequences

### Removed complexity

- prepared match transition brand and token storage,
- match owner, revision, stale, foreign, sibling, and reuse checks,
- candidate snapshot evidence and equality checks,
- match-level `decide` / `applyCommitted` ordering,
- post-commit match application failure,
- resident match actor lifecycle,
- separate public match replay state.

### Retained complexity

- transaction rollback and command idempotency,
- eviction and cold restoration,
- semantic replay validation,
- expected command rejection,
- terminal archival and disposal,
- gameplay-specific transition semantics.

### Testing rule

Each invariant is tested primarily through the interface of the module that owns it. Competition tests valid behavior and invalid semantic history. MatchRoom tests storage envelopes, retries, rollback, speculative-resident invalidation, eviction, and live publication ordering. Cross-module tests prove integration rather than repeat every negative case.
