#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

printf '%s\n' '=== SYNTAX ==='
for file in app.js boot.js sw.js worker.js scripts/*.mjs tests/*.mjs; do
  node --check "$file"
done
printf '%s\n' 'syntax: pass'

printf '%s\n' '=== PRODUCTION SECRET SCAN ==='
if grep -nE 'sk-[A-Za-z0-9_-]{16,}|AIza[0-9A-Za-z_-]{20,}' index.html app.js boot.js sw.js styles.css manifest.webmanifest; then
  printf '%s\n' 'possible embedded provider secret detected'
  exit 1
fi
printf '%s\n' 'embedded provider-secret patterns: none'

printf '%s\n' '=== DANGEROUS EXECUTION SINKS ==='
if grep -nE 'eval\(|new Function\(|document\.write\(' app.js boot.js; then
  printf '%s\n' 'dangerous execution sink detected'
  exit 1
fi
printf '%s\n' 'dangerous execution sinks: none'

printf '%s\n' '=== DEPENDENCY AUDIT ==='
npm audit --audit-level=high --omit=optional
