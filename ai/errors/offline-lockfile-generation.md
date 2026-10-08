# Offline package lock generation failure

- **Symptoms:** Initial `npm install --package-lock-only --ignore-scripts --offline` failed with `ENOTCACHED` while resolving `@eslint/js`.
- **Root cause:** Registry metadata was not cached. The same exact dependency graph was present in the parent workspace lockfile.
- **Affected files:** No application source was affected.
- **Solution:** Seeded the new project lockfile from available package resolution data, replaced the root package metadata with this project’s manifest, then normalized it with npm offline.
- **Tests:** `npm install --package-lock-only --ignore-scripts --offline` and `npm ci --ignore-scripts --offline` both PASS; 143 packages audited, zero vulnerabilities.
- **Regression risk:** Low; changes to dependencies must update both `package.json` and the committed lockfile.
