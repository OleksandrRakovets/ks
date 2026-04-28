# Architecture Review — 2026-04-28

Working notes from `/improve-codebase-architecture` session. Surfaces deepening opportunities (per `improve-codebase-architecture` skill vocabulary: shallow vs deep modules, seams, deletion test). Not durable decisions yet — promote to `.tracker/decisions/` when crystallized.

## Status

- Picked **#4** (lifecycle decisions duplicated) as starting point — owner flagged it as "legacy bs."
- **#1** (control projection envelope) deprioritized — owner argues `unknown` on the wire is intentional; only the renderer cares about types. Likely correct; see notes below.
- Remaining (#2, #3, #5, #6) parked in priority order.

## Candidate 1 — Control projection: `unknown` on the wire

**Files:** `clients/rr7/app/features/match-control/renderers/{index,pyramid,strila}.tsx`; `abstract-runtime.ts` (`{ projection: 'control', details: unknown }`).

**Owner pushback (likely valid):** the wire intentionally erases game-specific shape because only the renderer decodes it. A discriminated union would force every layer between gameplay and renderer to know game shapes.

**Re-evaluation needed:** is each game's control schema actually defined in *one* place (gameplay), or is the renderer redefining it? If gameplay owns the schema and the renderer just imports + parses, the seam is fine. If the renderer redefines, that's the real friction — fix is co-location, not a union.

## Candidate 2 — `MatchState.frames[i].gameState: unknown` leaks via casts

**Files:** `packages/competition/src/match-state.ts:15–27, 83–99`; `packages/competition/src/match-sparring-machine.ts:17,70` imports `StrilaFrameState` and hard-casts.

**Friction:** competition already needs the typed shape (it casts to it), so the type erasure isn't actually buying decoupling.

**Sketch:** each gameplay runtime exports a `GameFrameInvariant` (score, phase-like enum, winner). Competition consumes that; game-specific richness stays opaque in `details`.

## Candidate 3 — D1 schema knowledge smeared

**Files:** `clients/rr7/workers/do/MatchRoom.ts:69–77, 215–222`; `clients/rr7/app/server/match-room.ts:72–77`; `clients/rr7/workers/repos/{snapshots,matches,events}.ts`.

**Friction:** column names + row shapes reconstructed at every call site.

**Sketch:** single `matchPersistence` facade in competition; existing repos hang off it.

## Candidate 4 — Match lifecycle decisions duplicated [ACTIVE]

**Reframe (owner, 2026-04-28):** the deepening target is the in-progress **xstate machine** at `packages/competition/src/match-sparring-machine.ts`. `control.ts` and the inline assertions in `applyMatchEvent` are migration debris that should retire once the actor owns lifecycle. Branch `xstate2`.

**Existing duplication (to be eliminated):**
- `packages/competition/src/control.ts:9–24` — `deriveMatchLifecycleDecisions(snapshot)` returning `{ isMatchTargetReached, canStartNextFrame, canEndMatch }`.
- `packages/competition/src/match-state.ts:145–151` — `frame.started` inlines `isMatchTargetReached` + `last.winnerSeat` assertions.
- `match-state.ts:216–219` — `match.ended` is permissive (silent no-op).
- Route: `clients/rr7/app/routes/sparring-match/route-control.tsx:45–49` reads booleans from `control.ts`.

**Two `isMatchTargetReached` predicates are NOT the same:**
- `control.ts`: "already crossed target?" (`framesWonA >= target || framesWonB >= target`)
- `match-sparring-machine.ts:46–50`: "would awarding the *current* frame push me past?" (`framesWonBySeat[winner] + 1 >= target`)

The machine version is the correct enforcement point. `control.ts` is post-hoc UI inference and becomes a **selector over the xstate snapshot** once migration completes (`canStartNextFrame = snapshot.matches('between-frames')`). Depth via state-machine state names, not recomputed booleans.

## Target architecture (owner, 2026-04-28)

- 1 match = 1 DO instance.
- DO orchestrates **2 sibling actors**: 1 match-machine + 1 frame-machine.
- Actors are **NOT** composed via xstate `invoke`/`spawn`. DO owns routing. The seam is a **message protocol**, not a parent-child tree.
- Frame-machine is per-game, lives in `packages/gameplay/src/<game>/machine-sparring.ts`. Pyramid draft exists (`pyramid/machine-sparring.ts`), not wired. Strila version exists.
- Match-machine is game-agnostic. Lives in `packages/competition`. Currently leaks game knowledge — see below.
- `applyMatchEvent`, `control.ts`, all custom lifecycle code retire.
- Match projections take the same envelope shape as gameplay projections (uniform module shape).

## What needs to change in `match-sparring-machine.ts`

- Drop imports `StrilaEvent`, `StrilaFrameState`, `StrilaGameplayRuntime` (lines 2, 17, 25, 27).
- Drop event handlers for game-internal events (lines 151–157: `frame.commence`, `pot.record`, `miss.record`, `foul.commit`, `penalty.select`, `frame.award`, `frame.concede`). These go DO → frame-machine directly, never to match-machine.
- Drop `currentFrame: StrilaFrameState | null` from context (line 17). Match-machine doesn't track frame internals.
- Drop `isCurrentFrameOver` guard (line 45) — match-machine no longer peeks at frame phase.
- `isMatchTargetReached` guard reframes around the *received* completion event, not a frame snapshot.

## Protocol between match-machine and frame-machine (sketched)

**Match-machine event union shrinks to:**
- `match.setup { frameTarget, matchTarget }`
- `frame.start` — DO observes transition and spawns a fresh frame actor
- `frame.completed { winner, score, winReason }` — DO observes frame actor's `output` (final state) and forwards
- `match.end` — auto-triggered by guard on `frame.completed`, or admin event for early termination

**Match-machine context shrinks to:** `{ frameTarget, matchTarget, framesCompleted: CompletedFrame[], framesWonBySeat, matchWinner }`. No `currentFrame`.

**Frame-machine completion contract (shared type):** `FrameOutcome = { winner: Seat, winReason: <game-specific>, score: BySeatNumber }`. Pyramid already produces this shape (lines 239–243). Strila must conform. Type lives in `gameplay` (or `core` if shared with other layers).

→ **This subsumes Candidate #2.** The frame state type erasure problem dissolves: competition never holds frame state, only `FrameOutcome`. The leaky cast at `match-sparring-machine.ts:70` disappears with the rewrite.

## Open structural questions (next grilling pass)

1. **`FrameOutcome` shape.** Strict union for `winReason` (`'target-reached' | 'conceded' | ...`) vs opaque-per-game string? Pyramid uses `'target-reached' | 'conceded'`. Strila may differ.
2. **Variable per-frame config.** Some game variants need per-frame target overrides (handicap, race-to-different). Does `frame.start` carry config, or is it taken from match config?
3. **DO orchestration shape.** Does the DO instantiate the frame actor lazily on `frame.start`, persist its snapshot per frame, and dispose on `frame.completed`? Or one long-lived frame actor recycled with `match.setup`-like reset?
For Q3, here's the framing that simplifies the choice. Look at how pyramid's machine is exported (machine-sparring.ts:253–268): createInitialSnapshot +
sendEvent (which is just getNextSnapshot). It's a pure reducer, not a running actor. xstate's getInitialSnapshot / getNextSnapshot let you thread snapshots
through without ever calling createActor.

That collapses the question. There's no real "actor lifecycle" — there's only snapshot lifecycle.

What "long-lived" actually means here

Option A — fresh snapshot per frame:
- DO state: { matchSnapshot, currentFrameSnapshot: GameSnapshot | null }.
- On frame.start: DO calls frameMachine.createInitialSnapshot(input). Persist.
- On game events: currentFrameSnapshot = frameMachine.sendEvent(currentFrameSnapshot, event). Persist.
- When currentFrameSnapshot enters its frame-over final state: DO reads snapshot.output (the FrameOutcome), sends frame.completed to match-machine, sets
currentFrameSnapshot = null. The completed outcome lives only in match-machine's framesCompleted context.

Option B — recycled long-lived snapshot:
- DO state: { matchSnapshot, frameSnapshot: GameSnapshot } (always present).
- Frame machine has an explicit idle state it returns to between frames; frame.start transitions back into not-started.

Why A wins

1. xstate finals are terminal. Pyramid's frame-over is type: 'final' (line 227). You can't transition out of a final state. To "recycle" you'd either (a)
recreate the snapshot anyway (= Option A in disguise), or (b) redesign the frame machine to never reach final — which loses the natural place to read output
and removes the structural signal that the frame is done.
2. Persisted shape matches ontology. "There is no current frame" is a real state of the system (between frames, before first frame, after match end).
currentFrameSnapshot: null says exactly that. Option B forces a synthetic "idle" pseudo-state that has to be carefully kept identical to the post-completion
state.
3. Cold-start rehydration is simpler. On DO wake, load { matchSnapshot, currentFrameSnapshot } from D1. If currentFrameSnapshot is null, you're between
frames; otherwise resume. No "is this an idle reset or genuinely fresh?" disambiguation.
4. Snapshot drift can't occur. Option B has two writers to the same snapshot value (frame events and the reset transition). Option A has one writer per
snapshot lifetime — fewer ways to wedge state.
5. Cost is trivial. "Spawn ceremony" is one function call (createInitialSnapshot) — there's no actor to start, no listeners to wire.

What you persist with Option A

{
  matchSnapshot:        MatchSparringSnapshot,
  currentFrameSnapshot: GameFrameSnapshot | null,
}

Frame outcomes are not persisted separately — they live inside matchSnapshot.context.framesCompleted (the match-machine remembers what it learned). Event log
in D1 remains source of truth for full replay; snapshots are the cache.

Recommendation

Option A. It's not really a lifecycle question — it's "what does it mean for there to be no current frame," and null answers that more honestly than a
synthetic idle state.

One follow-up the choice surfaces: does currentFrameSnapshot need to remember which gameKey it belongs to? Today the match config has gameKey, so the DO can
dispatch sendEvent to the right frame-machine module. But if you ever support mixed-game matches (probably not for billiards), or if the persisted snapshot
needs to be self-describing for debugging/migration, you'd tag it: currentFrameSnapshot: { gameKey, snapshot } | null. I'd lean toward tagging it for the
migration-safety reason — when you change a frame machine's shape, you want the persisted snapshot to scream rather than silently feed wrong data. Cheap
insurance.

Want me to update the doc with the decision and move to the next question?

4. **Persistence per actor.** Match-machine snapshot persisted separately from frame-machine snapshot in D1? Or one combined "match-room snapshot" payload? Event log remains source of truth — replay strategy on cold start.
5. **Match-level projections (`control` / `display`).** Same envelope as gameplay (`{ projection, score, details: unknown }`)? Or a new envelope? The DO returns *which* — match projection, frame projection, or both stitched?
6. **Out-of-band events.** `frame.reopened` (referee correction), early `match.end`, `frame.award` by referee — do these go to match-machine, frame-machine, or DO-level rewrite of the event log?

## Candidate 5 — Legacy `score.delta` / `score.set` translation hidden

**Files:** `match-state.ts:106–126, 163–171`. Pyramid runtime unaware translation occurs.

**Friction:** two command paths converge in the switch; new games must support translation or crash.

**Sketch:** per-game `translateLegacyEvent` registered alongside the runtime; match-state always sees `game.command`.

## Candidate 6 — `MatchRoom` DO bundles 4 concerns

**Files:** `clients/rr7/workers/do/MatchRoom.ts:48–316`.

**Friction:** sequencing + SSE broadcast + snapshot caching + D1 persistence in one class.

**Sketch:** inject `MatchSequencer`, `MatchPersistence`, `Broadcaster` interfaces; DO retains only the part that needs `blockConcurrencyWhile`.

## Vocabulary reminder

When grilling, use: **module / interface / implementation / depth / seam / adapter / leverage / locality**. Apply the **deletion test** to anything suspected shallow.
