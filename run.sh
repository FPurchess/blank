#!/bin/bash

export GOPATH=$HOME/gotools:`pwd`:`pwd`/vendor
export PATH=$PATH:$HOME/gotools/bin

# precompile app
webpack

# lock and load...
go run src/cmd/blank/*.go

# FIXME proper thrust shutdown
killall thrust_shell
