# T005 - deploy flow and versioning

## Status

- [ ] Planned

## Why

Deploy is not part of the product roadmap milestones, but the repo still needs a safe manual stage/prod flow before regular club usage begins.

## Outcome

The repo has a predictable manual deploy process with lightweight safeguards and a versioning story that avoids stale frontends during hotfixes.

## Scope

- define Wrangler environments named `stage` and `prod`,
- add root-level deploy commands,
- enforce branch checks for stage and prod deploys,
- run checks before deploy,
- apply D1 migrations during deploy,
- expose an app version identifier and handle version mismatch safely in the frontend,
- verify cache policy for hashed assets and document responses.

## Acceptance

- stage and prod deploy commands are explicit and documented,
- invalid-branch deploy attempts are blocked,
- stage/prod migrations are part of the manual flow,
- app responses expose a version identifier,
- navigation behaves safely after a hot deploy.

## Notes

- `dev` is the default branch and is the only branch allowed to deploy to `stage`.
- `prod` will be created with the first production launch and is the only branch allowed to deploy to `prod`.
- Production updates should flow by merging from `dev` into `prod`, then running the production deploy command.
