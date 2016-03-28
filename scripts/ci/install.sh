#!/usr/bin/env bash

set -ev

go get github.com/constabulary/gb/...
go get github.com/golang/lint/golint
go get golang.org/x/tools/cmd/vet
go get github.com/jteeuwen/go-bindata/...
go get github.com/mattn/goveralls
go get golang.org/x/tools/cmd/cover
    
npm install