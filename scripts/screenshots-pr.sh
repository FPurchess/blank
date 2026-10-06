#!/usr/bin/env bash
# Proposes the docs screenshots that scripts/sync-screenshots.sh took over in a single PR from
# bot/screenshots: commits them on top of the checked out commit, force-pushes the branch and
# opens the PR or updates its description. Without a change, it closes the PR and deletes the
# branch, since main has these screenshots then. Run by the screenshots-pr job of
# .github/workflows/e2e.yml with GH_TOKEN; needs git and gh.
#
# usage: scripts/screenshots-pr.sh
set -euo pipefail
cd "$(dirname "$0")/.."

branch=bot/screenshots
dir=docs/public/screenshots
sha=$(git rev-parse HEAD)

git add -A "$dir"
pr=$(gh pr list --head "$branch" --state open --json number --jq '.[0].number // empty')

if git diff --cached --quiet; then
  echo "the screenshots are up to date"
  if [ -n "$pr" ]; then
    gh pr close "$pr" --comment "main has these screenshots now (${sha::7})."
  fi
  git push -q origin --delete "$branch" 2>/dev/null || true
  exit 0
fi

changes=$(git diff --cached --name-status -- "$dir" | while read -r status file; do
  case "$status" in
    A) echo "- added \`$file\`" ;;
    D) echo "- removed \`$file\`" ;;
    *) echo "- changed \`$file\`" ;;
  esac
done)

git -c user.name="github-actions[bot]" \
  -c user.email="41898282+github-actions[bot]@users.noreply.github.com" \
  commit -q -m "docs: refresh the screenshots from ${sha::7}"
git push -q --force origin "HEAD:refs/heads/$branch"

body=$(cat <<BODY
The docs screenshots as \`e2e/shots/\` captures them on main at ${sha}:

${changes}

This PR updates itself after every push to main and holds only the images whose frames changed. Its checks don't run, since a PR opened by GitHub Actions starts no workflows. Look at the images under *Files changed*, then merge it with \`gh pr merge --squash --admin <number>\`. Merging it doesn't capture them again.
BODY
)

if [ -n "$pr" ]; then
  gh pr edit "$pr" --body "$body"
  echo "updated #$pr"
else
  gh pr create --base main --head "$branch" --title "docs: refresh the screenshots" --body "$body"
fi
