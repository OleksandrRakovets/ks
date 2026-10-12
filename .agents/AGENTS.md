# Orb Provisioning

- `setup` treats Bun's declared version in root `package.json` as a minimum. Keep an equal or newer installed version; otherwise install the declared version without a latest-release lookup.
- When changing Bun's version or metadata representation, update affected setup, resume, CI, and tooling consumers together.
- For provisioning changes, run `.agents/setup` twice to verify idempotence, then `.agents/resume`. The root full gate does not exercise orb startup.
- `resume` checks successful setup against the setup script checksum. Preserve that failure detection rather than bypassing the marker.
- `.amp/services.yaml` declares only the dev portal, because `amp orb services ensure` starts every declared service. Start the production preview portal only when asked, as an ad-hoc service from the repository root: `amp orb service start play-preview --command './node_modules/.bin/turbo run @ks/play#preview -- --port "$PORT"' --portal --title "KS preview" --description "Production build preview with the colocated MatchRoom Durable Object."`
