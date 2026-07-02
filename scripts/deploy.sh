#!/usr/bin/env bash
# Deploy to Vercel production.
#
# The Vercel token is read from the VERCEL_TOKEN environment variable so it is
# never hardcoded or pasted inline. Set it once in your shell (or a git-ignored
# .env.deploy that you `source`), e.g.:
#
#   export VERCEL_TOKEN=your_token_here
#   ./scripts/deploy.sh
#
set -euo pipefail

if [[ -z "${VERCEL_TOKEN:-}" ]]; then
  echo "Error: VERCEL_TOKEN is not set." >&2
  echo "Set it first:  export VERCEL_TOKEN=your_token_here" >&2
  exit 1
fi

vercel --prod --token "$VERCEL_TOKEN" "$@"
