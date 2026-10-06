#!/usr/bin/env bash
# Fails while the docs screenshots of a commit aren't on it yet, since the
# docs of a release would show old ones: while the `screenshots` check
# (.github/workflows/e2e.yml) of its code commit (scripts/code-commit.sh) is
# still running, or while the screenshots PR from bot/screenshots is open.
# Warns only when the check failed or didn't run. make release runs it on
# origin/main; ALLOW_OLD_SCREENSHOTS=1 lets it pass anyway.
set -euo pipefail
cd "$(dirname "$0")/.."

sha=$(scripts/code-commit.sh "${1:?usage: check-screenshots-ci.sh <commit>}")
fail() {
  if [ -n "${ALLOW_OLD_SCREENSHOTS:-}" ]; then
    echo "warning: $* (ALLOW_OLD_SCREENSHOTS is set)" >&2
    exit 0
  fi
  echo "error: $* (ALLOW_OLD_SCREENSHOTS=1 releases anyway)" >&2
  exit 1
}

command -v gh >/dev/null || fail "gh is missing, it checks the screenshots on GitHub (https://cli.github.com)"
runs=$(gh api "repos/{owner}/{repo}/commits/$sha/check-runs?check_name=screenshots&filter=latest&per_page=100" \
  --jq '.check_runs[] | "\(.status) \(.conclusion) \(.html_url)"') ||
  fail "couldn't read the checks of $sha from GitHub"
if [ -z "$runs" ]; then
  echo "warning: the screenshots haven't been captured on $sha" >&2
fi
while read -r status conclusion url; do
  [ -n "$status" ] || continue
  [ "$status" = completed ] || fail "the screenshots of $sha are still being captured: $url"
  [ "$conclusion" = success ] || echo "warning: capturing the screenshots of $sha ended with $conclusion: $url" >&2
done <<<"$runs"

pr=$(gh pr list --head bot/screenshots --state open --json url --jq '.[0].url // empty') ||
  fail "couldn't read the pull requests from GitHub"
[ -z "$pr" ] || fail "merge the screenshots PR first, or the docs of the release show old ones: $pr"
echo "No screenshots of $sha wait to be merged"
