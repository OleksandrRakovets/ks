# Orb Provisioning

- `setup` owns provisioning and reads Bun's declaration from root `package.json`. It enforces the declared major/minor while allowing patch updates; do not assume an exact-version install.
- When changing Bun's version or metadata representation, update affected setup, resume, CI, and tooling consumers together.
- For provisioning changes, run `.agents/setup` twice to verify idempotence, then `.agents/resume`. The root full gate does not exercise orb startup.
- `resume` checks successful setup against the setup script checksum. Preserve that failure detection rather than bypassing the marker.
