#!/usr/bin/env bash
# Captures the docs screenshots: runs the spec files in e2e/shots/ side by side, each with
# an app, a virtual display, a session bus and a tauri-driver port of its own. The images go
# to e2e/screenshots/docs/, or to SHOTS_DIR (see e2e/shots/shots.ts); the logs to
# e2e/screenshots/logs/. Builds the debug app first, unless E2E_SKIP_BUILD is set.
#
# usage: scripts/docs-shots.sh [--grep <title>] [<topic>...]
#   --grep   only the shots whose it() title matches, e.g. --grep "records table mode"
#   topic    only these spec files, e.g. tables for e2e/shots/tables.shots.ts
# JOBS sets how many run at once (default: a third of the CPUs, at least 1),
# E2E_PORT the first port (default 4600; each spec file takes two), SHOTS_SCALE
# the pixels per point (default 2, sharp on HiDPI screens; GDK_SCALE of the app).
set -euo pipefail
cd "$(dirname "$0")/.."

grep=
topics=()
while [ $# -gt 0 ]; do
  case "$1" in
    --grep)
      grep=${2:?usage: scripts/docs-shots.sh [--grep <title>] [<topic>...]}
      shift 2
      ;;
    *)
      topics+=("$1")
      shift
      ;;
  esac
done

specs=()
if [ ${#topics[@]} -eq 0 ]; then
  for spec in e2e/shots/*.shots.ts; do specs+=("$(basename "$spec" .shots.ts)"); done
else
  for topic in "${topics[@]}"; do
    [ -f "e2e/shots/$topic.shots.ts" ] || { echo "no e2e/shots/$topic.shots.ts" >&2; exit 1; }
    specs+=("$topic")
  done
fi

if [ -z "${E2E_SKIP_BUILD:-}" ]; then
  bun run tauri build --debug --no-bundle
fi

logs=e2e/screenshots/logs
mkdir -p "$logs"
jobs=${JOBS:-$(( $(nproc) / 3 > 0 ? $(nproc) / 3 : 1 ))}
port=${E2E_PORT:-4600}
export E2E_SKIP_BUILD=1 grep GDK_SCALE=${SHOTS_SCALE:-2}

# runs one spec file: its own display (the -n of xvfb-run, so parallel starts don't race
# for the same one), its own bus and its own port
capture() {
  local index=$1 spec=$2
  local args=(bunx wdio run ./wdio.shots.conf.ts --spec "shots/$spec.shots.ts")
  [ -z "$grep" ] || args+=(--mochaOpts.grep "$grep")
  if (cd e2e && E2E_PORT=$((port + 2 * index)) \
    dbus-run-session -- xvfb-run -n $((300 + index)) -s "-screen 0 2400x1800x24" \
    "${args[@]}") >"$logs/$spec.log" 2>&1; then
    echo "✓ $spec"
  else
    echo "✖ $spec (see $logs/$spec.log)"
    return 1
  fi
}
export -f capture
export port logs

start=$SECONDS
failed=0
# shellcheck disable=SC2016 # expanded by the bash that xargs starts
for i in "${!specs[@]}"; do echo "$i ${specs[$i]}"; done |
  xargs -P "$jobs" -L 1 bash -c 'capture "$0" "$1"' || failed=1

for spec in "${specs[@]}"; do
  grep -hE '✓|✖' "$logs/$spec.log" | sed "s/^.*\(✓\|✖\)/  \1/" || true
done
echo "$(( SECONDS - start )) s for ${#specs[@]} spec files, $jobs at a time"
if [ "$failed" -ne 0 ]; then
  for spec in "${specs[@]}"; do
    if grep -q '✖' "$logs/$spec.log" 2>/dev/null || ! grep -q 'passing' "$logs/$spec.log" 2>/dev/null; then
      echo "--- $logs/$spec.log"
      tail -40 "$logs/$spec.log"
    fi
  done
  exit 1
fi
