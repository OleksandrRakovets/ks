# Gameplay

Gameplay owns game-specific frame rules, execution, restoration, and the coherent derivation of Game Presentation and Controls. It depends on core, not competition or runtime/storage adapters.

## Contracts And Semantics

- `src/registry.ts` owns supported game keys and runtimes. `contract/definitions.ts` is browser-safe; `contract/server.ts` exposes execution and restoration. Keep executable machines out of definitions.
- Inside `src`, import source modules directly rather than the package's public entrypoints; Oxlint enforces this boundary.
- Keep one `game` Command path. Game runtimes own command interpretation; do not add game-specific orchestration to callers.
- Game Presentation describes state; Controls are separate disposable capabilities. Derive them coherently from the same state, not as competing authorities.
- Use the directly declared `tiny-invariant` for predicate/invariant guards; messages are stripped in production. Unconditional unsupported-case throws may remain explicit. Guards do not replace boundary validation or typed command rejections.
- Checkpoints contain serializable snapshot values and contexts, not running actors. Restoration must preserve subsequent command behavior, not merely displayed scores.

## Changes And Checks

- Game-rule matrices and game-specific restoration belong in adjacent Bun tests here. Do not repeat those matrices in competition or persistence integration tests.
- When registering a game, coordinate browser-safe contracts and Play's explicit routes and curated shelf; read `apps/play/AGENTS.md` before editing those consumers.
