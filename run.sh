#!/bin/bash

[[ -n "$1" ]] && HEADLESS="$1" || HEADLESS="false"

export GOPATH=$HOME/gotools:`pwd`:`pwd`/vendor
export PATH=$PATH:$HOME/gotools/bin

# precompile app
webpack

# lock and load...

go run src/cmd/blank/*.go --config="./default.config.yaml" --headless=$HEADLESS

# FIXME proper thrust shutdown
killall thrust_shell
