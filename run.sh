#!/bin/bash

GOPATH=$HOME/gotools:`pwd`:`pwd`/vendor
PATH=$PATH:$HOME/gotools/bin

# precompile statics
webpack

# compile assets to binary
go-bindata -pkg="blank" -o src/blank/assets.go public/... tmpl/... default.config.yaml

# compile blank
gb build

# lock and load...
./bin/blank "$@"
