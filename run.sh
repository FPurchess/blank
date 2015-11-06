#!/bin/bash

[[ -n "$1" ]] && DEBUG="$1" || DEBUG="false"

export GOPATH=$HOME/gotools:`pwd`:`pwd`/vendor
export PATH=$PATH:$HOME/gotools/bin

# precompile app
webpack

# compile assets to binary
go-bindata -pkg="blank" -o src/blank/assets.go public/... tmpl/...

# lock and load...
go run src/cmd/blank/*.go --config="./default.config.yaml" --debug=$DEBUG

# FIXME proper thrust shutdown
killall thrust_shell
