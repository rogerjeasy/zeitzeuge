#!/usr/bin/env bash
# Draws architecture-light.png and architecture-dark.png from architecture.html.
set -euo pipefail
cd "$(dirname "$0")"
for scheme in light dark; do
  npx --yes playwright@1.56.1 screenshot --full-page --wait-for-timeout=1500 \
    --viewport-size="1600,1000" --color-scheme="$scheme" --device-scale-factor=2 \
    "file://$PWD/architecture.html" "architecture-$scheme.png" 2>/dev/null \
  || npx --yes playwright@1.56.1 screenshot --full-page --wait-for-timeout=1500 \
    --viewport-size="1600,1000" --color-scheme="$scheme" \
    "file://$PWD/architecture.html" "architecture-$scheme.png"
done
ls -la architecture-*.png
