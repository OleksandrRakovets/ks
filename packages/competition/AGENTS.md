# Competition

Competition owns Match lifecycle, execution, restoration, Correction semantics, and Match projections. It composes gameplay without HTTP, storage, or Cloudflare dependencies.

## Contracts And Lifecycle

- `@ks/competition/definitions` is browser-safe. The main entrypoint exposes executable APIs for server runtimes and tooling; keep machines out of definitions.
- Compose Match Controls before game Controls into one flat list. Layout grouping belongs to Play.
- Creation and non-final frame completion prepare the next frame automatically through transient `between-frames`; gameplay remains uncommenced until `frame.commence`.
- Initial preparation has no Protocol entry. Later `frame-prepared` entries belong to the preceding frame-ending Accepted Command alongside its award. Do not introduce a preparation Command or separate acceptance.
- Resident execution is disposable. Exported aggregate checkpoints must restore the semantic projection and subsequent command behavior without replaying Accepted Commands.
- Executable checkpoint objects and nested state are closed (`strictObject`) and readonly, including shared values embedded in state. Reuse representation field schemas without making tolerant creation/projection schemas strict. Readonly is a type contract, not runtime freezing.
- A Correction compensates for an Accepted Command without deleting its history. Competition owns domain correction behavior; MatchRoom owns checkpoint-link lookup, receipts, and atomic persistence. Read `do/match-room/AGENTS.md` when changing that seam.

## Checks

Match transitions, Protocol ordering, Correction, and checkpoint restoration belong in adjacent Bun tests. Leave game-specific scoring matrices to gameplay and storage/disposal/RPC behavior to Workerd integration tests.
