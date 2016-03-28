#!/usr/bin/env bash

set -ev


# §1 prepare assets
webpack --bail
go-bindata -pkg="blank" -o src/blank/assets.go public/... tmpl/...

# §2 lint / vet / test
golint src/
go tool vet src/
# TODO(fpur) 'gb test' does not support coverage. see https://github.com/constabulary/gb/issues/367
gb test

# §3 build
# TODO(fpur) 'gb build' does not support the -o option...
GOOS=linux GOARCH=amd64 gb build && cp bin/blank bin/blank-linux-x64-$TRAVIS_BRANCH-0.1.$TRAVIS_BUILD_NUMBER
GOOS=windows GOARCH=amd64 gb build && cp bin/blank bin/blank-windows-x64-$TRAVIS_BRANCH-0.1.$TRAVIS_BUILD_NUMBER.exe