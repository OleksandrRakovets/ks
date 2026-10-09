# Orb Provisioning

- `setup` treats Bun's declared version in root `package.json` as a minimum. Keep an equal or newer installed version; otherwise install the declared version without a latest-release lookup.
- When changing Bun's version or metadata representation, update affected setup, resume, CI, and tooling consumers together.
- For provisioning changes, run `.agents/setup` twice to verify idempotence, then `.agents/resume`. The root full gate does not exercise orb startup.
- `resume` checks successful setup against the setup script checksum. Preserve that failure detection rather than bypassing the marker.
