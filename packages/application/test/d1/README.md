# Application D1 integration tests

This project exercises application-owned persistence through the private D1 adapters against an isolated, migrated Miniflare D1 database. Each test resets storage and reapplies the production migrations.

Run with `bun run typecheck:integration` and `bun run test:integration` from `packages/application`.

## Follow-up opportunities

Player persistence remains in the fast fake-based suites and is intentionally outside this slice. Future D1 integration work can cover:

- `src/d1/guest-players.ts`
- `src/d1/players.ts`
- the remaining player fake-based tests
