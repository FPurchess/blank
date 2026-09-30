#!/usr/bin/env bash
# Fails unless the `engine` check (.github/workflows/test.yml) passed on a
# commit: it tests the layout engine and checks that the committed wasm is
# what its sources build. make release runs it on origin/main.
set -euo pipefail
cd "$(dirname "$0")/.."

sha="${1:?usage: check-engine-ci.sh <commit>}"
fail() { echo "error: $*" >&2; exit 1; }

command -v gh >/dev/null || fail "gh is missing, it checks the engine check on GitHub (https://cli.github.com)"
runs=$(gh api "repos/{owner}/{repo}/commits/$sha/check-runs?check_name=engine&filter=latest" \
  --jq '.check_runs[] | "\(.status) \(.conclusion) \(.html_url)"') ||
  fail "couldn't read the checks of $sha from GitHub"
[ -n "$runs" ] || fail "the engine check hasn't run on $sha"
read -r status conclusion url <<<"$(head -n 1 <<<"$runs")"
[ "$status" = completed ] || fail "the engine check is still running on $sha: $url"
[ "$conclusion" = success ] || fail "the engine check ended with $conclusion on $sha: $url"
echo "The engine check passed on $sha"
