#!/usr/bin/env bash
# Builds the docs of one channel into a checkout of the gh-pages branch, next to the
# other channels: "latest" at the root, "dev" at dev/ and every release frozen at v<version>/.
# Run by .github/workflows/docs.yml; works locally as well, e.g. `docs/deploy.sh dev /tmp/site`.
#
# usage: docs/deploy.sh <latest|dev> <site dir>
set -euo pipefail

channel=${1:?usage: docs/deploy.sh <latest|dev> <site dir>}
mkdir -p "${2:?usage: docs/deploy.sh <latest|dev> <site dir>}"
site=$(cd "$2" && pwd)
root=${DOCS_ROOT:-/blank/}
docs=$(cd "$(dirname "$0")" && pwd)
version=$(cd "$docs/.." && bun pm pkg get version | tr -d '"')

build() { # <channel> <base> <target dir>
  echo "building $1 at $2"
  (cd "$docs" && DOCS_ROOT=$root DOCS_CHANNEL=$1 DOCS_BASE=$2 bunx vitepress build --outDir "$3")
}

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

case "$channel" in
  latest)
    # the root holds the latest release, but must keep the other channels in place
    build latest "$root" "$tmp/latest"
    rsync -a --delete --exclude /.git --exclude /dev/ --exclude '/v[0-9]*/' \
      --exclude /versions.json --exclude /.nojekyll "$tmp/latest/" "$site/"
    build archive "${root}v$version/" "$tmp/archive"
    rsync -a --delete "$tmp/archive/" "$site/v$version/"

    # newest version first, so the switcher lists them in order
    # a broken versions.json fails the deploy instead of silently dropping the older versions
    existing=
    if [ -f "$site/versions.json" ]; then existing=$(jq -er '.versions[]' "$site/versions.json"); fi
    printf '%s\n' "$version" $existing | sort -u -V -r |
      jq -R . | jq -s --arg latest "$version" '{latest: $latest, versions: .}' >"$site/versions.json"
    ;;
  dev)
    build dev "${root}dev/" "$tmp/dev"
    rsync -a --delete "$tmp/dev/" "$site/dev/"
    ;;
  *)
    echo "unknown channel: $channel" >&2
    exit 1
    ;;
esac

# GitHub Pages must not run Jekyll over the build, it would drop files starting with "_"
touch "$site/.nojekyll"
