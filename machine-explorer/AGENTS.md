# Machine Explorer: never merge this branch

The `machine-explorer` branch is disposable developer tooling, not a feature branch.
Never merge it into `dev` or open a pull request for it. Rebase it onto `origin/dev`
and repair the preview only when requested.

Keep every preview-specific file in this directory. Do not add workspace membership,
root scripts, root TypeScript references, package exports, or machine forwarding modules.
Import repository source directly; accept that refactors can break this tool.

## Install and run

Run from the repository root:

```sh
bun install --frozen-lockfile
bun install --cwd machine-explorer --frozen-lockfile
bun run --cwd machine-explorer check
bun run --cwd machine-explorer build
bun run --cwd machine-explorer dev
```

The root install supplies the domain packages' dependencies. This directory has its
own manifest, lockfile, and tooling dependencies; use explicit versions, not `catalog:`
or `workspace:`. Keep XState at the installed domain version. Vite deduplicates XState
so imported machines and the inspector use one runtime.

The preview serves on port 7530. In an orb, start it as a supervised service:

```sh
amp orb service start machine-explorer --command 'bun run --cwd machine-explorer dev' --port 7530 --portal
```

## After rebasing

Reinstall both dependency trees, update direct imports and synthetic commands for the
current source contracts, and run the preview's `check` and `build`. Exercise all three
Frame modes and the Match lifecycle in the browser. Stately inspection is topology
inspection only; synthetic frame completions do not exercise MatchRoom integration.
