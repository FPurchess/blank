#!/usr/bin/env bash
# Prints the newest commit at or before <commit> that changes more than the docs screenshots:
# the screenshots PR (.github/workflows/screenshots.yml) lands commits that change only those, after the
# commit whose code they show. The release checks look at that code commit.
#
# usage: scripts/code-commit.sh <commit>
set -euo pipefail

sha=$(git rev-parse "${1:?usage: scripts/code-commit.sh <commit>}^{commit}")
while files=$(git diff-tree --no-commit-id --name-only -r "$sha") &&
  [ -n "$files" ] && ! grep -qv '^docs/public/screenshots/' <<<"$files"; do
  sha=$(git rev-parse "$sha^")
done
echo "$sha"
