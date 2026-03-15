## Project Intent

Architecture-first learning project for the KS score keeper app.
Primary goal: improve architecture/design skills. Shipping speed is secondary.

## Agent Behavior Expectations

- Be concise, explicit about tradeoffs, and avoid over-building.
- Ask before adding new layers/packages not already justified.
- Prefer incremental PR-sized chunks over broad scaffolding.
- Keep naming consistent and avoid hidden assumptions.
- Feel free to ask the user any questions during planning or implementation.

## Working Mode

1. One concern at a time.
2. Interview-first, then design, then implementation.
3. No large one-shot implementations.
4. Keep each implementation slice small and reviewable.
5. Respect explicit phase from user:
   - architecture-only (no code)
   - implementation (code allowed)

## Decision and Notes Locations

- Durable architecture decisions: `.tracker/decisions/`
- Important progress notes: `.tracker/`

## Architecture Preferences

- Prefer a single framework worker runtime for production unless explicitly changed.
- Keep route handlers thin; move business logic into shared domain-level services.
- Reuse shared schemas/types for both client and server validation.
- Standardize schema imports on `zod`; packages that define or compose schemas must declare a direct `zod` dependency, and workspace Zod version must stay pinned.
- Avoid internal same-process HTTP hops by default unless there is a clear benefit.

## Game Vertical Direction

- Avoid hardcoded game keys across layers.
- Use a central registry as the source of game keys and metadata.
- Keep a generic match kernel; keep game semantics in pluggable game implementations.
- Favor one consistent game command model across games (including simple and complex games).

## Deployment Preferences

- Manual deploy flow from the dev server; no third-party CI required yet.
- Use environment secrets management suitable for local + cloud environments.
- The project is not deployed anywhere yet (unless explicitly changed). We do not care about backward compatibility at this point. It's safe to edit the single DB migration and advise use to clear the local instance if necessary.
