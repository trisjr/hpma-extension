---
name: release
description: Bump version, update CHANGELOG, build Chrome + Firefox and package store-ready zips
argument-hint: <patch|minor|major|x.y.z>
disable-model-invocation: true
---

# Release: $ARGUMENTS

The manifest version comes from `package.json` (`src/manifest.ts` reads it), so `package.json` is the only place to bump.

## Steps

1. **Preflight** — working tree must be clean (`git status --porcelain` empty) and on `main`; otherwise stop and tell the user.
2. **Compute version** from the current `package.json` version and the argument (`patch`/`minor`/`major` or an explicit `x.y.z`). Store versions must be dotted integers only — no `-beta` suffixes.
3. **Collect changes** since the last release:
   - `git describe --tags --abbrev=0` for the last tag; if there are no tags, use the commit that last changed `"version"` in `package.json` (`git log -G'"version"' -1 --format=%H -- package.json`).
   - `git log <base>..HEAD --no-merges --format='%s'`, group by conventional-commit type (`feat`, `fix`, others). Drop `chore(deps)`/`ci`/`docs` noise unless it's user-visible.
4. **Edit files** (with Edit, not scripts):

   - `package.json` → `"version"`.
   - `CHANGELOG.md` → new section on top, matching the existing format:

     ```md
     ## vX.Y.Z

     ### What's Changed

     - ...

     Full Changelog: Compare vPREV...vX.Y.Z
     ```

5. **Verify**: `pnpm lint`, `pnpm lint:spell`, `pnpm build`, `pnpm build:firefox` — all must pass. Check `dist_chrome/manifest.json` and `dist_firefox/manifest.json` show the new version.
6. **Package**:
   ```bash
   mkdir -p release
   (cd dist_chrome && zip -qr ../release/hpma-extension-chrome-vX.Y.Z.zip .)
   (cd dist_firefox && zip -qr ../release/hpma-extension-firefox-vX.Y.Z.zip .)
   ```
   `release/` must stay out of git — if `.gitignore` doesn't cover it, tell the user rather than committing zips.
7. **Stop and report**: new version, changelog entry, zip paths and sizes. Ask before committing (`chore(release): vX.Y.Z`), tagging `vX.Y.Z`, or pushing — never do those unprompted.
