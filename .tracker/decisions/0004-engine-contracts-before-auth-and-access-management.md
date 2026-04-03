# 0004 - Stabilize Engine Contracts Before Auth and Access Management

## Status

Proposed

## Context

The current app is still early. The match engine, game contracts, and match mode boundaries are not settled yet.

We also do not yet have a coherent access model. Existing auth-related code is not a working product boundary, and adding manager auth now would force assumptions into an unstable domain model.

Current product direction from this conversation:

- public scoreboards remain public,
- casual sparring should stay lightweight and guest-friendly,
- organized competition/tournament control is a separate concern,
- manager auth is likely needed later, but should follow domain stabilization.

## Decision

1. Do not implement real auth/access management next.
2. Prioritize architecture work on the game engine and match contracts first.
3. Sequence the next design work as:
   - settle game module contracts,
   - settle `gameplay` vs `competition` responsibilities,
   - settle sparring vs competition mode boundaries,
   - settle projection contracts for control/display/summary,
   - settle DB envelope vs JSON payload policy,
   - only then revisit auth/access management.
4. Treat access management as a later concern layered onto a stable domain model, not a driver of the current engine design.

## Rationale

- Access rules depend on product responsibilities that are still being defined.
- The app should not guess identity boundaries before sparring and competition workflows are clear.
- Adding auth too early would increase the risk of generated or half-integrated code that looks complete without actually enforcing the intended product model.

## Consequences

- Short-term progress should focus on contracts and domain boundaries rather than login flows.
- Public/guest/referee/manager permissions will remain intentionally unresolved until engine responsibilities are clearer.
- Future auth work should be evaluated against the stabilized match and competition model rather than implemented opportunistically.

## Follow-up

- Write small decision records instead of broad design docs.
- Keep architecture work in reviewable slices, one concern at a time.
