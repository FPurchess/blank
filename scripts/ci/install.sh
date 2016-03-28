#!/usr/bin/env bash

set -ev

go get github.com/constabulary/gb/...
go get github.com/golang/lint/golint
go get golang.org/x/tools/cmd/vet
go get github.com/jteeuwen/go-bindata/...

npm install