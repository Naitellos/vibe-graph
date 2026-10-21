#!/usr/bin/env bash
# Watch vibe-graph catch an AI tangling the architecture — in ~15 seconds.
#
#   ./run.sh
#
# It scans this tiny project, records a baseline, then simulates an AI edit
# that makes `billing` reach into `analytics`, and runs the conformance check.
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
CLI=(npx -y @codearch/cli@latest)
# --root MUST come after the subcommand: citty does not forward root-level flags
# to subcommands, so `cli --root=X scan` drops it and scan walks UP from cwd —
# which, for a demo living inside a monorepo, resolves to the parent project.
ROOT=("--root=$DIR")
cd "$DIR"

echo "▶ 1/3  Scan + baseline the clean project"
"${CLI[@]}" scan "${ROOT[@]}" --quiet
"${CLI[@]}" baseline "${ROOT[@]}" >/dev/null
echo "       baseline recorded — billing, analytics, core are separate."
echo

echo "▶ 2/3  An AI edit (mid-session) makes billing reach into analytics"
cp src/billing/charge.ts .charge.orig
cat > src/billing/charge.ts <<'TS'
import { cents } from '../core/money.js'
import { track } from '../analytics/track.js' // <-- the AI just reached into analytics

export function charge(amount: number): number {
  track('charge', amount) // billing now depends on analytics at runtime
  return cents(amount)
}
TS
echo "       billing/charge.ts now imports ../analytics/track.js"
echo

echo "▶ 3/3  vibe-graph validate-diff:"
echo "----------------------------------------------------------------"
"${CLI[@]}" validate-diff "${ROOT[@]}" --working-files src/billing/charge.ts || true
echo "----------------------------------------------------------------"

# restore the clean file so the demo is repeatable
mv .charge.orig src/billing/charge.ts
echo
echo "(restored billing/charge.ts — run again any time)"
