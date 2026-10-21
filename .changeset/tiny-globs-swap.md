---
'@codearch/core': patch
'@codearch/cli': patch
---

Replace `fast-glob` and `micromatch` with `tinyglobby` and `picomatch`, which
removes `braces` (GHSA-vfj7-8cjw-p6xm, no upstream fix) from the production
dependency tree, so `npm audit` on install no longer reports it. File
discovery, workspace globs (including symlinked workspace directories, negated
entries and trailing `**`) and subsystem `match` globs resolve exactly as
before.
