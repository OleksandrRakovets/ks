# 0001 - RR7 Full-Mode + Domain Services (No Internal API Hop by Default)

## Status

Accepted

## Context

We want to:

- learn React Router 7 in full framework mode (SSR/loaders/actions on Cloudflare Worker),
- keep architecture understandable in small chunks,
- avoid over-engineering for hypothetical multi-app production.

TanStack is local-only DX comparison and will not touch production DB.

## Decision

1. Production runtime is a single RR7 framework worker (UI + loaders/actions + CF bindings).
2. Business logic lives in shared domain-level services (in/near `packages/domain`), not in route modules.
3. Route modules stay thin orchestration layers.
4. No internal HTTP hop by default (no action -> `fetch('/api/...')` for same-process writes).
5. Shared zod schemas in domain validate:
   - client-side before submit,
   - server-side again in actions/loaders.
6. Caller-specific routes may differ in auth/boilerplate (e.g. public vs tournament-director), but call the same domain service methods.
7. D1 is persistent source of truth; DO is runtime coordination with short lifecycle.

## Consequences

- Better RR7 DX and simpler debugging (single call stack).
- Controlled duplication at route boundary is acceptable.
- Strong reuse through domain services and shared schemas.
- Easier future extraction if needed, because route logic is thin.

## Guardrails

- Do not place domain rules directly in route files.
- Do not trust client-only validation.
- Keep DB access behind small repository abstractions used by domain services.
- Prefer additive event history / explicit corrections for score changes.

## First Implementation Slice (future session)

- Add one vertical feature end-to-end using this pattern:
  `NewPlayer` form + server action using shared `NewPlayerSchema`.
