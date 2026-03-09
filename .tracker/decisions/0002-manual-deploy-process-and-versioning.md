# 0002 - Manual Deploy Process and Versioning

## Status

Proposed

## Context

We want a simple, manual deploy flow without external CI for now.

Constraints:

- Deploy from a remote dev server used from multiple machines.
- Clear commands to deploy to stage/prod with persistent URLs.
- Environment mapping:
  - `dev` branch -> stage
  - `prod` branch -> production
- Avoid accidental prod deploys/migrations.
- Frequent hotfixes during tournaments are likely.

## Decision

1. Use a single `wrangler.jsonc` with environment sections:
   - default/shared config
   - `env.stage`
   - `env.production`
2. Use manual commands:
   - `bun deploy stage`
   - `bun deploy prod`
3. Deploy scripts must enforce branch checks:
   - stage deploy allowed only from `stage`
   - prod deploy allowed only from `prod`
4. Keep prod safety lightweight for now:
   - branch check only (no extra prompt/env gate)
5. Secrets strategy:
   - local: `.dev.vars`
   - stage/prod: `wrangler secret put ... --env <env>`
6. Deploy flow per env:
   - run checks (`bun test`, `bun run typecheck`, `bun run lint`)
   - apply D1 migrations for the target env
   - deploy Worker for the target env
7. Versioning strategy for hotfix safety:
   - generate `APP_VERSION` at deploy time
   - expose it in responses via `X-KS-Version`
   - if FE detects version mismatch, switch navigation to full-document reload automatically (no prompt)

## Caching and static assets policy

1. Hashed static assets:
   - long cache + immutable (expected behavior, but verify explicitly)
2. HTML/document responses:
   - short/no-cache
3. Data/action responses:
   - short/no-cache
4. We will keep route splitting enabled to evaluate DX/performance, but protect sessions with the version-mismatch strategy above.

## Verification checklist (stage before prod)

1. `curl -I` a hashed asset URL and confirm cache headers are appropriate for immutable assets.
2. `curl -I` an HTML route and confirm it is not long-cached.
3. Verify `X-KS-Version` header is present in app responses.
4. Simulate version mismatch and confirm navigation falls back to full-document reload automatically.
5. Confirm stage/prod branch guards block invalid branch deploy attempts.

## Placeholders to fill during implementation

- Staging worker name and URL: `TODO`
- Production worker name and domain: `TODO`
- Staging D1 DB binding/id details: `TODO`
- Production D1 DB binding/id details: `TODO`

## Implementation notes (locked for next session)

1. Repo default branch remains `dev`; production branch is `prod` (protected).
2. Deploy orchestrator file path: `deploy/cf.ts`.
3. Root scripts should call the deploy tool (e.g. `bun deploy stage|prod`).
4. Use `.env.prod` naming for production env file conventions.

## Consequences

- Low operational overhead and predictable manual deploy commands.
- Strong enough guardrails for a small project without CI.
- Easy to evolve later into CI-based promotion if needed.
