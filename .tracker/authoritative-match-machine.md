# Authoritative Match Machine Decision

## Status

Superseded in part on 2026-08-23 by `decisions/speculative-resident-match-execution.md`. XState and accepted-fact authority remain accepted; the match-level commit-before-apply and resident actor decisions do not. The replacement implementation plan lives in `speculative-match-execution-spec.md`.

## Decision

- XState machines are behavioral authority for Strila, regular pyramid variants, long free pyramid, and sparring match lifecycle.
- Accepted facts in MatchRoom SQLite are durable authority for active matches.
- One MatchRoom retains one resident sparring session and at most one resident gameplay session.
- Resident sessions decide commands without mutation; exact committed facts advance their prepared transitions.
- Durable Object eviction discards sessions. Cold replay reconstructs the same state and projection from facts.
- Raw XState snapshots remain in memory and are tooling contracts rather than persistence formats.
- MatchRoom owns command serialization, persistence, receipts, sequences, live delivery, and disposal; domain packages own transition semantics and projections.
- Expected command rejection is a typed value. Defects remain visible.
- A match-winning frame award commits game, frame-completion, and terminal match facts atomically.
- Command-produced facts carry command causation so accepted batches are identifiable for diagnostics and a later undo slice.

## Execution

The lead/reviewer starts with the epic strategy and assigns one linked slice at a time. Slice files contain the concrete interfaces, changes, tests, verification, and exit gates.
